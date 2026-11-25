// Full-page HTML for one language. Used only by scripts/build.mjs.
import * as R from '../assets/js/render.js';

export const SITE = 'https://www.fabao.hair';
export const PATHS = { ru: '/', ky: '/ky/' };
const OG_IMAGE = `${SITE}/assets/img/og-image.jpg`;

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function jsonLd(ctx) {
  const { lang, data } = ctx;
  const url = SITE + PATHS[lang];
  const phone = `+${R.waNumber(ctx)}`;
  const brandName = (id) => data.brands.find((b) => b.id === id)?.name;
  const imageUrl = (u) => {
    if (!u) return undefined;
    const img = ctx.images?.[u];
    const path = img ? img.variants[img.variants.length - 1].webp : u;
    return path.startsWith('/') ? SITE + path : path;
  };
  const store = {
    '@type': 'Store',
    '@id': `${SITE}/#store`,
    name: 'Fabao',
    url,
    logo: `${SITE}/assets/img/apple-touch-icon.png`,
    image: OG_IMAGE,
    description: R.t(lang, 'meta_description'),
    telephone: phone,
    address: { '@type': 'PostalAddress', addressLocality: R.setting(ctx, 'address') || 'Бишкек', addressCountry: 'KG' },
    areaServed: 'KG',
    currenciesAccepted: 'KGS',
    sameAs: [`https://instagram.com/${R.igHandle(ctx)}`],
  };
  const products = data.products.map((p) => {
    const item = {
      '@type': 'Product',
      name: R.loc(lang, p, 'name'),
      description: R.loc(lang, p, 'description') || undefined,
      image: imageUrl(p.image_url),
      brand: brandName(p.brand_id) ? { '@type': 'Brand', name: brandName(p.brand_id) } : undefined,
      category: R.t(lang, 'cat')[p.category] || undefined,
    };
    if (p.price_kgs != null && p.price_kgs !== '') {
      item.offers = {
        '@type': 'Offer',
        price: Number(p.price_kgs),
        priceCurrency: 'KGS',
        availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${url}#catalog`,
        seller: { '@id': `${SITE}/#store` },
      };
    }
    return item;
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      store,
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: SITE + '/', name: 'Fabao', inLanguage: ['ru', 'ky'], publisher: { '@id': `${SITE}/#store` } },
      { '@type': 'ItemList', name: R.t(lang, 'catalog_title'), itemListElement: products.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) },
    ],
  };
}

export function renderPage(ctx, sig) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const S = (k) => R.esc(R.setting(ctx, k));
  const url = SITE + PATHS[lang];
  const consult = R.esc(R.waLink(ctx, R.t(lang, 'wa_consult_msg')));
  const wholesale = R.esc(R.waLink(ctx, R.t(lang, 'wa_wholesale_msg')));
  const ig = R.igHandle(ctx);
  const year = new Date().getFullYear();
  const langLink = (l, label) => `<a href="${PATHS[l]}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ''}>${label}</a>`;
  const bake = { lang, sig, data: ctx.data, images: ctx.images, brandLogos: ctx.brandLogos };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${T('meta_title')}</title>
  <meta name="description" content="${T('meta_description')}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ru" href="${SITE}${PATHS.ru}">
  <link rel="alternate" hreflang="ky" href="${SITE}${PATHS.ky}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${PATHS.ru}">
  <meta name="theme-color" content="#1D5C40">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Fabao">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${T('og_title')}">
  <meta property="og:description" content="${T('og_description')}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${T('og_image_alt')}">
  <meta property="og:locale" content="${lang === 'ky' ? 'ky_KG' : 'ru_RU'}">
  <meta property="og:locale:alternate" content="${lang === 'ky' ? 'ru_RU' : 'ky_KG'}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/site.css">
  <script type="application/ld+json">${jsonForScript(jsonLd(ctx))}</script>
</head>
<body>
  <a class="skip-link" href="#main">${T('skip_link')}</a>
  <header class="header">
    <div class="wrap header-inner">
      <a class="logo" href="${PATHS[lang]}" aria-label="Fabao"><span class="wordmark"></span></a>
      <nav class="nav" aria-label="${T('nav_label')}">
        <a href="#catalog">${T('nav_catalog')}</a>
        <a href="#brands">${T('nav_brands')}</a>
        <a href="#order">${T('nav_delivery')}</a>
        <a href="#wholesale">${T('nav_wholesale')}</a>
        <a href="#contacts">${T('nav_contacts')}</a>
      </nav>
      <div class="header-actions">
        <nav class="lang" aria-label="${T('lang_label')}">
          ${langLink('ru', 'RU')}
          ${langLink('ky', 'KG')}
        </nav>
        <a class="btn btn-small btn-gold js-wa-consult" href="${consult}" target="_blank" rel="noopener" data-track="consult">WhatsApp</a>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">${T('eyebrow_official')}</p>
          <h1 data-setting="hero_title">${S('hero_title')}</h1>
          <p class="lead" data-setting="hero_subtitle">${S('hero_subtitle')}</p>
          <div class="hero-cta">
            <a class="btn btn-emerald" href="#catalog">${T('cta_catalog')}</a>
            <a class="btn btn-line js-wa-consult" href="${consult}" target="_blank" rel="noopener" data-track="consult">${T('cta_consult')}</a>
          </div>
        </div>
        <div class="hero-panel" aria-hidden="true">
          <span class="wordmark wordmark-hero"></span>
          <ul class="hero-brands js-hero-brands">${R.heroBrands(ctx)}</ul>
        </div>
      </div>
    </section>

    <section class="section" id="brands">
      <div class="wrap">
        <div class="section-head">
          <h2>${T('brands_title')}</h2>
          <p>${T('brands_lead')}</p>
        </div>
        <div class="brand-grid js-brands">${R.brandCards(ctx)}</div>
      </div>
    </section>

    <section class="section section-tint" id="catalog">
      <div class="wrap">
        <div class="section-head">
          <h2>${T('catalog_title')}</h2>
          <p>${T('catalog_lead')}</p>
        </div>
        <div class="filters js-filters" role="group" aria-label="${T('filter_label')}">${R.filters(ctx)}</div>
        <div class="product-grid js-products">${R.productCards(ctx)}</div>
      </div>
    </section>

    <section class="section" id="order">
      <div class="wrap">
        <div class="section-head"><h2>${T('order_title')}</h2></div>
        <ol class="steps">
          <li><span class="step-n" aria-hidden="true">1</span><h3>${T('step1_t')}</h3><p>${T('step1_d')}</p></li>
          <li><span class="step-n" aria-hidden="true">2</span><h3>${T('step2_t')}</h3><p>${T('step2_d')}</p></li>
          <li><span class="step-n" aria-hidden="true">3</span><h3>${T('step3_t')}</h3><p>${T('step3_d')}</p></li>
        </ol>
        <div class="delivery">
          <h3>${T('delivery_title')}</h3>
          <p data-setting="delivery_text">${S('delivery_text')}</p>
        </div>
      </div>
    </section>

    <section class="section wholesale" id="wholesale">
      <div class="wrap wholesale-grid">
        <div>
          <p class="eyebrow eyebrow-gold">${T('wholesale_eyebrow')}</p>
          <h2>${T('wholesale_title')}</h2>
          <p class="lead" data-setting="wholesale_text">${S('wholesale_text')}</p>
          <a class="btn btn-gold js-wa-wholesale" href="${wholesale}" target="_blank" rel="noopener" data-track="wholesale">${T('wholesale_cta')}</a>
        </div>
        <ul class="wholesale-points">${R.wholesalePoints(ctx)}</ul>
      </div>
    </section>

    <section class="section" id="contacts">
      <div class="wrap about-grid">
        <div>
          <h2>${T('about_title')}</h2>
          <p class="lead" data-setting="about_text">${S('about_text')}</p>
        </div>
        <div class="contact-card">
          <h3>${T('contacts_title')}</h3>
          <dl>
            <div class="js-row-address"${R.setting(ctx, 'address') ? '' : ' hidden'}><dt>${T('address')}</dt><dd data-setting="address">${S('address')}</dd></div>
            <div class="js-row-hours"${R.setting(ctx, 'hours') ? '' : ' hidden'}><dt>${T('hours')}</dt><dd data-setting="hours">${S('hours')}</dd></div>
            <div><dt>WhatsApp</dt><dd><a class="js-wa-consult js-wa-number" href="${consult}" target="_blank" rel="noopener" data-track="consult">+${R.esc(R.waNumber(ctx))}</a></dd></div>
            <div><dt>Instagram</dt><dd><a class="js-ig" href="https://instagram.com/${R.esc(ig)}" target="_blank" rel="noopener" data-track="instagram">@${R.esc(ig)}</a></dd></div>
          </dl>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="wrap footer-inner">
      <span class="wordmark wordmark-footer" role="img" aria-label="Fabao"></span>
      <p>${T('footer_rights')}</p>
      <p class="muted">© <span class="js-year">${year}</span> Fabao</p>
    </div>
  </footer>

  <dialog class="modal js-modal" aria-labelledby="modal-title">
    <div class="modal-body js-modal-body"></div>
  </dialog>

  <script type="application/json" id="bake-data">${jsonForScript(bake)}</script>
  <script type="module" src="/assets/js/site.js"></script>
</body>
</html>
`;
}

export function renderSitemap(lastmod) {
  const alt = Object.entries(PATHS).map(([l, p]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${p}"/>`).join('\n');
  const urls = Object.values(PATHS).map((p) => `  <url>
    <loc>${SITE}${p}</loc>
    <lastmod>${lastmod}</lastmod>
${alt}
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
