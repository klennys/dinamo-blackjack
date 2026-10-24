/**
 * DINAMO BLACKJACK - Real-Time Multiplayer WebSocket Client
 */

class MultiplayerClient {
    constructor() {
        this.ws = null;
        this.currentTableId = null;
        this.mySeatIndex = null;
        this.tableState = null;
        this.listeners = [];
        this.isConnected = false;
    }

    subscribe(fn) {
        this.listeners.push(fn);
    }

    notify(event, data) {
        for (const fn of this.listeners) {
            fn(event, data);
        }
    }

    connect(tableId) {
        if (this.ws) {
            this.disconnect();
        }

        this.currentTableId = tableId;
        this.mySeatIndex = null;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:5000';
        const wsUrl = `${protocol}//${host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                const token = window.authManager.token;
                const me = window.authManager.user;
                this.send({
                    action: 'JOIN_TABLE',
                    tableId: tableId,
                    token: token,
                    username: me ? me.username : null
                });
                this.notify('CONNECTED', { tableId });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('WS Parse Error:', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.notify('DISCONNECTED', {});
            };

            this.ws.onerror = (err) => {
                console.warn('WS Connection error:', err);
                this.notify('CONNECTION_ERROR', { error: err });
            };

        } catch (e) {
            this.notify('CONNECTION_ERROR', { error: e });
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.currentTableId = null;
        this.mySeatIndex = null;
        this.tableState = null;
    }

    send(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    // Actions
    takeSeat(seatIndex) {
        this.send({ action: 'TAKE_SEAT', seatIndex });
    }

    leaveSeat() {
        this.send({ action: 'LEAVE_SEAT' });
        this.mySeatIndex = null;
    }

    placeBet(amount, seatIndex = null) {
        this.send({ action: 'PLACE_BET', amount, seatIndex });
    }

    clearBet(seatIndex = null) {
        this.send({ action: 'CLEAR_BET', seatIndex });
    }

    hit(seatIndex = null) {
        this.send({ action: 'HIT', seatIndex: seatIndex ?? this.selectedActiveSeat ?? this.tableState?.activeTurnSeat });
    }

    stand(seatIndex = null) {
        this.send({ action: 'STAND', seatIndex: seatIndex ?? this.selectedActiveSeat ?? this.tableState?.activeTurnSeat });
    }

    nextRound() {
        this.send({ action: 'NEXT_ROUND' });
    }

    doubleDown(seatIndex = null) {
        this.send({ action: 'DOUBLE', seatIndex: seatIndex ?? this.selectedActiveSeat ?? this.tableState?.activeTurnSeat });
    }

    split(seatIndex = null) {
        this.send({ action: 'SPLIT', seatIndex: seatIndex ?? this.selectedActiveSeat ?? this.tableState?.activeTurnSeat });
    }

    surrender(seatIndex = null) {
        this.send({ action: 'SURRENDER', seatIndex: seatIndex ?? this.selectedActiveSeat ?? this.tableState?.activeTurnSeat });
    }

    selectActiveSeat(seatIndex) {
        this.send({ action: 'SELECT_ACTIVE_SEAT', seatIndex });
    }

    sendChat(text) {
        this.send({ action: 'CHAT', text });
    }

    // Server Message Dispatcher
    handleMessage(msg) {
        switch (msg.type) {
            case 'TABLE_STATE':
                this.tableState = msg;
                // Identify all seats belonging to current user (Multi-seat play)
                const me = window.authManager.user;
                this.mySeatIndices = [];
                if (me && msg.seats) {
                    msg.seats.forEach((s, idx) => {
                        if (s && s.username === me.username) {
                            this.mySeatIndices.push(idx);
                        }
                    });
                    this.mySeatIndex = this.mySeatIndices.length > 0 ? this.mySeatIndices[0] : null;
                }
                this.notify('TABLE_STATE_UPDATE', msg);
                break;

            case 'COUNTDOWN_TICK':
                this.notify('COUNTDOWN_TICK', msg);
                break;

            case 'CARD_DEALT':
                if (this.tableState) {
                    if (msg.target === 'seat' && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                        const s = this.tableState.seats[msg.seatIndex];
                        if (!s.cards) s.cards = [];
                        s.cards.push(msg.card);
                        if (msg.calc) s.calc = msg.calc;
                    } else if (msg.target === 'dealer') {
                        if (!this.tableState.dealerCards) this.tableState.dealerCards = [];
                        this.tableState.dealerCards.push(msg.card);
                    }
                }
                this.notify('CARD_DEALT', msg);
                break;

            case 'PLAYER_TURN_START':
                if (this.tableState) {
                    this.tableState.activeTurnSeat = msg.seatIndex;
                }
                this.selectedActiveSeat = msg.seatIndex;
                this.notify('PLAYER_TURN_START', msg);
                break;

            case 'TURN_TICK':
                this.notify('TURN_TICK', msg);
                break;

            case 'BET_PLACED':
                this.notify('BET_PLACED', msg);
                break;

            case 'HAND_BUSTED':
                this.notify('HAND_BUSTED', msg);
                break;

            case 'PLAYER_STAND':
                this.notify('PLAYER_STAND', msg);
                break;

            case 'PLAYER_DOUBLED':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    s.bet = msg.newBet;
                    if (!s.cards) s.cards = [];
                    if (msg.card) s.cards.push(msg.card);
                    if (msg.calc) s.calc = msg.calc;
                }
                this.notify('PLAYER_DOUBLED', msg);
                break;

            case 'PLAYER_SPLIT':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    s.isSplit = true;
                    s.splitHands = msg.hands;
                    s.activeHandIdx = msg.activeHandIdx;
                }
                this.notify('PLAYER_SPLIT', msg);
                break;

            case 'SPLIT_HAND_UPDATED':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    if (s.splitHands && s.splitHands[msg.handIndex]) {
                        s.splitHands[msg.handIndex].cards.push(msg.card);
                        s.splitHands[msg.handIndex].calc = msg.calc;
                        s.splitHands[msg.handIndex].isDone = msg.isDone;
                    }
                    s.activeHandIdx = msg.activeHandIdx;
                }
                this.notify('SPLIT_HAND_UPDATED', msg);
                break;

            case 'SPLIT_HAND_STAND':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    if (s.splitHands && s.splitHands[msg.handIndex]) {
                        s.splitHands[msg.handIndex].isDone = true;
                    }
                    s.activeHandIdx = msg.nextHandIndex;
                }
                this.notify('SPLIT_HAND_STAND', msg);
                break;

            case 'SPLIT_HAND_DOUBLED':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    if (s.splitHands && s.splitHands[msg.handIndex]) {
                        s.splitHands[msg.handIndex].cards.push(msg.card);
                        s.splitHands[msg.handIndex].calc = msg.calc;
                        s.splitHands[msg.handIndex].bet = msg.newBet;
                        s.splitHands[msg.handIndex].isDone = true;
                    }
                    s.activeHandIdx = msg.activeHandIdx;
                }
                this.notify('SPLIT_HAND_DOUBLED', msg);
                break;

            case 'PLAYER_SURRENDERED':
                if (this.tableState && this.tableState.seats && this.tableState.seats[msg.seatIndex]) {
                    const s = this.tableState.seats[msg.seatIndex];
                    s.isSurrendered = true;
                    s.bet = 0;
                }
                this.notify('PLAYER_SURRENDERED', msg);
                break;

            case 'TOAST':
                this.notify('TOAST', msg);
                break;

            case 'ROUND_FINISHED':
                this.notify('ROUND_FINISHED', msg);
                break;

            case 'CHAT_MESSAGE':
                this.notify('CHAT_MESSAGE', msg);
                break;

            case 'ANNOUNCEMENT':
                this.notify('ANNOUNCEMENT', msg);
                break;

            case 'ERROR':
                this.notify('SERVER_ERROR', msg);
                break;
        }
    }
}

window.multiplayerClient = new MultiplayerClient();
