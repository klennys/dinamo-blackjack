/**
 * DINAMO BLACKJACK - Deck & Card Shoe Engine
 * Supports standard Vegas 6-deck shoe, Fisher-Yates shuffling,
 * cut-card penetration indicator, and robust hand calculations.
 */

const SUITS = [
    { name: 'spades', symbol: '♠', color: 'black' },
    { name: 'hearts', symbol: '♥', color: 'red' },
    { name: 'diamonds', symbol: '♦', color: 'red' },
    { name: 'clubs', symbol: '♣', color: 'black' }
];

const RANKS = [
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 10, isFace: true },
    { rank: 'Q', value: 10, isFace: true },
    { rank: 'K', value: 10, isFace: true },
    { rank: 'A', value: 11, isAce: true }
];

class Card {
    constructor(rankObj, suitObj) {
        this.rank = rankObj.rank;
        this.value = rankObj.value;
        this.isFace = !!rankObj.isFace;
        this.isAce = !!rankObj.isAce;
        this.suit = suitObj.name;
        this.symbol = suitObj.symbol;
        this.color = suitObj.color;
        this.id = `${this.rank}_${this.suit}_${Math.random().toString(36).substring(2, 7)}`;
    }
}

class Shoe {
    constructor(deckCount = 6, penetration = 0.75) {
        this.deckCount = deckCount;
        this.penetration = penetration;
        this.cards = [];
        this.discardPile = [];
        this.needsReshuffle = false;
        this.init();
    }

    init() {
        this.cards = [];
        this.discardPile = [];
        for (let d = 0; d < this.deckCount; d++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    this.cards.push(new Card(rank, suit));
                }
            }
        }
        this.shuffle();
    }

    shuffle() {
        // Modern Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
        this.needsReshuffle = false;
    }

    draw() {
        if (this.cards.length === 0) {
            this.init();
        }

        const card = this.cards.pop();
        const totalCards = this.deckCount * 52;
        const dealt = totalCards - this.cards.length;

        if (dealt >= totalCards * this.penetration) {
            this.needsReshuffle = true;
        }

        return card;
    }

    remainingCount() {
        return this.cards.length;
    }

    totalCards() {
        return this.deckCount * 52;
    }
}

class Hand {
    constructor(bet = 0) {
        this.cards = [];
        this.bet = bet;
        this.isDone = false;
        this.isDoubled = false;
        this.isBusted = false;
        this.isBlackjack = false;
        this.isSurrendered = false;
        this.isSplitHand = false;
        this.result = null; // 'win' | 'lose' | 'push' | 'blackjack' | 'surrender'
        this.payout = 0;
    }

    addCard(card) {
        this.cards.push(card);
    }

    canSplit() {
        if (this.cards.length !== 2) return false;
        // Equal rank or both value 10
        return this.cards[0].rank === this.cards[1].rank ||
               (this.cards[0].value === 10 && this.cards[1].value === 10);
    }

    canDouble() {
        return this.cards.length === 2 && !this.isDoubled;
    }

    canSurrender() {
        return this.cards.length === 2 && !this.isSplitHand;
    }

    /**
     * Calculates the best possible value for this hand.
     * Aces count as 11 unless that would bust the hand, in which case they count as 1.
     */
    calculate() {
        let total = 0;
        let aces = 0;

        for (const card of this.cards) {
            if (card.isAce) {
                aces++;
                total += 11;
            } else {
                total += card.value;
            }
        }

        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }

        const isSoft = aces > 0;
        const isBust = total > 21;
        // Natural blackjack is strictly 2 cards totalling 21 (and not after a split, standard casino rule)
        const isBlackjack = this.cards.length === 2 && total === 21 && !this.isSplitHand;

        this.isBusted = isBust;
        this.isBlackjack = isBlackjack;

        return {
            total,
            isSoft,
            isBust,
            isBlackjack
        };
    }
}

window.Shoe = Shoe;
window.Hand = Hand;
window.Card = Card;
