// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police sirens, gunshots, punches, pickup blips and a small
// bass-led music loop, all built from oscillators and filtered noise.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Siren: two-tone triangle, toggled by the game loop.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  setEngine(running, speed01) {
    if (!this.ctx) return;
    this.engineGain.gain.value = this.muted ? 0 : (running ? 0.03 + 0.05 * speed01 : 0.015);
    this.engineOsc.frequency.value = 50 + 130 * speed01;
  }

  setSiren(on, t) {
    if (!this.ctx) return;
    this.sirenGain.gain.value = (on && !this.muted) ? 0.035 : 0;
    if (on) this.sirenOsc.frequency.value = (Math.floor(t * 2) % 2 === 0) ? 660 : 880;
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type || 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + (dur || 0.12));
  }

  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  shot() { this.noise(0.14, 0.28, 2400); this.blip(160, 0.08, 'square', 0.1); }
  punch() { this.noise(0.08, 0.18, 700); }
  crash() { this.noise(0.3, 0.3, 500); }
  pickup() { this.blip(880, 0.1, 'sine', 0.12); setTimeout(() => this.blip(1320, 0.14, 'sine', 0.12), 90); }
  sirenBlip() { this.blip(990, 0.18, 'triangle', 0.07); }
  missionDone() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'sine', 0.12), i * 110)); }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Chill bass line in A minor, one note per beat, plus a soft hat tick.
    const bass = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.blip(f, 0.42, 'triangle', 0.05);
      if (this.musicStep % 2 === 0) this.blip(6000, 0.02, 'square', 0.012);
      this.musicStep++;
    }, 320);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) { this.setEngine(false, 0); this.setSiren(false, 0); }
    return this.muted;
  }
}
