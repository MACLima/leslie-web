// Leslie Web – AudioWorkletProcessor com Doppler (delay modulado) + tremolo + pan + rampas

class LeslieProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mix',        defaultValue: 0.9, minValue: 0.0, maxValue: 1.0,  automationRate: 'k-rate' },
      { name: 'depthMs',    defaultValue: 2.5, minValue: 0.1, maxValue: 6.0,  automationRate: 'k-rate' },

      { name: 'supSlowHz',  defaultValue: 0.8, minValue: 0.1, maxValue: 2.0,  automationRate: 'k-rate' },
      { name: 'supFastHz',  defaultValue: 6.0, minValue: 3.0,  maxValue: 10.0, automationRate: 'k-rate' },

      { name: 'infSlowHz',  defaultValue: 0.6, minValue: 0.1, maxValue: 2.0,  automationRate: 'k-rate' },
      { name: 'infFastHz',  defaultValue: 4.5, minValue: 2.0,  maxValue: 8.0,  automationRate: 'k-rate' },

      { name: 'tremoloDb',  defaultValue: -4.0, minValue: -12.0, maxValue: 0.0, automationRate: 'k-rate' },

      // 0=Stop, 1=Slow, 2=Fast, 3=Brake
      { name: 'state',      defaultValue: 1,   minValue: 0,    maxValue: 3,    automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();

    // Sample rate e buffers de delay (50 ms de margem)
    this.fs = sampleRate;
    this.maxDelaySamps = Math.ceil(0.050 * this.fs);
    this.dl = new Float32Array(this.maxDelaySamps); // mono-sum
    this.w  = 0;

    // Estados dos rotores
    this.supPhase = 0; this.supSpeed = 0; this.supTarget = 0;
    this.infPhase = 0; this.infSpeed = 0; this.infTarget = 0;

    // Constantes de rampa (inércia)
    this.supTauUp = 0.8;  this.supTauDown = 1.6;
    this.infTauUp = 3.0;  this.infTauDown = 4.5;

    // LPF 1-pole p/ rotor inferior
    this.lpfZL = 0; this.lpfZR = 0;
    this.lpfAlpha = this._calcLPFAlpha(800);

    // Fases para pan estéreo (corneta)
    this.twoPi = 2 * Math.PI;
  }

  // utilitários
  _dbToLin(db) { return Math.pow(10, db / 20); }
  _slew(x, target, tau) {
    const a = 1 - Math.exp(-(1 / this.fs) / tau);
    return x + (target - x) * a;
  }
  _calcLPFAlpha(fc) {
    const x = Math.exp(-2 * Math.PI * fc / this.fs);
    return 1 - x; // coeficiente do 1-pole
  }
  _lpfStep(x, zName) {
    const z = this[zName] + this.lpfAlpha * (x - this[zName]);
    this[zName] = z;
    return z;
  }

  _updateTargets(p) {
    const st = Math.floor(p.state[0] ?? 1);
    const supSlow = p.supSlowHz[0], supFast = p.supFastHz[0];
    const infSlow = p.infSlowHz[0], infFast = p.infFastHz[0];

    if (st === 0) { // Stop
      this.supTarget = 0; this.infTarget = 0;
    } else if (st === 1) { // Slow
      this.supTarget = supSlow; this.infTarget = infSlow;
    } else if (st === 2) { // Fast
      this.supTarget = supFast; this.infTarget = infFast;
    } else { // Brake
      this.supTarget = 0; this.infTarget = 0;
    }
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0] || [];
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const inL  = input[0] || new Float32Array(128);
    const inR  = input[1] || inL;
    const outL = output[0];
    const outR = output[1];

    // parâmetros k-rate
    const mix     = parameters.mix[0];
    const depthMs = parameters.depthMs[0];
    const tremDb  = parameters.tremoloDb[0];
    const tremMin = this._dbToLin(tremDb);

    // limitar profundidade
    const depthSamps = Math.max(1, Math.min(this.maxDelaySamps - 3, depthMs * 0.001 * this.fs));
    this._updateTargets(parameters);

    for (let n = 0; n < outL.length; n++) {
      // 1) rampas de velocidade (inércia)
      const supTau = (this.supTarget > this.supSpeed) ? this.supTauUp : this.supTauDown;
      const infTau = (this.infTarget > this.infSpeed) ? this.infTauUp : this.infTauDown;
      this.supSpeed = this._slew(this.supSpeed, this.supTarget, supTau);
      this.infSpeed = this._slew(this.infSpeed, this.infTarget, infTau);

      // 2) fases dos LFOs
      this.supPhase += this.supSpeed / this.fs;
      if (this.supPhase >= 1) this.supPhase -= 1;
      this.infPhase += this.infSpeed / this.fs;
      if (this.infPhase >= 1) this.infPhase -= 1;

      const lfoSup = Math.sin(this.twoPi * this.supPhase); // -1..1
      const lfoInf = Math.sin(this.twoPi * this.infPhase); // -1..1

      // 3) escrever no buffer (entrada mono)
      const x = 0.5 * ((inL[n] || 0) + (inR[n] || 0));
      this.dl[this.w] = x;

      // 4) ler com atraso modulado (centro ± depth)
      const center = depthSamps;
      const mod    = depthSamps * lfoSup;
      let readPos  = this.w - (center + mod);
      while (readPos < 0) readPos += this.maxDelaySamps;
      while (readPos >= this.maxDelaySamps) readPos -= this.maxDelaySamps;

      const i0 = readPos | 0;
      const i1 = (i0 + 1) % this.maxDelaySamps;
      const frac = readPos - i0;
      const ySup = (1 - frac) * this.dl[i0] + frac * this.dl[i1];

      // 5) pan estéreo do rotor superior (sen/cos defasados)
      const panL = 0.5 * (1 + Math.sin(this.twoPi * this.supPhase));
      const panR = 0.5 * (1 + Math.cos(this.twoPi * this.supPhase));
      let ySupL = ySup * panL;
      let ySupR = ySup * panR;

      // 6) tremolo do rotor inferior + LPF (corpo)
      const trem = ((lfoInf + 1) * 0.5) * (1 - tremMin) + tremMin; // mapeia -1..1 → [tremMin..1]
      let yInfL = x * trem;
      let yInfR = x * trem;
      yInfL = this._lpfStep(yInfL, 'lpfZL');
      yInfR = this._lpfStep(yInfR, 'lpfZR');

      // 7) mistura de rotores + dry/wet
      const wetL = 0.6 * ySupL + 0.4 * yInfL;
      const wetR = 0.6 * ySupR + 0.4 * yInfR;

      outL[n] = (1 - mix) * (inL[n] || 0) + mix * wetL;
      outR[n] = (1 - mix) * (inR[n] || 0) + mix * wetR;

      // 8) avança write
      this.w++;
      if (this.w >= this.maxDelaySamps) this.w = 0;
    }

    return true;
  }
}

registerProcessor('leslie-processor', LeslieProcessor);
