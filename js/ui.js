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
        this.lastWinEl = document.getElementById('last-win-val');
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
        this.cockpitTurnTitle = document.getElementById('cockpit-turn-title');
        this.cockpitTimerBadge = document.getElementById('cockpit-timer-badge');
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

        // Take Seat buttons (Multiplayer - Support sitting at multiple seats!)
        document.querySelectorAll('.btn-take-seat').forEach(btn => {
            btn.addEventListener('click', () => {
                const seatIdx = parseInt(btn.dataset.seat, 10);
                window.soundEngine.playChip();
                if (!window.authManager.isLoggedIn()) {
                    this.showAuthModal('login');
                    return;
                }
                this.selectedBettingSeat = seatIdx;
                window.multiplayerClient.takeSeat(seatIdx);
            });
        });

        // Click on seat betting spot to select which seat receives chips
        document.querySelectorAll('.seat-container').forEach(seatBox => {
            const betSpot = seatBox.querySelector('.seat-betting-spot');
            if (betSpot) {
                betSpot.addEventListener('click', () => {
                    const seatIdx = parseInt(seatBox.dataset.seat, 10);
                    const mySeats = window.multiplayerClient.mySeatIndices || [];
                    if (mySeats.includes(seatIdx)) {
                        this.selectedBettingSeat = seatIdx;
                        this.updateSelectedBettingSeatUI();
                        window.soundEngine.playClick();
                    }
                });
            }
        });

        // Chips Clicking
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const amount = parseInt(chip.dataset.amount, 10);
                window.soundEngine.playChip();

                const user = window.authManager.user;
                const balance = user ? user.chips : (this.soloGame ? this.soloGame.bankroll : 0);

                if (balance < amount) {
                    this.showToast(`Yetersiz bakiye! Bu çip için $${amount.toLocaleString()} gerekir (Bakiyeniz: $${balance.toLocaleString()}).`);
                    return;
                }

                if (this.activeMode === 'multiplayer') {
                    const mySeats = window.multiplayerClient.mySeatIndices || [];
                    if (mySeats.length > 0) {
                        if (this.selectedBettingSeat === null || !mySeats.includes(this.selectedBettingSeat)) {
                            this.selectedBettingSeat = mySeats[0];
                        }
                        const targetSeatIdx = this.selectedBettingSeat;
                        const mySeat = window.multiplayerClient.tableState?.seats?.[targetSeatIdx];
                        const currentBet = mySeat ? mySeat.bet : 0;
                        const limits = {
                            'table-rookie': 2000,
                            'table-vegas': 10000,
                            'table-montecarlo': 25000,
                            'table-millionaire': 100000
                        };
                        const maxBet = limits[this.currentTableId] || 100000;
                        if (currentBet + amount > maxBet) {
                            this.showToast(`Bu masanın maksimum bahis limiti: $${maxBet.toLocaleString()}!`);
                            return;
                        }
                        window.multiplayerClient.placeBet(amount, targetSeatIdx);
                    } else {
                        this.showToast('Lütfen önce masada boş bir koltuğa oturun!');
                    }
                } else if (this.activeMode === 'solo') {
                    if (this.soloGame.addBet(amount)) {
                        this.renderChipsOnBetSpot();
                    } else {
                        this.showToast('Yetersiz bakiye!');
                    }
                }
                this.updateChipTrayState();
            });
        });

        // Clear Bet
        this.btnClear.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                window.multiplayerClient.clearBet(this.selectedBettingSeat);
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

        // Next Round (Solo & Multiplayer)
        this.btnNextRound.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismissRoundBannerAndReset();
        });
        if (this.roundMessageBanner) {
            this.roundMessageBanner.addEventListener('click', () => {
                this.dismissRoundBannerAndReset();
            });
        }

        // Player Actions
        this.btnHit.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                const activeSeatIdx = window.multiplayerClient.selectedActiveSeat ?? window.multiplayerClient.tableState?.activeTurnSeat;
                window.multiplayerClient.hit(activeSeatIdx);
            } else {
                this.soloGame.hit();
            }
        });

        this.btnStand.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                const activeSeatIdx = window.multiplayerClient.selectedActiveSeat ?? window.multiplayerClient.tableState?.activeTurnSeat;
                window.multiplayerClient.stand(activeSeatIdx);
            } else {
                this.soloGame.stand();
            }
        });

        this.btnDouble.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                const activeSeatIdx = window.multiplayerClient.selectedActiveSeat ?? window.multiplayerClient.tableState?.activeTurnSeat;
                const seat = window.multiplayerClient.tableState?.seats?.[activeSeatIdx];
                let count = 0;
                let currentBet = seat?.bet || 0;
                if (seat?.isSplit && seat?.splitHands) {
                    const curHand = seat.splitHands[seat.activeHandIdx || 0];
                    count = curHand?.cards?.length || 0;
                    currentBet = curHand?.bet || seat.bet || 0;
                } else {
                    const seatBox = document.getElementById(`seat-box-${activeSeatIdx}`);
                    const domCards = seatBox ? seatBox.querySelectorAll('.seat-cards .card') : [];
                    count = seat?.cards?.length || domCards.length;
                }
                if (count !== 2) {
                    this.showToast('İkiye katlama yalnızca ilk 2 kartta yapılabilir!');
                    return;
                }
                const chips = window.authManager.user?.chips || 0;
                if (chips < currentBet) {
                    this.showToast(`İkiye katlamak için yeterli çipiniz yok! (Gereken: $${currentBet.toLocaleString()})`);
                    return;
                }
                window.multiplayerClient.doubleDown(activeSeatIdx);
            } else {
                this.soloGame.doubleDown();
            }
        });

        this.btnSplit.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                const activeSeatIdx = window.multiplayerClient.selectedActiveSeat ?? window.multiplayerClient.tableState?.activeTurnSeat;
                const seat = window.multiplayerClient.tableState?.seats?.[activeSeatIdx];
                const seatBox = document.getElementById(`seat-box-${activeSeatIdx}`);
                const domCards = seatBox ? seatBox.querySelectorAll('.seat-cards .card') : [];
                
                let cards = seat?.cards;
                if (!cards || cards.length === 0) {
                    if (domCards.length === 2) {
                        const ranks = Array.from(domCards).map(el => {
                            const valEl = el.querySelector('.card-val') || el.querySelector('span');
                            return valEl ? valEl.innerText.trim() : '';
                        });
                        if (ranks[0] && ranks[1]) {
                            cards = [{ rank: ranks[0] }, { rank: ranks[1] }];
                        }
                    }
                }

                const count = cards ? cards.length : domCards.length;
                if (count !== 2) {
                    this.showToast('Bölme işlemi yalnızca ilk 2 kartta yapılabilir!');
                    return;
                }

                if (cards && cards.length === 2) {
                    const c1 = cards[0];
                    const c2 = cards[1];
                    const v1 = ['10','J','Q','K'].includes(c1.rank) ? 10 : (c1.rank === 'A' ? 11 : parseInt(c1.rank, 10));
                    const v2 = ['10','J','Q','K'].includes(c2.rank) ? 10 : (c2.rank === 'A' ? 11 : parseInt(c2.rank, 10));
                    if (c1.rank !== c2.rank && v1 !== v2) {
                        this.showToast(`Bölme yalnızca aynı değerdeki çift kartlarda yapılabilir! (${c1.rank} ve ${c2.rank} bölünemez)`);
                        return;
                    }
                }

                const chips = window.authManager.user?.chips || 0;
                const currentBet = seat?.bet || 0;
                if (chips < currentBet) {
                    this.showToast(`Bölmek için yeterli bakiyeniz yok! (Gereken: $${currentBet.toLocaleString()})`);
                    return;
                }
                window.multiplayerClient.split(activeSeatIdx);
            } else {
                this.soloGame.split();
            }
        });

        this.btnSurrender.addEventListener('click', () => {
            window.soundEngine.playClick();
            if (this.activeMode === 'multiplayer') {
                const activeSeatIdx = window.multiplayerClient.selectedActiveSeat ?? window.multiplayerClient.tableState?.activeTurnSeat;
                const seat = window.multiplayerClient.tableState?.seats?.[activeSeatIdx];
                if (seat?.isSplit) {
                    this.showToast('Bölünmüş ellerde pes etme kullanılamaz!');
                    return;
                }
                const seatBox = document.getElementById(`seat-box-${activeSeatIdx}`);
                const domCards = seatBox ? seatBox.querySelectorAll('.seat-cards .card') : [];
                const count = seat?.cards?.length || domCards.length;
                if (count !== 2) {
                    this.showToast('Pes etme yalnızca ilk 2 kartta yapılabilir!');
                    return;
                }
                window.multiplayerClient.surrender(activeSeatIdx);
            } else {
                this.soloGame.surrender();
            }
        });

        // Multi-seat hand selection during turn
        [0, 1, 2].forEach(seatIdx => {
            const seatBox = document.getElementById(`seat-box-${seatIdx}`);
            if (seatBox) {
                seatBox.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-take-seat')) return;
                    if (this.activeMode === 'multiplayer') {
                        const mySeats = window.multiplayerClient.mySeatIndices || [];
                        const state = window.multiplayerClient.tableState;
                        if (state && state.state === 'TURNS' && mySeats.includes(seatIdx)) {
                            const seatData = state.seats?.[seatIdx];
                            if (seatData && seatData.bet > 0 && !seatData.isDone) {
                                window.soundEngine.playClick();
                                window.multiplayerClient.selectedActiveSeat = seatIdx;
                                window.multiplayerClient.selectActiveSeat(seatIdx);
                                this.highlightActiveTurnSeat(seatIdx);
                            }
                        }
                    }
                });
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

        // Notifications Button Click
        const btnNotif = document.getElementById('btn-lobby-notifications');
        if (btnNotif) {
            btnNotif.addEventListener('click', () => {
                this.showToast('🔔 Bildirimler: Hoş geldiniz! Şu an aktif turnuva ve masalar sizi bekliyor.');
            });
        }

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
                const cornerBtn = document.getElementById('btn-auth-close-corner');
                if (cornerBtn) cornerBtn.classList.remove('hidden');
                this.showToast(`Hoş geldin, ${u}!`);
                this.updateLobbyUserHUD();
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
                const cornerBtn = document.getElementById('btn-auth-close-corner');
                if (cornerBtn) cornerBtn.classList.remove('hidden');
                this.showToast(`Hesabın oluşturuldu! Hoş geldin, ${u}!`);
                this.updateLobbyUserHUD();
            } else {
                errEl.innerText = res.error;
                errEl.classList.remove('hidden');
            }
        });

        this.btnLogout.addEventListener('click', () => {
            window.authManager.clearSession();
            this.profileModal.classList.add('hidden');
            this.showToast('Çıkış yapıldı.');
            this.initAuth();
        });

        // Auth Modal Tabs
        this.tabBtnLogin.addEventListener('click', () => this.switchAuthTab('login'));
        this.tabBtnRegister.addEventListener('click', () => this.switchAuthTab('register'));

        // Universal Modal Close Handlers (Closes ANY modal reliably)
        document.querySelectorAll('.modal-close-icon, .btn-modal-action-close, .modal-close, .btn-modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modal = btn.closest('.modal-overlay');
                if (modal && modal.id === 'auth-modal' && !window.authManager.isLoggedIn()) {
                    this.showToast('Oyuna devam edebilmek için lütfen giriş yapın veya kayıt olun!');
                    return;
                }
                if (modal && modal.id === 'settings-modal' && this.themeSelect) {
                    const chosen = this.themeSelect.value;
                    document.body.dataset.theme = chosen;
                    localStorage.setItem('dinamo_theme', chosen);
                    this.applySavedTheme();
                }
                if (modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        // Close on backdrop click (cannot close auth-modal if not logged in)
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (modal.id === 'auth-modal' && !window.authManager.isLoggedIn()) {
                        this.showToast('Lütfen önce hesabınıza giriş yapın veya yeni hesap açın.');
                        return;
                    }
                    modal.classList.add('hidden');
                }
            });
        });

        // Close on ESC key (cannot dismiss auth-modal without logging in)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
                    if (modal.id === 'auth-modal' && !window.authManager.isLoggedIn()) return;
                    modal.classList.add('hidden');
                });
                if (this.chatDrawer && !this.chatDrawer.classList.contains('hidden')) {
                    this.chatDrawer.classList.add('hidden');
                }
            }
        });

        // Specific Open Modal Triggers
        this.setupOpenModal(document.getElementById('btn-open-rules'), this.rulesModal);
        this.setupOpenModal(document.getElementById('btn-open-settings'), this.settingsModal);
        this.setupOpenModal(this.btnLobbySettings, this.settingsModal);
        this.setupOpenModal(document.getElementById('btn-open-strategy'), this.strategyChartModal);

        // Hero Actions (Lüks Ana Menü Referans Tasarımı)
        const btnQuickPlay = document.getElementById('btn-quick-play');
        if (btnQuickPlay) {
            btnQuickPlay.addEventListener('click', () => {
                window.soundEngine.playClick();
                const rookieBtn = document.querySelector('.btn-join-table[data-table="table-rookie"]');
                if (rookieBtn) {
                    rookieBtn.click();
                } else {
                    const tablesSec = document.querySelector('.lobby-tables-container');
                    if (tablesSec) tablesSec.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }

        const btnHeroSettings = document.getElementById('btn-hero-settings');
        if (btnHeroSettings) {
            btnHeroSettings.addEventListener('click', () => {
                this.settingsModal.classList.remove('hidden');
            });
        }

        const btnHeroStats = document.getElementById('btn-hero-stats');
        if (btnHeroStats) {
            btnHeroStats.addEventListener('click', () => {
                this.showProfileModal();
            });
        }

        const btnHeroLeaderboard = document.getElementById('btn-hero-leaderboard');
        if (btnHeroLeaderboard) {
            btnHeroLeaderboard.addEventListener('click', async () => {
                this.leaderboardModal.classList.remove('hidden');
                await this.renderLeaderboard();
            });
        }

        const btnBannerLobby = document.getElementById('btn-banner-lobby');
        if (btnBannerLobby) {
            btnBannerLobby.addEventListener('click', () => {
                this.roundMessageBanner.classList.add('hidden');
                this.leaveToLobby();
            });
        }

        // Initialize Quick Bet Stepper & Modal
        this.initQuickBetControls();

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
            this.showAuthModal('login');
            const cornerBtn = document.getElementById('btn-auth-close-corner');
            if (cornerBtn) cornerBtn.classList.add('hidden');
        } else {
            const cornerBtn = document.getElementById('btn-auth-close-corner');
            if (cornerBtn) cornerBtn.classList.remove('hidden');
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
            if (this.lobbyAvatar) this.lobbyAvatar.innerText = this.getAvatarEmoji(user.avatar);
            this.btnAuthTrigger.innerText = 'PROFİL';
            this.bankrollEl.innerText = `$${user.chips.toLocaleString()}`;
        } else {
            this.lobbyUsername.innerText = 'Giriş Yap';
            this.lobbyChips.innerText = '$0';
            if (this.lobbyAvatar) this.lobbyAvatar.innerText = '👤';
            this.btnAuthTrigger.innerText = 'GİRİŞ YAP';
        }
        this.updateChipTrayState();
    }

    updateChipTrayState() {
        const user = window.authManager.user;
        const currentBalance = user ? user.chips : (this.soloGame ? this.soloGame.bankroll : 0);
        
        let maxBet = Infinity;
        if (this.activeMode === 'multiplayer') {
            const limits = {
                'table-rookie': 2000,
                'table-vegas': 10000,
                'table-montecarlo': 25000,
                'table-millionaire': 100000
            };
            if (limits[this.currentTableId]) maxBet = limits[this.currentTableId];
        }

        document.querySelectorAll('.chip').forEach(chip => {
            const amount = parseInt(chip.dataset.amount, 10);
            if (amount > currentBalance || amount > maxBet) {
                chip.classList.add('chip-disabled');
            } else {
                chip.classList.remove('chip-disabled');
            }
        });
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
                    <td class="green-text"><strong>${u.wins} Galibiyet</strong></td>
                    <td class="gold-text"><strong>$${(u.total_won || 0).toLocaleString()}</strong></td>
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
                const card = document.querySelector(`.table-card[data-table="${t.id}"]`);
                if (card) {
                    const pips = card.querySelectorAll('.seat-pips .pip');
                    pips.forEach((pip, idx) => {
                        pip.classList.toggle('occupied', idx < t.seatedCount);
                    });
                }
            });
        }
    }

    // =========================================================================
    // Navigation & Table Joining
    // =========================================================================

    joinTable(tableId) {
        this.applySavedTheme();
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
            this.mpStatusMsg.innerText = 'Oyuncu bekleniyor... Oynamak için masada boş bir koltuğa oturun!';
            this.btnDeal.classList.add('hidden');

            const names = {
                'table-rookie': 'ACEMİ SALONU ($5 - $2,000)',
                'table-vegas': 'VEGAS STRIP VIP ($25 - $10,000)',
                'table-montecarlo': 'MONTE CARLO ($100 - $25,000)',
                'table-millionaire': 'DİNAMO HIGH ROLLER ($500 - $100,000)'
            };
            this.activeTableBadge.innerText = names[tableId] || 'VIP MASA';

            // Connect WebSocket
            window.multiplayerClient.connect(tableId);
        }
        this.updateChipTrayState();
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
                this.triggerCroupierDealAnimation();
                this.renderMultiplayerCardDealt(data);
                break;

            case 'PLAYER_TURN_START':
                this.handlePlayerTurnStart(data);
                break;

            case 'TURN_TICK':
                const myActiveSeats = window.multiplayerClient.mySeatIndices || [];
                if (myActiveSeats.includes(data.turnSeat)) {
                    this.mpStatusBar.classList.add('hidden');
                    const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                    const sName = seatNames[data.turnSeat] || `${data.turnSeat + 1}. KOLTUK`;
                    const isSplitSeat = data.isSplit || (window.multiplayerClient.tableState?.seats?.[data.turnSeat]?.isSplit);
                    const hIdx = data.activeHandIdx !== undefined ? data.activeHandIdx : (window.multiplayerClient.tableState?.seats?.[data.turnSeat]?.activeHandIdx || 0);
                    const handLabel = isSplitSeat ? ` (${hIdx + 1}. EL)` : '';
                    if (this.cockpitTurnTitle) this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName}${handLabel}`;
                    if (this.cockpitTimerBadge) this.cockpitTimerBadge.innerText = `${data.timeLeft}s`;
                } else {
                    this.mpStatusBar.classList.remove('hidden');
                    this.mpStatusMsg.innerText = `Sıra ${data.turnSeat + 1}. Koltukta (${data.timeLeft}s)`;
                }
                break;

            case 'BET_PLACED':
                window.soundEngine.playChip();
                this.renderSeatBet(data.seatIndex, data.bet);
                const seatedList = window.multiplayerClient.mySeatIndices || [];
                if (seatedList.includes(data.seatIndex)) {
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                    if (window.authManager.user) {
                        window.authManager.user.chips = data.chips;
                    }
                    this.updateTotalCurrentBetDisplay();
                    this.updateChipTrayState();
                }
                break;

            case 'HAND_BUSTED':
                window.soundEngine.playBust();
                this.showToast(`${data.username} patladı!`);
                break;

            case 'PLAYER_STAND':
                this.showToast(`${data.username} kaldı.`);
                if (window.authManager.user && window.authManager.user.username === data.username) {
                    this.setConsoleMode('idle');
                }
                break;

            case 'PLAYER_DOUBLED':
                window.soundEngine.playChip();
                const isMeDoubled = (window.authManager.user && window.authManager.user.username === data.username);
                const dName = data.username || 'Oyuncu';
                this.showToast(`${dName} bahsini $${(data.newBet || 0).toLocaleString()} yaparak ikiye katladı!`);
                
                // Real-time immediate seat bet update
                this.renderSeatBet(data.seatIndex, data.newBet);

                // If this is current user: instant bankroll & current-bet update!
                if (isMeDoubled) {
                    if (window.authManager.user) {
                        window.authManager.user.chips = data.chips;
                    }
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                    this.updateTotalCurrentBetDisplay();
                    this.updateChipTrayState();
                    this.setConsoleMode('idle');
                }

                // Render the double card immediately
                if (data.card) {
                    const seatBox = document.getElementById(`seat-box-${data.seatIndex}`);
                    if (seatBox) {
                        const cardsBox = seatBox.querySelector('.seat-cards');
                        if (cardsBox) {
                            const cEl = this.createCardDOM(data.card, false);
                            cardsBox.appendChild(cEl);
                            this.flyCardFromShoe(cEl);
                            window.soundEngine.playCard();
                        }
                        const badge = seatBox.querySelector('.hand-score');
                        if (badge && data.calc) {
                            badge.classList.remove('win', 'lose', 'push', 'surrender', 'busted', 'blackjack');
                            badge.innerText = data.calc.isBlackjack ? 'BLACKJACK!' :
                                             data.calc.isBust ? `PATLADI (${data.calc.total})` : `${data.calc.total}`;
                            badge.classList.remove('hidden');
                            if (data.calc.isBust) badge.classList.add('busted');
                            else if (data.calc.isBlackjack) badge.classList.add('blackjack');
                        }
                    }
                }
                break;

            case 'PLAYER_SPLIT':
                window.soundEngine.playChip();
                const isMeSplit = (window.authManager.user && window.authManager.user.username === data.username);
                const sSplitName = data.username || 'Oyuncu';
                this.showToast(`${sSplitName} elini 2'ye böldü! (1. El: $${(data.hands[0]?.bet || 0).toLocaleString()} - 2. El: $${(data.hands[1]?.bet || 0).toLocaleString()})`);
                
                // Update tableState seat bet & chips
                if (window.multiplayerClient.tableState?.seats?.[data.seatIndex]) {
                    const stSeat = window.multiplayerClient.tableState.seats[data.seatIndex];
                    stSeat.isSplit = true;
                    stSeat.bet = data.bet || ((data.hands[0]?.bet || 0) * 2);
                    stSeat.chips = data.chips;
                    stSeat.splitHands = data.hands;
                    stSeat.activeHandIdx = data.activeHandIdx;
                }
                
                // Real-time seat chip & tag update on table
                this.renderSeatBet(data.seatIndex, data.bet);
                const seatBoxEl = document.getElementById(`seat-box-${data.seatIndex}`);
                if (seatBoxEl) {
                    const chipsEl = seatBoxEl.querySelector('.seat-chips');
                    if (chipsEl) chipsEl.innerText = `$${data.chips.toLocaleString()}`;
                }

                if (isMeSplit) {
                    if (window.authManager.user) {
                        window.authManager.user.chips = data.chips;
                    }
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                    this.updateTotalCurrentBetDisplay();
                    this.updateChipTrayState();
                    const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                    const sName = seatNames[data.seatIndex] || `${data.seatIndex + 1}. KOLTUK`;
                    if (this.cockpitTurnTitle && data.activeHandIdx !== -1) {
                        this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName} (1. EL)`;
                    }
                }
                if (data.hands) {
                    this.renderSplitHands(data.seatIndex, data.hands, data.activeHandIdx);
                }
                break;

            case 'SPLIT_HAND_UPDATED':
                window.soundEngine.playCard();
                this.updateSplitHandCard(data.seatIndex, data.handIndex, data.card, data.calc, data.isDone, data.activeHandIdx);
                const isMeSplitUp = (window.authManager.user && window.authManager.user.username === data.username);
                if (isMeSplitUp && this.cockpitTurnTitle) {
                    const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                    const sName = seatNames[data.seatIndex] || `${data.seatIndex + 1}. KOLTUK`;
                    if (data.activeHandIdx !== -1) {
                        this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName} (${data.activeHandIdx + 1}. EL)`;
                    }
                }
                break;

            case 'SPLIT_HAND_STAND':
                this.updateSplitHandStand(data.seatIndex, data.handIndex, data.nextHandIndex);
                const isMeSplitStd = (window.authManager.user && window.authManager.user.username === data.username);
                if (isMeSplitStd) {
                    if (data.nextHandIndex !== -1) {
                        const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                        const sName = seatNames[data.seatIndex] || `${data.seatIndex + 1}. KOLTUK`;
                        if (this.cockpitTurnTitle) {
                            this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName} (${data.nextHandIndex + 1}. EL)`;
                        }
                    } else {
                        this.setConsoleMode('idle');
                    }
                }
                break;

            case 'SPLIT_HAND_DOUBLED':
                window.soundEngine.playChip();
                const isMeSplitDbl = (window.authManager.user && window.authManager.user.username === data.username);
                this.showToast(`${data.username} ${(data.handIndex + 1)}. elini ikiye katladı!`);
                if (window.multiplayerClient.tableState?.seats?.[data.seatIndex]) {
                    const stSeat = window.multiplayerClient.tableState.seats[data.seatIndex];
                    if (stSeat.splitHands && stSeat.splitHands[data.handIndex]) {
                        stSeat.splitHands[data.handIndex].bet = data.newBet;
                        stSeat.splitHands[data.handIndex].isDone = true;
                    }
                    stSeat.chips = data.chips;
                    const newSeatBet = data.seatBet || (stSeat.splitHands.reduce((acc, h) => acc + (h.bet || 0), 0));
                    stSeat.bet = newSeatBet;
                    this.renderSeatBet(data.seatIndex, newSeatBet);
                }
                const sBoxDbl = document.getElementById(`seat-box-${data.seatIndex}`);
                if (sBoxDbl) {
                    const chipsEl = sBoxDbl.querySelector('.seat-chips');
                    if (chipsEl) chipsEl.innerText = `$${data.chips.toLocaleString()}`;
                }
                if (isMeSplitDbl) {
                    if (window.authManager.user) {
                        window.authManager.user.chips = data.chips;
                    }
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                    this.updateTotalCurrentBetDisplay();
                    this.updateChipTrayState();
                    if (data.activeHandIdx !== undefined && data.activeHandIdx !== -1) {
                        const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                        const sName = seatNames[data.seatIndex] || `${data.seatIndex + 1}. KOLTUK`;
                        if (this.cockpitTurnTitle) {
                            this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName} (${data.activeHandIdx + 1}. EL)`;
                        }
                    } else {
                        this.setConsoleMode('idle');
                    }
                }
                this.updateSplitHandCard(data.seatIndex, data.handIndex, data.card, data.calc, true, data.activeHandIdx);
                break;

            case 'PLAYER_SURRENDERED':
                window.soundEngine.playChip();
                const isMeSurrender = (window.authManager.user && window.authManager.user.username === data.username);
                const surrName = data.username || 'Oyuncu';
                if (isMeSurrender) {
                    this.showToast(`🏳️ Pes ettiniz! Bahsinizin yarısı ($${(data.refund || 0).toLocaleString()}) kasanıza iade edildi.`);
                    if (window.authManager.user) {
                        window.authManager.user.chips = data.chips;
                    }
                    this.bankrollEl.innerText = `$${data.chips.toLocaleString()}`;
                    this.renderSeatBet(data.seatIndex, 0);
                    this.updateTotalCurrentBetDisplay();
                    this.updateChipTrayState();
                    this.setConsoleMode('idle');
                } else {
                    this.showToast(`${surrName} pes etti ($${(data.refund || 0).toLocaleString()} iade).`);
                    this.renderSeatBet(data.seatIndex, 0);
                }

                // Visual feedback on the surrendered seat
                const sBoxSurr = document.getElementById(`seat-box-${data.seatIndex}`);
                if (sBoxSurr) {
                    sBoxSurr.classList.add('seat-surrendered');
                    const badge = sBoxSurr.querySelector('.hand-score');
                    if (badge) {
                        badge.innerText = `PES ETTİ (İade: $${(data.refund || 0).toLocaleString()})`;
                        badge.classList.remove('hidden');
                    }
                }
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

            case 'TOAST':
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
            const dVal = state.dealerCalc?.total ?? (state.dealerCards?.[0] ? (state.dealerCards[0].isAce ? 11 : state.dealerCards[0].value) : null);
            if (dVal !== null && dVal !== undefined && this.dealerScoreBadge) {
                this.dealerScoreBadge.innerText = `${dVal}`;
                this.dealerScoreBadge.classList.remove('hidden');
            }
        } else {
            if (this.dealerScoreBadge) {
                this.dealerScoreBadge.classList.add('hidden');
                this.dealerScoreBadge.innerText = '0';
            }
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

            const me = window.authManager.user;
            const isMySeat = me && seat && seat.username === me.username;
            seatBox.classList.toggle('my-seat', isMySeat);
            seatBox.classList.remove('seat-surrendered');
            if (cardsBox) { cardsBox.style.opacity = ''; cardsBox.style.filter = ''; }
            if (badge) { badge.style.cssText = ''; }

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
                if (seat.isSplit && seat.splitHands && seat.splitHands.length) {
                    this.renderSplitHands(i, seat.splitHands, seat.activeHandIdx);
                } else {
                    const spWrap = seatBox.querySelector('.split-hands-wrapper');
                    if (spWrap) spWrap.remove();

                    if (seat.cards && seat.cards.length) {
                        const domCards = cardsBox.querySelectorAll('.card');
                        let cardsMatch = (domCards.length === seat.cards.length);
                        if (cardsMatch) {
                            domCards.forEach((cEl, cIdx) => {
                                const sc = seat.cards[cIdx];
                                const rCode = String(sc.rank).toUpperCase();
                                if (cEl.dataset.rank !== rCode) cardsMatch = false;
                            });
                        }
                        if (!cardsMatch) {
                            cardsBox.innerHTML = '';
                            seat.cards.forEach(c => cardsBox.appendChild(this.createCardDOM(c, false)));
                        }

                        if (badge) {
                            badge.classList.remove('win', 'lose', 'push', 'surrender', 'busted', 'blackjack');
                            if (seat.calc) {
                                badge.innerText = seat.calc.isBlackjack ? 'BLACKJACK!' :
                                                 seat.calc.isBust ? `PATLADI (${seat.calc.total})` : `${seat.calc.total}`;
                                badge.classList.remove('hidden');
                                if (seat.calc.isBust) badge.classList.add('busted');
                                else if (seat.calc.isBlackjack) badge.classList.add('blackjack');
                            }
                        }
                    } else {
                        cardsBox.innerHTML = '';
                        if (badge) {
                            badge.className = 'hand-score hidden';
                            badge.innerText = '0';
                        }
                    }
                }
            } else {
                btnSit.classList.remove('hidden');
                userTag.classList.add('hidden');
                const spWrap = seatBox.querySelector('.split-hands-wrapper');
                if (spWrap) spWrap.remove();
                cardsBox.innerHTML = '';
                if (badge) {
                    badge.className = 'hand-score hidden';
                    badge.innerText = '0';
                }
                betValEl.innerText = '$0';
                seatBox.querySelector('.seat-chip-stack').innerHTML = '';
            }
        });

        // Multi-Seat betting target selection
        const mySeats = window.multiplayerClient.mySeatIndices || [];
        if (mySeats.length > 0) {
            if (this.selectedBettingSeat === null || !mySeats.includes(this.selectedBettingSeat)) {
                this.selectedBettingSeat = mySeats[0];
            }
        } else {
            this.selectedBettingSeat = null;
        }
        this.updateSelectedBettingSeatUI();
        this.updateTotalCurrentBetDisplay();

        // Controls visibility based on state
        if (state.state === 'WAITING') {
            this.setConsoleMode('idle');
            this.mpStatusMsg.innerText = 'Oyuncu bekleniyor... Oynamak için masada boş bir koltuğa oturun!';
        } else if (state.state === 'BETTING') {
            if (mySeats.length > 0) {
                this.setConsoleMode('betting');
                if (state.countdown && state.countdown > 0) {
                    this.mpStatusMsg.innerText = `Bahisler kapanıyor: ${state.countdown}s`;
                } else {
                    this.mpStatusMsg.innerText = 'Bahislerinizi koyun! (İstediğiniz koltuğa tıklayıp çip ekleyebilirsiniz)';
                }
            } else {
                this.setConsoleMode('idle');
                if (state.countdown && state.countdown > 0) {
                    this.mpStatusMsg.innerText = `Bahis süresi: ${state.countdown}s (İzleyici modundasınız)`;
                } else {
                    this.mpStatusMsg.innerText = 'İzleyici modundasınız. Oynamak için masada boş bir koltuğa oturun!';
                }
            }
        } else if (state.state === 'TURNS') {
            // Update visual highlights for all seats
            [0, 1, 2].forEach(idx => {
                const sBox = document.getElementById(`seat-box-${idx}`);
                if (sBox) {
                    sBox.classList.remove('active-turn', 'my-turn-active', 'my-turn-clickable');
                    if (idx === state.activeTurnSeat) {
                        sBox.classList.add('active-turn');
                        if (mySeats.includes(idx)) sBox.classList.add('my-turn-active');
                    } else if (mySeats.includes(idx)) {
                        const sData = state.seats && state.seats[idx];
                        if (sData && sData.bet > 0 && !sData.isDone) {
                            sBox.classList.add('my-turn-clickable');
                        }
                    }
                }
            });

            if (mySeats.includes(state.activeTurnSeat)) {
                this.setConsoleMode('actions');
                this.updateMultiplayerCoach(state);
                this.mpStatusBar.classList.add('hidden');
                
                const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
                const sName = seatNames[state.activeTurnSeat] || `${state.activeTurnSeat + 1}. KOLTUK`;
                const activeSeatData = state.seats && state.seats[state.activeTurnSeat];
                let scoreText = '';
                if (activeSeatData && activeSeatData.cards && activeSeatData.cards.length) {
                    let total = 0, aces = 0;
                    activeSeatData.cards.forEach(c => {
                        if (['J','Q','K'].includes(c.rank)) total += 10;
                        else if (c.rank === 'A') { total += 11; aces++; }
                        else total += parseInt(c.rank, 10);
                    });
                    while (total > 21 && aces > 0) { total -= 10; aces--; }
                    scoreText = ` (${total} Puan)`;
                }
                if (this.cockpitTurnTitle) this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName}${scoreText}`;
                if (this.cockpitTimerBadge) this.cockpitTimerBadge.innerText = `${state.turnTimeLeft || 15}s`;

                // Update action buttons availability for active hand
                if (activeSeatData) {
                    const chips = window.authManager.user?.chips || 0;
                    if (activeSeatData.isSplit && activeSeatData.splitHands) {
                        const curHand = activeSeatData.splitHands[activeSeatData.activeHandIdx || 0];
                        const is2 = curHand && curHand.cards && curHand.cards.length === 2;
                        const canD = is2 && chips >= (curHand.bet || activeSeatData.bet);
                        const canSp = false;
                        const canSur = false;

                        if (this.btnDouble) {
                            this.btnDouble.disabled = !canD;
                            this.btnDouble.closest('.action-btn-item')?.classList.toggle('disabled', !canD);
                        }
                        if (this.btnSplit) {
                            this.btnSplit.disabled = !canSp;
                            this.btnSplit.closest('.action-btn-item')?.classList.toggle('disabled', !canSp);
                        }
                        if (this.btnSurrender) {
                            this.btnSurrender.disabled = !canSur;
                            this.btnSurrender.closest('.action-btn-item')?.classList.toggle('disabled', !canSur);
                        }
                    } else {
                        const is2 = activeSeatData.cards && activeSeatData.cards.length === 2;
                        const canD = is2 && chips >= activeSeatData.bet;
                        const isPair = is2 && (activeSeatData.cards[0].rank === activeSeatData.cards[1].rank || activeSeatData.cards[0].value === activeSeatData.cards[1].value);
                        const canSp = isPair && chips >= activeSeatData.bet;
                        const canSur = is2;

                        if (this.btnDouble) {
                            this.btnDouble.disabled = !canD;
                            this.btnDouble.closest('.action-btn-item')?.classList.toggle('disabled', !canD);
                        }
                        if (this.btnSplit) {
                            this.btnSplit.disabled = !canSp;
                            this.btnSplit.closest('.action-btn-item')?.classList.toggle('disabled', !canSp);
                        }
                        if (this.btnSurrender) {
                            this.btnSurrender.disabled = !canSur;
                            this.btnSurrender.closest('.action-btn-item')?.classList.toggle('disabled', !canSur);
                        }
                    }
                }
            } else {
                this.setConsoleMode('idle');
                this.mpStatusBar.classList.remove('hidden');
                if (state.activeTurnSeat !== -1) {
                    const seatedPlayer = state.seats && state.seats[state.activeTurnSeat];
                    const pName = seatedPlayer ? seatedPlayer.username : `${state.activeTurnSeat + 1}. Koltuk`;
                    this.mpStatusMsg.innerText = `Sıra ${pName}'da (${state.turnTimeLeft || 15}s)`;
                }
            }
        } else {
            this.setConsoleMode('idle');
        }
    }

    triggerCroupierDealAnimation() {
        const armRight = document.querySelector('.croupier-arm.arm-right');
        if (armRight) {
            armRight.classList.remove('dealing');
            void armRight.offsetWidth;
            armRight.classList.add('dealing');
            if (this._dealAnimTimer) clearTimeout(this._dealAnimTimer);
            this._dealAnimTimer = setTimeout(() => {
                armRight.classList.remove('dealing');
            }, 460);
        }
    }

    updateSelectedBettingSeatUI() {
        document.querySelectorAll('.seat-container').forEach(seatBox => {
            const idx = parseInt(seatBox.dataset.seat, 10);
            seatBox.classList.toggle('selected-betting-seat', idx === this.selectedBettingSeat);
        });
    }

    updateTotalCurrentBetDisplay() {
        if (this.activeMode === 'multiplayer' && window.multiplayerClient.tableState) {
            const mySeats = window.multiplayerClient.mySeatIndices || [];
            let total = 0;
            mySeats.forEach(idx => {
                const s = window.multiplayerClient.tableState.seats?.[idx];
                if (s) {
                    if (s.isSplit && s.splitHands && s.splitHands.length) {
                        total += s.splitHands.reduce((acc, h) => acc + (h.bet || 0), 0);
                    } else {
                        total += (s.bet || 0);
                    }
                }
            });
            this.currentBetEl.innerText = `$${total.toLocaleString()}`;
        }
    }

    setConsoleMode(mode) {
        if (mode === 'betting') {
            this.bettingControls.classList.remove('hidden');
            this.actionControls.classList.add('hidden');
            this.coachBox.classList.add('hidden');
            this.mpStatusBar.classList.remove('hidden');
        } else if (mode === 'actions') {
            this.bettingControls.classList.add('hidden');
            this.actionControls.classList.remove('hidden');
            // Hide floating status bar to avoid duplicate timer with cockpit
            this.mpStatusBar.classList.add('hidden');
        } else {
            this.bettingControls.classList.add('hidden');
            this.actionControls.classList.add('hidden');
            this.coachBox.classList.add('hidden');
            this.mpStatusBar.classList.remove('hidden');
        }
    }

    highlightActiveTurnSeat(activeIdx) {
        const mySeats = window.multiplayerClient.mySeatIndices || [];
        const seatNames = ['SOL KOLTUK', 'ORTA KOLTUK', 'SAĞ KOLTUK'];
        const sName = seatNames[activeIdx] || `${activeIdx + 1}. KOLTUK`;
        
        [0, 1, 2].forEach(idx => {
            const sBox = document.getElementById(`seat-box-${idx}`);
            if (sBox) {
                sBox.classList.remove('active-turn', 'my-turn-active', 'my-turn-clickable');
                if (idx === activeIdx) {
                    sBox.classList.add('active-turn');
                    if (mySeats.includes(idx)) {
                        sBox.classList.add('my-turn-active');
                    }
                } else if (mySeats.includes(idx)) {
                    const sData = window.multiplayerClient.tableState?.seats?.[idx];
                    if (sData && sData.bet > 0 && !sData.isDone) {
                        sBox.classList.add('my-turn-clickable');
                    }
                }
            }
        });

        if (mySeats.includes(activeIdx)) {
            this.setConsoleMode('actions');
            this.mpStatusBar.classList.add('hidden');
            if (this.cockpitTurnTitle) this.cockpitTurnTitle.innerText = `SIRA SİZDE: ${sName}`;
        }
    }

    handlePlayerTurnStart(data) {
        window.multiplayerClient.selectedActiveSeat = data.seatIndex;
        if (window.multiplayerClient.tableState) {
            window.multiplayerClient.tableState.activeTurnSeat = data.seatIndex;
        }
        const mySeats = window.multiplayerClient.mySeatIndices || [];
        this.highlightActiveTurnSeat(data.seatIndex);
        if (mySeats.includes(data.seatIndex)) {
            window.soundEngine.playWin();
            this.setConsoleMode('actions');
            this.mpStatusBar.classList.add('hidden');
            if (this.cockpitTimerBadge) this.cockpitTimerBadge.innerText = `${data.timeLeft}s`;
        } else {
            this.setConsoleMode('idle');
            this.mpStatusBar.classList.remove('hidden');
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
            const cardEl = this.createCardDOM(data.card, data.card.isHidden);
            this.dealerCardsContainer.appendChild(cardEl);
            this.flyCardFromShoe(cardEl);
            const upVal = data.dealerCalc?.total ?? data.dealerTotal;
            if (upVal !== undefined && this.dealerScoreBadge) {
                this.dealerScoreBadge.innerText = `${upVal}`;
                this.dealerScoreBadge.classList.remove('hidden');
            }
        } else {
            const seatBox = document.getElementById(`seat-box-${data.seatIndex}`);
            if (seatBox) {
                const cardsBox = seatBox.querySelector('.seat-cards');
                const cardEl = this.createCardDOM(data.card, false);
                cardsBox.appendChild(cardEl);
                this.flyCardFromShoe(cardEl);
                const badge = seatBox.querySelector('.hand-score');
                if (badge && data.calc) {
                    badge.classList.remove('win', 'lose', 'push', 'surrender', 'busted', 'blackjack');
                    badge.innerText = data.calc.isBlackjack ? 'BLACKJACK!' :
                                     data.calc.isBust ? `PATLADI (${data.calc.total})` : `${data.calc.total}`;
                    badge.classList.remove('hidden');
                    if (data.calc.isBust) badge.classList.add('busted');
                    else if (data.calc.isBlackjack) badge.classList.add('blackjack');
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

        const mySeats = window.multiplayerClient.mySeatIndices || (window.multiplayerClient.mySeatIndex !== null ? [window.multiplayerClient.mySeatIndex] : []);
        const myResults = data.results.filter(res => mySeats.includes(res.seatIndex) || (window.authManager.user && res.userId === window.authManager.user.id));

        data.results.forEach(res => {
            const seatBox = document.getElementById(`seat-box-${res.seatIndex}`);
            if (seatBox) {
                if (res.isSplit && res.splitResults) {
                    res.splitResults.forEach(sr => {
                        const hBox = seatBox.querySelector(`.split-hand-${sr.handIndex}`);
                        if (hBox) {
                            let b = hBox.querySelector('.split-outcome-badge');
                            if (!b) {
                                b = document.createElement('div');
                                b.className = 'split-outcome-badge';
                                hBox.appendChild(b);
                            }
                            const t = sr.outcome === 'win' ? `KAZANDI (+$${sr.winAmount})` :
                                      sr.outcome === 'blackjack' ? `BJ (+$${sr.winAmount})` :
                                      sr.outcome === 'push' ? 'BERABERE' : 'KAYBETTİ';
                            b.innerText = t;
                            b.className = `split-outcome-badge split-outcome-${sr.outcome}`;
                        }
                    });
                } else {
                    const badge = seatBox.querySelector('.hand-score');
                    if (badge) {
                        const outcomeText = res.outcome === 'win' ? `KAZANDI (+$${res.winAmount})` :
                                            res.outcome === 'blackjack' ? `BLACKJACK! (+$${res.winAmount})` :
                                            res.outcome === 'push' ? 'BERABERE' : 'KAYBETTİ';
                        badge.innerText = outcomeText;
                        badge.className = `hand-score ${res.outcome}`;
                        badge.classList.remove('hidden');
                    }
                }
            }
        });

        if (myResults.length > 0) {
            const bannerTitle = document.getElementById('round-banner-title');
            const bannerSub = document.getElementById('round-banner-sub');
            const winDealerCards = document.getElementById('win-dealer-cards');
            const winPlayerCards = document.getElementById('win-player-cards');
            const winDealerBadge = document.getElementById('win-dealer-badge');
            const winPlayerBadge = document.getElementById('win-player-badge');
            const winRewardAmt = document.getElementById('win-reward-amt');

            let totalWin = 0;
            let totalBet = 0;
            let anyWin = false;
            let anyBlackjack = false;
            let allPush = true;
            let allLose = true;
            const handSummaries = [];

            myResults.forEach(r => {
                totalWin += (r.winAmount || 0);
                totalBet += (r.bet || 0);
                const seatNum = r.seatIndex + 1;
                if (r.isSplit && r.splitResults) {
                    allPush = false;
                    if (r.winAmount > 0) anyWin = true;
                    if (r.winAmount < (r.bet || 0)) allLose = true;
                    const subDesc = r.splitResults.map((sh, sIdx) => {
                        const outStr = sh.outcome === 'win' ? `KAZANDI (+$${sh.winAmount})` :
                                       sh.outcome === 'blackjack' ? `BJ (+$${sh.winAmount})` :
                                       sh.outcome === 'push' ? 'BERABERE' : 'KAYIP';
                        return `${sIdx + 1}. El (${sh.total}): ${outStr}`;
                    }).join(' · ');
                    const netSeat = (r.winAmount || 0) - (r.bet || 0);
                    const netTag = netSeat > 0 ? `[Net +$${netSeat.toLocaleString()}]` :
                                   netSeat < 0 ? `[Net -$${Math.abs(netSeat).toLocaleString()}]` : '[Başa Baş]';
                    handSummaries.push(`Koltuk ${seatNum} [Bölünmüş]: ${subDesc} ${netTag}`);
                } else if (r.outcome === 'blackjack') {
                    anyBlackjack = true;
                    anyWin = true;
                    allPush = false;
                    allLose = false;
                    handSummaries.push(`Koltuk ${seatNum}: ⚡ BJ (+$${r.winAmount.toLocaleString()})`);
                } else if (r.outcome === 'win') {
                    anyWin = true;
                    allPush = false;
                    allLose = false;
                    handSummaries.push(`Koltuk ${seatNum}: KAZANDI (+$${r.winAmount.toLocaleString()})`);
                } else if (r.outcome === 'push') {
                    allLose = false;
                    handSummaries.push(`Koltuk ${seatNum}: BERABERE`);
                } else {
                    allPush = false;
                    handSummaries.push(`Koltuk ${seatNum}: KAYIP (-$${(r.bet || 0).toLocaleString()})`);
                }
            });

            if (this.lastWinEl) {
                this.lastWinEl.innerText = totalWin > 0 ? `+$${totalWin.toLocaleString()}` : '$0';
            }
            if (this.currentBetEl) {
                this.currentBetEl.innerText = '$0';
            }

            const netChange = totalWin - totalBet;

            if (anyBlackjack || anyWin || netChange > 0) {
                if (anyBlackjack) window.soundEngine.playBlackjack();
                else window.soundEngine.playWin();

                if (bannerTitle) {
                    bannerTitle.innerText = anyBlackjack ? '⚡ DINAMO BLACKJACK! ⚡' : 'KAZANDINIZ!';
                    bannerTitle.className = 'banner-title green';
                }
                const winText = netChange >= 0 ? `Net Kazanç: +$${netChange.toLocaleString()}` : `Toplam Ödül: +$${totalWin.toLocaleString()}`;
                if (bannerSub) bannerSub.innerHTML = `<strong class="gold-text">${winText}</strong> • ${handSummaries.join(' | ')}`;
                this.showToast(`🎉 Kazandınız! ${winText}`);
            } else if (allPush || netChange === 0) {
                window.soundEngine.playPush();
                if (bannerTitle) {
                    bannerTitle.innerText = 'BERABERE (PUSH)';
                    bannerTitle.className = 'banner-title yellow';
                }
                if (bannerSub) bannerSub.innerHTML = `Bahisleriniz iade edildi • ${handSummaries.join(' | ')}`;
                this.showToast('Berabere (Push). Bahisler iade edildi.');
            } else {
                window.soundEngine.playBust();
                if (bannerTitle) {
                    bannerTitle.innerText = 'BU EL MASANIN!';
                    bannerTitle.className = 'banner-title red';
                }
                if (bannerSub) bannerSub.innerHTML = `Toplam Kayıp: -$${totalBet.toLocaleString()} • ${handSummaries.join(' | ')}`;
                this.showToast('Bu el masanın!');
            }

            if (winRewardAmt) {
                winRewardAmt.innerText = totalWin > 0 ? `+$${totalWin.toLocaleString()}` : '$0';
            }

            // Populate Dealer and Player mini cards for all user seats
            if (winPlayerCards) {
                winPlayerCards.innerHTML = '';
                myResults.forEach((r, resIdx) => {
                    if (resIdx > 0) {
                        const sep = document.createElement('div');
                        sep.className = 'seat-card-separator';
                        sep.style.cssText = 'width: 2px; height: 38px; background: rgba(255,255,255,0.25); margin: 0 8px; align-self: center;';
                        winPlayerCards.appendChild(sep);
                    }
                    const mySeatBox = document.getElementById(`seat-box-${r.seatIndex}`);
                    if (mySeatBox) {
                        if (r.isSplit) {
                            const spWrapper = mySeatBox.querySelector('.split-hands-wrapper');
                            if (spWrapper) {
                                const h0 = spWrapper.querySelector('.split-hand-0');
                                const h1 = spWrapper.querySelector('.split-hand-1');
                                [h0, h1].forEach((hEl, hIdx) => {
                                    if (hIdx > 0) {
                                        const hSep = document.createElement('div');
                                        hSep.className = 'split-card-separator';
                                        hSep.style.cssText = 'width: 1px; height: 28px; background: rgba(212,175,55,0.4); margin: 0 6px; align-self: center;';
                                        winPlayerCards.appendChild(hSep);
                                    }
                                    if (hEl) {
                                        hEl.querySelectorAll('.card').forEach(c => {
                                            const rank = c.dataset.rank || c.querySelector('.card-corner .rank')?.innerText || '';
                                            const suit = c.dataset.suit || c.querySelector('.card-corner .suit')?.innerText || '';
                                            if (rank && suit) winPlayerCards.appendChild(this.createMiniCardElement({ rank, suit }));
                                        });
                                    }
                                });
                            }
                        } else {
                            mySeatBox.querySelectorAll('.seat-cards .card').forEach(c => {
                                const rank = c.dataset.rank || c.querySelector('.card-corner .rank')?.innerText || '';
                                const suit = c.dataset.suit || c.querySelector('.card-corner .suit')?.innerText || '';
                                if (rank && suit) winPlayerCards.appendChild(this.createMiniCardElement({ rank, suit }));
                            });
                        }
                    }
                });
                if (winPlayerBadge) {
                    const totalScores = myResults.map(r => {
                        if (r.isSplit && r.splitResults && r.splitResults.length >= 2) {
                            return `K${r.seatIndex + 1}: ${r.splitResults[0].total} / ${r.splitResults[1].total}`;
                        }
                        const score = (r.calc && r.calc.total !== undefined) ? r.calc.total : (r.total !== undefined ? r.total : '');
                        return `K${r.seatIndex + 1}: ${score}`;
                    }).join(' • ');
                    winPlayerBadge.innerText = `${totalScores} SEN`;
                }
            }

            if (winDealerCards) {
                winDealerCards.innerHTML = '';
                this.dealerCardsContainer.querySelectorAll('.card:not(.face-down)').forEach(c => {
                    const rank = c.dataset.rank || c.querySelector('.card-corner .rank')?.innerText || '';
                    const suit = c.dataset.suit || c.querySelector('.card-corner .suit')?.innerText || '';
                    if (rank && suit) winDealerCards.appendChild(this.createMiniCardElement({ rank, suit }));
                });
                if (winDealerBadge && data.dealerCalc) winDealerBadge.innerText = `${data.dealerCalc.total} DEALER`;
            }

            this.roundMessageBanner.classList.remove('hidden');
            if (this.roundBannerTimer) clearTimeout(this.roundBannerTimer);
            this.roundBannerTimer = setTimeout(() => {
                this.dismissRoundBannerAndReset();
            }, 4000);

            // Update user balance from the last result
            const lastChips = myResults[myResults.length - 1].chips;
            if (lastChips !== undefined) {
                this.bankrollEl.innerText = `$${lastChips.toLocaleString()}`;
                if (window.authManager.user) {
                    window.authManager.user.chips = lastChips;
                }
            }
            this.updateChipTrayState();
        }
    }

    dismissRoundBannerAndReset() {
        if (this.roundBannerTimer) clearTimeout(this.roundBannerTimer);
        if (this.roundMessageBanner) {
            this.roundMessageBanner.classList.add('hidden');
        }
        if (this.activeMode === 'multiplayer') {
            window.multiplayerClient.nextRound();
        } else if (this.activeMode === 'solo') {
            this.soloGame.prepareNextRound();
        }
    }

    clearMultiplayerTableCards() {
        if (this.dealerCardsContainer) {
            this.dealerCardsContainer.innerHTML = '';
        }
        if (this.dealerScoreBadge) {
            this.dealerScoreBadge.classList.add('hidden');
            this.dealerScoreBadge.innerText = '0';
        }
        document.querySelectorAll('.split-hands-wrapper').forEach(w => w.remove());
        if (this.currentBetEl) {
            this.currentBetEl.innerText = '$0';
        }
        for (let i = 0; i < 3; i++) {
            const seatBox = document.getElementById(`seat-box-${i}`);
            if (seatBox) {
                seatBox.classList.remove('seat-surrendered');
                const spWrap = seatBox.querySelector('.split-hands-wrapper');
                if (spWrap) spWrap.remove();
                const cardsBox = seatBox.querySelector('.seat-cards');
                if (cardsBox) {
                    cardsBox.innerHTML = '';
                    cardsBox.style.opacity = '';
                    cardsBox.style.filter = '';
                }
                const scoreBadge = seatBox.querySelector('.hand-score');
                if (scoreBadge) {
                    scoreBadge.classList.add('hidden');
                    scoreBadge.innerText = '0';
                    scoreBadge.className = 'hand-score hidden';
                    scoreBadge.style.cssText = '';
                }
                const chipStack = seatBox.querySelector('.seat-chip-stack');
                if (chipStack) chipStack.innerHTML = '';
                const betVal = seatBox.querySelector('.seat-bet-val');
                if (betVal) betVal.innerText = '$0';
            }
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
                this.updateChipTrayState();
                break;

            case 'DEAL_START':
                this.resetSoloTableVisuals();
                this.setConsoleMode('idle');
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
                this.setConsoleMode('actions');
                if (this.cockpitTurnTitle) this.cockpitTurnTitle.innerText = `SIRA SİZDE`;
                if (this.cockpitTimerBadge) this.cockpitTimerBadge.innerText = `AKTİF`;
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
                this.setConsoleMode('idle');
                this.handleSoloRoundFinished(data);
                this.updateChipTrayState();
                break;

            case 'NEW_ROUND_READY':
                this.resetSoloTableVisuals();
                this.setConsoleMode('betting');
                this.renderChipsOnBetSpot();
                this.updateChipTrayState();
                break;
        }
    }

    renderSoloPlayerCard(card, calculation) {
        const handBox = document.querySelector('#player-hand-0 .hand-cards');
        if (handBox) {
            handBox.appendChild(this.createCardDOM(card, false));
            const badge = document.querySelector('#player-hand-0 .hand-score');
            if (badge && calculation) {
                badge.classList.remove('win', 'lose', 'push', 'surrender', 'busted', 'blackjack');
                badge.innerText = calculation.isBlackjack ? 'BLACKJACK!' :
                                 calculation.isBust ? `PATLADI (${calculation.total})` : `${calculation.total}`;
                badge.classList.remove('hidden');
                if (calculation.isBust) badge.classList.add('busted');
                else if (calculation.isBlackjack) badge.classList.add('blackjack');
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

    createMiniCardElement(card) {
        const el = document.createElement('div');
        const suitLower = (card.suit || '').toLowerCase();
        let sCode = 'S';
        if (suitLower === 'clubs' || card.suit === '♣' || suitLower === 'c') sCode = 'C';
        else if (suitLower === 'hearts' || card.suit === '♥' || suitLower === 'h') sCode = 'H';
        else if (suitLower === 'diamonds' || card.suit === '♦' || suitLower === 'd') sCode = 'D';
        else if (suitLower === 'spades' || card.suit === '♠' || suitLower === 's') sCode = 'S';

        const rCode = String(card.rank || 'A').toUpperCase();
        const svgPath = `assets/cards/${sCode}_${rCode}.svg`;
        const isRed = (sCode === 'H' || sCode === 'D');

        el.className = `mini-card ${isRed ? 'red' : 'black'} mini-card-classic`;
        el.innerHTML = `
            <img src="${svgPath}" alt="${rCode} of ${card.suit || sCode}" class="mini-card-svg-face" loading="eager" draggable="false">
        `;
        return el;
    }

    initQuickBetControls() {
        this.selectedQuickBetAmount = 25;
        const quickBetAmtEl = document.getElementById('quick-bet-amount');
        const btnBetMinus = document.getElementById('btn-bet-minus');
        const btnBetPlus = document.getElementById('btn-bet-plus');
        const btnOpenQuickBet = document.getElementById('btn-open-quick-bet');
        const quickBetModal = document.getElementById('quick-bet-modal');
        const btnConfirmQuickBet = document.getElementById('btn-confirm-quick-bet');
        const customBetInput = document.getElementById('custom-bet-input');
        const chipBtns = document.querySelectorAll('.quick-chip-btn');

        const updateQuickBetDisplay = () => {
            if (quickBetAmtEl) quickBetAmtEl.innerText = `$${this.selectedQuickBetAmount.toLocaleString()}`;
        };

        if (btnBetMinus) {
            btnBetMinus.addEventListener('click', () => {
                window.soundEngine.playClick();
                if (this.selectedQuickBetAmount > 25) {
                    this.selectedQuickBetAmount -= 25;
                } else if (this.selectedQuickBetAmount > 5) {
                    this.selectedQuickBetAmount = 5;
                }
                updateQuickBetDisplay();
            });
        }

        if (btnBetPlus) {
            btnBetPlus.addEventListener('click', () => {
                window.soundEngine.playClick();
                this.selectedQuickBetAmount += 25;
                updateQuickBetDisplay();
            });
        }

        if (btnOpenQuickBet) {
            btnOpenQuickBet.addEventListener('click', () => {
                window.soundEngine.playClick();
                if (quickBetModal) quickBetModal.classList.remove('hidden');
            });
        }

        chipBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                window.soundEngine.playChip();
                chipBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedQuickBetAmount = parseInt(btn.dataset.amt, 10);
                if (customBetInput) customBetInput.value = '';
                updateQuickBetDisplay();
            });
        });

        if (customBetInput) {
            customBetInput.addEventListener('input', () => {
                const val = parseInt(customBetInput.value, 10);
                if (!isNaN(val) && val > 0) {
                    this.selectedQuickBetAmount = val;
                    chipBtns.forEach(b => b.classList.remove('active'));
                    updateQuickBetDisplay();
                }
            });
        }

        if (btnConfirmQuickBet) {
            btnConfirmQuickBet.addEventListener('click', () => {
                window.soundEngine.playChip();
                const amt = this.selectedQuickBetAmount;
                if (this.activeMode === 'multiplayer') {
                    window.multiplayerClient.placeBet(amt, this.selectedBettingSeat);
                } else if (this.activeMode === 'solo') {
                    this.soloGame.placeBet(amt);
                    this.renderChipsOnBetSpot();
                }
                if (quickBetModal) quickBetModal.classList.add('hidden');
                this.showToast(`$${amt.toLocaleString()} bahis koyuldu!`);
            });
        }
    }

    handleSoloRoundFinished(data) {
        const hand = data.playerHands[0];
        const bannerTitle = document.getElementById('round-banner-title');
        const bannerSub = document.getElementById('round-banner-sub');
        const winDealerCards = document.getElementById('win-dealer-cards');
        const winPlayerCards = document.getElementById('win-player-cards');
        const winDealerBadge = document.getElementById('win-dealer-badge');
        const winPlayerBadge = document.getElementById('win-player-badge');
        const winRewardAmt = document.getElementById('win-reward-amt');

        let reward = 0;
        if (hand.result === 'blackjack') {
            window.soundEngine.playBlackjack();
            bannerTitle.innerText = '⚡ DINAMO BLACKJACK! ⚡';
            bannerTitle.className = 'banner-title gold';
            reward = Math.floor(hand.bet * 1.5);
            bannerSub.innerHTML = `Ödül: <strong class="gold-text">+$${reward.toLocaleString()}</strong>`;
        } else if (hand.result === 'win') {
            window.soundEngine.playWin();
            bannerTitle.innerText = 'KAZANDINIZ!';
            bannerTitle.className = 'banner-title green';
            reward = hand.bet;
            bannerSub.innerHTML = `Ödül: <strong class="gold-text">+$${reward.toLocaleString()}</strong>`;
        } else if (hand.result === 'push') {
            window.soundEngine.playPush();
            bannerTitle.innerText = 'BERABERE (PUSH)';
            bannerTitle.className = 'banner-title yellow';
            bannerSub.innerHTML = `İade: <strong class="gold-text">$${hand.bet.toLocaleString()}</strong>`;
        } else {
            window.soundEngine.playBust();
            bannerTitle.innerText = 'BU EL MASANIN!';
            bannerTitle.className = 'banner-title red';
            reward = -hand.bet;
            bannerSub.innerHTML = `Kayıp: <strong class="red-text">-$${hand.bet.toLocaleString()}</strong>`;
        }

        if (winRewardAmt) {
            winRewardAmt.innerText = reward >= 0 ? `+$${reward.toLocaleString()}` : `-$${Math.abs(reward).toLocaleString()}`;
        }
        if (this.lastWinEl) {
            this.lastWinEl.innerText = reward > 0 ? `+$${reward.toLocaleString()}` : '$0';
        }

        // Populate VS Comparison Cards
        if (winDealerCards && data.dealerHand) {
            winDealerCards.innerHTML = '';
            data.dealerHand.cards.forEach(c => winDealerCards.appendChild(this.createMiniCardElement(c)));
            const dCalc = data.dealerHand.calculate();
            if (winDealerBadge) winDealerBadge.innerText = `${dCalc.score} DEALER`;
        }

        if (winPlayerCards && hand) {
            winPlayerCards.innerHTML = '';
            hand.cards.forEach(c => winPlayerCards.appendChild(this.createMiniCardElement(c)));
            const pCalc = hand.calculate();
            if (winPlayerBadge) winPlayerBadge.innerText = `${pCalc.score} SEN`;
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
        if (badge) {
            badge.className = 'hand-score hidden';
            badge.innerText = '0';
        }
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


    flyCardFromShoe(cardEl) {
        if (!cardEl) return;
        this.triggerCroupierDealAnimation();
        const shoe = document.getElementById('table-visual-shoe') || document.querySelector('.visual-shoe-spot') || document.querySelector('.shoe-visual-box');
        if (!shoe) return;

        requestAnimationFrame(() => {
            const shoeRect = shoe.getBoundingClientRect();
            const cardRect = cardEl.getBoundingClientRect();

            if (!shoeRect.width || !cardRect.width) return;

            // Offset from center of shoe to center of destination card
            const deltaX = (shoeRect.left + shoeRect.width * 0.35) - (cardRect.left + cardRect.width * 0.5);
            const deltaY = (shoeRect.top + shoeRect.height * 0.45) - (cardRect.top + cardRect.height * 0.5);

            cardEl.animate([
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) rotate(22deg) scale(0.42)`,
                    opacity: 0.15
                },
                {
                    transform: 'translate(0px, 0px) rotate(0deg) scale(1)',
                    opacity: 1
                }
            ], {
                duration: 440,
                easing: 'cubic-bezier(0.16, 0.95, 0.24, 1)',
                fill: 'none'
            });
        });
    }

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

        const suitLower = (card.suit || '').toLowerCase();
        const sym = card.symbol || '';
        let sCode = 'S';
        let suitSym = '♠';

        if (suitLower === 'clubs' || sym === '♣') {
            sCode = 'C';
            suitSym = '♣';
        } else if (suitLower === 'hearts' || sym === '♥') {
            sCode = 'H';
            suitSym = '♥';
        } else if (suitLower === 'diamonds' || sym === '♦') {
            sCode = 'D';
            suitSym = '♦';
        } else if (suitLower === 'spades' || sym === '♠') {
            sCode = 'S';
            suitSym = '♠';
        }

        const rCode = String(card.rank).toUpperCase();
        const svgPath = `assets/cards/${sCode}_${rCode}.svg`;

        const isRed = (sCode === 'H' || sCode === 'D' || card.color === 'red');
        cardDiv.classList.add(isRed ? 'card-red' : 'card-black');

        cardDiv.dataset.rank = rCode;
        cardDiv.dataset.suit = suitSym;
        cardDiv.dataset.suitCode = sCode;

        cardDiv.innerHTML = `
            <div class="card-inner">
                <div class="card-front classic-casino-card">
                    <span class="card-corner card-corner-top"><span class="rank">${rCode}</span><span class="suit">${suitSym}</span></span>
                    <img src="${svgPath}" alt="${rCode} of ${card.suit || sCode}" class="card-svg-face" loading="eager" draggable="false">
                </div>
            </div>
        `;
        return cardDiv;
    }

    getCenterContent(card) {
        return '';
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

    renderSplitHands(seatIndex, hands, activeHandIdx = 0) {
        const seatBox = document.getElementById(`seat-box-${seatIndex}`);
        if (!seatBox) return;
        const handSpot = seatBox.querySelector('.seat-hand-spot');
        if (!handSpot) return;

        const mainBadge = seatBox.querySelector('.hand-score');
        if (mainBadge) mainBadge.classList.add('hidden');

        let wrapper = handSpot.querySelector('.split-hands-wrapper');
        if (!wrapper) {
            const oldCards = handSpot.querySelector('.seat-cards');
            if (oldCards) oldCards.innerHTML = '';
            wrapper = document.createElement('div');
            wrapper.className = 'split-hands-wrapper';
            handSpot.appendChild(wrapper);
        }
        wrapper.innerHTML = '';

        hands.forEach((h, idx) => {
            const box = document.createElement('div');
            box.className = `split-hand-box split-hand-${idx} ${idx === activeHandIdx ? 'active' : ''}`;
            
            const label = document.createElement('div');
            label.className = 'split-hand-label';
            label.innerText = `${idx + 1}. EL ($${(h.bet || 0).toLocaleString()})`;
            box.appendChild(label);

            const cardsRow = document.createElement('div');
            cardsRow.className = 'split-cards-row';
            h.cards.forEach(c => cardsRow.appendChild(this.createCardDOM(c, false)));
            box.appendChild(cardsRow);

            if (h.calc) {
                const score = document.createElement('div');
                score.className = `split-score-badge ${h.calc.isBust ? 'busted' : ''}`;
                score.innerText = h.calc.isBlackjack ? 'BJ' : (h.calc.isBust ? `PAT (${h.calc.total})` : `${h.calc.total}`);
                box.appendChild(score);
            }

            wrapper.appendChild(box);
        });
    }

    updateSplitHandCard(seatIndex, handIndex, card, calc, isDone, activeHandIdx) {
        const seatBox = document.getElementById(`seat-box-${seatIndex}`);
        if (!seatBox) return;
        const hBox = seatBox.querySelector(`.split-hand-${handIndex}`);
        if (!hBox) return;

        const row = hBox.querySelector('.split-cards-row');
        if (row && card) {
            const cEl = this.createCardDOM(card, false);
            row.appendChild(cEl);
            this.flyCardFromShoe(cEl);
        }

        let score = hBox.querySelector('.split-score-badge');
        if (score && calc) {
            score.innerText = calc.isBlackjack ? 'BJ' : (calc.isBust ? `PAT (${calc.total})` : `${calc.total}`);
            if (calc.isBust) score.classList.add('busted');
        }

        [0, 1].forEach(idx => {
            const b = seatBox.querySelector(`.split-hand-${idx}`);
            if (b) {
                if (idx === activeHandIdx) b.classList.add('active');
                else b.classList.remove('active');
            }
        });
    }

    updateSplitHandStand(seatIndex, handIndex, nextHandIndex) {
        const seatBox = document.getElementById(`seat-box-${seatIndex}`);
        if (!seatBox) return;
        const hBox = seatBox.querySelector(`.split-hand-${handIndex}`);
        if (hBox) hBox.classList.remove('active');
        if (nextHandIndex !== -1) {
            const nextBox = seatBox.querySelector(`.split-hand-${nextHandIndex}`);
            if (nextBox) nextBox.classList.add('active');
        }
    }

}
