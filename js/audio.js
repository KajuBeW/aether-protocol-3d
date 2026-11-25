/**
 * AETHER PROTOCOL - Procedural Web Audio Synthesizer & Convolution Reverb Engine
 * Zero external audio assets required; generates realistic layered gunshots, explosions,
 * footsteps, sci-fi HUD chimes, bullet-time filter sweeps, and atmospheric cyber-rain.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.reverbNode = null;
    this.worldFilter = null;
    this.noiseBuffer = null;
    this.volume = 0.75;
    this.initialized = false;
    this.rainSource = null;
    this.pulseTimer = 0;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Master dynamics compressor for punchy AAA mix without clipping
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;

    // World Lowpass filter for Chrono-Overdrive (Bullet-Time muffled depth!)
    this.worldFilter = this.ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.Q.value = 0.8;

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.95;

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.24;

    // Procedural Courtyard Convolution Reverb
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this._createReverbImpulse(1.65, 3.2);
    const reverbWet = this.ctx.createGain();
    reverbWet.gain.value = 0.24;

    this.sfxGain.connect(this.worldFilter);
    this.sfxGain.connect(this.reverbNode);
    this.reverbNode.connect(reverbWet);
    reverbWet.connect(this.worldFilter);
    this.ambienceGain.connect(this.worldFilter);

    this.worldFilter.connect(compressor);
    compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Shared 2-second white/pink noise buffer
    this.noiseBuffer = this._createNoiseBuffer(2.0);
    this._startRainAmbience();
    this.initialized = true;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  setOverdriveAudio(active) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    this.worldFilter.frequency.setTargetAtTime(active ? 1150 : 20000, now, 0.08);
  }

  _createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  _createReverbImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return impulse;
  }

  _startRainAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1450;
    bp.Q.value = 0.55;

    const g = this.ctx.createGain();
    g.gain.value = 0.28;

    src.connect(bp);
    bp.connect(g);
    g.connect(this.ambienceGain);
    src.start();
    this.rainSource = src;
  }

  // Subtle darksynth combat bass pulse called during active gameplay
  updateCombatPulse(dt, enemyCount, overdrive) {
    if (!this.initialized || enemyCount <= 0) return;
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) {
      this.pulseTimer = overdrive ? 0.48 : 0.28;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const notes = [55, 55, 65.41, 49.0];
      const freq = notes[Math.floor(Math.random() * notes.length)];
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(240, now);
      lp.frequency.exponentialRampToValueAtTime(70, now + 0.22);

      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.ambienceGain);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  playWeaponFire(type) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    if (type === 'ar') {
      // Punchy sub kick + crisp transient crack + plasma chirp
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(165, now);
      sub.frequency.exponentialRampToValueAtTime(38, now + 0.09);
      subGain.gain.setValueAtTime(0.55, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      sub.connect(subGain);
      subGain.connect(this.sfxGain);
      sub.start(now);
      sub.stop(now + 0.11);

      // Noise crack
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200 + (Math.random() - 0.5) * 300, now);
      bp.Q.value = 0.9;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.45, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      n.start(now);
      n.stop(now + 0.09);

      // Sci-fi pulse harmonic
      const pulse = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      pulse.type = 'sawtooth';
      pulse.frequency.setValueAtTime(880, now);
      pulse.frequency.exponentialRampToValueAtTime(240, now + 0.065);
      pg.gain.setValueAtTime(0.16, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      pulse.connect(pg);
      pg.connect(this.sfxGain);
      pulse.start(now);
      pulse.stop(now + 0.075);
    } else if (type === 'shotgun') {
      // Heavy kinetic boom + wide transient roar + metallic pump rack
      const boom = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(135, now);
      boom.frequency.exponentialRampToValueAtTime(28, now + 0.24);
      bg.gain.setValueAtTime(0.85, now);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      boom.connect(bg);
      bg.connect(this.sfxGain);
      boom.start(now);
      boom.stop(now + 0.27);

      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3400, now);
      lp.frequency.exponentialRampToValueAtTime(420, now + 0.24);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.75, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(this.sfxGain);
      n.start(now);
      n.stop(now + 0.26);
    } else if (type === 'railgun') {
      // Electromagnetic high-energy discharge + sub shockwave
      const zap = this.ctx.createOscillator();
      const zg = this.ctx.createGain();
      zap.type = 'sawtooth';
      zap.frequency.setValueAtTime(1950, now);
      zap.frequency.exponentialRampToValueAtTime(110, now + 0.34);
      zg.gain.setValueAtTime(0.42, now);
      zg.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      zap.connect(zg);
      zg.connect(this.sfxGain);
      zap.start(now);
      zap.stop(now + 0.37);

      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(190, now);
      sub.frequency.exponentialRampToValueAtTime(32, now + 0.32);
      sg.gain.setValueAtTime(0.75, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      sub.connect(sg);
      sg.connect(this.sfxGain);
      sub.start(now);
      sub.stop(now + 0.35);

      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 3600;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.48, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxGain);
      n.start(now);
      n.stop(now + 0.21);
    }
  }

  playReload() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const clicks = [
      { t: 0.04, f: 520 },
      { t: 0.38, f: 680 },
      { t: 0.72, f: 940 }
    ];
    clicks.forEach(c => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(c.f, now + c.t);
      osc.frequency.exponentialRampToValueAtTime(c.f * 0.45, now + c.t + 0.055);
      g.gain.setValueAtTime(0.24, now + c.t);
      g.gain.exponentialRampToValueAtTime(0.001, now + c.t + 0.06);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + c.t);
      osc.stop(now + c.t + 0.07);
    });
  }

  playHitmarker(isCrit = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = isCrit ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isCrit ? 2450 : 1650, now);
    osc.frequency.exponentialRampToValueAtTime(isCrit ? 1200 : 850, now + 0.045);
    g.gain.setValueAtTime(isCrit ? 0.36 : 0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(g);
    g.connect(this.masterGain); // Bypass lowpass so hitmarkers always feel razor-sharp!
    osc.start(now);
    osc.stop(now + 0.06);

    if (isCrit) {
      const ping = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(3200, now + 0.015);
      pg.gain.setValueAtTime(0.24, now + 0.015);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      ping.connect(pg);
      pg.connect(this.masterGain);
      ping.start(now + 0.015);
      ping.stop(now + 0.15);
    }
  }

  playFootstep(sprinting = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320 + Math.random() * 140;
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(sprinting ? 0.16 : 0.1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    n.start(now);
    n.stop(now + 0.07);
  }

  playJump(isDouble = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDouble ? 240 : 140, now);
    osc.frequency.exponentialRampToValueAtTime(isDouble ? 620 : 320, now + 0.14);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);

    if (isDouble) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.28, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      n.start(now);
      n.stop(now + 0.17);
    }
  }

  playDash() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, now);
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    n.start(now);
    n.stop(now + 0.23);
  }

  playExplosion(scale = 1.0) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.55 * scale);
    sg.gain.setValueAtTime(Math.min(0.95, 0.75 * scale), now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.6 * scale);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.62 * scale);

    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.55 * scale);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(Math.min(0.85, 0.65 * scale), now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.58 * scale);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(this.sfxGain);
    n.start(now);
    n.stop(now + 0.6 * scale);
  }

  playEnemyLaser() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playPlayerHit(shielded = true) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = shielded ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(shielded ? 360 : 150, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playPickup() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 1046.5].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      g.gain.setValueAtTime(0.2, now + idx * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.16);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.18);
    });
  }

  playWaveHorn(isBoss = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isBoss ? 82.4 : 110, now);
    osc.frequency.linearRampToValueAtTime(isBoss ? 73.4 : 146.8, now + 0.65);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;

    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.88);
  }
}

window.SoundEngine = SoundEngine;
