// Motor de áudio: cria contexto, carrega o worklet e expõe setters de parâmetros

export type LeslieState = 0 | 1 | 2 | 3; // 0=Stop,1=Slow,2=Fast,3=Brake

let ctx: AudioContext;
let node: AudioWorkletNode;
let mic: MediaStreamAudioSourceNode | null = null;

export async function initLeslie() {
  // 48k é bom, mas deixe o navegador decidir; ajuste se quiser forçar
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklet.js`);

  node = new AudioWorkletNode(ctx, 'leslie-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });
  node.connect(ctx.destination);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  });
  mic = ctx.createMediaStreamSource(stream);
  mic.connect(node);

  // valores iniciais coerentes com a UI
  setParam('mix', 0.9);
  setParam('depthMs', 2.5);
  setParam('tremoloDb', -4.0);
  setParam('supSlowHz', 0.8);
  setParam('supFastHz', 6.0);
  setParam('infSlowHz', 0.6);
  setParam('infFastHz', 4.5);
  setState(1); // Slow
}

export function setParam(name: string, value: number) {
  const p = node.parameters.get(name);
  if (p) p.setValueAtTime(value, ctx.currentTime);
}

export function setState(state: LeslieState) {
  setParam('state', state);
}

export async function resume() {
  if (ctx?.state !== 'running') await ctx.resume();
}
