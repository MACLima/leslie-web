// src/ui.ts
import { LeslieEngine } from './audio';

const engine = new LeslieEngine();

export async function bootUI() {
  await engine.init();
  engine.setPro(false); // começa Free
  bindControls();
}

function bindControls() {
  const startBtn = document.getElementById('start')!;
  startBtn.addEventListener('click', async () => {
    await engine.useMic();
    engine.resume();
  });

  bindSlider('mix', 0.9);
  bindSlider('depthMs', 2.5);
  bindSlider('tremoloDb', -4.0);
  bindSlider('supSlowHz', 0.8);
  bindSlider('supFastHz', 6.0);
  bindSlider('infSlowHz', 0.6);
  bindSlider('infFastHz', 4.5);

  document.getElementById('slow')!.addEventListener('click', () => engine.setState('slow'));
  document.getElementById('fast')!.addEventListener('click', () => engine.setState('fast'));
  document.getElementById('brake')!.addEventListener('click', () => engine.setState('brake'));
  document.getElementById('stop')!.addEventListener('click', () => engine.setState('stop'));
}

function bindSlider(id: string, def: number) {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = String(def);
  el.oninput = () => engine.setParam(id, Number(el.value));
}
