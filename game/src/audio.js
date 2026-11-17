// All sound in Solmarina Heat is synthesized with WebAudio — no audio files,
// no network. Engine hum, sirens, waves, gunshots, pickups and jingles.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.waveGain = null;
    this.sirenPhase = 0;
    this.sirenOn = false;
    this.muted = false;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);

    // --- Engine hum: two detuned saws through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // --- Police siren: a triangle wave whose pitch flips between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    // --- Ocean waves: looped filtered noise, gain set by distance to the sea.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06; // brown-ish rumble
      data[i] = last * 3.2;
    }
    const waveSrc = this.ctx.createBufferSource();
    waveSrc.buffer = buf;
    waveSrc.loop = true;
    const waveFilter = this.ctx.createBiquadFilter();
    waveFilter.type = 'lowpass';
    waveFilter.frequency.value = 320;
    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.value = 0.0;
    waveSrc.connect(waveFilter);
    waveFilter.connect(this.waveGain);
    this.waveGain.connect(this.master);
    waveSrc.start();
    this._noiseBuffer = buf;
  }

  setEngine(speedNorm, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedNorm * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 52 + speedNorm * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 900, t, 0.1);
  }

  setSiren(on, distance) {
    this.sirenOn = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = on ? Math.max(0.015, 0.085 - distance * 0.00035) : 0;
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.15);
  }

  setWaves(amount) {
    if (!this.ctx) return;
    this.waveGain.gain.setTargetAtTime(amount * 0.06, this.ctx.currentTime, 0.4);
  }

  update(dt) {
    if (!this.ctx) return;
    if (this.sirenOn) {
      this.sirenPhase += dt;
      const hi = (this.sirenPhase % 0.9) < 0.45;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 950 : 690, this.ctx.currentTime, 0.03);
    }
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.ctx || !this._noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  click() { this._blip(920, 0.06, 'square', 0.08); }
  pickup() { this._blip(660, 0.09, 'sine', 0.2); this._blip(990, 0.14, 'sine', 0.2, 0.08); }
  cash() { [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.16, 'triangle', 0.16, i * 0.09)); }
  punch() { this._noise(0.09, 500, 0.35); }
  gunshot() { this._noise(0.16, 1800, 0.5, 'highpass'); this._noise(0.12, 300, 0.4); }
  crash(intensity = 1) { this._noise(0.25, 700, 0.3 * intensity); }
  skid() { this._noise(0.18, 2400, 0.07, 'bandpass'); }
  horn() { this._blip(370, 0.28, 'square', 0.1); this._blip(466, 0.28, 'square', 0.08); }
  denied() { this._blip(180, 0.2, 'sawtooth', 0.15); }
  missionDone() { [392, 523, 659, 784].forEach((f, i) => this._blip(f, 0.2, 'triangle', 0.18, i * 0.11)); }
}
