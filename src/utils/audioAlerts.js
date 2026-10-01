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
