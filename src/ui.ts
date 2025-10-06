import './styles.css';
import { initLeslie, setParam, setState, resume } from './audio';

// Boot da interface e bindings dos controles
export function bootUI() {
  const startBtn = document.getElementById('start')!;
  startBtn.addEventListener('click', async () => {
    await initLeslie();
    await resume();
  });

  bindSlider('mix',       0.9);
  bindSlider('depthMs',   2.5);
  bindSlider('tremoloDb', -4.0);

  bindSlider('supSlowHz', 0.8);
  bindSlider('supFastHz', 6.0);
  bindSlider('infSlowHz', 0.6);
  bindSlider('infFastHz', 4.5);

  // Botões de estado
  document.getElementById('slow')!.addEventListener('click', () => setState(1));
  document.getElementById('fast')!.addEventListener('click', () => setState(2));
  document.getElementById('brake')!.addEventListener('click', () => setState(3));
  document.getElementById('stop')!.addEventListener('click', () => setState(0));
}

function bindSlider(id: string, def: number) {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = String(def);
  el.addEventListener('input', () => setParam(id, Number(el.value)));
}

// 🔰 auto-boot ao carregar o módulo
bootUI(
