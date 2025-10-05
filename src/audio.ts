// src/audio.ts
export type LeslieState = 'stop' | 'slow' | 'fast' | 'brake';

export class LeslieEngine {
  private ctx!: AudioContext;
  private node!: AudioWorkletNode;
  private input!: MediaStreamAudioSourceNode | null;
  private state: LeslieState = 'slow';

  async init() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.audioWorklet.addModule('/worklet.js');
    this.node = new AudioWorkletNode(this.ctx, 'leslie-processor', {
      outputChannelCount: [2],
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2
    });
    this.node.connect(this.ctx.destination);
  }

  async useMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
    this.input = this.ctx.createMediaStreamSource(stream);
    this.input.connect(this.node);
  }

  setParam(name: string, value: number) {
    const p = (this.node.parameters as Map<string, AudioParam>).get(name);
    if (p) p.setValueAtTime(value, this.ctx.currentTime);
  }

  setState(s: LeslieState) {
    this.state = s;
    const map = { stop: 0, slow: 1, fast: 2, brake: 3 };
    this.setParam('state', map[s]);
  }

  setPro(enabled: boolean) {
    this.setParam('proFlag', enabled ? 1 : 0);
  }

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  suspend() { if (this.ctx.state === 'running') this.ctx.suspend(); }
}
