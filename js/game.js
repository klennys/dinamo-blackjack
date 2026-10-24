/**
 * DINAMO BLACKJACK - Game Logic & State Machine
 */

const GameState = {
    BETTING: 'BETTING',
    DEALING: 'DEALING',
    INSURANCE: 'INSURANCE',
    PLAYER_TURN: 'PLAYER_TURN',
    DEALER_TURN: 'DEALER_TURN',
    SETTLEMENT: 'SETTLEMENT',
    ROUND_OVER: 'ROUND_OVER'
};

class BlackjackGame {
    constructor() {
        this.shoe = new Shoe(6, 0.75);
        this.state = GameState.BETTING;

        // Player financials
        this.bankroll = this.loadBankroll();
        this.currentBet = 0;
        this.lastBet = 0;
        this.insuranceBet = 0;

        // Hands
        this.playerHands = [];
        this.activeHandIndex = 0;
        this.dealerHand = null;
        this.dealerHoleCardHidden = true;

        // Configuration
        this.dealerStandsOnSoft17 = true;
        this.animationSpeed = 'normal'; // 'fast' | 'normal'

        // Statistics
        this.stats = this.loadStats();

        // Listeners for UI notification
        this.listeners = [];
    }

    subscribe(fn) {
        this.listeners.push(fn);
    }

    notify(event, data) {
        for (const fn of this.listeners) {
            fn(event, data);
        }
    }

    loadBankroll() {
        const saved = localStorage.getItem('dinamo_blackjack_bankroll');
        if (saved !== null) {
            const val = parseInt(saved, 10);
            if (!isNaN(val) && val > 0) return val;
        }
        return 2500;
    }

    saveBankroll() {
        localStorage.setItem('dinamo_blackjack_bankroll', this.bankroll.toString());
    }

    loadStats() {
        const defaultStats = {
            roundsPlayed: 0,
            wins: 0,
            losses: 0,
            pushes: 0,
            blackjacks: 0,
            surrenders: 0,
            highestBankroll: 2500,
            netProfit: 0
        };
        const saved = localStorage.getItem('dinamo_blackjack_stats');
        if (saved) {
            try {
                return { ...defaultStats, ...JSON.parse(saved) };
            } catch (e) {
                return defaultStats;
            }
        }
        return defaultStats;
    }

    saveStats() {
        localStorage.setItem('dinamo_blackjack_stats', JSON.stringify(this.stats));
    }

    resetBankroll() {
        this.bankroll = 2500;
        this.currentBet = 0;
        this.saveBankroll();
        this.notify('BANKROLL_UPDATED', { bankroll: this.bankroll });
    }

    // Betting Actions
    addBet(amount) {
        if (this.state !== GameState.BETTING) return false;
        if (this.bankroll >= amount) {
            this.bankroll -= amount;
            this.currentBet += amount;
            this.saveBankroll();
            this.notify('BET_UPDATED', { currentBet: this.currentBet, bankroll: this.bankroll, addedChip: amount });
            return true;
        }
        return false;
    }

    clearBet() {
        if (this.state !== GameState.BETTING || this.currentBet === 0) return false;
        this.bankroll += this.currentBet;
        this.currentBet = 0;
        this.saveBankroll();
        this.notify('BET_UPDATED', { currentBet: 0, bankroll: this.bankroll });
        return true;
    }

    doubleCurrentBet() {
        if (this.state !== GameState.BETTING || this.currentBet === 0) return false;
        if (this.bankroll >= this.currentBet) {
            const add = this.currentBet;
            this.bankroll -= add;
            this.currentBet += add;
            this.saveBankroll();
            this.notify('BET_UPDATED', { currentBet: this.currentBet, bankroll: this.bankroll, addedChip: add });
            return true;
        }
        return false;
    }

    rebet() {
        if (this.state !== GameState.BETTING) return false;
        if (this.lastBet > 0 && this.bankroll >= this.lastBet) {
            this.clearBet();
            this.bankroll -= this.lastBet;
            this.currentBet = this.lastBet;
            this.saveBankroll();
            this.notify('BET_UPDATED', { currentBet: this.currentBet, bankroll: this.bankroll });
            return true;
        }
        return false;
    }

    allIn() {
        if (this.state !== GameState.BETTING || this.bankroll <= 0) return false;
        const total = this.bankroll + this.currentBet;
        this.currentBet = total;
        this.bankroll = 0;
        this.saveBankroll();
        this.notify('BET_UPDATED', { currentBet: this.currentBet, bankroll: this.bankroll });
        return true;
    }

    // Round Dealing Sequence
    async startDeal() {
        if (this.state !== GameState.BETTING || this.currentBet <= 0) return;

        this.lastBet = this.currentBet;
        this.state = GameState.DEALING;
        this.dealerHoleCardHidden = true;
        this.insuranceBet = 0;

        if (this.shoe.needsReshuffle) {
            this.notify('SHUFFLE_START');
            this.shoe.shuffle();
            await this.delay(1000);
            this.notify('SHUFFLE_END');
        }

        // Initialize hands
        const firstHand = new Hand(this.currentBet);
        this.playerHands = [firstHand];
        this.activeHandIndex = 0;
        this.dealerHand = new Hand(0);

        this.notify('DEAL_START');

        // Dealing sequence: Player 1 -> Dealer 1 -> Player 2 -> Dealer 2 (hole card)
        const delayMs = this.animationSpeed === 'fast' ? 250 : 500;

        // Player card 1
        await this.dealCardToPlayer(0);
        await this.delay(delayMs);

        // Dealer card 1
        await this.dealCardToDealer(false);
        await this.delay(delayMs);

        // Player card 2
        await this.dealCardToPlayer(0);
        await this.delay(delayMs);

        // Dealer card 2 (hole card - face down)
        await this.dealCardToDealer(true);
        await this.delay(delayMs);

        // Check for Dealer Ace (Insurance option)
        const dealerUpCard = this.dealerHand.cards[0];
        if (dealerUpCard.isAce && this.bankroll >= Math.floor(this.currentBet / 2)) {
            this.state = GameState.INSURANCE;
            this.notify('INSURANCE_OFFER', { insuranceCost: Math.floor(this.currentBet / 2) });
            return;
        }

        await this.checkInitialBlackjacks();
    }

    async resolveInsurance(bought) {
        if (this.state !== GameState.INSURANCE) return;

        if (bought) {
            const cost = Math.floor(this.currentBet / 2);
            this.bankroll -= cost;
            this.insuranceBet = cost;
            this.saveBankroll();
            this.notify('INSURANCE_BOUGHT', { cost, bankroll: this.bankroll });
        }

        await this.delay(400);
        await this.checkInitialBlackjacks();
    }

    async checkInitialBlackjacks() {
        const dealerUpCard = this.dealerHand.cards[0];
        const dealerHoleCard = this.dealerHand.cards[1];
        const dealerCalc = this.dealerHand.calculate();
        const playerHand = this.playerHands[0];
        const playerCalc = playerHand.calculate();

        // If dealer upcard is 10 or Ace, dealer peeks for Blackjack
        const dealerPeeks = dealerUpCard.value === 10 || dealerUpCard.isAce;

        if (dealerPeeks && dealerCalc.isBlackjack) {
            // Dealer has Blackjack!
            this.dealerHoleCardHidden = false;
            this.notify('DEALER_REVEAL_HOLE', { dealerHand: this.dealerHand });
            await this.delay(600);

            // Handle insurance payout
            if (this.insuranceBet > 0) {
                const insuranceWin = this.insuranceBet * 3; // 2:1 profit + original bet
                this.bankroll += insuranceWin;
                this.saveBankroll();
                this.notify('INSURANCE_PAYOUT', { won: true, amount: insuranceWin, bankroll: this.bankroll });
            }

            if (playerCalc.isBlackjack) {
                // Both have Blackjack -> Push
                playerHand.result = 'push';
                playerHand.payout = playerHand.bet;
                this.bankroll += playerHand.payout;
                this.stats.pushes++;
            } else {
                // Dealer wins, player loses
                playerHand.result = 'lose';
                playerHand.payout = 0;
                this.stats.losses++;
            }

            await this.finishRound();
            return;
        }

        // If insurance was bought but dealer doesn't have blackjack:
        if (this.insuranceBet > 0) {
            this.notify('INSURANCE_PAYOUT', { won: false, amount: 0, bankroll: this.bankroll });
        }

        // Check if player has natural Blackjack
        if (playerCalc.isBlackjack) {
            // Dealer does not have Blackjack
            this.dealerHoleCardHidden = false;
            this.notify('DEALER_REVEAL_HOLE', { dealerHand: this.dealerHand });
            await this.delay(600);

            playerHand.result = 'blackjack';
            // Blackjack pays 3:2 -> 1.5x profit + 1.0x bet = 2.5x total payout
            playerHand.payout = Math.floor(playerHand.bet * 2.5);
            this.bankroll += playerHand.payout;
            this.stats.wins++;
            this.stats.blackjacks++;

            await this.finishRound();
            return;
        }

        // Proceed to player turn
        this.state = GameState.PLAYER_TURN;
        this.notify('PLAYER_TURN_START', {
            activeHandIndex: this.activeHandIndex,
            hand: this.getActiveHand(),
            dealerUpCard
        });
    }

    async dealCardToPlayer(handIndex) {
        const card = this.shoe.draw();
        this.playerHands[handIndex].addCard(card);
        this.notify('CARD_DEALT_PLAYER', {
            handIndex,
            card,
            calculation: this.playerHands[handIndex].calculate()
        });
    }

    async dealCardToDealer(isHidden) {
        const card = this.shoe.draw();
        this.dealerHand.addCard(card);
        this.notify('CARD_DEALT_DEALER', {
            card,
            isHidden,
            calculation: isHidden ? null : this.dealerHand.calculate()
        });
    }

    getActiveHand() {
        return this.playerHands[this.activeHandIndex];
    }

    // Player Actions
    async hit() {
        if (this.state !== GameState.PLAYER_TURN) return;

        const hand = this.getActiveHand();
        await this.dealCardToPlayer(this.activeHandIndex);

        const calc = hand.calculate();
        if (calc.isBust) {
            hand.isDone = true;
            hand.isBusted = true;
            this.notify('HAND_BUSTED', { handIndex: this.activeHandIndex, hand });
            await this.delay(600);
            await this.advanceToNextHandOrDealer();
        } else if (calc.total === 21) {
            // Reached 21 automatically stands
            hand.isDone = true;
            await this.delay(400);
            await this.advanceToNextHandOrDealer();
        } else {
            this.notify('PLAYER_TURN_UPDATE', {
                activeHandIndex: this.activeHandIndex,
                hand,
                dealerUpCard: this.dealerHand.cards[0]
            });
        }
    }

    async stand() {
        if (this.state !== GameState.PLAYER_TURN) return;
        const hand = this.getActiveHand();
        hand.isDone = true;
        this.notify('HAND_STAND', { handIndex: this.activeHandIndex, hand });
        await this.advanceToNextHandOrDealer();
    }

    async doubleDown() {
        if (this.state !== GameState.PLAYER_TURN) return;
        const hand = this.getActiveHand();
        if (!hand.canDouble() || this.bankroll < hand.bet) return;

        this.bankroll -= hand.bet;
        this.currentBet += hand.bet;
        hand.bet *= 2;
        hand.isDoubled = true;
        this.saveBankroll();

        this.notify('HAND_DOUBLED', { handIndex: this.activeHandIndex, hand, bankroll: this.bankroll, currentBet: this.currentBet });

        // Draw exactly one card
        await this.dealCardToPlayer(this.activeHandIndex);
        const calc = hand.calculate();
        if (calc.isBust) {
            hand.isBusted = true;
            this.notify('HAND_BUSTED', { handIndex: this.activeHandIndex, hand });
        }
        hand.isDone = true;
        await this.delay(600);
        await this.advanceToNextHandOrDealer();
    }

    async split() {
        if (this.state !== GameState.PLAYER_TURN) return;
        const hand = this.getActiveHand();
        if (!hand.canSplit() || this.bankroll < hand.bet || this.playerHands.length >= 2) return;

        // Split hand into two
        this.bankroll -= hand.bet;
        this.saveBankroll();

        const card2 = hand.cards.pop();
        const hand2 = new Hand(hand.bet);
        hand2.isSplitHand = true;
        hand.isSplitHand = true;
        hand2.addCard(card2);

        this.playerHands.push(hand2);

        this.notify('HANDS_SPLIT', {
            hands: this.playerHands,
            bankroll: this.bankroll
        });

        const delayMs = this.animationSpeed === 'fast' ? 250 : 500;
        // Deal 2nd card to hand 1
        await this.delay(delayMs);
        await this.dealCardToPlayer(0);

        // Deal 2nd card to hand 2
        await this.delay(delayMs);
        await this.dealCardToPlayer(1);

        // If split Aces, standard casino rule: exactly 1 card to each Ace, then auto stand
        if (hand.cards[0].isAce) {
            hand.isDone = true;
            hand2.isDone = true;
            await this.delay(600);
            await this.startDealerTurn();
            return;
        }

        this.notify('PLAYER_TURN_UPDATE', {
            activeHandIndex: this.activeHandIndex,
            hand: this.getActiveHand(),
            dealerUpCard: this.dealerHand.cards[0]
        });
    }

    async surrender() {
        if (this.state !== GameState.PLAYER_TURN) return;
        const hand = this.getActiveHand();
        if (!hand.canSurrender()) return;

        hand.isDone = true;
        hand.isSurrendered = true;
        hand.result = 'surrender';
        // Surrender returns half the bet
        const refund = Math.floor(hand.bet / 2);
        hand.payout = refund;
        this.bankroll += refund;
        this.stats.surrenders++;
        this.saveBankroll();

        this.notify('HAND_SURRENDERED', { handIndex: this.activeHandIndex, hand, refund, bankroll: this.bankroll });
        await this.finishRound();
    }

    async advanceToNextHandOrDealer() {
        if (this.activeHandIndex < this.playerHands.length - 1) {
            this.activeHandIndex++;
            this.notify('ACTIVE_HAND_CHANGED', {
                activeHandIndex: this.activeHandIndex,
                hand: this.getActiveHand(),
                dealerUpCard: this.dealerHand.cards[0]
            });
        } else {
            // All player hands finished, proceed to dealer turn
            await this.startDealerTurn();
        }
    }

    // Dealer AI & Turn
    async startDealerTurn() {
        this.state = GameState.DEALER_TURN;

        // Check if all player hands busted
        const allBusted = this.playerHands.every(h => h.isBusted || h.isSurrendered);

        // Reveal hole card
        this.dealerHoleCardHidden = false;
        this.notify('DEALER_REVEAL_HOLE', { dealerHand: this.dealerHand });
        await this.delay(600);

        if (!allBusted) {
            // Dealer must draw to 16, stand on 17
            let dealerCalc = this.dealerHand.calculate();

            while (dealerCalc.total < 17 || (!this.dealerStandsOnSoft17 && dealerCalc.total === 17 && dealerCalc.isSoft)) {
                await this.dealCardToDealer(false);
                dealerCalc = this.dealerHand.calculate();
                await this.delay(this.animationSpeed === 'fast' ? 300 : 700);
            }
        }

        await this.settleRound();
    }

    // Settlement & Payouts
    async settleRound() {
        this.state = GameState.SETTLEMENT;
        const dealerCalc = this.dealerHand.calculate();
        const dealerBusted = dealerCalc.isBust;
        const dealerScore = dealerCalc.total;

        for (let i = 0; i < this.playerHands.length; i++) {
            const hand = this.playerHands[i];
            if (hand.isSurrendered) continue;

            const playerCalc = hand.calculate();

            if (hand.isBusted) {
                hand.result = 'lose';
                hand.payout = 0;
                this.stats.losses++;
            } else if (dealerBusted) {
                // Dealer bust -> Player wins 1:1
                hand.result = 'win';
                hand.payout = hand.bet * 2;
                this.bankroll += hand.payout;
                this.stats.wins++;
            } else if (playerCalc.total > dealerScore) {
                // Player has higher score -> Player wins 1:1
                hand.result = 'win';
                hand.payout = hand.bet * 2;
                this.bankroll += hand.payout;
                this.stats.wins++;
            } else if (playerCalc.total < dealerScore) {
                // Dealer has higher score -> Dealer wins
                hand.result = 'lose';
                hand.payout = 0;
                this.stats.losses++;
            } else {
                // Tie / Push
                hand.result = 'push';
                hand.payout = hand.bet;
                this.bankroll += hand.payout;
                this.stats.pushes++;
            }
        }

        await this.finishRound();
    }

    async finishRound() {
        this.state = GameState.ROUND_OVER;
        this.stats.roundsPlayed++;
        if (this.bankroll > this.stats.highestBankroll) {
            this.stats.highestBankroll = this.bankroll;
        }
        this.stats.netProfit = this.bankroll - 2500;
        this.saveBankroll();
        this.saveStats();

        this.notify('ROUND_FINISHED', {
            playerHands: this.playerHands,
            dealerHand: this.dealerHand,
            bankroll: this.bankroll,
            stats: this.stats
        });

        this.currentBet = 0;
    }

    prepareNextRound() {
        this.state = GameState.BETTING;
        this.playerHands = [];
        this.dealerHand = null;
        this.dealerHoleCardHidden = true;
        this.activeHandIndex = 0;
        this.insuranceBet = 0;
        this.notify('NEW_ROUND_READY', {
            bankroll: this.bankroll,
            lastBet: this.lastBet
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.BlackjackGame = BlackjackGame;
window.GameState = GameState;
