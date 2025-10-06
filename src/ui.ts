import './styles.css';

export function bootUI() {
  const startBtn = document.getElementById('start')!;
  startBtn.addEventListener('click', async () => {
    const audio = await import('./audio');
    audio.initLeslie();
  });
}
