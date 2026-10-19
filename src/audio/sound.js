// =============================================================================
//  sound.js — tiny synthesised sound (Web Audio oscillators). No audio files.
//  Sound is optional polish: nothing in the game depends on hearing it.
// =============================================================================
export class Sound {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }

  /** Must be called from a user gesture (click / key press) before audio can start. */
  unlock() {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  tone(freq, start, dur, { type = 'sine', gain = 0.12, slideTo = null } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    switch (name) {
      case 'blip': this.tone(520, 0, 0.08, { gain: 0.05 }); break;                 // dialogue line
      case 'click': this.tone(660, 0, 0.06, { gain: 0.06, type: 'triangle' }); break;
      case 'chime':                                                               // something was documented
        this.tone(523, 0, 0.35, { gain: 0.09 });
        this.tone(659, 0.09, 0.35, { gain: 0.08 });
        this.tone(784, 0.18, 0.5, { gain: 0.07 });
        break;
      case 'soft': this.tone(330, 0, 0.25, { gain: 0.07, slideTo: 280 }); break;  // gentle "not quite"
      case 'open': this.tone(440, 0, 0.12, { gain: 0.05, type: 'triangle' }); break;
      default: break;
    }
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    // very quiet, slowly breathing two-note pad
    const mk = (freq, gain) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.value = gain;
      lfo.frequency.value = 0.12; lfoGain.gain.value = gain * 0.6;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      osc.connect(g); g.connect(this.master);
      osc.start(); lfo.start();
      return [osc, lfo];
    };
    this.ambient = [...mk(196, 0.012), ...mk(247, 0.008)];
  }
}
