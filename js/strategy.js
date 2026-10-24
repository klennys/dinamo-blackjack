/**
 * DINAMO BLACKJACK - Vegas Basic Strategy Engine
 * Evaluates mathematically optimal moves based on 4-8 deck Vegas rules (Dealer Stands on 17).
 */

const StrategyEngine = {
    // Hard totals (Player total vs Dealer upcard 2..11, where 11 is Ace)
    hardTotals: {
        5:  ['H','H','H','H','H','H','H','H','H','H'],
        6:  ['H','H','H','H','H','H','H','H','H','H'],
        7:  ['H','H','H','H','H','H','H','H','H','H'],
        8:  ['H','H','H','H','H','H','H','H','H','H'],
        9:  ['H','D','D','D','D','H','H','H','H','H'],
        10: ['D','D','D','D','D','D','D','D','H','H'],
        11: ['D','D','D','D','D','D','D','D','D','D'],
        12: ['H','H','S','S','S','H','H','H','H','H'],
        13: ['S','S','S','S','S','H','H','H','H','H'],
        14: ['S','S','S','S','S','H','H','H','H','H'],
        15: ['S','S','S','S','S','H','H','H','Rh','H'],
        16: ['S','S','S','S','S','H','H','Rh','Rh','Rh'],
        17: ['S','S','S','S','S','S','S','S','S','S'],
        18: ['S','S','S','S','S','S','S','S','S','S'],
        19: ['S','S','S','S','S','S','S','S','S','S'],
        20: ['S','S','S','S','S','S','S','S','S','S'],
        21: ['S','S','S','S','S','S','S','S','S','S'],
    },

    // Soft totals (Player non-Ace card 2..9 vs Dealer upcard 2..11)
    softTotals: {
        2: ['H','H','H','D','D','H','H','H','H','H'], // A,2 (13)
        3: ['H','H','H','D','D','H','H','H','H','H'], // A,3 (14)
        4: ['H','H','D','D','D','H','H','H','H','H'], // A,4 (15)
        5: ['H','H','D','D','D','H','H','H','H','H'], // A,5 (16)
        6: ['H','D','D','D','D','H','H','H','H','H'], // A,6 (17)
        7: ['Ds','Ds','Ds','Ds','Ds','S','S','H','H','H'], // A,7 (18)
        8: ['S','S','S','S','Ds','S','S','S','S','S'], // A,8 (19)
        9: ['S','S','S','S','S','S','S','S','S','S'], // A,9 (20)
    },

    // Pair splitting (Card rank 2..11 vs Dealer upcard 2..11)
    pairs: {
        2:  ['P','P','P','P','P','P','H','H','H','H'], // 2,2
        3:  ['P','P','P','P','P','P','H','H','H','H'], // 3,3
        4:  ['H','H','H','P','P','H','H','H','H','H'], // 4,4
        5:  ['D','D','D','D','D','D','D','D','H','H'], // 5,5 (Never split, double!)
        6:  ['P','P','P','P','P','H','H','H','H','H'], // 6,6
        7:  ['P','P','P','P','P','P','H','H','H','H'], // 7,7
        8:  ['P','P','P','P','P','P','P','P','P','P'], // 8,8 (Always split!)
        9:  ['P','P','P','P','P','S','P','P','S','S'], // 9,9
        10: ['S','S','S','S','S','S','S','S','S','S'], // 10,10 (Never split!)
        11: ['P','P','P','P','P','P','P','P','P','P']  // A,A (Always split!)
    },

    /**
     * Get Dealer upcard index (0 for 2, ..., 8 for 10/J/Q/K, 9 for Ace)
     */
    getDealerIndex(dealerCard) {
        if (!dealerCard) return 0;
        if (dealerCard.isAce) return 9;
        return Math.min(8, Math.max(0, dealerCard.value - 2));
    },

    /**
     * Returns the recommended optimal move
     */
    getRecommendation(hand, dealerUpCard, canDouble, canSplit, canSurrender) {
        if (!hand || !dealerUpCard || hand.cards.length < 2) return null;

        const dealerIdx = this.getDealerIndex(dealerUpCard);
        const { total, isSoft } = hand.calculate();

        // 1. Check Pairs
        if (canSplit && hand.cards.length === 2 && hand.canSplit()) {
            const rankVal = hand.cards[0].isAce ? 11 : hand.cards[0].value;
            const pairRow = this.pairs[rankVal];
            if (pairRow) {
                const action = pairRow[dealerIdx];
                if (action === 'P') {
                    return {
                        action: 'split',
                        code: 'P',
                        title: 'BÖL',
                        advice: `${hand.cards[0].rank}-${hand.cards[1].rank} çiftini krupiyenin ${dealerUpCard.rank} kartına karşı bölmek matematiksel olarak en karlı hamledir.`
                    };
                }
            }
        }

        // 2. Check Soft Totals (Hand has Ace counting as 11)
        if (isSoft && hand.cards.length === 2) {
            // Find the non-ace card value
            const nonAce = hand.cards[0].isAce ? hand.cards[1].value : hand.cards[0].value;
            const softRow = this.softTotals[nonAce];
            if (softRow) {
                let action = softRow[dealerIdx];
                if (action === 'D' && !canDouble) action = 'H';
                if (action === 'Ds' && !canDouble) action = 'S';

                if (action === 'D' || action === 'Ds') {
                    return {
                        action: canDouble ? 'double' : (action === 'Ds' ? 'stand' : 'hit'),
                        code: action,
                        title: canDouble ? 'İKİYE KATLA' : (action === 'Ds' ? 'DUR' : 'KART ÇEK'),
                        advice: `Soft ${total} eli krupiyenin ${dealerUpCard.rank} kartına karşı ${canDouble ? 'ikiye katlamak' : 'avantajlı'} en iyi karardır.`
                    };
                } else if (action === 'S') {
                    return {
                        action: 'stand',
                        code: 'S',
                        title: 'DUR',
                        advice: `Soft ${total} yeterince güçlüdür, krupiyenin patlama ihtimaline karşı elde kalın.`
                    };
                } else {
                    return {
                        action: 'hit',
                        code: 'H',
                        title: 'KART ÇEK',
                        advice: `Soft ${total} patlama riski olmadan geliştirilebilir, kart çekin.`
                    };
                }
            }
        }

        // 3. Hard Totals
        const hardTotal = Math.min(21, Math.max(5, total));
        const hardRow = this.hardTotals[hardTotal];
        if (hardRow) {
            let action = hardRow[dealerIdx];

            // Handle Surrender
            if ((action === 'Rh' || action === 'Rs')) {
                if (canSurrender) {
                    return {
                        action: 'surrender',
                        code: 'R',
                        title: 'PES ET',
                        advice: `${total} vs Krupiye ${dealerUpCard.rank} için pes etmek bahsin yarısını kurtarır.`
                    };
                } else {
                    action = action === 'Rh' ? 'H' : 'S';
                }
            }

            // Handle Double
            if (action === 'D' && !canDouble) {
                action = 'H';
            }

            if (action === 'D') {
                return {
                    action: 'double',
                    code: 'D',
                    title: 'İKİYE KATLA',
                    advice: `${total} toplamı krupiyenin zayıf kartına karşı ikiye katlamak için en uygun durumdur.`
                };
            } else if (action === 'S') {
                return {
                    action: 'stand',
                    code: 'S',
                    title: 'DUR',
                    advice: `${total} toplamı ile patlama riski almayın, krupiyenin kartını bekleyin.`
                };
            } else {
                return {
                    action: 'hit',
                    code: 'H',
                    title: 'KART ÇEK',
                    advice: `${total} skoru kazanmak için yetersiz kalabilir, patlamadan kart çekmelisiniz.`
                };
            }
        }

        return {
            action: total >= 17 ? 'stand' : 'hit',
            code: total >= 17 ? 'S' : 'H',
            title: total >= 17 ? 'DUR' : 'KART ÇEK',
            advice: total >= 17 ? '17 ve üzeri puanlarda durmak önerilir.' : 'Kart çekerek puanınızı yükseltin.'
        };
    }
};

window.StrategyEngine = StrategyEngine;
