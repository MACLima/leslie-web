// src/paywall.ts
export function setupPaywall() {
  const btn = document.getElementById('buy')!;
  btn.addEventListener('click', async () => {
    const res = await fetch('/api/create-checkout-session', { method: 'POST' });
    const data = await res.json();
    // redireciona para o Stripe Checkout
    window.location.href = data.url;
  });

  // Exemplo simples: ler ?license=XYZ na URL após retorno
  const url = new URL(window.location.href);
  const lic = url.searchParams.get('license');
  if (lic) {
    localStorage.setItem('leslie_license', lic);
  }
}
