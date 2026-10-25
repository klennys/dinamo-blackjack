"""
DINAMO BLACKJACK - High-Performance Async Multiplayer Backend Server
Built with aiohttp & SQLite
Supports Real-Time Multi-Seat Multiplayer, Accounts, Profiles, Table Lobby & Chat
"""

import asyncio
import hashlib
import json
import os
import random
import secrets
import sqlite3
import time
from aiohttp import web, WSMsgType

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "dinamo_casino.db")
PORT = int(os.environ.get("PORT", 5000))

# ==============================================================================
# Database Management
# ==============================================================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT 'avatar-vip-1',
            chips INTEGER DEFAULT 5000,
            vip_level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            hands_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            blackjacks INTEGER DEFAULT 0,
            biggest_win INTEGER DEFAULT 0,
            total_won INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_bonus REAL DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at REAL DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()

def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Active sessions cache: token -> user_dict
ACTIVE_SESSIONS = {}

def get_user_by_token(token: str):
    if not token:
        return None
    # 1. Check in-memory cache
    if token in ACTIVE_SESSIONS:
        return ACTIVE_SESSIONS[token]

    # 2. Check persistent DB sessions
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT u.* FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE s.token = ?
        """, (token,))
        row = cur.fetchone()

        # 3. Fallback for local-token-{uid}
        if not row and token.startswith("local-token-"):
            try:
                uid = int(token.replace("local-token-", ""))
                cur.execute("SELECT * FROM users WHERE id = ?", (uid,))
                row = cur.fetchone()
            except Exception:
                pass

        conn.close()
        if row:
            user_dict = dict(row)
            if "password_hash" in user_dict:
                del user_dict["password_hash"]
            ACTIVE_SESSIONS[token] = user_dict
            return user_dict
    except Exception as e:
        print("get_user_by_token DB error:", e)
    return None

# ==============================================================================
# Card & Shoe Engine
# ==============================================================================

SUITS = [
    {"name": "spades", "symbol": "♠", "color": "black"},
    {"name": "hearts", "symbol": "♥", "color": "red"},
    {"name": "diamonds", "symbol": "♦", "color": "red"},
    {"name": "clubs", "symbol": "♣", "color": "black"}
]

RANKS = [
    {"rank": "2", "val": 2}, {"rank": "3", "val": 3}, {"rank": "4", "val": 4},
    {"rank": "5", "val": 5}, {"rank": "6", "val": 6}, {"rank": "7", "val": 7},
    {"rank": "8", "val": 8}, {"rank": "9", "val": 9}, {"rank": "10", "val": 10},
    {"rank": "J", "val": 10, "isFace": True},
    {"rank": "Q", "val": 10, "isFace": True},
    {"rank": "K", "val": 10, "isFace": True},
    {"rank": "A", "val": 11, "isAce": True}
]

def make_shoe(decks=6):
    cards = []
    for d in range(decks):
        for s in SUITS:
            for r in RANKS:
                cards.append({
                    "rank": r["rank"],
                    "value": r["val"],
                    "suit": s["name"],
                    "symbol": s["symbol"],
                    "color": s["color"],
                    "isFace": r.get("isFace", False),
                    "isAce": r.get("isAce", False)
                })
    random.shuffle(cards)
    return cards

def calculate_hand(cards):
    total = 0
    aces = 0
    for c in cards:
        if c.get("isAce"):
            aces += 1
            total += 11
        else:
            total += c["value"]
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    is_soft = aces > 0
    is_bust = total > 21
    is_blackjack = len(cards) == 2 and total == 21
    return {
        "total": total,
        "isSoft": is_soft,
        "isBust": is_bust,
        "isBlackjack": is_blackjack
    }

# ==============================================================================
# Multiplayer Blackjack Table Room
# ==============================================================================

class MultiplayerTable:
    def __init__(self, table_id, name, min_bet, max_bet, max_seats=3):
        self.id = table_id
        self.name = name
        self.min_bet = min_bet
        self.max_bet = max_bet
        self.max_seats = max_seats
        
        # seats: index -> { user: dict, bet: int, cards: list, isDone: bool, isBusted: bool, ws: WebSocketResponse } or None
        self.seats = [None] * max_seats
        self.spectators = set() # WebSocketResponse
        
        self.shoe = make_shoe(6)
        self.dealer_cards = []
        self.dealer_hole_hidden = True
        
        # State: 'WAITING' | 'BETTING' | 'DEALING' | 'TURNS' | 'DEALER' | 'PAYOUT'
        self.state = 'WAITING'
        self.countdown = 0
        self.active_turn_seat = -1
        self.turn_time_left = 0
        
        self.lock = asyncio.Lock()
        self.loop_task = None
        self.payout_skip_event = None

    def skip_payout(self):
        # In multiplayer, ensure at least 2.5s showcase so other players have time to see their cards
        elapsed = time.time() - getattr(self, 'payout_start_time', 0)
        active_seats = [s for s in self.seats if s is not None and s.get('bet', 0) > 0]
        if len(active_seats) > 1 and elapsed < 2.5:
            return
        if self.payout_skip_event and not self.payout_skip_event.is_set():
            self.payout_skip_event.set()

    def start_loop(self):
        if self.loop_task is None or self.loop_task.done():
            self.loop_task = asyncio.create_task(self.table_game_loop())

    def get_seated_count(self):
        return sum(1 for s in self.seats if s is not None)

    def to_summary(self):
        return {
            "id": self.id,
            "name": self.name,
            "minBet": self.min_bet,
            "maxBet": self.max_bet,
            "maxSeats": self.max_seats,
            "seatedCount": self.get_seated_count(),
            "spectatorCount": len(self.spectators),
            "state": self.state
        }

    def to_state_payload(self):
        seated_data = []
        for i, s in enumerate(self.seats):
            if s is None:
                seated_data.append(None)
            else:
                seated_data.append({
                    "seatIndex": i,
                    "username": s["user"]["username"],
                    "avatar": s["user"]["avatar"],
                    "vipLevel": s["user"]["vip_level"],
                    "chips": s["user"]["chips"],
                    "bet": sum(h["bet"] for h in s.get("splitHands", [])) if s.get("isSplit") else s["bet"],
                    "cards": s["cards"],
                    "calc": calculate_hand(s["cards"]) if s["cards"] else None,
                    "isDone": s["isDone"],
                    "isBusted": s["isBusted"],
                    "result": s.get("result", None),
                    "isSplit": s.get("isSplit", False),
                    "activeHandIdx": s.get("activeHandIdx", 0),
                    "splitHands": s.get("splitHands", [])
                })

        visible_dealer_cards = []
        if self.dealer_cards:
            if self.dealer_hole_hidden and len(self.dealer_cards) >= 2:
                visible_dealer_cards = [self.dealer_cards[0], {"isHidden": True}]
            else:
                visible_dealer_cards = self.dealer_cards

        dealer_calc = None
        if self.dealer_cards:
            if self.dealer_hole_hidden:
                first = self.dealer_cards[0]
                dealer_calc = {"total": 11 if first.get("isAce") else first["value"]}
            else:
                dealer_calc = calculate_hand(self.dealer_cards)

        return {
            "type": "TABLE_STATE",
            "tableId": self.id,
            "state": self.state,
            "countdown": self.countdown,
            "activeTurnSeat": self.active_turn_seat,
            "turnTimeLeft": self.turn_time_left,
            "seats": seated_data,
            "dealerCards": visible_dealer_cards,
            "dealerCalc": dealer_calc,
            "shoeRemaining": len(self.shoe)
        }

    async def broadcast(self, payload):
        text = json.dumps(payload)
        unique_ws = set()
        for s in self.seats:
            if s and s["ws"] and not s["ws"].closed:
                unique_ws.add(s["ws"])
        for ws in list(self.spectators):
            if not ws.closed:
                unique_ws.add(ws)
            else:
                self.spectators.remove(ws)
        if unique_ws:
            coros = [ws.send_str(text) for ws in unique_ws]
            await asyncio.gather(*coros, return_exceptions=True)

    async def add_spectator(self, ws):
        self.spectators.add(ws)
        await ws.send_str(json.dumps(self.to_state_payload()))

    def remove_client(self, ws):
        if ws in self.spectators:
            self.spectators.remove(ws)
        for i in range(self.max_seats):
            if self.seats[i] and self.seats[i]["ws"] == ws:
                # If they leave during waiting/betting, refund bet
                if self.state in ['WAITING', 'BETTING']:
                    if self.seats[i]["bet"] > 0:
                        self.seats[i]["user"]["chips"] += self.seats[i]["bet"]
                        self.update_user_chips(self.seats[i]["user"]["id"], self.seats[i]["user"]["chips"])
                self.seats[i] = None
        seated = [s for s in self.seats if s is not None]
        if not seated:
            self.state = 'WAITING'
            self.countdown = 0
            self.dealer_cards = []
            self.active_turn_seat = -1

    def update_user_chips(self, user_id, chips):
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("UPDATE users SET chips = ? WHERE id = ?", (chips, user_id))
            conn.commit()
            conn.close()
        except Exception as e:
            print("DB chip update err:", e)

    # Core Table Game Loop
    async def table_game_loop(self):
        while True:
            await asyncio.sleep(1)
            
            # Check if any player is seated
            seated_players = [s for s in self.seats if s is not None]
            if not seated_players:
                if self.state != 'WAITING':
                    self.state = 'WAITING'
                    self.dealer_cards = []
                    self.active_turn_seat = -1
                    self.countdown = 0
                    await self.broadcast(self.to_state_payload())
                else:
                    self.state = 'WAITING'
                    self.dealer_cards = []
                    self.active_turn_seat = -1
                    self.countdown = 0
                continue

            # State 1: WAITING -> Start Betting Countdown (Only if at least 1 player is seated)
            if self.state == 'WAITING':
                self.state = 'BETTING'
                self.countdown = 12
                self.dealer_cards = []
                self.dealer_hole_hidden = True
                for s in self.seats:
                    if s:
                        s["cards"] = []
                        s["bet"] = 0
                        s["isDone"] = False
                        s["isBusted"] = False
                        s["isSurrendered"] = False
                        s["isSplit"] = False
                        s["splitHands"] = []
                        s["activeHandIdx"] = 0
                        s["result"] = None
                await self.broadcast(self.to_state_payload())
                await self.broadcast({
                    "type": "COUNTDOWN_TICK",
                    "countdown": self.countdown,
                    "message": f"Bahisler kapanıyor: {self.countdown}s"
                })

            # State 2: BETTING Countdown
            elif self.state == 'BETTING':
                self.countdown -= 1
                await self.broadcast({
                    "type": "COUNTDOWN_TICK",
                    "countdown": self.countdown,
                    "message": f"Bahisler kapanıyor: {self.countdown}s"
                })
                if self.countdown <= 0:
                    # Check if at least 1 player has placed bet >= min_bet
                    active_bettors = [s for s in self.seats if s and s["bet"] >= self.min_bet]
                    if not active_bettors:
                        # Reset betting countdown
                        self.countdown = 10
                        await self.broadcast({
                            "type": "ANNOUNCEMENT",
                            "message": f"En az 1 oyuncu min ${self.min_bet} bahis koymalı!"
                        })
                    else:
                        await self.start_deal_phase()

            # State 3: PLAYER TURNS
            elif self.state == 'TURNS':
                if self.active_turn_seat != -1 and self.seats[self.active_turn_seat]:
                    self.turn_time_left -= 1
                    s_active = self.seats[self.active_turn_seat]
                    await self.broadcast({
                        "type": "TURN_TICK",
                        "turnSeat": self.active_turn_seat,
                        "timeLeft": self.turn_time_left,
                        "isSplit": s_active.get("isSplit", False),
                        "activeHandIdx": s_active.get("activeHandIdx", 0)
                    })
                    if self.turn_time_left <= 0:
                        # Auto-stand on timeout
                        await self.player_stand(self.active_turn_seat)

    async def start_deal_phase(self):
        self.state = 'DEALING'
        for s in self.seats:
            if s:
                s["cards"] = []
                s["isDone"] = False
                s["isBusted"] = False
                s["isSurrendered"] = False
                s["isSplit"] = False
                s["splitHands"] = []
                s["activeHandIdx"] = 0
        await self.broadcast(self.to_state_payload())

        # Check shoe penetration (reshuffle if less than 60 cards)
        if len(self.shoe) < 60:
            self.shoe = make_shoe(6)
            await self.broadcast({"type": "ANNOUNCEMENT", "message": "Deste Karıştırıldı!"})
            await asyncio.sleep(1)

        # Dealing sequence: 2 cards to each seated bettor, 2 cards to dealer
        for round_idx in range(2):
            for i in range(self.max_seats):
                seat = self.seats[i]
                if seat and seat["bet"] > 0:
                    card = self.shoe.pop()
                    seat["cards"].append(card)
                    await self.broadcast({
                        "type": "CARD_DEALT",
                        "target": "seat",
                        "seatIndex": i,
                        "card": card,
                        "calc": calculate_hand(seat["cards"])
                    })
                    await asyncio.sleep(0.5)

            # Dealer card
            d_card = self.shoe.pop()
            self.dealer_cards.append(d_card)
            is_hidden = (round_idx == 1)
            up_val = 11 if (self.dealer_cards[0].get("isAce")) else self.dealer_cards[0]["value"]
            await self.broadcast({
                "type": "CARD_DEALT",
                "target": "dealer",
                "card": {"isHidden": True} if is_hidden else d_card,
                "dealerTotal": up_val,
                "dealerCalc": {"total": up_val}
            })
            await asyncio.sleep(0.5)

        # Check for Natural Blackjacks
        dealer_calc = calculate_hand(self.dealer_cards)
        dealer_has_bj = dealer_calc["isBlackjack"]

        for i, s in enumerate(self.seats):
            if s and s["bet"] > 0:
                calc = calculate_hand(s["cards"])
                if calc["isBlackjack"]:
                    s["isDone"] = True

        if dealer_has_bj:
            # Reveal dealer hole immediately
            self.dealer_hole_hidden = False
            await self.broadcast(self.to_state_payload())
            await asyncio.sleep(1)
            await self.finish_round()
            return

        # Advance to first player's turn
        await self.advance_turn(-1)

    async def advance_turn(self, current_seat):
        next_seat = -1
        for i in range(current_seat + 1, self.max_seats):
            if self.seats[i] and self.seats[i]["bet"] > 0 and not self.seats[i]["isDone"]:
                next_seat = i
                break

        if next_seat != -1:
            self.state = 'TURNS'
            self.active_turn_seat = next_seat
            self.turn_time_left = 15
            await self.broadcast({
                "type": "PLAYER_TURN_START",
                "seatIndex": next_seat,
                "username": self.seats[next_seat]["user"]["username"],
                "timeLeft": 15
            })
        else:
            # All players done -> Dealer Turn
            await self.start_dealer_turn()

    async def player_hit(self, seat_idx):
        if self.state != 'TURNS' or self.active_turn_seat != seat_idx:
            return
        seat = self.seats[seat_idx]
        if not seat or seat["isDone"]:
            return

        if seat.get("isSplit"):
            active_idx = seat.get("activeHandIdx", 0)
            hand = seat["splitHands"][active_idx]
            if hand["isDone"]:
                return
            card = self.shoe.pop()
            hand["cards"].append(card)
            calc = calculate_hand(hand["cards"])
            hand["calc"] = calc
            if calc["isBust"]:
                hand["isBusted"] = True
                hand["isDone"] = True
                if active_idx == 0:
                    seat["activeHandIdx"] = 1
                else:
                    seat["isDone"] = True
            elif calc["total"] == 21:
                hand["isDone"] = True
                if active_idx == 0:
                    seat["activeHandIdx"] = 1
                else:
                    seat["isDone"] = True

            await self.broadcast({
                "type": "SPLIT_HAND_UPDATED",
                "seatIndex": seat_idx,
                "username": seat["user"]["username"],
                "handIndex": active_idx,
                "card": card,
                "calc": calc,
                "isDone": hand["isDone"],
                "isBust": calc["isBust"],
                "activeHandIdx": seat["activeHandIdx"]
            })

            if seat["isDone"]:
                await asyncio.sleep(1)
                await self.advance_turn(seat_idx)
            else:
                self.turn_time_left = 15
            return

        card = self.shoe.pop()
        seat["cards"].append(card)
        calc = calculate_hand(seat["cards"])
        await self.broadcast({
            "type": "CARD_DEALT",
            "target": "seat",
            "seatIndex": seat_idx,
            "card": card,
            "calc": calc
        })

        if calc["isBust"]:
            seat["isBusted"] = True
            seat["isDone"] = True
            await self.broadcast({
                "type": "HAND_BUSTED",
                "seatIndex": seat_idx,
                "username": seat["user"]["username"]
            })
            await asyncio.sleep(1)
            await self.advance_turn(seat_idx)
        elif calc["total"] == 21:
            seat["isDone"] = True
            await asyncio.sleep(0.5)
            await self.advance_turn(seat_idx)
        else:
            self.turn_time_left = 15

    async def player_stand(self, seat_idx):
        if self.state != 'TURNS' or self.active_turn_seat != seat_idx:
            return
        seat = self.seats[seat_idx]
        if not seat:
            return

        if seat.get("isSplit"):
            active_idx = seat.get("activeHandIdx", 0)
            hand = seat["splitHands"][active_idx]
            hand["isDone"] = True
            if active_idx == 0:
                seat["activeHandIdx"] = 1
                self.turn_time_left = 15
                await self.broadcast({
                    "type": "SPLIT_HAND_STAND",
                    "seatIndex": seat_idx,
                    "username": seat["user"]["username"],
                    "handIndex": 0,
                    "nextHandIndex": 1
                })
            else:
                seat["isDone"] = True
                await self.broadcast({
                    "type": "SPLIT_HAND_STAND",
                    "seatIndex": seat_idx,
                    "username": seat["user"]["username"],
                    "handIndex": 1,
                    "nextHandIndex": -1
                })
                await asyncio.sleep(0.5)
                await self.advance_turn(seat_idx)
            return

        seat["isDone"] = True
        await self.broadcast({
            "type": "PLAYER_STAND",
            "seatIndex": seat_idx,
            "username": seat["user"]["username"]
        })
        await asyncio.sleep(0.5)
        await self.advance_turn(seat_idx)

    async def player_double(self, seat_idx):
        if self.state != 'TURNS' or self.active_turn_seat != seat_idx:
            return
        seat = self.seats[seat_idx]
        if not seat:
            return
        user = seat["user"]

        if seat.get("isSplit"):
            active_idx = seat.get("activeHandIdx", 0)
            hand = seat["splitHands"][active_idx]
            if len(hand["cards"]) != 2 or hand["isDone"]:
                await self.broadcast({
                    "type": "TOAST",
                    "username": user["username"],
                    "message": "İkiye katlama yalnızca ilk 2 kartta yapılabilir!"
                })
                return
            if user["chips"] < hand["bet"]:
                await self.broadcast({
                    "type": "TOAST",
                    "username": user["username"],
                    "message": f"İkiye katlamak için yeterli çipiniz yok! (Gereken: ${hand['bet']:,})"
                })
                return
            user["chips"] -= hand["bet"]
            hand["bet"] *= 2
            seat["bet"] = sum(h["bet"] for h in seat["splitHands"])
            self.update_user_chips(user["id"], user["chips"])
            card = self.shoe.pop()
            hand["cards"].append(card)
            calc = calculate_hand(hand["cards"])
            hand["calc"] = calc
            hand["isDone"] = True
            if calc["isBust"]:
                hand["isBusted"] = True
            
            if active_idx == 0:
                seat["activeHandIdx"] = 1
                self.turn_time_left = 15
            else:
                seat["isDone"] = True

            await self.broadcast({
                "type": "SPLIT_HAND_DOUBLED",
                "seatIndex": seat_idx,
                "username": user["username"],
                "handIndex": active_idx,
                "card": card,
                "calc": calc,
                "newBet": hand["bet"],
                "seatBet": seat["bet"],
                "chips": user["chips"],
                "activeHandIdx": seat["activeHandIdx"]
            })

            if seat["isDone"]:
                await asyncio.sleep(1)
                await self.advance_turn(seat_idx)
            return

        if len(seat["cards"]) != 2:
            await self.broadcast({
                "type": "TOAST",
                "username": seat["user"]["username"],
                "message": "İkiye katlama yalnızca ilk iki kartta yapılabilir!"
            })
            return
        if user["chips"] < seat["bet"]:
            await self.broadcast({
                "type": "TOAST",
                "username": user["username"],
                "message": f"İkiye katlamak için yeterli çipiniz yok! (Gereken: ${seat['bet']:,})"
            })
            return

        user["chips"] -= seat["bet"]
        seat["bet"] *= 2
        self.update_user_chips(user["id"], user["chips"])

        card = self.shoe.pop()
        seat["cards"].append(card)
        calc = calculate_hand(seat["cards"])
        seat["isDone"] = True
        if calc["isBust"]:
            seat["isBusted"] = True

        await self.broadcast({
            "type": "PLAYER_DOUBLED",
            "seatIndex": seat_idx,
            "username": user["username"],
            "card": card,
            "calc": calc,
            "newBet": seat["bet"],
            "chips": user["chips"]
        })
        await asyncio.sleep(1)
        await self.advance_turn(seat_idx)

    async def player_surrender(self, seat_idx):
        if self.state != 'TURNS' or self.active_turn_seat != seat_idx:
            return
        seat = self.seats[seat_idx]
        if not seat:
            return
        if seat.get("isSplit") or len(seat.get("cards", [])) != 2:
            await self.broadcast({
                "type": "TOAST",
                "username": seat["user"]["username"],
                "message": "Pes etme yalnızca ilk iki kartta yapılabilir!"
            })
            return
        user = seat["user"]
        refund = seat["bet"] // 2
        user["chips"] += refund
        seat["bet"] = 0
        seat["isDone"] = True
        seat["isSurrendered"] = True
        self.update_user_chips(user["id"], user["chips"])

        await self.broadcast({
            "type": "PLAYER_SURRENDERED",
            "seatIndex": seat_idx,
            "username": user["username"],
            "refund": refund,
            "chips": user["chips"]
        })
        await asyncio.sleep(0.8)
        await self.advance_turn(seat_idx)

    async def player_split(self, seat_idx):
        if self.state != 'TURNS' or self.active_turn_seat != seat_idx:
            return
        seat = self.seats[seat_idx]
        if not seat:
            return
        if seat.get("isSplit"):
            await self.broadcast({
                "type": "TOAST",
                "username": seat["user"]["username"],
                "message": "Bir turda yalnızca bir kez bölme yapılabilir!"
            })
            return
        if len(seat.get("cards", [])) != 2:
            await self.broadcast({
                "type": "TOAST",
                "username": seat["user"]["username"],
                "message": "Bölme işlemi yalnızca ilk 2 kartta yapılabilir!"
            })
            return
        
        c1, c2 = seat["cards"][0], seat["cards"][1]
        c1_val = 10 if c1["rank"] in ['10', 'J', 'Q', 'K'] else (11 if c1["rank"] == 'A' else int(c1["rank"]))
        c2_val = 10 if c2["rank"] in ['10', 'J', 'Q', 'K'] else (11 if c2["rank"] == 'A' else int(c2["rank"]))
        
        if c1["rank"] != c2["rank"] and c1_val != c2_val:
            await self.broadcast({
                "type": "TOAST",
                "username": seat["user"]["username"],
                "message": f"Bölme yalnızca aynı değerdeki çift kartlarda yapılabilir! ({c1['rank']} ve {c2['rank']} bölünemez)"
            })
            return

        user = seat["user"]
        if user["chips"] < seat["bet"]:
            await self.broadcast({
                "type": "TOAST",
                "username": user["username"],
                "message": f"Bölmek için yeterli çipiniz yok! (Gereken: ${seat['bet']:,})"
            })
            return

        # Deduct matching bet for second hand
        user["chips"] -= seat["bet"]
        self.update_user_chips(user["id"], user["chips"])

        # Deal one replacement card to each split hand
        new_c1 = self.shoe.pop()
        new_c2 = self.shoe.pop()

        is_ace_split = (c1["rank"] == 'A')

        hand0 = {
            "cards": [c1, new_c1],
            "calc": calculate_hand([c1, new_c1]),
            "bet": seat["bet"],
            "isDone": is_ace_split,
            "isBusted": False
        }
        hand1 = {
            "cards": [c2, new_c2],
            "calc": calculate_hand([c2, new_c2]),
            "bet": seat["bet"],
            "isDone": is_ace_split,
            "isBusted": False
        }

        seat["isSplit"] = True
        seat["splitHands"] = [hand0, hand1]
        seat["activeHandIdx"] = 0
        seat["bet"] = sum(h["bet"] for h in seat["splitHands"])
        if is_ace_split:
            seat["isDone"] = True

        await self.broadcast({
            "type": "PLAYER_SPLIT",
            "seatIndex": seat_idx,
            "username": user["username"],
            "chips": user["chips"],
            "bet": seat["bet"],
            "hands": [
                { "cards": hand0["cards"], "calc": hand0["calc"], "bet": hand0["bet"], "isDone": hand0["isDone"] },
                { "cards": hand1["cards"], "calc": hand1["calc"], "bet": hand1["bet"], "isDone": hand1["isDone"] }
            ],
            "activeHandIdx": 0 if not is_ace_split else -1
        })

        if is_ace_split:
            await self.broadcast({
                "type": "TOAST",
                "username": user["username"],
                "message": "Aslar bölündü! Her iki ele tek kart verildi ve tur tamamlandı."
            })
            await asyncio.sleep(1)
            await self.advance_turn(seat_idx)
        else:
            await self.broadcast({
                "type": "TOAST",
                "username": user["username"],
                "message": "El ikiye bölündü! 1. El ile devam ediyorsunuz."
            })

    async def start_dealer_turn(self):
        self.state = 'DEALER'
        self.active_turn_seat = -1
        self.dealer_hole_hidden = False
        await self.broadcast(self.to_state_payload())
        await asyncio.sleep(0.8)

        # Check if dealer needs to draw
        any_survivor = False
        for s in self.seats:
            if s and s["bet"] > 0:
                if s.get("isSplit"):
                    if any(not h.get("isBusted") for h in s.get("splitHands", [])):
                        any_survivor = True
                        break
                elif not s.get("isBusted") and not s.get("isSurrendered"):
                    any_survivor = True
                    break

        if any_survivor:
            dealer_calc = calculate_hand(self.dealer_cards)
            while dealer_calc["total"] < 17:
                c = self.shoe.pop()
                self.dealer_cards.append(c)
                dealer_calc = calculate_hand(self.dealer_cards)
                await self.broadcast({
                    "type": "CARD_DEALT",
                    "target": "dealer",
                    "card": c,
                    "dealerTotal": dealer_calc["total"],
                    "dealerCalc": dealer_calc
                })
                await asyncio.sleep(0.8)

        await self.finish_round()

    async def finish_round(self):
        self.state = 'PAYOUT'
        dealer_calc = calculate_hand(self.dealer_cards)
        dealer_bust = dealer_calc["isBust"]
        dealer_total = dealer_calc["total"]
        dealer_bj = dealer_calc["isBlackjack"]

        payout_results = []

        conn = get_db()
        cur = conn.cursor()

        for i, s in enumerate(self.seats):
            if not s or s["bet"] <= 0:
                continue

            user = s["user"]

            if s.get("isSplit"):
                total_split_win = 0
                split_res = []
                for h_idx, h in enumerate(s.get("splitHands", [])):
                    h_calc = h["calc"]
                    h_total = h_calc["total"]
                    h_bj = h_calc["isBlackjack"]
                    h_bust = h.get("isBusted", False) or h_calc["isBust"]
                    h_win = 0
                    h_outcome = ""

                    if h_bust:
                        h_outcome = "lose"
                        h_win = 0
                    elif dealer_bj:
                        if h_bj:
                            h_outcome = "push"
                            h_win = h["bet"]
                        else:
                            h_outcome = "lose"
                            h_win = 0
                    elif h_bj:
                        h_outcome = "blackjack"
                        h_win = int(h["bet"] * 2.5)
                    elif dealer_bust:
                        h_outcome = "win"
                        h_win = h["bet"] * 2
                    elif h_total > dealer_total:
                        h_outcome = "win"
                        h_win = h["bet"] * 2
                    elif h_total < dealer_total:
                        h_outcome = "lose"
                        h_win = 0
                    else:
                        h_outcome = "push"
                        h_win = h["bet"]

                    total_split_win += h_win
                    split_res.append({
                        "handIndex": h_idx,
                        "bet": h["bet"],
                        "outcome": h_outcome,
                        "winAmount": h_win,
                        "total": h_total
                    })

                    user["hands_played"] += 1
                    if h_outcome in ['win', 'blackjack']:
                        user["wins"] += 1
                        user["total_won"] = user.get("total_won", 0) + h_win
                        if h_win > user["biggest_win"]:
                            user["biggest_win"] = h_win
                    if h_outcome == 'blackjack':
                        user["blackjacks"] += 1

                user["chips"] += total_split_win
                cur.execute("""
                    UPDATE users SET 
                        chips = ?, hands_played = ?, wins = ?, 
                        blackjacks = ?, biggest_win = ?, total_won = ?
                    WHERE id = ?
                """, (user["chips"], user["hands_played"], user["wins"], 
                      user["blackjacks"], user["biggest_win"], user.get("total_won", 0), user["id"]))

                seat_total_bet = sum(h["bet"] for h in s.get("splitHands", []))
                split_outcome = "win" if total_split_win > seat_total_bet else ("push" if total_split_win == seat_total_bet else "lose")
                payout_results.append({
                    "seatIndex": i,
                    "username": user["username"],
                    "isSplit": True,
                    "bet": seat_total_bet,
                    "totalBet": seat_total_bet,
                    "splitResults": split_res,
                    "outcome": split_outcome,
                    "winAmount": total_split_win,
                    "chips": user["chips"]
                })
                continue

            calc = calculate_hand(s["cards"])
            p_total = calc["total"]
            p_bj = calc["isBlackjack"]
            win_amount = 0
            outcome = ""

            is_bust = s.get("isBusted", False) or calc["isBust"]
            if is_bust:
                outcome = "lose"
                win_amount = 0
            elif dealer_bj:
                if p_bj:
                    outcome = "push"
                    win_amount = s["bet"]
                else:
                    outcome = "lose"
                    win_amount = 0
            elif p_bj:
                outcome = "blackjack"
                win_amount = int(s["bet"] * 2.5) # 3:2 payout
            elif dealer_bust:
                outcome = "win"
                win_amount = s["bet"] * 2
            elif p_total > dealer_total:
                outcome = "win"
                win_amount = s["bet"] * 2
            elif p_total < dealer_total:
                outcome = "lose"
                win_amount = 0
            else:
                outcome = "push"
                win_amount = s["bet"]

            s["result"] = outcome
            user["chips"] += win_amount
            user["hands_played"] += 1
            if outcome in ['win', 'blackjack']:
                user["wins"] += 1
                user["total_won"] = user.get("total_won", 0) + win_amount
                if win_amount > user["biggest_win"]:
                    user["biggest_win"] = win_amount
            if outcome == 'blackjack':
                user["blackjacks"] += 1

            # Update DB stats
            cur.execute("""
                UPDATE users SET 
                    chips = ?, hands_played = ?, wins = ?, 
                    blackjacks = ?, biggest_win = ?, total_won = ?
                WHERE id = ?
            """, (user["chips"], user["hands_played"], user["wins"], 
                  user["blackjacks"], user["biggest_win"], user.get("total_won", 0), user["id"]))

            payout_results.append({
                "seatIndex": i,
                "username": user["username"],
                "bet": s["bet"],
                "calc": calc,
                "total": p_total,
                "outcome": outcome,
                "winAmount": win_amount,
                "chips": user["chips"]
            })

        conn.commit()
        conn.close()

        await self.broadcast({
            "type": "ROUND_FINISHED",
            "dealerCalc": dealer_calc,
            "results": payout_results
        })

        # Allow instant skip via "Tekrar Oyna" or max 4.5 seconds showcase
        self.payout_start_time = time.time()
        self.payout_skip_event = asyncio.Event()
        try:
            await asyncio.wait_for(self.payout_skip_event.wait(), timeout=4.5)
        except asyncio.TimeoutError:
            pass
        self.dealer_cards = []
        self.dealer_hole_hidden = True
        self.active_turn_seat = -1
        self.countdown = 0
        for s in self.seats:
            if s:
                s["cards"] = []
                s["bet"] = 0
                s["isDone"] = False
                s["isBusted"] = False
                s["isSurrendered"] = False
                s["isSplit"] = False
                s["splitHands"] = []
                s["activeHandIdx"] = 0
                s["result"] = None
        self.state = 'WAITING'
        await self.broadcast(self.to_state_payload())

# ==============================================================================
# Lobby & Room Manager
# ==============================================================================

TABLES = {
    "table-rookie": MultiplayerTable("table-rookie", "Acemi Salonu (Rookie)", min_bet=5, max_bet=2000, max_seats=3),
    "table-vegas": MultiplayerTable("table-vegas", "Vegas Strip VIP", min_bet=25, max_bet=10000, max_seats=3),
    "table-montecarlo": MultiplayerTable("table-montecarlo", "Monte Carlo Salon", min_bet=100, max_bet=25000, max_seats=3),
    "table-millionaire": MultiplayerTable("table-millionaire", "Dinamo High Roller", min_bet=500, max_bet=100000, max_seats=3)
}

async def start_background_tasks(app):
    for tbl in TABLES.values():
        tbl.start_loop()

# ==============================================================================
# REST API Endpoints
# ==============================================================================

async def api_register(request):
    try:
        data = await request.json()
        username = data.get("username", "").strip()
        password = data.get("password", "")
        avatar = data.get("avatar", "avatar-vip-1")

        if len(username) < 3 or len(username) > 16:
            return web.json_response({"success": False, "error": "Kullanıcı adı 3-16 karakter olmalıdır."})
        if len(password) < 4:
            return web.json_response({"success": False, "error": "Şifre en az 4 karakter olmalıdır."})

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cur.fetchone():
            conn.close()
            return web.json_response({"success": False, "error": "Bu kullanıcı adı zaten alınmış!"})

        pw_hash = hash_pw(password)
        cur.execute("""
            INSERT INTO users (username, password_hash, avatar, chips, vip_level)
            VALUES (?, ?, ?, 5000, 1)
        """, (username, pw_hash, avatar))
        user_id = cur.lastrowid
        conn.commit()

        # Retrieve user row
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = dict(cur.fetchone())
        del row["password_hash"]

        token = secrets.token_hex(24)
        cur.execute("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, time.time()))
        conn.commit()
        conn.close()

        ACTIVE_SESSIONS[token] = row

        return web.json_response({"success": True, "token": token, "user": row})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

async def api_login(request):
    try:
        data = await request.json()
        username = data.get("username", "").strip()
        password = data.get("password", "")

        conn = get_db()
        cur = conn.cursor()
        pw_hash = hash_pw(password)
        cur.execute("SELECT * FROM users WHERE username = ? AND password_hash = ?", (username, pw_hash))
        row = cur.fetchone()

        if not row:
            conn.close()
            return web.json_response({"success": False, "error": "Kullanıcı adı veya şifre hatalı!"})

        user_dict = dict(row)
        del user_dict["password_hash"]

        token = secrets.token_hex(24)
        cur.execute("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_dict["id"], time.time()))
        conn.commit()
        conn.close()

        ACTIVE_SESSIONS[token] = user_dict

        return web.json_response({"success": True, "token": token, "user": user_dict})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

async def api_me(request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user = get_user_by_token(token)
    if not user:
        username = request.headers.get("X-Username")
        if username:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM users WHERE username = ?", (username,))
            row = cur.fetchone()
            if not row:
                pw_hash = hash_pw("auto_healed_vip")
                cur.execute("INSERT INTO users (username, password_hash, chips) VALUES (?, ?, 5000)", (username, pw_hash))
                conn.commit()
                user_id = cur.lastrowid
                cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                row = cur.fetchone()
            if row:
                user = dict(row)
                del user["password_hash"]
                if token:
                    cur.execute("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user["id"], time.time()))
                    conn.commit()
                ACTIVE_SESSIONS[token] = user
            conn.close()

    if not user:
        return web.json_response({"success": False, "error": "Oturum geçersiz"}, status=401)
    
    # Refresh chips and stats from DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
    row = dict(cur.fetchone())
    conn.close()
    del row["password_hash"]
    ACTIVE_SESSIONS[token] = row
    return web.json_response({"success": True, "user": row})

async def api_daily_bonus(request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user = get_user_by_token(token)
    if not user:
        return web.json_response({"success": False, "error": "Oturum geçersiz"}, status=401)

    now = time.time()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT last_bonus, chips FROM users WHERE id = ?", (user["id"],))
    row = cur.fetchone()
    last_bonus = row["last_bonus"] or 0

    if now - last_bonus < 86400 and user["chips"] > 100:
        remain_hrs = int((86400 - (now - last_bonus)) / 3600)
        conn.close()
        return web.json_response({
            "success": False, 
            "error": f"Günlük bonus için {remain_hrs} saat beklemelisiniz!"
        })

    bonus_amount = 1000
    new_chips = row["chips"] + bonus_amount
    cur.execute("UPDATE users SET chips = ?, last_bonus = ? WHERE id = ?", (new_chips, now, user["id"]))
    conn.commit()
    conn.close()

    user["chips"] = new_chips
    return web.json_response({"success": True, "bonus": bonus_amount, "newChips": new_chips})

async def api_tables(request):
    tables_list = [tbl.to_summary() for tbl in TABLES.values()]
    return web.json_response({"success": True, "tables": tables_list})

async def api_leaderboard(request):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT username, avatar, chips, vip_level, wins, hands_played, biggest_win, total_won 
        FROM users ORDER BY wins DESC, total_won DESC, CAST(chips AS INTEGER) DESC LIMIT 10
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return web.json_response({"success": True, "leaderboard": rows})

# ==============================================================================
# WebSocket Real-Time Multiplayer Handler
# ==============================================================================

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    current_table = None
    current_seat_idx = None
    current_user = None

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                action = data.get("action")

                # 1. Join Table as Spectator
                if action == "JOIN_TABLE":
                    token = data.get("token")
                    username = data.get("username")
                    current_user = get_user_by_token(token)
                    if not current_user and username:
                        try:
                            conn = get_db()
                            cur = conn.cursor()
                            cur.execute("SELECT * FROM users WHERE username = ?", (username,))
                            row = cur.fetchone()
                            if not row:
                                pw_hash = hash_pw("auto_healed_vip")
                                cur.execute("INSERT INTO users (username, password_hash, chips) VALUES (?, ?, 5000)", (username, pw_hash))
                                conn.commit()
                                user_id = cur.lastrowid
                                cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                                row = cur.fetchone()
                            if row:
                                current_user = dict(row)
                                if "password_hash" in current_user:
                                    del current_user["password_hash"]
                                if token:
                                    cur.execute("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, current_user["id"], time.time()))
                                    conn.commit()
                                ACTIVE_SESSIONS[token] = current_user
                            conn.close()
                        except Exception as e:
                            print("Auto-heal session err:", e)
                    table_id = data.get("tableId")
                    if table_id in TABLES:
                        if current_table:
                            current_table.remove_client(ws)
                        current_table = TABLES[table_id]
                        await current_table.add_spectator(ws)

                # 2. Sit at Seat (Allows player to sit at multiple seats)
                elif action == "TAKE_SEAT":
                    if not current_user:
                        token = data.get("token")
                        username = data.get("username")
                        if token:
                            current_user = get_user_by_token(token)
                        if not current_user and username:
                            try:
                                conn = get_db()
                                cur = conn.cursor()
                                cur.execute("SELECT * FROM users WHERE username = ?", (username,))
                                row = cur.fetchone()
                                if not row:
                                    pw_hash = hash_pw("auto_healed_vip")
                                    cur.execute("INSERT INTO users (username, password_hash, chips) VALUES (?, ?, 5000)", (username, pw_hash))
                                    conn.commit()
                                    user_id = cur.lastrowid
                                    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                                    row = cur.fetchone()
                                if row:
                                    current_user = dict(row)
                                    if "password_hash" in current_user:
                                        del current_user["password_hash"]
                                    if token:
                                        cur.execute("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, current_user["id"], time.time()))
                                        conn.commit()
                                    ACTIVE_SESSIONS[token] = current_user
                                conn.close()
                            except Exception as e:
                                print("Take seat auto-heal err:", e)

                    if not current_table or not current_user:
                        await ws.send_str(json.dumps({"type": "ERROR", "message": "Önce giriş yapmalısınız!"}))
                        continue
                    seat_idx = data.get("seatIndex")
                    if 0 <= seat_idx < current_table.max_seats:
                        if current_table.seats[seat_idx] is None:
                            # In real Blackjack, a player can take 1, 2, or all 3 seats!
                            current_table.seats[seat_idx] = {
                                "user": current_user,
                                "bet": 0,
                                "cards": [],
                                "isDone": False,
                                "isBusted": False,
                                "ws": ws
                            }
                            if ws in current_table.spectators:
                                current_table.spectators.remove(ws)
                            if current_table.state == 'WAITING':
                                current_table.state = 'BETTING'
                                current_table.countdown = 12
                                current_table.dealer_cards = []
                                current_table.dealer_hole_hidden = True
                                for s in current_table.seats:
                                    if s:
                                        s["cards"] = []
                                        s["bet"] = 0
                                        s["isDone"] = False
                                        s["isBusted"] = False
                                        s["result"] = None
                            await current_table.broadcast(current_table.to_state_payload())

                # 3. Leave Seat
                elif action == "LEAVE_SEAT":
                    seat_idx = data.get("seatIndex")
                    if current_table:
                        if seat_idx is not None and 0 <= seat_idx < current_table.max_seats:
                            if current_table.seats[seat_idx] and current_table.seats[seat_idx]["user"]["id"] == current_user["id"]:
                                current_table.seats[seat_idx] = None
                        else:
                            # Leave all seats
                            for i in range(current_table.max_seats):
                                if current_table.seats[i] and current_table.seats[i]["user"]["id"] == current_user["id"]:
                                    current_table.seats[i] = None
                        # If no remaining seats, become spectator
                        has_any_seat = any(s and s["user"]["id"] == current_user["id"] for s in current_table.seats)
                        if not has_any_seat:
                            current_table.spectators.add(ws)
                        # If table is now empty, reset to WAITING
                        seated_left = [s for s in current_table.seats if s is not None]
                        if not seated_left:
                            current_table.state = 'WAITING'
                            current_table.countdown = 0
                            current_table.dealer_cards = []
                            current_table.active_turn_seat = -1
                        await current_table.broadcast(current_table.to_state_payload())

                # 4. Place Bet (Supports targeting any of the player's seated seats)
                elif action == "PLACE_BET":
                    amount = int(data.get("amount", 0))
                    seat_idx = data.get("seatIndex")
                    if current_table and current_table.state == 'BETTING' and current_user:
                        target_seat = None
                        target_idx = None
                        if seat_idx is not None and 0 <= seat_idx < current_table.max_seats:
                            s = current_table.seats[seat_idx]
                            if s and s["user"]["id"] == current_user["id"]:
                                target_seat = s
                                target_idx = seat_idx
                        else:
                            # Default to player's first seat
                            for i in range(current_table.max_seats):
                                if current_table.seats[i] and current_table.seats[i]["user"]["id"] == current_user["id"]:
                                    target_seat = current_table.seats[i]
                                    target_idx = i
                                    break

                        if target_seat and target_idx is not None:
                            if current_user["chips"] < amount:
                                await ws.send_str(json.dumps({
                                    "type": "ANNOUNCEMENT",
                                    "message": "Yetersiz bakiye!"
                                }))
                            elif target_seat["bet"] + amount > current_table.max_bet:
                                await ws.send_str(json.dumps({
                                    "type": "ANNOUNCEMENT",
                                    "message": f"Bu masanın maksimum bahis limiti: ${current_table.max_bet:,}"
                                }))
                            else:
                                current_user["chips"] -= amount
                                target_seat["bet"] += amount
                                current_table.update_user_chips(current_user["id"], current_user["chips"])
                                await current_table.broadcast({
                                    "type": "BET_PLACED",
                                    "seatIndex": target_idx,
                                    "bet": target_seat["bet"],
                                    "chips": current_user["chips"]
                                })

                # 5. Clear Bet
                elif action == "CLEAR_BET":
                    seat_idx = data.get("seatIndex")
                    if current_table and current_table.state == 'BETTING' and current_user:
                        if seat_idx is not None and 0 <= seat_idx < current_table.max_seats:
                            s = current_table.seats[seat_idx]
                            if s and s["user"]["id"] == current_user["id"] and s["bet"] > 0:
                                current_user["chips"] += s["bet"]
                                s["bet"] = 0
                                current_table.update_user_chips(current_user["id"], current_user["chips"])
                                await current_table.broadcast({
                                    "type": "BET_PLACED",
                                    "seatIndex": seat_idx,
                                    "bet": 0,
                                    "chips": current_user["chips"]
                                })
                        else:
                            # Clear all seats belonging to user
                            for i in range(current_table.max_seats):
                                s = current_table.seats[i]
                                if s and s["user"]["id"] == current_user["id"] and s["bet"] > 0:
                                    current_user["chips"] += s["bet"]
                                    s["bet"] = 0
                                    current_table.update_user_chips(current_user["id"], current_user["chips"])
                                    await current_table.broadcast({
                                        "type": "BET_PLACED",
                                        "seatIndex": i,
                                        "bet": 0,
                                        "chips": current_user["chips"]
                                    })
                # 6. Gameplay Actions (Hit, Stand, Double, Split, Surrender) - applies to selected or active turn seat
                elif action in ["HIT", "STAND", "DOUBLE", "SPLIT", "SURRENDER"]:
                    if current_table and current_user and current_table.state == 'TURNS':
                        req_seat_idx = data.get("seatIndex")
                        if req_seat_idx is not None and 0 <= req_seat_idx < current_table.max_seats:
                            cand_seat = current_table.seats[req_seat_idx]
                            if cand_seat and cand_seat["user"]["id"] == current_user["id"] and cand_seat["bet"] > 0 and not cand_seat["isDone"]:
                                current_table.active_turn_seat = req_seat_idx
                        
                        target_seat_idx = current_table.active_turn_seat
                        if target_seat_idx != -1:
                            turn_seat = current_table.seats[target_seat_idx]
                            if turn_seat and turn_seat["user"]["id"] == current_user["id"] and not turn_seat["isDone"]:
                                if action == "HIT":
                                    await current_table.player_hit(target_seat_idx)
                                elif action == "STAND":
                                    await current_table.player_stand(target_seat_idx)
                                elif action == "DOUBLE":
                                    await current_table.player_double(target_seat_idx)
                                elif action == "SPLIT":
                                    await current_table.player_split(target_seat_idx)
                                elif action == "SURRENDER":
                                    await current_table.player_surrender(target_seat_idx)

                elif action == "SELECT_ACTIVE_SEAT":
                    seat_idx = data.get("seatIndex")
                    if current_table and current_user and current_table.state == 'TURNS' and seat_idx is not None:
                        if 0 <= seat_idx < current_table.max_seats:
                            target_seat = current_table.seats[seat_idx]
                            if target_seat and target_seat["user"]["id"] == current_user["id"] and target_seat["bet"] > 0 and not target_seat["isDone"]:
                                current_table.active_turn_seat = seat_idx
                                current_table.turn_time_left = 15
                                await current_table.broadcast({
                                    "type": "PLAYER_TURN_START",
                                    "seatIndex": seat_idx,
                                    "username": current_user["username"],
                                    "timeLeft": 15
                                })

                # 7. Live Table Chat
                elif action == "CHAT":
                    msg_text = data.get("text", "").strip()[:100]
                    if current_table and current_user and msg_text:
                        await current_table.broadcast({
                            "type": "CHAT_MESSAGE",
                            "username": current_user["username"],
                            "avatar": current_user["avatar"],
                            "text": msg_text,
                            "time": time.strftime("%H:%M")
                        })

                # 8. Skip Payout Delay / Immediate Next Round
                elif action in ["NEXT_ROUND", "SKIP_PAYOUT"]:
                    if current_table and current_table.state == 'PAYOUT':
                        current_table.skip_payout()

    finally:
        if current_table:
            # Vacate seats belonging to this connection
            for i in range(current_table.max_seats):
                if current_table.seats[i] and (current_table.seats[i].get("ws") == ws or (current_user and current_table.seats[i]["user"]["id"] == current_user["id"])):
                    current_table.seats[i] = None
            current_table.remove_client(ws)
            await current_table.broadcast(current_table.to_state_payload())

    return ws

# ==============================================================================
# Web App Startup & Routing
# ==============================================================================

@web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        resp = web.Response(status=200)
    else:
        try:
            resp = await handler(request)
        except Exception as e:
            resp = web.json_response({"success": False, "error": str(e)}, status=500)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    return resp

def create_app():
    init_db()
    app = web.Application(middlewares=[cors_middleware])
    app.on_startup.append(start_background_tasks)

    # REST APIs
    app.router.add_post('/api/register', api_register)
    app.router.add_post('/api/login', api_login)
    app.router.add_get('/api/me', api_me)
    app.router.add_post('/api/daily-bonus', api_daily_bonus)
    app.router.add_get('/api/tables', api_tables)
    app.router.add_get('/api/leaderboard', api_leaderboard)

    # Real-Time WebSocket
    app.router.add_get('/ws', ws_handler)

    # Serve static assets
    app.router.add_static('/css/', path=os.path.join(BASE_DIR, 'css'), name='css')
    app.router.add_static('/js/', path=os.path.join(BASE_DIR, 'js'), name='js')
    app.router.add_static('/assets/', path=os.path.join(BASE_DIR, 'assets'), name='assets')
    
    async def index(request):
        return web.FileResponse(os.path.join(BASE_DIR, 'index.html'))

    async def manifest_handler(request):
        return web.FileResponse(os.path.join(BASE_DIR, 'manifest.json'), headers={'Content-Type': 'application/manifest+json'})

    async def sw_handler(request):
        return web.FileResponse(os.path.join(BASE_DIR, 'sw.js'), headers={'Content-Type': 'application/javascript'})

    async def favicon_handler(request):
        ico_path = os.path.join(BASE_DIR, 'assets', 'favicon.ico')
        if os.path.exists(ico_path):
            return web.FileResponse(ico_path, headers={'Content-Type': 'image/x-icon'})
        return web.FileResponse(os.path.join(BASE_DIR, 'assets', 'icon-192.png'), headers={'Content-Type': 'image/png'})

    app.router.add_get('/', index)
    app.router.add_get('/manifest.json', manifest_handler)
    app.router.add_get('/sw.js', sw_handler)
    app.router.add_get('/favicon.ico', favicon_handler)

    return app

if __name__ == '__main__':
    print("=" * 60)
    print("*** DINAMO BLACKJACK - VIP MULTIPLAYER SERVER ***")
    print(f"Sunucu Baslatiliyor: http://localhost:{PORT}")
    print(f"Yerel Ag (LAN) Baglantisi: http://127.0.0.1:{PORT}")
    print("=" * 60)
    web.run_app(create_app(), host='0.0.0.0', port=PORT)
