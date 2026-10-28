/**
 * Audio Alerts Engine
 * Synthesizes realistic Shopify Store "Cha-Ching!" cash register sounds using Web Audio API
 */

export const playShopifyChachingSound = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Part A: Mechanical Register Slide ("Cha-")
        const bufferSize = Math.floor(ctx.sampleRate * 0.08);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.025));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(3200, now);
        noiseFilter.Q.setValueAtTime(3, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        // Part B: The Metallic Spring Strike ("-Ching!")
        const strikeOsc = ctx.createOscillator();
        const strikeGain = ctx.createGain();
        strikeOsc.type = 'triangle';
        strikeOsc.frequency.setValueAtTime(987.77, now + 0.04); // B5
        strikeOsc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.07); // E6
        strikeGain.gain.setValueAtTime(0.45, now + 0.04);
        strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        strikeOsc.connect(strikeGain);
        strikeGain.connect(ctx.destination);
        strikeOsc.start(now + 0.04);
        strikeOsc.stop(now + 0.35);

        // Part C: The Crystal High Resonant Bell ("-INGGG")
        const bellOsc1 = ctx.createOscillator();
        const bellOsc2 = ctx.createOscillator();
        const bellGain = ctx.createGain();

        bellOsc1.type = 'sine';
        bellOsc1.frequency.setValueAtTime(2637.02, now + 0.08); // E7
        bellOsc2.type = 'sine';
        bellOsc2.frequency.setValueAtTime(3135.96, now + 0.08); // G7

        bellGain.gain.setValueAtTime(0.4, now + 0.08);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

        bellOsc1.connect(bellGain);
        bellOsc2.connect(bellGain);
        bellGain.connect(ctx.destination);

        bellOsc1.start(now + 0.08);
        bellOsc2.start(now + 0.08);
        bellOsc1.stop(now + 0.95);
        bellOsc2.stop(now + 0.95);
    } catch (e) {
        console.warn("Shopify Cha-Ching audio playback error:", e);
    }
};

/**
 * Modern Message Notification Chime (iOS / Slack style bubble chime)
 * Uses high-quality two-tone harmonic synth with smooth decay
 */
export const playNewMessageChime = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Tone 1: Note F#5 (739.99 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(739.99, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tone 2: Higher Note B5 (987.77 Hz) slightly delayed for modern "ding-dong" / "bubble" feel
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(987.77, now + 0.09);
        gain2.gain.setValueAtTime(0.35, now + 0.09);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.09);
        osc2.stop(now + 0.7);

        // Harmonic overtone for crisp sparkle
        const sparkOsc = ctx.createOscillator();
        const sparkGain = ctx.createGain();
        sparkOsc.type = 'triangle';
        sparkOsc.frequency.setValueAtTime(1975.53, now + 0.1); // B6
        sparkGain.gain.setValueAtTime(0.12, now + 0.1);
        sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        sparkOsc.connect(sparkGain);
        sparkGain.connect(ctx.destination);
        sparkOsc.start(now + 0.1);
        sparkOsc.stop(now + 0.45);
    } catch (e) {
        console.warn("New message chime playback error:", e);
    }
};

