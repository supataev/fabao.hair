// Full-page HTML. Used only by scripts/build.mjs.
// Pages (each in ru at / and ky at /ky/): home, /brands/, /brands/<slug>/, /products/.
import * as R from '../assets/js/render.js';

export const SITE = 'https://www.fabao.hair';
const OG_IMAGE = `${SITE}/assets/img/og-image.jpg`;
const LANGS = ['ru', 'ky'];

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/* ---------- structured data ---------- */
function storeLd(ctx) {
  return {
    '@type': 'Store',
    '@id': `${SITE}/#store`,
    name: 'Fabao',
    url: `${SITE}/`,
    logo: `${SITE}/assets/img/apple-touch-icon.png`,
    image: OG_IMAGE,
    description: R.t(ctx.lang, 'meta_description'),
    telephone: `+${R.waNumber(ctx)}`,
    address: { '@type': 'PostalAddress', addressLocality: R.setting(ctx, 'address') || 'Бишкек', addressCountry: 'KG' },
    areaServed: 'KG',
    currenciesAccepted: 'KGS',
    sameAs: [`https://instagram.com/${R.igHandle(ctx)}`],
  };
}

function productLd(ctx, p, pageUrl) {
  const img = p.image_url && ctx.images?.[p.image_url];
  const image = img ? SITE + img.variants[img.variants.length - 1].webp : (p.image_url?.startsWith('/') ? SITE + p.image_url : p.image_url || undefined);
  const brand = R.brandOf(ctx, p);
  const item = {
    '@type': 'Product',
    name: R.loc(ctx.lang, p, 'name'),
    description: R.loc(ctx.lang, p, 'description') || undefined,
    image,
    brand: brand ? { '@type': 'Brand', name: brand.name } : undefined,
    category: R.t(ctx.lang, 'cat')[p.category] || undefined,
  };
  if (R.hasPrice(p)) {
    item.offers = {
      '@type': 'Offer', price: Number(p.price_kgs), priceCurrency: 'KGS',
      availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: pageUrl, seller: { '@id': `${SITE}/#store` },
    };
  }
  return item;
}

const itemList = (ctx, name, products, pageUrl) => ({
  '@type': 'ItemList', name,
  itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: productLd(ctx, p, pageUrl) })),
});

const breadcrumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

/* ---------- layout ---------- */
function layout(ctx, page) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const url = SITE + R.path(lang, page.path);
  const consult = R.esc(R.waLink(ctx, R.t(lang, 'wa_consult_msg')));
  const ig = R.igHandle(ctx);
  const home = R.path(lang, '/');
  const nav = [
    ['products', R.path(lang, '/products/'), 'nav_catalog'],
    ['brands', R.path(lang, '/brands/'), 'nav_brands'],
    ['blog', R.path(lang, '/blog/'), 'nav_blog'],
    ['order', `${home}#order`, 'nav_delivery'],
    ['wholesale', `${home}#wholesale`, 'nav_wholesale'],
    ['contacts', `${home}#contacts`, 'nav_contacts'],
  ];
  const navLinks = nav.map(([key, href, label]) => `<a href="${href}"${page.active === key ? ' aria-current="page"' : ''}>${T(label)}</a>`).join('\n          ');
  const langLink = (l, label) => `<a href="${R.path(l, page.path)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${label}</a>`;
  const langSwitch = `<nav class="lang" aria-label="${T('lang_label')}">${langLink('ru', 'RU')}${langLink('ky', 'KG')}</nav>`;
  const ld = { '@context': 'https://schema.org', '@graph': [storeLd(ctx), ...(page.ld || [])] };
  // '/assets/…?v=<content hash>': new releases always load their own files
  const asset = (u) => (ctx.assetVersions?.[u] ? `${u}?v=${ctx.assetVersions[u]}` : u);
  const bake = {
    lang, page: page.kind, brand: page.brand?.slug ?? null, post: page.post?.id ?? null, sig: ctx.sig,
    data: ctx.data, images: ctx.images, brandLogos: ctx.brandLogos, popularity: ctx.popularity,
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${R.esc(page.title)}</title>
  <meta name="description" content="${R.esc(page.description)}">
  <link rel="canonical" href="${url}">
  ${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${R.path(l, page.path)}">`).join('\n  ')}
  <link rel="alternate" hreflang="x-default" href="${SITE}${R.path('ru', page.path)}">
  <meta name="theme-color" content="#1D5C40">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Fabao">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${R.esc(page.ogTitle || page.title)}">
  <meta property="og:description" content="${R.esc(page.description)}">
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
  <link rel="stylesheet" href="${asset('/assets/css/site.css')}">
  <script type="importmap">${jsonForScript({ imports: Object.fromEntries(['/assets/js/render.js', '/assets/js/i18n.js', '/assets/js/config.js'].map((u) => [u, asset(u)])) })}</script>
  <script type="application/ld+json">${jsonForScript(ld)}</script>
</head>
<body class="page-${page.kind}">
  <a class="skip-link" href="#main">${T('skip_link')}</a>
  <header class="header">
    <div class="wrap header-inner">
      <a class="logo" href="${home}" aria-label="Fabao — ${T('nav_home')}"><span class="wordmark"></span></a>
      <nav class="nav" aria-label="${T('nav_label')}">
          ${navLinks}
      </nav>
      <div class="header-actions">
        ${langSwitch}
        <a class="btn btn-small btn-gold header-wa js-wa-consult" href="${consult}" target="_blank" rel="noopener" data-track="consult">WhatsApp</a>
        <button type="button" class="icon-btn cart-btn js-cart-open" aria-label="${T('cart_open')}" aria-haspopup="dialog">${R.ICONS.cart}<span class="cart-count js-cart-count" hidden>0</span></button>
        <button type="button" class="icon-btn menu-btn js-menu-open" aria-label="${T('menu_open')}" aria-haspopup="dialog">${R.ICONS.menu}</button>
      </div>
    </div>
  </header>

  <dialog class="sidebar js-sidebar" aria-label="${T('nav_label')}">
    <div class="sidebar-panel">
      <div class="sidebar-head">
        <a class="logo" href="${home}" aria-label="Fabao"><span class="wordmark"></span></a>
        <button type="button" class="icon-btn js-sidebar-close" aria-label="${T('menu_close')}">${R.ICONS.close}</button>
      </div>
      <nav class="sidebar-nav" aria-label="${T('nav_label')}">
        <a href="${home}"${page.kind === 'home' ? ' aria-current="page"' : ''}>${T('nav_home')}</a>
        ${navLinks}
      </nav>
      <div class="sidebar-foot">
        ${langSwitch}
        <a class="btn btn-gold btn-block js-wa-consult" href="${consult}" target="_blank" rel="noopener" data-track="consult">${R.ICONS.whatsapp} ${T('cta_consult')}</a>
        <a class="sidebar-ig js-ig" href="https://instagram.com/${R.esc(ig)}" target="_blank" rel="noopener" data-track="instagram">@${R.esc(ig)}</a>
      </div>
    </div>
  </dialog>

  <main id="main">
${page.body}
  </main>

  <footer class="footer">
    <div class="wrap footer-inner">
      <span class="wordmark wordmark-footer" role="img" aria-label="Fabao"></span>
      <nav class="footer-nav" aria-label="${T('nav_label')}">${nav.slice(0, 3).map(([, href, label]) => `<a href="${href}">${T(label)}</a>`).join('')}<a href="${home}#contacts">${T('nav_contacts')}</a></nav>
      <p>${T('footer_rights')}</p>
      <p class="muted">© <span class="js-year">${new Date().getFullYear()}</span> Fabao</p>
    </div>
  </footer>

  <dialog class="modal js-modal" aria-labelledby="modal-title">
    <div class="modal-body js-modal-body"></div>
  </dialog>

  <dialog class="cart js-cart" aria-labelledby="cart-title">
    <div class="cart-panel">
      <div class="cart-head">
        <h2 id="cart-title">${T('cart_title')}</h2>
        <button type="button" class="icon-btn js-cart-close" aria-label="${T('close')}">${R.ICONS.close}</button>
      </div>
      <div class="cart-empty js-cart-empty">
        <p>${T('cart_empty')}</p>
        <a class="btn btn-emerald" href="${R.path(lang, '/products/')}">${T('cart_go_catalog')}</a>
      </div>
      <ul class="cart-lines js-cart-lines"></ul>
      <form class="cart-foot js-cart-form" hidden>
        <p class="cart-total js-cart-total"></p>
        <details class="cart-details">
          <summary>${T('cart_details')}</summary>
          <label>${T('form_name')}<input name="name" autocomplete="name" maxlength="80"></label>
          <label>${T('form_address')}<input name="address" autocomplete="street-address" maxlength="160"></label>
          <label>${T('form_comment')}<textarea name="comment" rows="2" maxlength="300"></textarea></label>
        </details>
        <button type="submit" class="btn btn-emerald btn-block">${R.ICONS.whatsapp} ${T('cart_checkout')}</button>
        <p class="cart-note">${T('cart_note')}</p>
        <p class="cart-sent js-cart-sent" role="status" hidden>${T('cart_sent')}</p>
        <button type="button" class="btn-link js-cart-clear">${T('cart_clear')}</button>
      </form>
    </div>
  </dialog>

  <div class="toast js-toast" role="status" aria-live="polite" hidden></div>

  <script type="application/json" id="bake-data">${jsonForScript(bake)}</script>
  <script type="module" src="${asset('/assets/js/site.js')}"></script>
</body>
</html>
`;
}

/* ---------- shared sections ---------- */
const sectionHead = (title, lead, link) => `<div class="section-head section-head-row">
          <div><h2>${title}</h2>${lead ? `<p>${lead}</p>` : ''}</div>
          ${link || ''}
        </div>`;

function orderSections(ctx) {
  const T = (k) => R.esc(R.t(ctx.lang, k));
  const S = (k) => R.esc(R.setting(ctx, k));
  const wholesale = R.esc(R.waLink(ctx, R.t(ctx.lang, 'wa_wholesale_msg')));
  const consult = R.esc(R.waLink(ctx, R.t(ctx.lang, 'wa_consult_msg')));
  const ig = R.igHandle(ctx);
  return `
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
    </section>`;
}

/* ---------- pages ---------- */
function homePage(ctx) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const S = (k) => R.esc(R.setting(ctx, k));
  const promos = R.activePromos(ctx);
  const brands = R.rankBrands(ctx).slice(0, R.HOME_BRANDS);
  const products = R.rankProducts(ctx).slice(0, R.HOME_PRODUCTS);
  const posts = R.publishedPosts(ctx).slice(0, 3);
  const slider = promos.length ? `
    <section class="promo js-promo" id="promos" aria-roledescription="carousel" aria-label="${T('promos_label')}" data-autoplay="${R.carouselSettings(ctx).autoplay ? 'on' : 'off'}" data-interval="${R.carouselSettings(ctx).interval}">
      <div class="promo-track js-promo-track" data-r="promos">${R.promoSlides(ctx)}</div>
      <div class="promo-controls">
        <button type="button" class="promo-arrow js-promo-prev" aria-label="${T('slide_prev')}">${R.ICONS.prev}</button>
        <div class="promo-dots js-promo-dots"></div>
        <button type="button" class="promo-arrow js-promo-next" aria-label="${T('slide_next')}">${R.ICONS.next}</button>
      </div>
    </section>` : '';
  const body = `${slider}
    <section class="intro">
      <div class="wrap intro-grid">
        <div>
          <p class="eyebrow">${T('eyebrow_official')}</p>
          <h1 data-setting="hero_title">${S('hero_title')}</h1>
          <p class="lead" data-setting="hero_subtitle">${S('hero_subtitle')}</p>
          <div class="hero-cta">
            <a class="btn btn-emerald" href="${R.path(lang, '/products/')}">${T('cta_catalog')}</a>
            <a class="btn btn-line js-wa-consult" href="${R.esc(R.waLink(ctx, R.t(lang, 'wa_consult_msg')))}" target="_blank" rel="noopener" data-track="consult">${T('cta_consult')}</a>
          </div>
        </div>
        <div class="intro-panel">
          <span class="wordmark wordmark-hero" aria-hidden="true"></span>
          <p class="intro-panel-label">${T('official_of')}</p>
          <ul class="hero-brands" data-r="hero-brands">${R.heroBrands(ctx)}</ul>
        </div>
      </div>
    </section>

    <section class="section" id="brands">
      <div class="wrap">
        ${sectionHead(T('popular_brands_title'), T('popular_brands_lead'), `<a class="btn btn-line" href="${R.path(lang, '/brands/')}">${T('all_brands')}</a>`)}
        <div class="brand-grid" data-r="home-brands">${R.brandCards(ctx, brands)}</div>
      </div>
    </section>

    <section class="section section-tint" id="popular">
      <div class="wrap">
        ${sectionHead(T('popular_products_title'), T('popular_products_lead'), `<a class="btn btn-line" href="${R.path(lang, '/products/')}">${T('all_products')}</a>`)}
        <div class="product-grid" data-r="home-products">${R.productCards(ctx, products)}</div>
      </div>
    </section>
${posts.length ? `
    <section class="section" id="blog">
      <div class="wrap">
        ${sectionHead(T('blog_home_title'), T('blog_home_lead'), `<a class="btn btn-line" href="${R.path(lang, '/blog/')}">${T('blog_all')}</a>`)}
        <div class="post-grid" data-r="home-posts">${R.postCards(ctx, posts)}</div>
      </div>
    </section>` : ''}
${orderSections(ctx)}`;
  return layout(ctx, {
    kind: 'home', path: '/', active: null, body,
    title: R.t(lang, 'meta_title'), ogTitle: R.t(lang, 'og_title'), description: R.t(lang, 'meta_description'),
    ld: [{ '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Fabao', inLanguage: LANGS, publisher: { '@id': `${SITE}/#store` } },
      itemList(ctx, R.t(lang, 'popular_products_title'), products, SITE + R.path(lang, '/'))],
  });
}

function brandsPage(ctx) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const body = `
    <section class="page-head">
      <div class="wrap">
        <h1>${T('brands_page_title')}</h1>
        <p class="lead">${T('brands_page_lead')}</p>
      </div>
    </section>
    <section class="section section-flush">
      <div class="wrap">
        <div class="brand-grid" data-r="brands-all">${R.brandCards(ctx)}</div>
      </div>
    </section>`;
  return layout(ctx, {
    kind: 'brands', path: '/brands/', active: 'brands', body,
    title: R.t(lang, 'meta_brands_title'), description: R.t(lang, 'meta_brands_description'),
    ld: [breadcrumbs([[R.t(lang, 'nav_home'), SITE + R.path(lang, '/')], [R.t(lang, 'brands_page_title'), SITE + R.path(lang, '/brands/')]])],
  });
}

function brandPage(ctx, b) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const products = R.rankProducts(ctx, ctx.data.products.filter((p) => p.brand_id === b.id));
  const others = R.rankBrands(ctx).filter((x) => x.id !== b.id);
  const brandPosts = R.publishedPosts(ctx).filter((x) => x.brand_id === b.id).slice(0, 3);
  const features = R.brandFeatures(ctx, b);
  const story = R.paragraphs(R.loc(lang, b, 'story'));
  const tagline = R.loc(lang, b, 'tagline') || R.loc(lang, b, 'description');
  const accent = R.esc(b.accent_color || '#1D5C40');
  const pagePath = `/brands/${b.slug}/`;
  const body = `
    <section class="brand-hero" style="--accent:${accent}">
      <div class="wrap brand-hero-grid">
        <div class="brand-hero-text">
          <nav class="crumbs" aria-label="${T('nav_label')}"><a href="${R.path(lang, '/brands/')}">← ${T('back_to_brands')}</a></nav>
          <p class="brand-country">${R.esc(R.loc(lang, b, 'country'))}</p>
          <h1 class="brand-hero-logo">${R.logoImg(ctx, b, 'page')}</h1>
          <p class="brand-tagline">${R.esc(tagline)}</p>
          <div class="hero-cta">
            <a class="btn btn-accent" href="#brand-products">${T('brand_all_products')} <span class="count">${products.length}</span></a>
            <a class="btn btn-line js-wa-consult" href="${R.esc(R.waLink(ctx, R.t(lang, 'wa_consult_msg')))}" target="_blank" rel="noopener" data-track="consult">${T('cta_consult')}</a>
          </div>
        </div>
        <div class="brand-collage" aria-hidden="true">${R.brandCollage(ctx, b)}</div>
      </div>
    </section>
${features ? `
    <section class="section">
      <div class="wrap">
        <div class="section-head"><h2>${T('brand_features')}</h2></div>
        <ul class="features" style="--accent:${accent}">${features}</ul>
      </div>
    </section>` : ''}
${story ? `
    <section class="section section-tint">
      <div class="wrap story">
        <h2>${T('brand_story')}</h2>
        <div class="story-text">${story}</div>
      </div>
    </section>` : ''}
    <section class="section" id="brand-products">
      <div class="wrap">
        ${sectionHead(R.esc(fill(R.t(lang, 'brand_products_title'), { brand: b.name })), '', `<a class="btn btn-line" href="${R.productsUrl(ctx, `?brand=${encodeURIComponent(b.slug)}`)}">${T('nav_catalog')}</a>`)}
        <div class="product-grid" data-r="brand-products">${R.productCards(ctx, products)}</div>
      </div>
    </section>
${brandPosts.length ? `
    <section class="section">
      <div class="wrap">
        ${sectionHead(T('blog_brand_stories'), '', `<a class="btn btn-line" href="${R.path(lang, '/blog/')}">${T('blog_all')}</a>`)}
        <div class="post-grid" data-r="brand-posts">${R.postCards(ctx, brandPosts)}</div>
      </div>
    </section>` : ''}
${others.length ? `
    <section class="section section-tint">
      <div class="wrap">
        ${sectionHead(T('other_brands'), '', `<a class="btn btn-line" href="${R.path(lang, '/brands/')}">${T('all_brands')}</a>`)}
        <div class="brand-grid">${R.brandCards(ctx, others)}</div>
      </div>
    </section>` : ''}`;
  return layout(ctx, {
    kind: 'brand', path: pagePath, active: 'brands', brand: b, body,
    title: fill(R.t(lang, 'meta_brand_title'), { brand: b.name }),
    description: tagline || R.t(lang, 'meta_brands_description'),
    ld: [
      { '@type': 'Brand', name: b.name, description: tagline || undefined, url: SITE + R.path(lang, pagePath) },
      itemList(ctx, b.name, products, SITE + R.path(lang, pagePath)),
      breadcrumbs([[R.t(lang, 'nav_home'), SITE + R.path(lang, '/')], [R.t(lang, 'brands_page_title'), SITE + R.path(lang, '/brands/')], [b.name, SITE + R.path(lang, pagePath)]]),
    ],
  });
}

function productsPage(ctx) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const products = R.rankProducts(ctx);
  const body = `
    <section class="page-head">
      <div class="wrap">
        <h1>${T('products_page_title')}</h1>
        <p class="lead">${T('products_page_lead')}</p>
      </div>
    </section>
    <section class="section section-flush">
      <div class="wrap">
        <div class="catalog-filters js-catalog-filters">${R.catalogFilters(ctx)}</div>
        <div class="product-grid js-catalog" data-r="catalog">${R.productCards(ctx, products)}</div>
        <p class="empty js-no-results" hidden>${T('no_results')}</p>
      </div>
    </section>`;
  return layout(ctx, {
    kind: 'products', path: '/products/', active: 'products', body,
    title: R.t(lang, 'meta_products_title'), description: R.t(lang, 'meta_products_description'),
    ld: [itemList(ctx, R.t(lang, 'products_page_title'), products, SITE + R.path(lang, '/products/')),
      breadcrumbs([[R.t(lang, 'nav_home'), SITE + R.path(lang, '/')], [R.t(lang, 'products_page_title'), SITE + R.path(lang, '/products/')]])],
  });
}

function blogPage(ctx) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const posts = R.publishedPosts(ctx);
  const tags = R.blogTags(ctx);
  const body = `
    <section class="page-head">
      <div class="wrap">
        <h1>${T('blog_page_title')}</h1>
        <p class="lead">${T('blog_page_lead')}</p>
      </div>
    </section>
    <section class="section section-flush">
      <div class="wrap">
        ${tags ? `<div class="filter-row blog-tags js-blog-tags" role="group" aria-label="${T('blog_tags_label')}">${tags}</div>` : ''}
        <div class="post-grid js-blog-list" data-r="blog-list">${posts.length ? R.postCards(ctx, posts) : `<p class="empty">${T('blog_empty')}</p>`}</div>
      </div>
    </section>`;
  return layout(ctx, {
    kind: 'blog', path: '/blog/', active: 'blog', body,
    title: R.t(lang, 'meta_blog_title'), description: R.t(lang, 'meta_blog_description'),
    ld: [{ '@type': 'Blog', name: R.t(lang, 'blog_page_title'), url: SITE + R.path(lang, '/blog/'), inLanguage: lang,
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: R.loc(lang, p, 'title'), url: SITE + R.path(lang, `/blog/${p.slug}/`), datePublished: p.published_on })) },
    breadcrumbs([[R.t(lang, 'nav_home'), SITE + R.path(lang, '/')], [R.t(lang, 'blog_page_title'), SITE + R.path(lang, '/blog/')]])],
  });
}

function postPage(ctx, post) {
  const { lang } = ctx;
  const T = (k) => R.esc(R.t(lang, k));
  const title = R.loc(lang, post, 'title');
  const excerpt = R.loc(lang, post, 'excerpt');
  const brand = post.brand_id && ctx.data.brands.find((b) => b.id === post.brand_id);
  const more = R.publishedPosts(ctx).filter((p) => p.id !== post.id).slice(0, 3);
  // products of the story's category first: a story titled «Тоники …» shows the tonics
  const titleLc = R.loc(lang, post, 'title').toLowerCase();
  const inTitle = (p) => { const cat = (R.t(lang, 'cat')[p.category] || '').toLowerCase(); return cat && titleLc.includes(cat) ? 1 : 0; };
  const brandProducts = brand ? R.rankProducts(ctx, ctx.data.products.filter((p) => p.brand_id === brand.id))
    .map((p, i) => [p, i]).sort((a, b) => (inTitle(b[0]) - inTitle(a[0])) || (a[1] - b[1])).map(([p]) => p).slice(0, 4) : [];
  const pagePath = `/blog/${post.slug}/`;
  const img = post.cover_url && ctx.images?.[post.cover_url];
  const imageUrl = img ? SITE + img.variants[img.variants.length - 1].webp : undefined;
  const body = `
    <article class="post">
      <header class="post-head" data-r="post-head">${R.postHead(ctx, post)}</header>
      <div class="wrap post-narrow post-body" data-r="post-body">${R.postBody(ctx, post)}</div>
      <div class="wrap post-narrow post-cta">
        <p>${T('blog_cta_text')}</p>
        <a class="btn btn-emerald js-wa-consult" href="${R.esc(R.waLink(ctx, R.t(lang, 'wa_consult_msg')))}" target="_blank" rel="noopener" data-track="consult">${T('cta_consult')}</a>
      </div>
    </article>
${brandProducts.length ? `
    <section class="section section-tint">
      <div class="wrap">
        ${sectionHead(R.esc(R.t(lang, 'blog_related_products').replace('{brand}', brand.name)), '', `<a class="btn btn-line" href="${R.brandUrl(ctx, brand)}">${T('brand_more')}</a>`)}
        <div class="product-grid">${R.productCards(ctx, brandProducts)}</div>
      </div>
    </section>` : ''}
${more.length ? `
    <section class="section">
      <div class="wrap">
        ${sectionHead(T('blog_more'), '', `<a class="btn btn-line" href="${R.path(lang, '/blog/')}">${T('blog_all')}</a>`)}
        <div class="post-grid" data-r="post-more">${R.postCards(ctx, more)}</div>
      </div>
    </section>` : ''}`;
  return layout(ctx, {
    kind: 'post', path: pagePath, active: 'blog', post, body,
    title: `${title} · Fabao`, description: excerpt || title,
    ld: [{ '@type': 'BlogPosting', headline: title, description: excerpt || undefined, image: imageUrl, datePublished: post.published_on,
      dateModified: (post.updated_at || post.published_on || '').slice(0, 10), inLanguage: lang, url: SITE + R.path(lang, pagePath),
      author: { '@id': `${SITE}/#store` }, publisher: { '@id': `${SITE}/#store` } },
    breadcrumbs([[R.t(lang, 'nav_home'), SITE + R.path(lang, '/')], [R.t(lang, 'blog_page_title'), SITE + R.path(lang, '/blog/')], [title, SITE + R.path(lang, pagePath)]])],
  });
}

// Every page of the site: [file path, html]
export function renderSite(base) {
  const files = [];
  for (const lang of LANGS) {
    const ctx = { ...base, lang };
    const dir = lang === 'ky' ? 'ky/' : '';
    files.push([`${dir}index.html`, homePage(ctx)]);
    files.push([`${dir}brands/index.html`, brandsPage(ctx)]);
    files.push([`${dir}products/index.html`, productsPage(ctx)]);
    for (const b of ctx.data.brands) files.push([`${dir}brands/${b.slug}/index.html`, brandPage(ctx, b)]);
    files.push([`${dir}blog/index.html`, blogPage(ctx)]);
    for (const post of R.publishedPosts(ctx)) files.push([`${dir}blog/${post.slug}/index.html`, postPage(ctx, post)]);
  }
  return files;
}

export function pagePaths(data) {
  const posts = (data.posts || []).filter((p) => !p.published_on || p.published_on <= R.today());
  return ['/', '/brands/', '/products/', '/blog/', ...data.brands.map((b) => `/brands/${b.slug}/`), ...posts.map((p) => `/blog/${p.slug}/`)];
}

export function renderSitemap(paths, lastmod) {
  const urls = paths.flatMap((p) => LANGS.map((l) => `  <url>
    <loc>${SITE}${R.path(l, p)}</loc>
    <lastmod>${lastmod}</lastmod>
${LANGS.map((x) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${SITE}${R.path(x, p)}"/>`).join('\n')}
  </url>`)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
