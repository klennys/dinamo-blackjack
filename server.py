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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_bonus REAL DEFAULT 0
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

# Active sessions: token -> user_dict
ACTIVE_SESSIONS = {}

def get_user_by_token(token: str):
    return ACTIVE_SESSIONS.get(token)

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
                    "bet": s["bet"],
                    "cards": s["cards"],
                    "calc": calculate_hand(s["cards"]) if s["cards"] else None,
                    "isDone": s["isDone"],
                    "isBusted": s["isBusted"],
                    "result": s.get("result", None)
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
        coros = []
        for s in self.seats:
            if s and s["ws"] and not s["ws"].closed:
                coros.append(s["ws"].send_str(text))
        for ws in list(self.spectators):
            if not ws.closed:
                coros.append(ws.send_str(text))
            else:
                self.spectators.remove(ws)
        if coros:
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
                self.state = 'WAITING'
                self.dealer_cards = []
                self.active_turn_seat = -1
                continue

            # State 1: WAITING -> Start Betting Countdown
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
                        s["result"] = None
                await self.broadcast(self.to_state_payload())

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
                    await self.broadcast({
                        "type": "TURN_TICK",
                        "turnSeat": self.active_turn_seat,
                        "timeLeft": self.turn_time_left
                    })
                    if self.turn_time_left <= 0:
                        # Auto-stand on timeout
                        await self.player_stand(self.active_turn_seat)

    async def start_deal_phase(self):
        self.state = 'DEALING'
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
            await self.broadcast({
                "type": "CARD_DEALT",
                "target": "dealer",
                "card": {"isHidden": True} if is_hidden else d_card,
                "dealerTotal": 11 if (self.dealer_cards[0].get("isAce")) else self.dealer_cards[0]["value"]
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
        if not seat or len(seat["cards"]) != 2:
            return
        user = seat["user"]
        if user["chips"] < seat["bet"]:
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
            "card": card,
            "calc": calc,
            "newBet": seat["bet"],
            "chips": user["chips"]
        })
        await asyncio.sleep(1)
        await self.advance_turn(seat_idx)

    async def start_dealer_turn(self):
        self.state = 'DEALER'
        self.active_turn_seat = -1
        self.dealer_hole_hidden = False
        await self.broadcast(self.to_state_payload())
        await asyncio.sleep(0.8)

        # If all non-surrendered players busted, dealer doesn't need to draw
        any_survivor = any(s for s in self.seats if s and s["bet"] > 0 and not s["isBusted"])
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
            calc = calculate_hand(s["cards"])
            p_total = calc["total"]
            p_bj = calc["isBlackjack"]
            win_amount = 0
            outcome = ""

            if s["isBusted"]:
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
                if win_amount > user["biggest_win"]:
                    user["biggest_win"] = win_amount
            if outcome == 'blackjack':
                user["blackjacks"] += 1

            # Update DB stats
            cur.execute("""
                UPDATE users SET 
                    chips = ?, hands_played = ?, wins = ?, 
                    blackjacks = ?, biggest_win = ?
                WHERE id = ?
            """, (user["chips"], user["hands_played"], user["wins"], 
                  user["blackjacks"], user["biggest_win"], user["id"]))

            payout_results.append({
                "seatIndex": i,
                "username": user["username"],
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

        # Wait 6 seconds before starting the next betting round
        await asyncio.sleep(6)
        self.state = 'WAITING'

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
        conn.close()
        del row["password_hash"]

        token = secrets.token_hex(24)
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
        conn.close()

        if not row:
            return web.json_response({"success": False, "error": "Kullanıcı adı veya şifre hatalı!"})

        user_dict = dict(row)
        del user_dict["password_hash"]

        token = secrets.token_hex(24)
        ACTIVE_SESSIONS[token] = user_dict

        return web.json_response({"success": True, "token": token, "user": user_dict})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

async def api_me(request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user = get_user_by_token(token)
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

    bonus_amount = 2500
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
        SELECT username, avatar, chips, vip_level, wins, hands_played, biggest_win 
        FROM users ORDER BY chips DESC LIMIT 10
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
                    current_user = get_user_by_token(token)
                    table_id = data.get("tableId")
                    if table_id in TABLES:
                        if current_table:
                            current_table.remove_client(ws)
                        current_table = TABLES[table_id]
                        await current_table.add_spectator(ws)

                # 2. Sit at Seat
                elif action == "TAKE_SEAT":
                    if not current_table or not current_user:
                        await ws.send_str(json.dumps({"type": "ERROR", "message": "Önce giriş yapmalısınız!"}))
                        continue
                    seat_idx = data.get("seatIndex")
                    if 0 <= seat_idx < current_table.max_seats:
                        if current_table.seats[seat_idx] is None:
                            # Remove from any existing seat
                            for i in range(current_table.max_seats):
                                if current_table.seats[i] and current_table.seats[i]["user"]["id"] == current_user["id"]:
                                    current_table.seats[i] = None

                            current_table.seats[seat_idx] = {
                                "user": current_user,
                                "bet": 0,
                                "cards": [],
                                "isDone": False,
                                "isBusted": False,
                                "ws": ws
                            }
                            current_seat_idx = seat_idx
                            if ws in current_table.spectators:
                                current_table.spectators.remove(ws)
                            await current_table.broadcast(current_table.to_state_payload())

                # 3. Leave Seat
                elif action == "LEAVE_SEAT":
                    if current_table and current_seat_idx is not None:
                        current_table.seats[current_seat_idx] = None
                        current_seat_idx = None
                        current_table.spectators.add(ws)
                        await current_table.broadcast(current_table.to_state_payload())

                # 4. Place Bet
                elif action == "PLACE_BET":
                    amount = int(data.get("amount", 0))
                    if current_table and current_seat_idx is not None:
                        if current_table.state == 'BETTING':
                            seat = current_table.seats[current_seat_idx]
                            if seat:
                                if current_user["chips"] < amount:
                                    await ws.send_str(json.dumps({
                                        "type": "ANNOUNCEMENT",
                                        "message": "Yetersiz bakiye!"
                                    }))
                                elif seat["bet"] + amount > current_table.max_bet:
                                    await ws.send_str(json.dumps({
                                        "type": "ANNOUNCEMENT",
                                        "message": f"Bu masanın maksimum bahis limiti: ${current_table.max_bet:,}"
                                    }))
                                else:
                                    current_user["chips"] -= amount
                                    seat["bet"] += amount
                                    current_table.update_user_chips(current_user["id"], current_user["chips"])
                                    await current_table.broadcast({
                                        "type": "BET_PLACED",
                                        "seatIndex": current_seat_idx,
                                        "bet": seat["bet"],
                                        "chips": current_user["chips"]
                                    })

                # 5. Clear Bet
                elif action == "CLEAR_BET":
                    if current_table and current_seat_idx is not None and current_table.state == 'BETTING':
                        seat = current_table.seats[current_seat_idx]
                        if seat and seat["bet"] > 0:
                            current_user["chips"] += seat["bet"]
                            seat["bet"] = 0
                            current_table.update_user_chips(current_user["id"], current_user["chips"])
                            await current_table.broadcast({
                                "type": "BET_PLACED",
                                "seatIndex": current_seat_idx,
                                "bet": 0,
                                "chips": current_user["chips"]
                            })

                # 6. Gameplay Actions (Hit, Stand, Double)
                elif action == "HIT":
                    if current_table and current_seat_idx is not None:
                        await current_table.player_hit(current_seat_idx)

                elif action == "STAND":
                    if current_table and current_seat_idx is not None:
                        await current_table.player_stand(current_seat_idx)

                elif action == "DOUBLE":
                    if current_table and current_seat_idx is not None:
                        await current_table.player_double(current_seat_idx)

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

    finally:
        if current_table:
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
    
    async def index(request):
        return web.FileResponse(os.path.join(BASE_DIR, 'index.html'))
    
    app.router.add_get('/', index)

    return app

if __name__ == '__main__':
    print("=" * 60)
    print("*** DINAMO BLACKJACK - VIP MULTIPLAYER SERVER ***")
    print(f"Sunucu Baslatiliyor: http://localhost:{PORT}")
    print(f"Yerel Ag (LAN) Baglantisi: http://127.0.0.1:{PORT}")
    print("=" * 60)
    web.run_app(create_app(), host='0.0.0.0', port=PORT)
