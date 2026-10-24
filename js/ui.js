/**
 * DINAMO BLACKJACK - Unified UI Controller
 * Manages Lobby, Authentication, Multi-Seat Real-Time Multiplayer & Solo Practice
 */

class BlackjackUI {
    constructor(soloGame) {
        this.soloGame = soloGame;
        this.activeMode = 'lobby'; // 'lobby' | 'multiplayer' | 'solo'
        this.currentTableId = null;
        this.coachEnabled = true;

        this.initDOMElements();
        this.bindEvents();

        // Subscriptions
        window.authManager.subscribe(this.handleAuthEvent.bind(this));
        window.multiplayerClient.subscribe(this.handleMultiplayerEvent.bind(this));
        this.soloGame.subscribe(this.handleSoloGameEvent.bind(this));

        // Auto-login or show Guest
        this.initAuth();
        this.loadLobbyTables();
        this.applySavedTheme();
    }

    initDOMElements() {
        // Views
        this.viewLobby = document.getElementById('view-lobby');
        this.viewTable = document.getElementById('view-table');

        // Lobby Elements
        this.lobbyUsername = document.getElementById('lobby-username');
        this.lobbyChips = document.getElementById('lobby-chips');
        this.lobbyAvatar = document.getElementById('lobby-user-avatar');
        this.lobbyProfilePill = document.getElementById('lobby-profile-pill');
        this.btnClaimBonus = document.getElementById('btn-claim-bonus');
        this.btnAuthTrigger = document.getElementById('btn-auth-trigger');
        this.btnOpenLeaderboard = document.getElementById('btn-open-leaderboard');
        this.btnLobbySettings = document.getElementById('btn-lobby-settings');

        // Table Navigation & HUD
        this.btnBackLobby = document.getElementById('btn-back-lobby');
        this.activeTableBadge = document.getElementById('active-table-badge');
        this.bankrollEl = document.getElementById('bankroll-val');
        this.currentBetEl = document.getElementById('current-bet-val');
        this.shoeRemainingEl = document.getElementById('shoe-remaining');
        this.shoeMeterEl = document.getElementById('shoe-meter-fill');
        this.btnRefillBankroll = document.getElementById('btn-refill-bankroll');

        // Dealer
        this.dealerCardsContainer = document.getElementById('dealer-cards');
        this.dealerScoreBadge = document.getElementById('dealer-score-badge');

        // Multiplayer Seats & Arena
        this.multiSeatArena = document.querySelector('.multi-seat-arena');
        this.soloCenterSpot = document.getElementById('solo-center-spot');
        this.soloPlayerSection = document.getElementById('solo-player-section');
        this.mpStatusBar = document.getElementById('multiplayer-status-bar');
        this.mpStatusMsg = document.getElementById('mp-status-msg');

        // Solo Mode Hand/Bet
        this.bettingSpot = document.getElementById('betting-spot');
        this.chipStackContainer = document.getElementById('chip-stack-container');
        this.playerCardsWrapper = document.getElementById('player-cards-wrapper');

        // Controls
        this.bettingControls = document.getElementById('betting-controls');
        this.actionControls = document.getElementById('action-controls');
        this.btnDeal = document.getElementById('btn-deal');
        this.btnClear = document.getElementById('btn-clear');
        this.btnDoubleBet = document.getElementById('btn-double-bet');
        this.btnRebet = document.getElementById('btn-rebet');
        this.btnAllIn = document.getElementById('btn-all-in');

        this.btnHit = document.getElementById('btn-hit');
        this.btnStand = document.getElementById('btn-stand');
        this.btnDouble = document.getElementById('btn-double');
        this.btnSplit = document.getElementById('btn-split');
        this.btnSurrender = document.getElementById('btn-surrender');

        // Coach
        this.coachBox = document.getElementById('coach-box');
        this.coachRecommendation = document.getElementById('coach-rec');
        this.coachAdvice = document.getElementById('coach-advice');
        this.btnToggleCoach = document.getElementById('btn-toggle-coach');

        // Chat
        this.chatDrawer = document.getElementById('table-chat-drawer');
        this.btnToggleChat = document.getElementById('btn-toggle-chat');
        this.btnCloseChat = document.getElementById('btn-close-chat');
        this.chatMessagesBox = document.getElementById('chat-messages-box');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');

        // Modals
        this.authModal = document.getElementById('auth-modal');
        this.profileModal = document.getElementById('profile-modal');
        this.leaderboardModal = document.getElementById('leaderboard-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.rulesModal = document.getElementById('rules-modal');
        this.strategyChartModal = document.getElementById('strategy-chart-modal');
        this.roundMessageBanner = document.getElementById('round-message-banner');
        this.btnNextRound = document.getElementById('btn-next-round');

        // Form tabs
        this.tabBtnLogin = document.getElementById('tab-btn-login');
        this.tabBtnRegister = document.getElementById('tab-btn-register');
        this.formLogin = document.getElementById('form-login');
        this.formRegister = document.getElementById('form-register');
        this.btnGuestLogin = document.getElementById('btn-guest-login');
        this.btnLogout = document.getElementById('btn-logout');

        // Utility triggers
        this.soundToggle = document.getElementById('sound-toggle');
        this.themeSelect = document.getElementById('theme-select');
    }

    bindEvents() {
        // Navigation: Back to Lobby
        this.btnBackLobby.addEventListener('click', () => {
            window.soundEngine.playClick();
            this.leaveToLobby();
        });

        // Table Selection Cards
        document.querySelectorAll('.btn-join-table').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tableId = btn.dataset.table;
                window.soundEngine.playClick();
                this.joinTable(tableId);
            });
        });

        // Take Seat buttons (Multiplayer)
        document.querySelectorAll('.btn-take-seat').forEach(btn => {
            btn.addEventListener('click', () => {
                const seatIdx = parseInt(btn.dataset.seat, 10);
                window.soundEngine.playChip();
                if (!window.authManager.isLoggedIn()) {
                    this.showAuthModal('login');
                    return;
                }
                window.multiplayerClient.takeSeat(seatIdx);
            });
        });

        // Chips Clicking
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const amount = parseInt(chip.dataset.amount, 10);
                window.soundEngine.playChip();

                if (this.activeMode === 'multiplayer') {
                    if (window.multiplayerClient.mySeatIndex !== null) {
                        const user = window.authManager.user;
                        if (user && user.chips < amount) {
                            this.showToast('Yetersiz bakiye!');
                            return;
                        }
                        window.multiplayerClient.placeBet(amount);
                    } else {
                        this.showToast('Lütfen önce masada bir koltuğa oturun!');
                    }
                } else if (this.activeMode === 'solo') {
                    if (this.soloGame.addBet(amount)) {
                        this.renderChipsOnBetSpot();
                    } else {
                        this.showToast('Yetersiz bakiye!');
                    }
                }
            });
        });

        // Clear Bet
        this.btnClear.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                window.multiplayerClient.clearBet();
            } else if (this.activeMode === 'solo') {
                this.soloGame.clearBet();
                this.renderChipsOnBetSpot();
            }
        });

        // Deal Button (Solo mode)
        this.btnDeal.addEventListener('click', () => {
            if (this.activeMode === 'solo') {
                window.soundEngine.playClick();
                this.soloGame.startDeal();
            }
        });

        // Next Round (Solo mode)
        this.btnNextRound.addEventListener('click', () => {
            this.roundMessageBanner.classList.add('hidden');
            if (this.activeMode === 'solo') {
                this.soloGame.prepareNextRound();
            }
        });

        // Player Actions
        this.btnHit.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                window.multiplayerClient.hit();
            } else {
                this.soloGame.hit();
            }
        });

        this.btnStand.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                window.multiplayerClient.stand();
            } else {
                this.soloGame.stand();
            }
        });

        this.btnDouble.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                window.multiplayerClient.doubleDown();
            } else {
                this.soloGame.doubleDown();
            }
        });

        this.btnSplit.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'solo') {
                this.soloGame.split();
            }
        });

        this.btnSurrender.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'solo') {
                this.soloGame.surrender();
            }
        });

        // Chat Toggle & Messaging
        this.btnToggleChat.addEventListener('click', () => {
            this.chatDrawer.classList.toggle('hidden');
        });
        this.btnCloseChat.addEventListener('click', () => {
            this.chatDrawer.classList.add('hidden');
        });
        this.btnSendChat.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        document.querySelectorAll('.btn-chat-emoji').forEach(b => {
            b.addEventListener('click', () => {
                this.chatInput.value += b.dataset.emoji;
                this.chatInput.focus();
            });
        });

        // Daily Bonus Claim
        this.btnClaimBonus.addEventListener('click', async () => {
            window.soundEngine.playWin();
            const res = await window.authManager.claimDailyBonus();
            if (res.success) {
                this.showToast(`🎉 Günlük Bonus Alındı: +$${res.bonus.toLocaleString()} Çip!`);
                this.updateLobbyUserHUD();
            } else {
                this.showToast(res.error || 'Bonus henüz hazır değil!');
            }
        });

        // Profile Pill Click
        this.lobbyProfilePill.addEventListener('click', () => {
            if (window.authManager.isLoggedIn()) {
                this.showProfileModal();
            } else {
                this.showAuthModal('login');
            }
        });

        // Leaderboard trigger
        this.btnOpenLeaderboard.addEventListener('click', async () => {
            this.leaderboardModal.classList.remove('hidden');
            await this.renderLeaderboard();
        });

        // Auth Trigger button in lobby header
        this.btnAuthTrigger.addEventListener('click', () => {
            if (window.authManager.isLoggedIn()) {
                this.showProfileModal();
            } else {
                this.showAuthModal('login');
            }
        });

        // Auth Forms Submit
        this.formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-username').value;
            const p = document.getElementById('login-password').value;
            const errEl = document.getElementById('login-error');
            const res = await window.authManager.login(u, p);
            if (res.success) {
                errEl.classList.add('hidden');
                this.authModal.classList.add('hidden');
                this.showToast(`Hoş geldin, ${u}!`);
            } else {
                errEl.innerText = res.error;
                errEl.classList.remove('hidden');
            }
        });

        this.formRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('reg-username').value;
            const p = document.getElementById('reg-password').value;
            const avatar = document.querySelector('input[name="reg-avatar"]:checked')?.value || 'avatar-vip-1';
            const errEl = document.getElementById('reg-error');
            const res = await window.authManager.register(u, p, avatar);
            if (res.success) {
                errEl.classList.add('hidden');
                this.authModal.classList.add('hidden');
                this.showToast(`Hesabın oluşturuldu! Hoş geldin, ${u}!`);
            } else {
                errEl.innerText = res.error;
                errEl.classList.remove('hidden');
            }
        });

        this.btnGuestLogin.addEventListener('click', () => {
            window.authManager.loginAsGuest();
            this.authModal.classList.add('hidden');
            this.showToast('Misafir olarak giriş yapıldı!');
        });

        this.btnLogout.addEventListener('click', () => {
            window.authManager.clearSession();
            this.profileModal.classList.add('hidden');
            this.showToast('Çıkış yapıldı.');
        });

        // Auth Modal Tabs
        this.tabBtnLogin.addEventListener('click', () => this.switchAuthTab('login'));
        this.tabBtnRegister.addEventListener('click', () => this.switchAuthTab('register'));

        // Universal Modal Setup (Attaches close handlers to ALL modals)
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modal.classList.add('hidden');
                });
            }
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        // Specific Open Modal Triggers
        this.setupOpenModal(document.getElementById('btn-open-rules'), this.rulesModal);
        this.setupOpenModal(document.getElementById('btn-open-settings'), this.settingsModal);
        this.setupOpenModal(this.btnLobbySettings, this.settingsModal);
        this.setupOpenModal(document.getElementById('btn-open-strategy'), this.strategyChartModal);

        // Coach Toggle
        this.btnToggleCoach.addEventListener('click', () => {
            this.coachEnabled = !this.coachEnabled;
            this.btnToggleCoach.classList.toggle('active', this.coachEnabled);
            this.coachBox.classList.toggle('hidden', !this.coachEnabled);
        });

        // Theme switch
        this.themeSelect.addEventListener('change', (e) => {
            document.body.dataset.theme = e.target.value;
            localStorage.setItem('dinamo_theme', e.target.value);
        });

        // Sound switch
        this.soundToggle.addEventListener('change', (e) => {
            window.soundEngine.setMuted(!e.target.checked);
        });
    }

    setupOpenModal(btn, modal) {
        if (!btn || !modal) return;
        btn.addEventListener('click', () => modal.classList.remove('hidden'));
    }

    applySavedTheme() {
        const theme = localStorage.getItem('dinamo_theme') || 'classic-emerald';
        document.body.dataset.theme = theme;
        if (this.themeSelect) this.themeSelect.value = theme;
    }

    // =========================================================================
    // Authentication & Profile
    // =========================================================================

    initAuth() {
        if (!window.authManager.isLoggedIn()) {
            window.authManager.loginAsGuest();
        }
        this.updateLobbyUserHUD();
    }

    handleAuthEvent(event, data) {
        this.updateLobbyUserHUD();
    }

    updateLobbyUserHUD() {
        const user = window.authManager.user;
        if (user) {
            this.lobbyUsername.innerText = user.username;
            this.lobbyChips.innerText = `$${user.chips.toLocaleString()}`;
            this.lobbyAvatar.innerText = this.getAvatarEmoji(user.avatar);
            this.btnAuthTrigger.innerText = 'PROFİL';
            this.bankrollEl.innerText = `$${user.chips.toLocaleString()}`;
        } else {
            this.lobbyUsername.innerText = 'Giriş Yap';
            this.lobbyChips.innerText = '$0';
            this.lobbyAvatar.innerText = '👤';
            this.btnAuthTrigger.innerText = 'GİRİŞ YAP';
        }
    }

    getAvatarEmoji(code) {
        const map = {
            'avatar-vip-1': '👑',
            'avatar-vip-2': '🎩',
            'avatar-vip-3': '💎',
            'avatar-vip-4': '🦁',
            'avatar-vip-5': '⚡',
            'avatar-vip-6': '🃏'
        };
        return map[code] || '👑';
    }

    showAuthModal(tab) {
        this.authModal.classList.remove('hidden');
        this.switchAuthTab(tab);
    }

    switchAuthTab(tab) {
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('reg-error').classList.add('hidden');
        if (tab === 'login') {
            this.tabBtnLogin.classList.add('active');
            this.tabBtnRegister.classList.remove('active');
            this.formLogin.classList.remove('hidden');
            this.formRegister.classList.add('hidden');
        } else {
            this.tabBtnLogin.classList.remove('active');
            this.tabBtnRegister.classList.add('active');
            this.formLogin.classList.add('hidden');
            this.formRegister.classList.remove('hidden');
        }
    }

    async showProfileModal() {
        const user = await window.authManager.refreshProfile();
        if (!user) return;
        document.getElementById('profile-big-avatar').innerText = this.getAvatarEmoji(user.avatar);
        document.getElementById('profile-username-view').innerText = user.username;
        document.getElementById('profile-vip-tag').innerText = `VIP SEVİYESİ ${user.vip_level || 1}`;
        document.getElementById('prof-chips').innerText = `$${user.chips.toLocaleString()}`;
        document.getElementById('prof-hands').innerText = user.hands_played || 0;
        document.getElementById('prof-wins').innerText = user.wins || 0;
        document.getElementById('prof-bjs').innerText = user.blackjacks || 0;
        document.getElementById('prof-biggest').innerText = `$${(user.biggest_win || 0).toLocaleString()}`;
        
        const wr = user.hands_played > 0 ? ((user.wins / user.hands_played) * 100).toFixed(1) + '%' : '0%';
        document.getElementById('prof-winrate').innerText = wr;

        this.profileModal.classList.remove('hidden');
    }

    async renderLeaderboard() {
        const tbody = document.getElementById('leaderboard-tbody');
        const list = await window.authManager.getLeaderboard();
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Henüz kayıtlı lider yok.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `
                <tr>
                    <td><strong>${medal}</strong></td>
                    <td>${this.getAvatarEmoji(u.avatar)} <strong>${u.username}</strong></td>
                    <td class="gold-text"><strong>$${u.chips.toLocaleString()}</strong></td>
                    <td class="green-text">${u.wins} Galibiyet</td>
                    <td>$${(u.biggest_win || 0).toLocaleString()}</td>
                </tr>
            `;
        }).join('');
    }

    async loadLobbyTables() {
        const tables = await window.authManager.getTables();
        if (tables && tables.length) {
            tables.forEach(t => {
                const el = document.getElementById(`seats-${t.id}`);
                if (el) el.innerText = `${t.seatedCount} / ${t.maxSeats} Koltuk`;
            });
        }
    }

    // =========================================================================
    // Navigation & Table Joining
    // =========================================================================

    joinTable(tableId) {
        this.currentTableId = tableId;
        this.viewLobby.classList.add('hidden');
        this.viewTable.classList.remove('hidden');

        if (tableId === 'table-solo') {
            this.activeMode = 'solo';
            this.activeTableBadge.innerText = 'SOLO ANTRENMAN';
            this.multiSeatArena.classList.add('hidden');
            this.soloCenterSpot.classList.remove('hidden');
            this.soloPlayerSection.classList.remove('hidden');
            this.mpStatusBar.classList.add('hidden');
            this.btnDeal.classList.remove('hidden');

            this.soloGame.prepareNextRound();
        } else {
            this.activeMode = 'multiplayer';
            this.multiSeatArena.classList.remove('hidden');
            this.soloCenterSpot.classList.add('hidden');
            this.soloPlayerSection.classList.add('hidden');
            this.mpStatusBar.classList.remove('hidden');
            this.btnDeal.classList.add('hidden');

            const names = {
                'table-rookie': 'ACEMİ SALONU ($5-$200)',
                'table-vegas': 'VEGAS STRIP VIP ($25-$1K)',
                'table-montecarlo': 'MONTE CARLO ($100-$5K)',
                'table-millionaire': 'DİNAMO HIGH ROLLER ($500-$25K)'
            };
            this.activeTableBadge.innerText = names[tableId] || 'VIP MASA';

            // Connect WebSocket
            window.multiplayerClient.connect(tableId);
        }
    }

    leaveToLobby() {
        if (this.activeMode === 'multiplayer') {
            window.multiplayerClient.disconnect();
        }
        this.activeMode = 'lobby';
        this.viewTable.classList.add('hidden');
        this.viewLobby.classList.remove('hidden');
        this.loadLobbyTables();
        this.updateLobbyUserHUD();
    }

    // =========================================================================
    // Real-Time Multiplayer Event Handlers
    // =========================================================================

    handleMultiplayerEvent(event, data) {
        switch (event) {
            case 'TABLE_STATE_UPDATE':
                this.renderMultiplayerTableState(data);
                break;

            case 'COUNTDOWN_TICK':
                this.mpStatusMsg.innerText = data.message;
                break;

            case 'CARD_DEALT':
                window.soundEngine.playCard();
                this.renderMultiplayerCardDealt(data);
                break;

            case 'PLAYER_TURN_START':
                this.handlePlayerTurnStart(data);
                break;

            case 'TURN_TICK':
                if (data.turnSeat === window.multiplayerClient.mySeatIndex) {
                    this.mpStatusMsg.innerText = `Sıra Sizde! Kalan süre: ${data.timeLeft}s`;
                } else {
                    this.mpStatusMsg.innerText = `Sıra ${data.turnSeat + 1}. Koltukta (${data.timeLeft}s)`;
                }
                break;

            case 'BET_PLACED':
                window.soundEngine.playChip();
                this.renderSeatBet(data.seatIndex, data.bet);
                if (data.seatIndex === window.multiplayerClient.mySeatIndex) {
                    this.currentBetEl.innerText = `$${data.bet.toLocaleString()}`;
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                }
                break;

            case 'HAND_BUSTED':
                window.soundEngine.playBust();
                this.showToast(`${data.username} patladı!`);
                break;

            case 'PLAYER_STAND':
                this.showToast(`${data.username} kaldı.`);
                break;

            case 'PLAYER_DOUBLED':
                window.soundEngine.playChip();
                this.showToast(`${data.username} ikiye katladı!`);
                break;

            case 'ROUND_FINISHED':
                this.handleMultiplayerRoundFinished(data);
                break;

            case 'CHAT_MESSAGE':
                this.renderIncomingChat(data);
                break;

            case 'ANNOUNCEMENT':
                this.showToast(data.message);
                break;

            case 'SERVER_ERROR':
                this.showToast(data.message);
                break;
        }
    }

    renderMultiplayerTableState(state) {
        // Render Shoe
        const remaining = state.shoeRemaining || 312;
        this.shoeRemainingEl.innerText = `${remaining} / 312 Kart`;
        this.shoeMeterEl.style.width = `${Math.round((remaining / 312) * 100)}%`;

        // Render Dealer Cards
        this.dealerCardsContainer.innerHTML = '';
        if (state.dealerCards && state.dealerCards.length) {
            state.dealerCards.forEach(c => {
                this.dealerCardsContainer.appendChild(this.createCardDOM(c, c.isHidden));
            });
            if (state.dealerCalc) {
                this.dealerScoreBadge.innerText = `${state.dealerCalc.total}`;
                this.dealerScoreBadge.classList.remove('hidden');
            }
        } else {
            this.dealerScoreBadge.classList.add('hidden');
        }

        // Render 3 Seats
        state.seats.forEach((seat, i) => {
            const seatBox = document.getElementById(`seat-box-${i}`);
            if (!seatBox) return;

            const btnSit = seatBox.querySelector('.btn-take-seat');
            const userTag = seatBox.querySelector('.seat-user-tag');
            const usernameEl = seatBox.querySelector('.seat-username');
            const chipsEl = seatBox.querySelector('.seat-chips');
            const avatarEl = seatBox.querySelector('.seat-avatar');
            const cardsBox = seatBox.querySelector('.seat-cards');
            const badge = seatBox.querySelector('.hand-score');
            const betSpot = seatBox.querySelector('.seat-betting-spot');
            const betValEl = seatBox.querySelector('.seat-bet-val');

            // Active turn highlight
            seatBox.classList.toggle('active-turn', i === state.activeTurnSeat);

            if (seat) {
                btnSit.classList.add('hidden');
                userTag.classList.remove('hidden');
                usernameEl.innerText = seat.username;
                chipsEl.innerText = `$${seat.chips.toLocaleString()}`;
                avatarEl.innerText = this.getAvatarEmoji(seat.avatar);

                // Bet
                betValEl.innerText = seat.bet > 0 ? `$${seat.bet.toLocaleString()}` : '$0';
                this.renderSeatChipStack(seatBox.querySelector('.seat-chip-stack'), seat.bet);

                // Cards
                cardsBox.innerHTML = '';
                if (seat.cards && seat.cards.length) {
                    seat.cards.forEach(c => cardsBox.appendChild(this.createCardDOM(c, false)));
                    if (seat.calc) {
                        badge.innerText = seat.calc.isBlackjack ? 'BLACKJACK!' :
                                         seat.calc.isBust ? `PATLADI (${seat.calc.total})` : `${seat.calc.total}`;
                        badge.classList.remove('hidden');
                    }
                } else {
                    badge.classList.add('hidden');
                }
            } else {
                btnSit.classList.remove('hidden');
                userTag.classList.add('hidden');
                cardsBox.innerHTML = '';
                badge.classList.add('hidden');
                betValEl.innerText = '$0';
                seatBox.querySelector('.seat-chip-stack').innerHTML = '';
            }
        });

        // Controls visibility based on state
        const mySeatIdx = window.multiplayerClient.mySeatIndex;
        if (state.state === 'BETTING') {
            if (mySeatIdx !== null) {
                this.setConsoleMode('betting');
            } else {
                this.setConsoleMode('idle');
                this.mpStatusMsg.innerText = 'İzleyici modundasınız. Oynamak için boş bir koltuğa oturun!';
            }
        } else if (state.state === 'TURNS') {
            if (mySeatIdx !== null && state.activeTurnSeat === mySeatIdx) {
                this.setConsoleMode('actions');
                this.updateMultiplayerCoach(state);
            } else {
                this.setConsoleMode('idle');
            }
        } else {
            this.setConsoleMode('idle');
        }
    }

    setConsoleMode(mode) {
        if (mode === 'betting') {
            this.bettingControls.classList.remove('hidden');
            this.actionControls.classList.add('hidden');
            this.coachBox.classList.add('hidden');
        } else if (mode === 'actions') {
            this.bettingControls.classList.add('hidden');
            this.actionControls.classList.remove('hidden');
        } else {
            this.bettingControls.classList.add('hidden');
            this.actionControls.classList.add('hidden');
            this.coachBox.classList.add('hidden');
        }
    }

    handlePlayerTurnStart(data) {
        const mySeatIdx = window.multiplayerClient.mySeatIndex;
        if (data.seatIndex === mySeatIdx) {
            window.soundEngine.playWin();
            this.setConsoleMode('actions');
            this.mpStatusMsg.innerText = `SIRA SİZDE! Kalan süre: ${data.timeLeft}s`;
        } else {
            this.setConsoleMode('idle');
            this.mpStatusMsg.innerText = `Sıra ${data.username}'da (${data.timeLeft}s)`;
        }
    }

    updateMultiplayerCoach(state) {
        if (!this.coachEnabled) return;
        const mySeat = state.seats[window.multiplayerClient.mySeatIndex];
        const dealerUp = state.dealerCards?.[0];
        if (!mySeat || !dealerUp || mySeat.cards.length < 2) return;

        // Convert cards to hand object
        const mockHand = new Hand(mySeat.bet);
        mySeat.cards.forEach(c => mockHand.addCard(c));
        const rec = window.StrategyEngine.getRecommendation(mockHand, dealerUp, true, false, false);
        if (rec) {
            this.coachRecommendation.innerText = rec.title;
            this.coachAdvice.innerText = rec.advice;
            this.coachBox.classList.remove('hidden');

            [this.btnHit, this.btnStand, this.btnDouble, this.btnSplit, this.btnSurrender].forEach(b => b.classList.remove('btn-coach-rec'));
            if (rec.action === 'hit') this.btnHit.classList.add('btn-coach-rec');
            else if (rec.action === 'stand') this.btnStand.classList.add('btn-coach-rec');
            else if (rec.action === 'double') this.btnDouble.classList.add('btn-coach-rec');
        }
    }

    renderMultiplayerCardDealt(data) {
        if (data.target === 'dealer') {
            this.dealerCardsContainer.appendChild(this.createCardDOM(data.card, data.card.isHidden));
            if (data.dealerCalc) {
                this.dealerScoreBadge.innerText = `${data.dealerCalc.total}`;
                this.dealerScoreBadge.classList.remove('hidden');
            }
        } else {
            const seatBox = document.getElementById(`seat-box-${data.seatIndex}`);
            if (seatBox) {
                const cardsBox = seatBox.querySelector('.seat-cards');
                cardsBox.appendChild(this.createCardDOM(data.card, false));
                const badge = seatBox.querySelector('.hand-score');
                if (data.calc) {
                    badge.innerText = data.calc.isBlackjack ? 'BLACKJACK!' :
                                     data.calc.isBust ? `PATLADI (${data.calc.total})` : `${data.calc.total}`;
                    badge.classList.remove('hidden');
                }
            }
        }
    }

    renderSeatBet(seatIndex, bet) {
        const seatBox = document.getElementById(`seat-box-${seatIndex}`);
        if (!seatBox) return;
        const betVal = seatBox.querySelector('.seat-bet-val');
        betVal.innerText = bet > 0 ? `$${bet.toLocaleString()}` : '$0';
        this.renderSeatChipStack(seatBox.querySelector('.seat-chip-stack'), bet);
    }

    renderSeatChipStack(container, amount) {
        if (!container) return;
        container.innerHTML = '';
        if (amount <= 0) return;

        const denoms = [5000, 1000, 500, 100, 25, 5];
        let rem = amount;
        const stack = [];
        for (const d of denoms) {
            const cnt = Math.floor(rem / d);
            for (let i = 0; i < Math.min(cnt, 3); i++) stack.push(d);
            rem %= d;
        }

        stack.reverse().forEach((val, idx) => {
            const c = document.createElement('div');
            c.className = `table-chip chip-${val}`;
            c.style.width = '36px';
            c.style.height = '36px';
            c.style.fontSize = '9px';
            c.style.bottom = `${idx * 3}px`;
            c.innerText = val >= 1000 ? `${val / 1000}K` : `${val}`;
            container.appendChild(c);
        });
    }

    handleMultiplayerRoundFinished(data) {
        this.actionControls.classList.add('hidden');
        this.coachBox.classList.add('hidden');

        // Reveal Dealer Hole Card
        const hidden = this.dealerCardsContainer.querySelector('.card.face-down');
        if (hidden && data.dealerCalc) {
            this.dealerScoreBadge.innerText = data.dealerCalc.isBlackjack ? 'BLACKJACK!' :
                                              data.dealerCalc.isBust ? `PATLADI (${data.dealerCalc.total})` : `${data.dealerCalc.total}`;
        }

        const mySeatIdx = window.multiplayerClient.mySeatIndex;
        let myResult = null;

        data.results.forEach(res => {
            const seatBox = document.getElementById(`seat-box-${res.seatIndex}`);
            if (seatBox) {
                const badge = seatBox.querySelector('.hand-score');
                const outcomeText = res.outcome === 'win' ? `KAZANDI (+$${res.winAmount})` :
                                    res.outcome === 'blackjack' ? `BLACKJACK! (+$${res.winAmount})` :
                                    res.outcome === 'push' ? 'BERABERE' : 'KAYBETTİ';
                badge.innerText = outcomeText;
                badge.className = `hand-score ${res.outcome}`;
                badge.classList.remove('hidden');
            }

            if (res.seatIndex === mySeatIdx) {
                myResult = res;
            }
        });

        if (myResult) {
            if (myResult.outcome === 'blackjack') {
                window.soundEngine.playBlackjack();
                this.showToast(`🔥 BLACKJACK! Kazanç: +$${myResult.winAmount.toLocaleString()}`);
            } else if (myResult.outcome === 'win') {
                window.soundEngine.playWin();
                this.showToast(`🎉 KAZANDINIZ! +$${myResult.winAmount.toLocaleString()}`);
            } else if (myResult.outcome === 'push') {
                window.soundEngine.playPush();
                this.showToast('Berabere (Push). Bahsiniz iade edildi.');
            } else {
                window.soundEngine.playBust();
                this.showToast('Bu el masanın!');
            }
            this.bankrollEl.innerText = `$${myResult.chips.toLocaleString()}`;
        }
    }

    // =========================================================================
    // In-Game Live Table Chat
    // =========================================================================

    sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;
        window.multiplayerClient.sendChat(text);
        this.chatInput.value = '';
    }

    renderIncomingChat(data) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        msgDiv.innerHTML = `
            <span class="sender">${this.getAvatarEmoji(data.avatar)} ${data.username}:</span>
            <span class="content">${this.escapeHTML(data.text)}</span>
            <span class="time">${data.time}</span>
        `;
        this.chatMessagesBox.appendChild(msgDiv);
        this.chatMessagesBox.scrollTop = this.chatMessagesBox.scrollHeight;
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    // =========================================================================
    // Solo Practice Mode Handlers
    // =========================================================================

    handleSoloGameEvent(event, data) {
        if (this.activeMode !== 'solo') return;

        switch (event) {
            case 'BET_UPDATED':
                this.bankrollEl.innerText = `$${data.bankroll.toLocaleString()}`;
                this.currentBetEl.innerText = `$${data.currentBet.toLocaleString()}`;
                this.btnDeal.disabled = data.currentBet === 0;
                this.renderChipsOnBetSpot();
                break;

            case 'DEAL_START':
                this.resetSoloTableVisuals();
                this.bettingControls.classList.add('hidden');
                break;

            case 'CARD_DEALT_PLAYER':
                window.soundEngine.playCard();
                this.renderSoloPlayerCard(data.card, data.calculation);
                break;

            case 'CARD_DEALT_DEALER':
                window.soundEngine.playCard();
                this.dealerCardsContainer.appendChild(this.createCardDOM(data.card, data.isHidden));
                if (!data.isHidden && data.calculation) {
                    this.dealerScoreBadge.innerText = `${data.calculation.total}`;
                    this.dealerScoreBadge.classList.remove('hidden');
                } else if (data.isHidden) {
                    const upVal = this.soloGame.dealerHand.cards[0].value;
                    this.dealerScoreBadge.innerText = `${upVal}`;
                    this.dealerScoreBadge.classList.remove('hidden');
                }
                break;

            case 'PLAYER_TURN_START':
            case 'PLAYER_TURN_UPDATE':
                this.actionControls.classList.remove('hidden');
                this.updateSoloCoach();
                break;

            case 'DEALER_REVEAL_HOLE':
                window.soundEngine.playCard();
                const hiddenDOM = this.dealerCardsContainer.querySelector('.card.face-down');
                if (hiddenDOM && data.dealerHand.cards.length >= 2) {
                    hiddenDOM.replaceWith(this.createCardDOM(data.dealerHand.cards[1], false));
                }
                const calc = data.dealerHand.calculate();
                this.dealerScoreBadge.innerText = calc.isBust ? `PATLADI (${calc.total})` : `${calc.total}`;
                break;

            case 'ROUND_FINISHED':
                this.actionControls.classList.add('hidden');
                this.coachBox.classList.add('hidden');
                this.handleSoloRoundFinished(data);
                break;

            case 'NEW_ROUND_READY':
                this.resetSoloTableVisuals();
                this.bettingControls.classList.remove('hidden');
                this.actionControls.classList.add('hidden');
                this.coachBox.classList.add('hidden');
                this.renderChipsOnBetSpot();
                break;
        }
    }

    renderSoloPlayerCard(card, calculation) {
        const handBox = document.querySelector('#player-hand-0 .hand-cards');
        if (handBox) {
            handBox.appendChild(this.createCardDOM(card, false));
            const badge = document.querySelector('#player-hand-0 .hand-score');
            if (badge && calculation) {
                badge.innerText = calculation.isBlackjack ? 'BLACKJACK!' :
                                 calculation.isBust ? `PATLADI (${calculation.total})` : `${calculation.total}`;
                badge.classList.remove('hidden');
            }
        }
    }

    updateSoloCoach() {
        if (!this.coachEnabled) return;
        const hand = this.soloGame.getActiveHand();
        const dealerUp = this.soloGame.dealerHand?.cards[0];
        if (!hand || !dealerUp) return;

        const rec = window.StrategyEngine.getRecommendation(hand, dealerUp, hand.canDouble(), false, false);
        if (rec) {
            this.coachRecommendation.innerText = rec.title;
            this.coachAdvice.innerText = rec.advice;
            this.coachBox.classList.remove('hidden');

            [this.btnHit, this.btnStand, this.btnDouble, this.btnSplit, this.btnSurrender].forEach(b => b.classList.remove('btn-coach-rec'));
            if (rec.action === 'hit') this.btnHit.classList.add('btn-coach-rec');
            else if (rec.action === 'stand') this.btnStand.classList.add('btn-coach-rec');
            else if (rec.action === 'double' && hand.canDouble()) this.btnDouble.classList.add('btn-coach-rec');
        }
    }

    handleSoloRoundFinished(data) {
        const hand = data.playerHands[0];
        const bannerTitle = document.getElementById('round-banner-title');
        const bannerSub = document.getElementById('round-banner-sub');

        if (hand.result === 'blackjack') {
            window.soundEngine.playBlackjack();
            bannerTitle.innerText = '⚡ DINAMO BLACKJACK! ⚡';
            bannerTitle.className = 'banner-title gold';
            bannerSub.innerText = `Tebrikler! Kazanç: +$${Math.floor(hand.bet * 1.5)}`;
        } else if (hand.result === 'win') {
            window.soundEngine.playWin();
            bannerTitle.innerText = 'TEBRİKLER, KAZANDINIZ!';
            bannerTitle.className = 'banner-title green';
            bannerSub.innerText = `Toplam Kazanç: +$${hand.bet}`;
        } else if (hand.result === 'push') {
            window.soundEngine.playPush();
            bannerTitle.innerText = 'BERABERE (PUSH)';
            bannerTitle.className = 'banner-title yellow';
            bannerSub.innerText = 'Bahsiniz güvenle iade edildi.';
        } else {
            window.soundEngine.playBust();
            bannerTitle.innerText = 'BU EL MASANIN!';
            bannerTitle.className = 'banner-title red';
            bannerSub.innerText = 'Bir sonraki elde şans sizden yana olsun.';
        }

        this.roundMessageBanner.classList.remove('hidden');
        this.bankrollEl.innerText = `$${this.soloGame.bankroll.toLocaleString()}`;
    }

    resetSoloTableVisuals() {
        this.dealerCardsContainer.innerHTML = '';
        this.dealerScoreBadge.classList.add('hidden');
        const cards = document.querySelector('#player-hand-0 .hand-cards');
        if (cards) cards.innerHTML = '';
        const badge = document.querySelector('#player-hand-0 .hand-score');
        if (badge) badge.classList.add('hidden');
    }

    renderChipsOnBetSpot() {
        if (!this.chipStackContainer) return;
        this.chipStackContainer.innerHTML = '';
        const bet = this.soloGame.currentBet;
        if (bet <= 0) return;

        const denoms = [5000, 1000, 500, 100, 25, 5];
        let rem = bet;
        const stack = [];
        for (const d of denoms) {
            const cnt = Math.floor(rem / d);
            for (let i = 0; i < Math.min(cnt, 4); i++) stack.push(d);
            rem %= d;
        }

        stack.reverse().forEach((val, idx) => {
            const c = document.createElement('div');
            c.className = `table-chip chip-${val}`;
            c.style.bottom = `${idx * 4}px`;
            c.innerText = val >= 1000 ? `${val / 1000}K` : `${val}`;
            this.chipStackContainer.appendChild(c);
        });
    }

    // =========================================================================
    // Card DOM Generator
    // =========================================================================

    createCardDOM(card, isHidden) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${isHidden ? 'face-down' : 'face-up'}`;

        if (isHidden) {
            cardDiv.innerHTML = `
                <div class="card-inner">
                    <div class="card-back">
                        <div class="card-back-pattern">
                            <span class="back-logo">DINAMO</span>
                        </div>
                    </div>
                </div>
            `;
            return cardDiv;
        }

        const colorClass = card.color === 'red' ? 'card-red' : 'card-black';
        cardDiv.classList.add(colorClass);

        cardDiv.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <div class="card-corner top-left">
                        <span class="rank">${card.rank}</span>
                        <span class="suit">${card.symbol}</span>
                    </div>
                    <div class="card-center">
                        ${this.getCenterContent(card)}
                    </div>
                    <div class="card-corner bottom-right">
                        <span class="rank">${card.rank}</span>
                        <span class="suit">${card.symbol}</span>
                    </div>
                </div>
            </div>
        `;
        return cardDiv;
    }

    getCenterContent(card) {
        if (card.isFace) {
            const title = card.rank === 'J' ? 'VALE' : card.rank === 'Q' ? 'KIZ' : 'PAPAZ';
            return `<div class="card-face-art"><div class="face-title">${card.rank}</div><div class="face-sub">${title}</div><span class="suit-huge">${card.symbol}</span></div>`;
        } else if (card.isAce) {
            return `<span class="ace-emblem">${card.symbol}</span>`;
        } else {
            return `<span class="pip-icon">${card.symbol}</span>`;
        }
    }

    showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast-alert';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 2500);
    }
}

window.BlackjackUI = BlackjackUI;
