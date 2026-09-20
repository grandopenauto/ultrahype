(() => {
  const catalog = window.ULTRAHYPE_CATALOG || { products: [] };
  const root = document.getElementById('product-root');
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || catalog.products?.[0]?.id;
  const product = catalog.products.find((item) => item.id === id);

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  if (!product || !root) {
    if (root) root.innerHTML = `<section class="product-loading"><span class="kicker">PRODUCT NOT FOUND</span><h1>That UltraHype product is not available.</h1><a class="button primary" href="./">Back to marketplace</a></section>`;
    return;
  }

  document.body.dataset.productTheme = product.theme || 'default';
  document.title = `${product.brand} — ${product.name} | UltraHype`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', product.description || product.headline || 'UltraHype product');

  const mediaHtml = product.theme === 'dcd' ? renderDcdVisual(product) : renderGallery(product);
  const priceHtml = product.price ? `<div class="product-price">${esc(product.price.label)}</div>` : '';
  const checkoutHtml = product.checkout?.url ? `<a class="button primary" href="${esc(product.checkout.url)}" target="_blank" rel="noopener">${esc(product.checkout.label || 'Continue')}</a>` : '';
  const highlights = (product.highlights || []).map((item) => `<div class="product-highlight">${esc(item)}</div>`).join('');
  const values = (product.valueProps || []).map((item, index) => `<article class="value-card"><span>0${index + 1}</span><h3>${esc(item[0])}</h3><p>${esc(item[1])}</p></article>`).join('');
  const features = (product.features || []).map((item) => `<li>${esc(item)}</li>`).join('');
  const faq = (product.faq || []).map((item) => `<article class="faq-card"><h3>${esc(item[0])}</h3><p>${esc(item[1])}</p></article>`).join('');
  const intelModes = (product.intelligence?.modes || []).map((item) => `<div class="intel-mode"><strong>${esc(item)}</strong><span>${product.intelligence?.status === 'pending' ? 'Awaiting live intelligence data' : 'Capability relationship available for future scoring'}</span></div>`).join('');
  const intelStatus = product.intelligence?.status === 'pending' ? 'NOT YET SCORED' : 'CAPABILITY LAYER';
  const intelCopy = product.intelligence?.status === 'pending'
    ? 'UltraHype is prepared to attach live opportunity signals here, including FSHackability, HypeStack relationships and collection intelligence. No score is shown until it is backed by real market data.'
    : 'This product can participate in UltraHype capability matching. Future intelligence can compare operating fit, complementary systems and deployment paths without inventing unsupported scores.';

  root.innerHTML = `
    <nav class="product-breadcrumb" aria-label="Breadcrumb"><a href="./">UltraHype</a><span>›</span><a href="./#products">Products</a><span>›</span><span>${esc(product.name)}</span></nav>

    <section class="product-hero">
      <div class="product-media-shell">${mediaHtml}</div>
      <aside class="product-buy-panel">
        <div class="product-brandline"><span class="product-badge">${esc(product.badge || 'ULTRAHYPE')}</span><span class="product-category">${esc(product.category || product.type)}</span></div>
        <p class="product-brand">${esc(product.brand)}</p>
        <h1>${esc(product.name)}</h1>
        <p class="product-headline">${esc(product.headline)}</p>
        <p class="product-description">${esc(product.description)}</p>
        ${priceHtml}
        <div class="product-actions">${checkoutHtml}<a class="button ghost" href="./#products">Back to marketplace</a></div>
        ${product.checkout?.note ? `<p class="product-note">${esc(product.checkout.note)}</p>` : ''}
        <div class="product-highlights">${highlights}</div>
      </aside>
    </section>

    <section class="product-section">
      <div class="product-section-head"><span class="kicker">WHY IT MATTERS</span><h2>${product.theme === 'dcd' ? 'A controlled operating lane, not another exposed endpoint.' : 'Product details that earn the spotlight.'}</h2></div>
      <div class="value-grid">${values}</div>
    </section>

    <section class="product-section story-grid">
      <article class="story-copy">
        <span class="kicker">${product.theme === 'dcd' ? 'OPERATING MODEL' : 'DESIGN STORY'}</span>
        <h2>${esc(product.storyTitle || 'Product story')}</h2>
        <p>${esc(product.story || '')}</p>
        <ul class="feature-list">${features}</ul>
      </article>
      <article class="intelligence-card">
        <div class="intel-top"><span class="kicker">ULTRAHYPE INTELLIGENCE</span><span class="intel-status">${intelStatus}</span></div>
        <h3>See what else this product can become.</h3>
        <p>${esc(intelCopy)}</p>
        <div class="intel-modes">${intelModes}</div>
      </article>
    </section>

    <section class="product-section">
      <div class="product-section-head"><span class="kicker">DETAILS</span><h2>Know the operating terms before you move.</h2></div>
      <div class="faq-grid">${faq}</div>
    </section>

    <section class="product-cta">
      <div><span class="kicker">${esc(product.brand)}</span><h2>${product.theme === 'dcd' ? 'Receive outside work. Protect inside operations.' : 'Ready for the next move?'}</h2><p>${esc(product.checkout?.note || '')}</p></div>
      <div class="product-actions">${checkoutHtml}<a class="button ghost" href="./">Explore UltraHype</a></div>
    </section>
  `;

  wireGallery();
  wireReveal();

  function renderGallery(item) {
    const gallery = item.gallery || [{ src: item.heroMedia, alt: item.name }];
    const thumbs = gallery.map((media, index) => `<button class="product-thumb ${index === 0 ? 'active' : ''}" type="button" data-image="${esc(media.src)}" data-alt="${esc(media.alt || item.name)}" aria-label="Show image ${index + 1}"><img src="${esc(media.src)}" alt="" loading="${index === 0 ? 'eager' : 'lazy'}" /></button>`).join('');
    return `<img id="product-main-image" class="product-main-image" src="${esc(gallery[0].src)}" alt="${esc(gallery[0].alt || item.name)}" /><div class="product-thumbs">${thumbs}</div>`;
  }

  function renderDcdVisual(item) {
    return `<div class="dcd-visual"><div class="dcd-gridlines"></div><div class="dock-machine"><div class="dock-machine-top"><span>DIGITAL CROSS DOCK</span><span>LANE ONLINE</span></div><div class="dock-core-card"><h3>${esc(item.name)}</h3><p>RECEIVE → STAGE → MANIFEST → ROUTE → CONTROL → DELIVER</p><div class="dock-flow"><div class="dock-state"><span>01</span><strong>RECEIVE</strong><i class="dock-pulse"></i></div><div class="dock-state"><span>02</span><strong>MANIFEST CREATED</strong><b>STAGED</b></div><div class="dock-state"><span>03</span><strong>POLICY + ROUTE</strong><b>CONTROLLED</b></div><div class="dock-state"><span>04</span><strong>DOWNSTREAM DELIVERY</strong><b>READY</b></div></div></div></div></div>`;
  }

  function wireGallery() {
    const main = document.getElementById('product-main-image');
    if (!main) return;
    document.querySelectorAll('.product-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const next = thumb.dataset.image;
        if (!next || next === main.src) return;
        document.querySelectorAll('.product-thumb').forEach((item) => item.classList.remove('active'));
        thumb.classList.add('active');
        main.classList.add('swap');
        window.setTimeout(() => {
          main.src = next;
          main.alt = thumb.dataset.alt || product.name;
          main.classList.remove('swap');
        }, 130);
      });
    });
  }

  function wireReveal() {
    if (!('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll('.value-card, .story-copy, .intelligence-card, .faq-card, .product-cta');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        observer.unobserve(entry.target);
      });
    }, { threshold: .08 });
    targets.forEach((target) => observer.observe(target));
  }
})();
