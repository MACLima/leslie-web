import './styles.css';
import {
  initLeslie, resume, setParam, setState, toggleBypass,
  listInputs, selectInput, startMic, stopMic,
  midiNoteOn, midiNoteOff, midiCC
} from './audio';

// Auto-boot
bootUI();

export function bootUI() {
  // Iniciar Mic
  const startBtn = document.getElementById('startMic')!;
  startBtn.addEventListener('click', async () => {
    await initLeslie();
    await resume();
    await hydrateInputs();
    const sel = document.getElementById('inputSelect') as HTMLSelectElement | null;
    const deviceId = sel?.value || undefined;
    await startMic(deviceId);
  });

  // Parar Mic
  const stopBtn = document.getElementById('stopMic')!;
  stopBtn.addEventListener('click', () => {
    stopMic();
  });

  // sliders
  bindSlider('mix',       0.9);
  bindSlider('depthMs',   2.5);
  bindSlider('tremoloDb', -4.0);
  bindSlider('supSlowHz', 0.8);
  bindSlider('supFastHz', 6.0);
  bindSlider('infSlowHz', 0.6);
  bindSlider('infFastHz', 4.5);

  // botões de estado
  bindState('slow', 1);
  bindState('fast', 2);
  bindState('brake', 3);
  bindState('stop', 0);

  // bypass
  const bypassBtn = document.getElementById('bypass')!;
  bypassBtn.addEventListener('click', () => {
    const on = toggleBypass();
    bypassBtn.textContent = on ? 'Bypass (ON)' : 'Bypass';
  });

  // seletor de entrada
  const inputSel = document.getElementById('inputSelect') as HTMLSelectElement;
  inputSel.addEventListener('change', async () => {
    await selectInput(inputSel.value || undefined);
  });

  // Web MIDI (opcional)
  const useMidi = document.getElementById('useMidi') as HTMLInputElement;
  useMidi.addEventListener('change', async () => {
    if (useMidi.checked) {
      try {
        const access = await (navigator as any).requestMIDIAccess();
        access.inputs.forEach((input: WebMidi.MIDIInput) => {
          input.onmidimessage = (ev: WebMidi.MIDIMessageEvent) => {
            const [st, d1, d2] = ev.data;
            const cmd = st & 0xf0;
            if (cmd === 0x90 && d2 > 0) midiNoteOn(d1, d2);
            else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) midiNoteOff();
            else if (cmd === 0xB0) midiCC(d1, d2);
          };
        });
      } catch {
        alert('Web MIDI não disponível neste navegador.');
        useMidi.checked = false;
      }
    }
  });
}

function bindSlider(id: string, def: number) {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = String(def);
  el.addEventListener('input', () => setParam(id, Number(el.value)));
}

function bindState(id: string, st: 0|1|2|3) {
  document.getElementById(id)!.addEventListener('click', () => setState(st));
}

async function hydrateInputs() {
  const sel = document.getElementById('inputSelect') as HTMLSelectElement;
  sel.innerHTML = '';
  const devs = await listInputs();
  const optAny = document.createElement('option');
  optAny.value = '';
  optAny.textContent = 'Padrão do sistema';
  sel.appendChild(optAny);
  for (const d of devs) {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || d.deviceId;
    sel.appendChild(o);
  }
}
