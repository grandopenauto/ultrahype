const config = window.ULTRAHYPE_CONFIG || {};

const year = document.getElementById('year');
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
const toast = document.getElementById('toast');
const marketInput = document.getElementById('market-search');
const marketButton = document.getElementById('market-search-btn');
const marketResult = document.getElementById('market-result');

if (year) year.textContent = new Date().getFullYear();

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

document.querySelectorAll('[data-toast]').forEach((button) => {
  button.addEventListener('click', () => showToast(button.dataset.toast));
});

async function searchEbay() {
  const query = marketInput?.value.trim();
  if (!query || !marketResult) {
    if (marketInput) marketInput.focus();
    return;
  }

  const ebay = config.integrations?.ebay;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');

  if (!ebay?.enabled || !apiBase) {
    marketResult.classList.add('active');
    marketResult.innerHTML = `<span>Connector staged</span><p>“${escapeHtml(query)}” is ready to route through the protected eBay Browse adapter as soon as the backend endpoint is enabled. No eBay credential will be placed in this browser.</p>`;
    showToast('eBay discovery UI is working; protected backend connection is the remaining activation step.');
    return;
  }

  marketResult.classList.add('loading');
  marketResult.innerHTML = '<span>Searching</span><p>Routing query through the protected marketplace adapter…</p>';

  try {
    const url = new URL(`${apiBase}${ebay.searchPath}`);
    url.searchParams.set('q', query);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const payload = await response.json();
    const count = Array.isArray(payload.items) ? payload.items.length : Number(payload.count || 0);
    marketResult.classList.remove('loading');
    marketResult.classList.add('active');
    marketResult.innerHTML = `<span>Connected result</span><p>${count} item${count === 1 ? '' : 's'} returned for “${escapeHtml(query)}”. The production result renderer can now map the normalized catalog payload into UltraHype cards.</p>`;
  } catch (error) {
    marketResult.classList.remove('loading');
    marketResult.innerHTML = `<span>Connector unavailable</span><p>${escapeHtml(error.message)}. The public storefront remains isolated from marketplace credentials.</p>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (marketButton) marketButton.addEventListener('click', searchEbay);
if (marketInput) {
  marketInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchEbay();
  });
}

const revealTargets = document.querySelectorAll('.drop-card, .network-node, .market-terminal, .sell-card');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.animate(
          [
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }
        );
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  revealTargets.forEach((target) => observer.observe(target));
}
