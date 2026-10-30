// Sons sintetizados na hora (sem arquivos), com cara de fliperama: bipes, arpejos e ruído filtrado.
// O som vem do lado do tabuleiro onde a coisa aconteceu (panorâmico esquerda/direita).
// Só começa depois de um clique, tecla ou da entrada no VR (regra do navegador).
export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.flip = 0; this.powerNode = null; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.7 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }
  get ok() { return !!this.ctx && this.on; }

  // saída com panorâmico (pan de -1 a 1)
  out(pan = 0) {
    const g = this.ctx.createGain();
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }
  tone(freq, dur, { type = 'square', vol = 0.12, pan = 0, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.out(pan);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { freq = 800, q = 1, vol = 0.2, pan = 0, delay = 0, type = 'bandpass', slide = 0 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.out(pan);
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // insetos ao fundo (cigarra de dia, grilo à noite), bem baixinho
  startAmbient() {
    const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 4200;
    lfo.type = 'square'; lfo.frequency.value = 18;
    lg.gain.value = 0.006;
    g.gain.value = 0;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.amb = { o, lfo, g, lg };
  }
  setAmbient(night, on) {
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    this.amb.o.frequency.setTargetAtTime(night ? 3600 : 4800, t, 0.3);
    this.amb.lfo.frequency.setTargetAtTime(night ? 5 : 22, t, 0.3);
    this.amb.lg.gain.setTargetAtTime(on ? (night ? 0.01 : 0.005) : 0, t, 0.5);
  }

  click() { this.tone(880, 0.05, { vol: 0.08 }); }
  denied() { this.tone(160, 0.14, { type: 'sawtooth', vol: 0.1 }); }
  fruit(pan) { this.flip ^= 1; this.tone(this.flip ? 620 : 830, 0.045, { type: 'triangle', vol: 0.13, pan }); }
  pequi(pan) { [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.1, { type: 'square', vol: 0.09, pan, delay: k * 0.05 })); }
  // zumbido do tatu em bola enquanto o pequi dura
  power(on) {
    if (!this.ctx) return;
    if (on && !this.powerNode && this.on) {
      const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 220;
      lfo.frequency.value = 7; lg.gain.value = 60;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.045;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.powerNode = { o, lfo, g };
    } else if (!on && this.powerNode) {
      const n = this.powerNode; this.powerNode = null;
      n.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch { /* já parou */ } }, 300);
    }
  }
  powerWarn() { if (this.powerNode) this.powerNode.lfo.frequency.setTargetAtTime(16, this.ctx.currentTime, 0.1); }
  knock(pan, k = 0) { this.tone(300 + k * 120, 0.22, { type: 'square', vol: 0.12, pan, slide: 3 }); this.noise(0.12, { freq: 1500, vol: 0.12, pan }); }
  bossHit(pan) { this.tone(140, 0.4, { type: 'sawtooth', vol: 0.16, pan, slide: 0.5 }); this.noise(0.35, { freq: 400, vol: 0.25, pan, slide: 0.4 }); this.tone(600, 0.25, { vol: 0.08, pan, slide: 2, delay: 0.15 }); }
  roar(pan) { this.noise(0.6, { freq: 300, q: 3, vol: 0.28, pan, slide: 0.6 }); this.tone(90, 0.5, { type: 'sawtooth', vol: 0.12, pan, slide: 0.7 }); }
  growl(pan) { this.noise(0.25, { freq: 420, q: 4, vol: 0.12, pan, slide: 0.7 }); }
  die() { for (let k = 0; k < 8; k++) this.tone(700 - k * 70, 0.1, { type: 'square', vol: 0.1, delay: k * 0.09, slide: 0.85 }); }
  stonePlace(pan) { this.noise(0.12, { freq: 260, q: 1.2, vol: 0.4, pan, type: 'lowpass' }); this.tone(110, 0.1, { type: 'sine', vol: 0.18, pan, slide: 0.6 }); }
  stoneBack() { this.tone(400, 0.06, { type: 'triangle', vol: 0.06 }); }
  crumble(pan) { for (let k = 0; k < 5; k++) this.noise(0.06, { freq: 900 + k * 300, vol: 0.12, pan, delay: k * 0.04 }); }
  stoneReady() { this.tone(1200, 0.05, { type: 'sine', vol: 0.06 }); }
  ram(pan) { this.noise(0.1, { freq: 220, vol: 0.3, pan, type: 'lowpass' }); }
  caju(pan) { [988, 1319, 1568].forEach((f, k) => this.tone(f, 0.12, { type: 'triangle', vol: 0.1, pan, delay: k * 0.06 })); }
  cajuShow(pan) { this.tone(1568, 0.2, { type: 'sine', vol: 0.06, pan }); this.tone(2093, 0.25, { type: 'sine', vol: 0.05, pan, delay: 0.1 }); }
  extraLife() { [523, 784, 1047, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.09, { vol: 0.09, delay: k * 0.07 })); }
  ready() { [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.14, { type: 'square', vol: 0.08, delay: k * 0.13 })); }
  won() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.14, { type: 'square', vol: 0.09, delay: k * 0.1 })); }
  lost() { [392, 370, 349, 330].forEach((f, k) => this.tone(f, 0.32, { type: 'triangle', vol: 0.12, delay: k * 0.26 })); }
  star(k) { this.tone(880 * (1 + k * 0.25), 0.2, { type: 'triangle', vol: 0.1 }); }
  hide(pan) { this.tone(500, 0.4, { type: 'sine', vol: 0.06, pan, slide: 0.4 }); }
  show(pan) { this.tone(250, 0.3, { type: 'sine', vol: 0.06, pan, slide: 2.2 }); }
}
