class LeslieProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0]) {
      const inL = input[0];
      const outL = output[0];
      const outR = output[1] ?? output[0];

      for (let i = 0; i < inL.length; i++) {
        outL[i] = inL[i];
        outR[i] = inL[i]; // saída estéreo simples por enquanto
      }
    }
    return true;
  }
}

registerProcessor('leslie-processor', LeslieProcessor);
