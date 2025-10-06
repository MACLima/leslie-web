// Motor de áudio com inicialização preguiçosa (lazy) e fila de parâmetros/estado
export type LeslieState = 0 | 1 | 2 | 3; // 0=Stop,1=Slow,2=Fast,3=Brake

let ctx: AudioContext | null = null;
let node: AudioWorkletNode | null = null;
let currentSource: MediaStreamAudioSourceNode | OscillatorNode | null = null;
let currentStream: MediaStream | null = null;

let savedMix = 0.9;
let isBypassed = false;

// Tone interno (para teste/MIDI)
let toneOsc: OscillatorNode | null = null;
let toneGain: GainNode | null = null;

// ---- Fila de parâmetros/estado antes da engine existir ----
const pendingParams = new Map<string, number>([
  ['mix', 0.9],
  ['depthMs', 2.5],
  ['tremoloDb', -4.0],
  ['supSlowHz', 0.8],
  ['supFastHz', 6.0],
  ['infSlowHz', 0.6],
  ['infFastHz', 4.5],
  ['state', 1],
]);
let pendingState: LeslieState = 1;

function engineReady() {
  return !!(ctx && node);
}

// Cria contexto + worklet + nó do Leslie (NÃO inicia microfone)
export async function initLeslie() {
  if (engineReady()) return;

  ctx = new AudioContext(); // fica "suspended" até resume()
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklet.js`);

  node = new AudioWorkletNode(ctx, 'leslie-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.connect(ctx.destination);

  // aplica fila pendente
  for (const [k, v] of pendingParams.entries()) {
    node.parameters.get(k)?.setValueAtTime(v, ctx.currentTime);
  }
  savedMix = pendingParams.get('mix') ?? savedMix;
}

// Garante engine criada (sem retomar áudio)
export async function ensureEngine() {
  await initLeslie();
}

export async function resume() {
  if (ctx && ctx.state !== 'running') await ctx.resume();
}

// --------- Controles DSP ---------
export function setParam(name: string, value: number) {
  // guarda sempre na fila (caso engine ainda não exista)
  pendingParams.set(name, value);
  if (name === 'mix' && !isBypassed) savedMix = value;

  if (!engineReady()) return; // será aplicado no init
  const p = node!.parameters.get(name);
  if (p && ctx) p.setValueAtTime(value, ctx.currentTime);
}

export function setState(state: LeslieState) {
  pendingState = state;
  setParam('state', state);
}

// --------- BYPASS ---------
export function toggleBypass() {
  isBypassed = !isBypassed;
  setParam('mix', isBypassed ? 0 : savedMix);
  return isBypassed;
}

// --------- Entrada de áudio (iniciar/parar mic) ---------
export async function startMic(deviceId?: string) {
  await ensureEngine();
  await resume();

  stopMic(); // encerra fonte anterior (se houver)

  currentStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const mic = ctx!.createMediaStreamSource(currentStream);
  mic.connect(node!);
  currentSource = mic;
}

export function stopMic() {
  try { (currentSource as any)?.disconnect?.(); } catch {}
  currentSource = null;

  if (currentStream) {
    for (const tr of currentStream.getTracks()) {
      try { tr.stop(); } catch {}
    }
  }
  currentStream = null;
}

// --------- Listagem/seleção de entradas ---------
export async function listInputs(): Promise<MediaDeviceInfo[]> {
  // Tentar permissão para liberar labels (não quebra se negar)
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'audioinput');
}

export async function selectInput(deviceId?: string) {
  await startMic(deviceId);
}

// --------- Tone interno (para MIDI/diagnóstico) ---------
export function startTone(freq = 440) {
  if (!ctx || !node) return; // precisa da engine criada (não precisa do mic)
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
  try { toneOsc?.stop(); } catch {}
  toneOsc?.disconnect?.();
  toneGain?.disconnect?.();
  toneOsc = null;
  toneGain = null;
}

export function midiNoteOn(midi: number, vel = 100) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  startTone(freq);
}
export function midiNoteOff() {
  stopTone();
}
export function midiCC(cc: number, value: number) {
  if (cc === 1) setState(value < 64 ? 1 : 2);     // Modwheel → Slow/Fast
  if (cc === 64) setState(value >= 64 ? 3 : 1);   // Sustain → Brake/Slow
}
