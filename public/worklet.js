// public/worklet.js
class LeslieProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mix', defaultValue: 0.9, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'depthMs', defaultValue: 2.5, minValue: 0.1, maxValue: 6.0, automationRate: 'k-rate' },
      { name: 'supSlowHz', defaultValue: 0.8, minValue: 0.1, maxValue: 2.0, automationRate: 'k-rate' },
      { name: 'supFastHz', defaultValue: 6.0, minValue: 3.0, maxValue: 10.0, automationRate: 'k-rate' },
      { name: 'infSlowHz', defaultValue: 0.6, minValue: 0.1, maxValue: 2.0, automationRate: 'k-rate' },
      { name: 'infFastHz', defaultValue: 4.5, minValue: 2.0, maxValue: 8.0, automationRate: 'k-rate' },
      { name: 'tremoloDb', defaultValue: -4.0, minValue: -12.0, maxValue: 0.0, automationRate: 'k-rate' },
      { name: 'state', defaultValue: 1, minValue: 0, maxValue: 3, automationRate: 'k-rate' }, // 0=Stop,1=Slow,2=Fast,3=Brake
      { name: 'proFlag', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }   // 0=Free,1=Pro
    ];
  }

  constructor() {
    super();

    this.fs = sampleRate;
    this.maxDelaySamps = Math.ceil(0.050 * this.fs); // 50ms buffer
    this.dlL = new Float32Array(this.maxDelaySamps);
    this.dlR = new Float32Array(this.maxDelaySamps);
    this.w = 0;

    // rotor state
    this.supPhase = 0; this.supSpeed = 0; this.supTarget = 0;
    this.infPhase = 0; this.infSpeed = 0; this.infTarget = 0;

    // ramp time-constants (s)
    this.supTauUp = 0.8; this.supTauDown = 1.6;
    this.infTauUp = 3.0; this.infTauDown = 4.5;

    // simple 1-pole LPF for lower rotor color
    this.infLP_zL = 0; this.infLP_zR = 0;
    this.infLP_alpha = this._calcLPFAlpha(800); // ~800 Hz

    // free-mode beep
    this.beepPhase = 0;
    this.beepIntervalSamples = Math.floor(this.fs * 20); // a cada 20s
    this.beepLen = Math.floor(this.fs * 0.08);           // 80ms
    this.sampleCounter = 0;
  }

  _dbToLin(db) { return Math.pow(10, db / 20); }
  _slew(current, target, tau) {
    const Ts = 1 / this.fs;
    const a = 1 - Math.exp(-Ts / tau);
    return current + (target - current) * a;
  }
  _lp1(x, z) {
    const y = z + this.infLP_alpha * (x - z);
    return y;
  }
  _calcLPFAlpha(fc) {
    const x = Math.exp(-2 * Math.PI * fc / this.fs);
    return 1 - x; // bilinear simplificada (ok p/ 1p)
  }

  _updateTargets(params) {
    const state = Math.floor(params.state[0] || 1);
    const supSlow = params.supSlowHz[0], supFast = params.supFastHz[0];
    const infSlow = params.infSlowHz[0], infFast = params.infFastHz[0];

    if (state === 0) { // Stop
      this.supTarget = 0; this.infTarget = 0;
    } else if (state === 1) { // Slow
      this.supTarget = supSlow; this.infTarget = infSlow;
    } else if (state === 2) { // Fast
      this.supTarget = supFast; this.infTarget = infFast;
    } else { // Brake: desacelera até zero
      this.supTarget = 0; this.infTarget = 0;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const inL = input?.[0] || new Float32Array(128);
    const inR = input?.[1] || inL;
    const outL = output[0];
    const outR = output[1];

    const mix = parameters.mix[0];
    const depthMs = parameters.depthMs[0];
    const tremDb = parameters.tremoloDb[0];
    const tremMin = this._dbToLin(tremDb);
    const proFlag = parameters.proFlag[0] > 0.5;

    this._updateTargets(parameters);
    const depthSamps = Math.min(this.maxDelaySamps - 2, Math.max(1, depthMs * 0.001 * this.fs));

    for (let n = 0; n < outL.length; n++) {
      // 1) ramp speeds
      const supTau = (this.supTarget > this.supSpeed) ? this.supTauUp : this.supTauDown;
      const infTau = (this.infTarget > this.infSpeed) ? this.infTauUp : this.infTauDown;
      this.supSpeed = this._slew(this.supSpeed, this.supTarget, supTau);
      this.infSpeed = this._slew(this.infSpeed, this.infTarget, infTau);

      // 2) LFOs (phase 0..1)
      this.supPhase += this.supSpeed / this.fs;
      if (this.supPhase >= 1) this.supPhase -= 1;
      this.infPhase += this.infSpeed / this.fs;
      if (this.infPhase >= 1) this.infPhase -= 1;

      const lfoSup = Math.sin(2 * Math.PI * this.supPhase);
      const lfoInf = Math.sin(2 * Math.PI * this.infPhase);

      // 3) write into delay (mono sum)
      const x = 0.5 * ((inL[n] || 0) + (inR[n] || 0));
      this.dlL[this.w] = x;
      this.dlR[this.w] = x;

      // 4) read with modulated delay (center ± depth)
      const center = depthSamps;
      const mod = depthSamps * lfoSup; // ±depth
      let readPos = this.w - (center + mod);
      while (readPos < 0) readPos += this.maxDelaySamps;
      while (readPos >= this.maxDelaySamps) readPos -= this.maxDelaySamps;

      const i0 = readPos | 0;
      const i1 = (i0 + 1) % this.maxDelaySamps;
      const frac = readPos - i0;
      const ySup = (1 - frac) * this.dlL[i0] + frac * this.dlL[i1];

      // 5) stereo pan do rotor superior (sen/cos defasados)
      const panL = 0.5 * (1 + Math.sin(2 * Math.PI * this.supPhase));
      const panR = 0.5 * (1 + Math.cos(2 * Math.PI * this.supPhase));
      let ySupL = ySup * panL;
      let ySupR = ySup * panR;

      // 6) tremolo rotor inferior
      const trem = ((lfoInf + 1) * 0.5) * (1 - tremMin) + tremMin; // map -1..1 → [tremMin..1]
      let yInfL = x * trem;
      let yInfR = x * trem;

      // 7) LPF simples no inferior (corpo)
      this.infLP_zL = this._lp1(yInfL, this.infLP_zL);
      this.infLP_zR = this._lp1(yInfR, this.infLP_zR);
      yInfL = this.infLP_zL; 
      yInfR = this.infLP_zR;

      // 8) mix
      const wetL = 0.6 * ySupL + 0.4 * yInfL;
      const wetR = 0.6 * ySupR + 0.4 * yInfR;
      outL[n] = (1 - mix) * (inL[n] || 0) + mix * wetL;
      outR[n] = (1 - mix) * (inR[n] || 0) + mix * wetR;

      // 9) beep no modo Free
      if (!proFlag) {
        const t = this.sampleCounter % this.beepIntervalSamples;
        if (t < this.beepLen) {
          // seno a ~1.2kHz -20 dB
          const b = Math.sin(2 * Math.PI * 1200 * (this.sampleCounter / this.fs)) * 0.1;
          outL[n] += b; outR[n] += b;
        }
      }

      // advance write
      this.w++; if (this.w >= this.maxDelaySamps) this.w = 0;
      this.sampleCounter++;
    }

    return true;
  }
}

registerProcessor('leslie-processor', LeslieProcessor);
