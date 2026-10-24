/**
 * DINAMO BLACKJACK - Authentication & Profile Manager
 * Supports API communication with server.py and seamless offline/localStorage fallback.
 */

function getApiBase() {
    if (window.location.protocol === 'file:') {
        return 'http://localhost:5000';
    }
    return '';
}

class AuthManager {
    constructor() {
        this.apiBase = getApiBase();
        this.token = localStorage.getItem('dinamo_token') || null;
        this.user = this.loadLocalUser();
        this.listeners = [];
        if (this.token && this.user) {
            this.refreshProfile();
        }
    }

    subscribe(fn) {
        this.listeners.push(fn);
    }

    notify(event, data) {
        for (const fn of this.listeners) {
            fn(event, data);
        }
    }

    loadLocalUser() {
        const saved = localStorage.getItem('dinamo_user');
        if (saved) {
            try {
                const u = JSON.parse(saved);
                // Disallow old guest accounts
                if (u && u.username && u.username.toLowerCase().startsWith('misafir_')) {
                    localStorage.removeItem('dinamo_user');
                    localStorage.removeItem('dinamo_token');
                    return null;
                }
                return u;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    getLocalAccounts() {
        const raw = localStorage.getItem('dinamo_local_accounts');
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    saveLocalAccount(account) {
        const accs = this.getLocalAccounts();
        accs[account.username.toLowerCase()] = account;
        localStorage.setItem('dinamo_local_accounts', JSON.stringify(accs));
    }

    saveSession(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('dinamo_token', token);
        localStorage.setItem('dinamo_user', JSON.stringify(user));
        this.notify('AUTH_CHANGED', { isLoggedIn: true, user });
    }

    clearSession() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('dinamo_token');
        localStorage.removeItem('dinamo_user');
        this.notify('AUTH_CHANGED', { isLoggedIn: false, user: null });
    }

    isLoggedIn() {
        return !!this.user && !this.user.username.toLowerCase().startsWith('misafir_');
    }

    async register(username, password, avatar) {
        username = (username || '').trim();
        password = (password || '').trim();

        if (username.length < 3 || username.length > 16) {
            return { success: false, error: 'Kullanıcı adı 3-16 karakter olmalıdır.' };
        }
        if (password.length < 4) {
            return { success: false, error: 'Şifre en az 4 karakter olmalıdır.' };
        }

        // Check duplicate in local storage
        const localAccounts = this.getLocalAccounts();
        if (localAccounts[username.toLowerCase()]) {
            return { success: false, error: 'Bu kullanıcı adı zaten alınmış!' };
        }

        const fallbackUser = {
            id: Date.now(),
            username: username,
            password: password,
            avatar: avatar || 'avatar-vip-1',
            chips: 5000,
            vip_level: 1,
            hands_played: 0,
            wins: 0,
            blackjacks: 0,
            biggest_win: 0
        };

        // 1. Try server registration
        try {
            const res = await fetch(`${this.apiBase}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, avatar })
            });
            const data = await res.json();
            if (data.success) {
                fallbackUser.id = data.user.id;
                this.saveLocalAccount(fallbackUser);
                this.saveSession(data.token, data.user);
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (e) {
            // 2. Server offline / file protocol fallback: register locally
            this.saveLocalAccount(fallbackUser);
            this.saveSession('local-token-' + fallbackUser.id, fallbackUser);
            return { success: true, isOffline: true };
        }
    }

    async login(username, password) {
        username = (username || '').trim();
        password = (password || '').trim();
        const localAccounts = this.getLocalAccounts();

        // 1. Try server login first
        try {
            const res = await fetch(`${this.apiBase}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                const acc = { ...data.user, password };
                this.saveLocalAccount(acc);
                this.saveSession(data.token, data.user);
                return { success: true };
            } else {
                // If server explicitly responded that credentials are wrong
                return { success: false, error: data.error };
            }
        } catch (e) {
            // 2. Server unreachable / file protocol fallback: check local accounts
            const acc = localAccounts[username.toLowerCase()];
            if (!acc) {
                return { 
                    success: false, 
                    error: 'Bu kullanıcı adı bulunamadı. Lütfen "YENİ HESAP AÇ" sekmesinden kaydolun.' 
                };
            }
            if (acc.password !== password) {
                return { success: false, error: 'Kullanıcı adı veya şifre hatalı!' };
            }

            this.saveSession('local-token-' + acc.id, acc);
            return { success: true, isOffline: true };
        }
    }

    async refreshProfile() {
        if (!this.token) return this.user;
        try {
            const headers = { 'Authorization': `Bearer ${this.token}` };
            if (this.user && this.user.username) {
                headers['X-Username'] = this.user.username;
            }
            const res = await fetch(`${this.apiBase}/api/me`, { headers });
            const data = await res.json();
            if (data.success) {
                this.user = data.user;
                localStorage.setItem('dinamo_user', JSON.stringify(data.user));
                this.notify('PROFILE_UPDATED', { user: this.user });
                return this.user;
            }
        } catch (e) {
            // Server offline
        }
        return this.user;
    }

    async claimDailyBonus() {
        if (!this.token || this.token.startsWith('local-')) {
            // Local bonus fallback
            this.user.chips += 1000;
            localStorage.setItem('dinamo_user', JSON.stringify(this.user));
            if (this.user.username) {
                const accs = this.getLocalAccounts();
                if (accs[this.user.username.toLowerCase()]) {
                    accs[this.user.username.toLowerCase()].chips = this.user.chips;
                    localStorage.setItem('dinamo_local_accounts', JSON.stringify(accs));
                }
            }
            this.notify('PROFILE_UPDATED', { user: this.user });
            return { success: true, bonus: 2500, newChips: this.user.chips };
        }

        try {
            const res = await fetch(`${this.apiBase}/api/daily-bonus`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            if (data.success) {
                this.user.chips = data.newChips;
                localStorage.setItem('dinamo_user', JSON.stringify(this.user));
                this.notify('PROFILE_UPDATED', { user: this.user });
                return data;
            } else {
                return data;
            }
        } catch (e) {
            return { success: false, error: 'Sunucu bağlantısı yok' };
        }
    }

    async getLeaderboard() {
        try {
            const res = await fetch(`${this.apiBase}/api/leaderboard`);
            const data = await res.json();
            if (data.success) return data.leaderboard;
        } catch (e) {}

        // Fallback to local accounts
        const accs = Object.values(this.getLocalAccounts());
        if (accs.length) {
            accs.sort((a, b) => (b.chips || 0) - (a.chips || 0));
            return accs.slice(0, 10);
        }
        return [];
    }

    async getTables() {
        try {
            const res = await fetch(`${this.apiBase}/api/tables`);
            const data = await res.json();
            if (data.success) return data.tables;
        } catch (e) {}
        return [];
    }
}

window.authManager = new AuthManager();
