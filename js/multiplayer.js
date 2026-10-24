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
                this.send({
                    action: 'JOIN_TABLE',
                    tableId: tableId,
                    token: token
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

    placeBet(amount) {
        this.send({ action: 'PLACE_BET', amount });
    }

    clearBet() {
        this.send({ action: 'CLEAR_BET' });
    }

    hit() {
        this.send({ action: 'HIT' });
    }

    stand() {
        this.send({ action: 'STAND' });
    }

    doubleDown() {
        this.send({ action: 'DOUBLE' });
    }

    sendChat(text) {
        this.send({ action: 'CHAT', text });
    }

    // Server Message Dispatcher
    handleMessage(msg) {
        switch (msg.type) {
            case 'TABLE_STATE':
                this.tableState = msg;
                // Identify which seat belongs to current user
                const me = window.authManager.user;
                if (me && msg.seats) {
                    const mySeat = msg.seats.findIndex(s => s && s.username === me.username);
                    this.mySeatIndex = mySeat !== -1 ? mySeat : null;
                }
                this.notify('TABLE_STATE_UPDATE', msg);
                break;

            case 'COUNTDOWN_TICK':
                this.notify('COUNTDOWN_TICK', msg);
                break;

            case 'CARD_DEALT':
                this.notify('CARD_DEALT', msg);
                break;

            case 'PLAYER_TURN_START':
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
                this.notify('PLAYER_DOUBLED', msg);
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
