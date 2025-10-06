// Motor de áudio: contexto, worklet e fontes (mic OU tone interno via MIDI)
export type LeslieState = 0 | 1 | 2 | 3; // 0=Stop,1=Slow,2=Fast,3=Brake

let ctx: AudioContext;
let node: AudioWorkletNode;
let currentSource: MediaStreamAudioSourceNode | OscillatorNode | null = null;
let savedMix = 0.9;
let isBypassed = false;

// Tone interno (para teste/MIDI)
let toneOsc: OscillatorNode | null = null;
let toneGain: GainNode | null = null;

export async function initLeslie() {
  if (!ctx) {
    ctx = new AudioContext();
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklet.js`);

    node = new AudioWorkletNode(ctx, 'leslie-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    node.connect(ctx.destination);

    // parâmetros iniciais
    setParam('mix', savedMix);
    setParam('depthMs', 2.5);
    setParam('tremoloDb', -4.0);
    setParam('supSlowHz', 0.8);
    setParam('supFastHz', 6.0);
    setParam('infSlowHz', 0.6);
    setParam('infFastHz', 4.5);
    setState(1); // Slow
  }
}

export async function resume() {
  if (ctx?.state !== 'running') await ctx.resume();
}

// --------- Controles DSP ---------
export function setParam(name: string, value: number) {
  const p = node.parameters.get(name);
  if (p) p.setValueAtTime(value, ctx.currentTime);
  if (name === 'mix' && !isBypassed) savedMix = value;
}

export function setState(state: LeslieState) {
  setParam('state', state);
}

// --------- BYPASS ---------
export function toggleBypass() {
  if (!node) return;
  isBypassed = !isBypassed;
  setParam('mix', isBypassed ? 0 : savedMix);
  return isBypassed;
}

// --------- Seleção de entrada (microfone/USB) ---------
export async function listInputs(): Promise<MediaDeviceInfo[]> {
  // pedir permissão uma vez para liberar labels
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {}
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}

export async function selectInput(deviceId?: string) {
  // desconecta fonte atual
  if (currentSource) {
    (currentSource as any).disconnect?.();
    currentSource = null;
  }
  // cria nova stream
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  const mic = ctx.createMediaStreamSource(stream);
  mic.connect(node);
  currentSource = mic;
}

// --------- Tone interno (para MIDI/diagnóstico) ---------
export function startTone(freq = 440) {
  stopTone();
  toneOsc = ctx.createOscillator();
  toneOsc.type = 'square';
  toneOsc.frequency.value = freq;

  toneGain = ctx.createGain();
  toneGain.gain.value = 0.15;

  toneOsc.connect(toneGain).connect(node);
  toneOsc.start();
  currentSource = toneOsc;
}

export function stopTone() {
  try {
    toneOsc?.stop();
  } catch {}
  toneOsc?.disconnect?.();
  toneGain?.disconnect?.();
  toneOsc = null;
  toneGain = null;
}

// MIDI helpers (monofônico simples)
export function midiNoteOn(midi: number, vel = 100) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  startTone(freq);
}
export function midiNoteOff() {
  stopTone();
}
export function midiCC(cc: number, value: number) {
  // Exemplo: CC1 (Modwheel) < 64 => slow; >= 64 => fast
  if (cc === 1) setState(value < 64 ? 1 : 2);
  // CC64 (Sustain) >= 64 => Brake, < 64 => volta ao slow
  if (cc === 64) setState(value >= 64 ? 3 : 1);
}
