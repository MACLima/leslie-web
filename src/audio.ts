let ctx: AudioContext;
let node: AudioWorkletNode;

export async function initLeslie() {
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklet.js`);

  node = new AudioWorkletNode(ctx, 'leslie-processor', { outputChannelCount: [2] });

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const input = ctx.createMediaStreamSource(stream);
  input.connect(node).connect(ctx.destination);
}
