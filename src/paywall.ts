export function setupPaywall() {
  const btn = document.getElementById('buy');
  if (!btn) return;
  btn.addEventListener('click', () => {
    alert('Função Pro ainda não habilitada nesta versão pública.');
  });
}
