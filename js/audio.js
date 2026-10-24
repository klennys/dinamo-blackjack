/**
 * DINAMO BLACKJACK - Procedural Web Audio Sound Engine
 * No external sound files required; 100% self-contained & low latency.
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.7;
        this._initOnInteraction = this._initOnInteraction.bind(this);
        window.addEventListener('click', this._initOnInteraction, { once: true });
        window.addEventListener('keydown', this._initOnInteraction, { once: true });
    }

    _initOnInteraction() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    _getContext() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    setMuted(muted) {
        this.enabled = !muted;
    }

    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, val));
    }

    // Ceramic Casino Chip sound
    playChip() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // High frequency click / clink
        osc.type = 'triangle';
        const baseFreq = 1800 + Math.random() * 400;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200, now);
        filter.Q.setValueAtTime(3, now);

        gain.gain.setValueAtTime(0.3 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.05);

        // Secondary subtle rattle for realism
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(3200 + Math.random() * 200, now + 0.01);
        gain2.gain.setValueAtTime(0.15 * this.volume, now + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.01);
        osc2.stop(now + 0.045);
    }

    // Card slide & snap onto table
    playCard() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 0.08;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.08);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.35 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
    }

    // Button click / UI tick
    playClick() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.03);

        gain.gain.setValueAtTime(0.15 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.03);
    }

    // Regular Win chime
    playWin() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const now = ctx.currentTime;

        notes.forEach((freq, idx) => {
            const start = now + idx * 0.09;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25 * this.volume, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(start);
            osc.stop(start + 0.35);
        });
    }

    // Natural Blackjack Jackpot Celebration
    playBlackjack() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const chords = [
            [523.25, 659.25, 783.99],          // C major
            [587.33, 739.99, 880.00],          // D major
            [659.25, 830.61, 987.77],          // E major
            [1046.50, 1318.51, 1567.98]        // C6 major high fanfare
        ];

        const now = ctx.currentTime;

        chords.forEach((chord, step) => {
            const time = now + step * 0.14;
            chord.forEach(freq => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, time);

                const dur = step === chords.length - 1 ? 0.7 : 0.25;
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.2 * this.volume, time + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(time);
                osc.stop(time + dur);
            });
        });
    }

    // Bust / Defeat sound
    playBust() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const notes = [311.13, 293.66, 277.18, 246.94]; // Eb4, D4, Db4, B3

        notes.forEach((freq, idx) => {
            const start = now + idx * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.18 * this.volume, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(800, start);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(start);
            osc.stop(start + 0.25);
        });
    }

    // Push / Tie sound
    playPush() {
        if (!this.enabled) return;
        const ctx = this._getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        [440, 554.37].forEach((freq, idx) => {
            const start = now + idx * 0.1;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.15 * this.volume, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(start);
            osc.stop(start + 0.3);
        });
    }
}

window.soundEngine = new SoundEngine();
