// HTML renderers shared by the browser (assets/js/site.js) and the build
// script (scripts/build.mjs), so the baked pages and live updates look the same.
// Every function returns an HTML string. Nothing here touches the DOM.
import { STRINGS } from './i18n.js';

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const t = (lang, key) => STRINGS[lang]?.[key] ?? STRINGS.ru[key] ?? key;

// localized field, falling back to Russian
export const loc = (lang, obj, field) => (lang === 'ky' && obj?.[`${field}_ky`]) || obj?.[`${field}_ru`] || '';

export function setting(ctx, key) {
  const s = ctx.data?.settings?.[key];
  if (!s) return '';
  return (ctx.lang === 'ky' && s.ky) || s.ru || '';
}

export const waNumber = (ctx) => (setting(ctx, 'whatsapp') || '996505017013').replace(/\D/g, '');
export const waLink = (ctx, text) => `https://wa.me/${waNumber(ctx)}?text=${encodeURIComponent(text)}`;
export const igHandle = (ctx) => (setting(ctx, 'instagram') || 'fabao_kg').replace(/^@/, '');

export function formatPrice(lang, p) {
  if (p == null || p === '') return t(lang, 'price_on_request');
  return `${Number(p).toLocaleString('ru-RU')} ${t(lang, 'som')}`;
}
export const hasPrice = (p) => p.price_kgs != null && p.price_kgs !== '';

/* ---------- links ---------- */
export const path = (lang, p) => (lang === 'ky' ? '/ky' : '') + p;
export const brandUrl = (ctx, b) => path(ctx.lang, `/brands/${b.slug}/`);
export const productsUrl = (ctx, query = '') => path(ctx.lang, `/products/${query}`);
export const brandOf = (ctx, p) => ctx.data.brands.find((b) => b.id === p.brand_id);

// Slide links: '/…' (site path, localized), 'whatsapp', or a full https:// URL.
export function linkFor(ctx, link) {
  if (!link) return null;
  if (link === 'whatsapp') return waLink(ctx, t(ctx.lang, 'wa_consult_msg'));
  if (link.startsWith('/')) return path(ctx.lang, link);
  if (/^https:\/\//.test(link)) return link;
  return null;
}

/* ---------- popularity ---------- */
export const HOME_PRODUCTS = 8;
export const HOME_BRANDS = 3;
const score = (ctx, kind, id) => ctx.popularity?.[kind]?.[id] ?? 0;

// ★ (is_featured in admin) first, then what visitors engage with most.
export function rankProducts(ctx, list = ctx.data.products) {
  return [...list].sort((a, b) => (b.is_featured - a.is_featured)
    || (b.in_stock - a.in_stock)
    || (score(ctx, 'products', b.id) - score(ctx, 'products', a.id))
    || ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
}

export function rankBrands(ctx) {
  const total = (b) => score(ctx, 'brands', b.id)
    + ctx.data.products.filter((p) => p.brand_id === b.id).reduce((s, p) => s + score(ctx, 'products', p.id), 0);
  return [...ctx.data.brands].sort((a, b) => (total(b) - total(a)) || ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
}

/* ---------- images ---------- */
const SIZES = {
  card: '(max-width: 640px) calc(100vw - 32px), (max-width: 960px) 45vw, 290px',
  modal: '(max-width: 640px) calc(100vw - 32px), 430px',
  promo: '(max-width: 760px) 70vw, 420px',
  collage: '(max-width: 760px) 40vw, 220px',
};

// <picture> with AVIF/WebP variants when the build made them, plain <img> otherwise
export function picture(ctx, url, alt, kind = 'card', eager = false) {
  const img = ctx.images?.[url];
  const common = `alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"`;
  if (!img) return `<img src="${esc(url)}" ${common}>`;
  const set = (fmt) => img.variants.map((v) => `${v[fmt]} ${v.w}w`).join(', ');
  const largest = img.variants[img.variants.length - 1];
  return `<picture>`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="${SIZES[kind]}">`
    + `<source type="image/webp" srcset="${set('webp')}" sizes="${SIZES[kind]}">`
    + `<img src="${largest.webp}" width="${img.w}" height="${img.h}" ${common}>`
    + `</picture>`;
}

function productImage(ctx, p, cls, kind) {
  const name = loc(ctx.lang, p, 'name');
  if (p.image_url) return `<div class="${cls}">${picture(ctx, p.image_url, name, kind)}</div>`;
  const cat = STRINGS[ctx.lang].cat[p.category] || '';
  return `<div class="${cls} product-img-empty"><span class="wordmark"></span>${cat ? `<small>${esc(cat)}</small>` : ''}</div>`;
}

const brandLine = (ctx, p) => [brandOf(ctx, p)?.name, p.volume].filter(Boolean).map(esc).join(' · ');

/* ---------- icons (inline, stroke = currentColor) ---------- */
const svg = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  cart: svg('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  whatsapp: svg('<path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1.3-1.2 2 .9c-.3 1.3-1.3 2-2.6 1.9A7 7 0 0 1 8 9.4c-.1-1.3.6-2.3 1.9-2.6l.9 2z"/>'),
  // brand features, used in turn
  award: svg('<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>'),
  leaf: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  flask: svg('<path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/>'),
};
const FEATURE_ICONS = ['award', 'leaf', 'target', 'flask'];

/* ---------- brand logos ---------- */
// Brand logos live in assets/img/brands/<slug>.svg|png (see scripts/build.mjs).
const brandLogo = (ctx, b) => ctx.brandLogos?.[b.slug];

// Optical sizing: every logo gets the same AREA (not the same height), so a
// long wordmark and a compact mark look equally heavy side by side.
const LOGO_AREA = { card: 7200, hero: 2600, page: 15000 };
function logoSize(logo, kind) {
  const ratio = logo.w / logo.h;
  const area = LOGO_AREA[kind];
  return { w: Math.round(Math.sqrt(area * ratio)), h: Math.round(Math.sqrt(area / ratio)) };
}

// one colour (currentColor) — for dark backgrounds
export function logoMask(ctx, b, kind = 'hero') {
  const logo = brandLogo(ctx, b);
  if (!logo) return `<span class="logo-text">${esc(b.name)}</span>`;
  const { w, h } = logoSize(logo, kind);
  return `<span class="logo-mask" style="--logo:url('${esc(logo.src)}');width:${w}px;height:${h}px"></span><span class="visually-hidden">${esc(b.name)}</span>`;
}

// brand colours — for light backgrounds
export function logoImg(ctx, b, kind = 'card') {
  const logo = brandLogo(ctx, b);
  if (!logo) return esc(b.name);
  const { w, h } = logoSize(logo, kind);
  return `<img src="${esc(logo.src)}" width="${w}" height="${h}" alt="${esc(b.name)}" decoding="async"${kind === 'page' ? '' : ' loading="lazy"'}>`;
}

export function heroBrands(ctx) {
  return rankBrands(ctx).map((b) => `<li class="hero-brand-logo"><a href="${brandUrl(ctx, b)}">${logoMask(ctx, b, 'hero')}</a></li>`).join('');
}

/* ---------- brands ---------- */
export function brandCard(ctx, b) {
  const { lang } = ctx;
  const count = ctx.data.products.filter((p) => p.brand_id === b.id).length;
  return `<article class="brand-card" style="--accent:${esc(b.accent_color || '#1D5C40')}">`
    + `<p class="brand-country">${esc(loc(lang, b, 'country'))}</p>`
    + `<h3 class="brand-logo">${logoImg(ctx, b, 'card')}</h3>`
    + `<p>${esc(loc(lang, b, 'tagline') || loc(lang, b, 'description'))}</p>`
    + `<div class="brand-actions">`
    + `<a class="btn btn-line btn-small" href="${brandUrl(ctx, b)}">${esc(t(lang, 'brand_more'))}</a>`
    + `<a class="btn btn-emerald btn-small" href="${productsUrl(ctx, `?brand=${encodeURIComponent(b.slug)}`)}">${esc(t(lang, 'brand_products'))}${count ? ` <span class="count">${count}</span>` : ''}</a>`
    + `</div></article>`;
}

export const brandCards = (ctx, list = rankBrands(ctx)) => list.map((b) => brandCard(ctx, b)).join('');

export function parseFeatures(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(' — ');
    return i === -1 ? { title: l, text: '' } : { title: l.slice(0, i), text: l.slice(i + 3) };
  });
}

export function brandFeatures(ctx, b) {
  const list = parseFeatures(loc(ctx.lang, b, 'features'));
  return list.map((f, i) => `<li class="feature"><span class="feature-icon">${ICONS[FEATURE_ICONS[i % FEATURE_ICONS.length]]}</span>`
    + `<h3>${esc(f.title)}</h3>${f.text ? `<p>${esc(f.text)}</p>` : ''}</li>`).join('');
}

export const paragraphs = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p)}</p>`).join('');

// up to three product photos of the brand, for the brand page hero
export function brandCollage(ctx, b) {
  const shots = rankProducts(ctx, ctx.data.products.filter((p) => p.brand_id === b.id && p.image_url)).slice(0, 3);
  if (b.cover_url) shots.unshift({ image_url: b.cover_url, name_ru: b.name });
  return shots.slice(0, 3).map((p, i) => `<div class="collage-item collage-${i + 1}">${picture(ctx, p.image_url, loc(ctx.lang, p, 'name') || b.name, 'collage', i === 0)}</div>`).join('');
}

/* ---------- products ---------- */
function addButton(ctx, p, cls = 'btn-block') {
  const { lang } = ctx;
  if (!p.in_stock) return `<button type="button" class="btn btn-muted ${cls}" disabled>${esc(t(lang, 'out_of_stock'))}</button>`;
  return `<button type="button" class="btn btn-emerald ${cls}" data-add="${esc(p.id)}">${ICONS.cart}<span>${esc(t(lang, 'add_to_cart'))}</span></button>`;
}

export function productCard(ctx, p) {
  const { lang } = ctx;
  const name = loc(lang, p, 'name');
  const desc = loc(lang, p, 'description');
  const b = brandOf(ctx, p);
  const search = [p.name_ru, p.name_ky, b?.name, t('ru', 'cat')[p.category], t('ky', 'cat')[p.category]].filter(Boolean).join(' ').toLowerCase();
  return `<article class="product-card${p.in_stock ? '' : ' is-out'}" data-id="${esc(p.id)}" data-brand="${esc(b?.slug ?? '')}" data-cat="${esc(p.category ?? '')}" data-price="${hasPrice(p) ? Number(p.price_kgs) : ''}" data-search="${esc(search)}">`
    + `<button type="button" class="product-open" data-product="${esc(p.id)}" aria-label="${esc(`${t(lang, 'details')}: ${name}`)}" tabindex="-1">${productImage(ctx, p, 'product-img', 'card')}${p.is_featured ? `<span class="badge">${esc(t(lang, 'badge_hit'))}</span>` : ''}</button>`
    + `<div class="product-info">`
    + `<p class="product-brand">${brandLine(ctx, p)}</p>`
    + `<h3><button type="button" class="product-title" data-product="${esc(p.id)}">${esc(name)}</button></h3>`
    + (desc ? `<p class="product-desc">${esc(desc)}</p>` : '')
    + `<div class="product-meta">`
    + `<span class="price">${esc(formatPrice(lang, p.price_kgs))}</span>`
    + `<span class="stock ${p.in_stock ? 'ok' : 'no'}">${esc(p.in_stock ? t(lang, 'in_stock') : t(lang, 'out_of_stock'))}</span>`
    + `</div>`
    + addButton(ctx, p)
    + `</div></article>`;
}

export const productCards = (ctx, list) => (list.length
  ? list.map((p) => productCard(ctx, p)).join('')
  : `<p class="empty">${esc(t(ctx.lang, 'empty_catalog'))}</p>`);

export function productModal(ctx, p) {
  const { lang } = ctx;
  const name = loc(lang, p, 'name');
  const usage = loc(lang, p, 'usage');
  const b = brandOf(ctx, p);
  return `<button type="button" class="modal-close" aria-label="${esc(t(lang, 'close'))}">${ICONS.close}</button>`
    + productImage(ctx, p, 'modal-img', 'modal')
    + `<div class="modal-text">`
    + `<p class="product-brand">${brandLine(ctx, p)}</p>`
    + `<h3 id="modal-title">${esc(name)}</h3>`
    + `<p class="price">${esc(formatPrice(lang, p.price_kgs))}</p>`
    + `<p class="pre">${esc(loc(lang, p, 'description'))}</p>`
    + (usage ? `<h4>${esc(t(lang, 'how_to_use'))}</h4><p class="pre">${esc(usage)}</p>` : '')
    + `<div class="modal-actions">${addButton(ctx, p, '')}`
    + (b ? `<a class="link-arrow" href="${brandUrl(ctx, b)}">${esc(t(lang, 'about_brand'))} ${esc(b.name)}</a>` : '')
    + `</div></div>`;
}

/* ---------- catalog filters ---------- */
export function catalogFilters(ctx) {
  const { lang } = ctx;
  const cats = [...new Set(ctx.data.products.map((p) => p.category).filter(Boolean))];
  const chip = (group, value, label) => `<button type="button" class="chip" data-filter-${group}="${esc(value)}" aria-pressed="${value === ''}">${esc(label)}</button>`;
  return `<div class="catalog-search"><label class="visually-hidden" for="q">${esc(t(lang, 'search_label'))}</label>`
    + `${ICONS.search}<input id="q" type="search" class="js-q" placeholder="${esc(t(lang, 'search_placeholder'))}" autocomplete="off"></div>`
    + `<div class="filter-row" role="group" aria-label="${esc(t(lang, 'filter_label'))}">${chip('brand', '', t(lang, 'filter_all_brands'))}${rankBrands(ctx).map((b) => chip('brand', b.slug, b.name)).join('')}</div>`
    + `<div class="filter-row" role="group" aria-label="${esc(t(lang, 'filter_cat_label'))}">${chip('cat', '', t(lang, 'filter_all_cats'))}${cats.map((c) => chip('cat', c, STRINGS[lang].cat[c] || c)).join('')}</div>`
    + `<div class="catalog-bar"><p class="catalog-count js-count" aria-live="polite"></p>`
    + `<label class="sort">${esc(t(lang, 'sort_label'))} <select class="js-sort">`
    + ['popular', 'price_asc', 'price_desc', 'name'].map((s) => `<option value="${s}">${esc(t(lang, `sort_${s}`))}</option>`).join('')
    + `</select></label></div>`;
}

/* ---------- promo slider ---------- */
const today = () => new Date().toISOString().slice(0, 10);
export const activePromos = (ctx) => (ctx.data.promos || []).filter((p) => (!p.starts_on || p.starts_on <= today()) && (!p.ends_on || p.ends_on >= today()));

export function promoSlides(ctx) {
  const { lang } = ctx;
  const list = activePromos(ctx);
  return list.map((p, i) => {
    const href = linkFor(ctx, p.link);
    const brand = p.brand_id && ctx.data.brands.find((b) => b.id === p.brand_id);
    const accent = p.theme === 'brand' && brand?.accent_color ? `--accent:${esc(brand.accent_color)};` : '';
    const title = loc(lang, p, 'title');
    const external = href && /^https:/.test(href);
    return `<article class="promo-slide theme-${esc(p.theme)}" style="${accent}" role="group" aria-roledescription="${esc(t(lang, 'slide'))}" aria-label="${i + 1} / ${list.length}" data-index="${i}">`
      + `<div class="promo-text">`
      + (brand ? `<p class="promo-brand">${logoMask(ctx, brand, 'hero')}</p>` : '')
      + `<p class="promo-title">${esc(title)}</p>`
      + (loc(lang, p, 'text') ? `<p class="promo-desc">${esc(loc(lang, p, 'text'))}</p>` : '')
      + (href ? `<a class="btn promo-cta" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''} data-track="promo_click" data-label="${esc(title)}">${esc(loc(lang, p, 'cta') || t(lang, 'more'))}</a>` : '')
      + `</div>`
      + (p.image_url ? `<div class="promo-media">${picture(ctx, p.image_url, '', 'promo', i === 0)}</div>` : '')
      + `</article>`;
  }).join('');
}

/* ---------- cart ---------- */
export function cartLines(ctx, items) {
  const { lang } = ctx;
  return items.map(({ p, qty }) => `<li class="cart-line" data-id="${esc(p.id)}">`
    + `<div class="cart-thumb">${p.image_url ? picture(ctx, p.image_url, '', 'collage') : '<span class="wordmark"></span>'}</div>`
    + `<div class="cart-info"><p class="cart-name">${esc(loc(lang, p, 'name'))}</p>`
    + `<p class="cart-price">${esc(hasPrice(p) ? `${formatPrice(lang, p.price_kgs * qty)}` : t(lang, 'price_on_request'))}</p>`
    + `<div class="qty"><button type="button" data-qty="-1" aria-label="${esc(t(lang, 'qty_less'))}">${ICONS.minus}</button>`
    + `<span aria-live="polite">${qty}</span>`
    + `<button type="button" data-qty="1" aria-label="${esc(t(lang, 'qty_more'))}">${ICONS.plus}</button></div></div>`
    + `<button type="button" class="cart-remove" data-remove aria-label="${esc(t(lang, 'remove'))}">${ICONS.trash}</button>`
    + `</li>`).join('');
}

export function cartTotal(items) {
  const priced = items.filter(({ p }) => hasPrice(p));
  return { sum: priced.reduce((s, { p, qty }) => s + Number(p.price_kgs) * qty, 0), unpriced: items.length - priced.length };
}

// The text that opens in WhatsApp at checkout.
export function cartMessage(ctx, items, form = {}) {
  const { lang } = ctx;
  const T = (k) => t(lang, k);
  const lines = items.map(({ p, qty }, i) => `${i + 1}. ${loc(lang, p, 'name')}${p.volume ? ` (${p.volume})` : ''} × ${qty}`
    + (hasPrice(p) ? ` — ${formatPrice(lang, p.price_kgs * qty)}` : ` — ${T('price_on_request').toLowerCase()}`));
  const { sum, unpriced } = cartTotal(items);
  const out = [T('wa_cart_hello'), '', ...lines, ''];
  if (sum) out.push(`${T('cart_total')}: ${formatPrice(lang, sum)}${unpriced ? ` + ${T('cart_plus_unpriced')}` : ''}`);
  if (form.name) out.push(`${T('form_name')}: ${form.name}`);
  if (form.address) out.push(`${T('form_address')}: ${form.address}`);
  if (form.comment) out.push(`${T('form_comment')}: ${form.comment}`);
  return out.join('\n').trim();
}

export const wholesalePoints = (ctx) => t(ctx.lang, 'wholesale_points').map((p) => `<li>${esc(p)}</li>`).join('');

/* ---------- data ---------- */
// A short fingerprint of the content, to tell whether the database changed since the bake.
export function signature(data) {
  const rows = [...data.brands, ...data.products, ...(data.promos || [])].map((r) => `${r.id}@${r.updated_at ?? ''}`);
  const s = Object.entries(data.settings).map(([k, v]) => `${k}=${v.ru}|${v.ky}`);
  return [...rows, ...s].sort().join(';');
}

// Rows as returned by the database -> the shape the renderers use.
export function normalize(brands, products, settingsRows, promos = []) {
  const settings = {};
  for (const row of settingsRows) settings[row.key] = { ru: row.value_ru ?? '', ky: row.value_ky ?? '' };
  return { brands, products, settings, promos };
}

export function normalizePopularity(rows = []) {
  const pop = { products: {}, brands: {} };
  for (const r of rows) {
    if (r.product_id) pop.products[r.product_id] = (pop.products[r.product_id] ?? 0) + Number(r.score);
    if (r.brand_id) pop.brands[r.brand_id] = (pop.brands[r.brand_id] ?? 0) + Number(r.score);
  }
  return pop;
}

export const QUERIES = {
  brands: 'brands?select=*&is_published=eq.true&order=sort_order.asc,name.asc',
  products: 'products?select=*&is_published=eq.true&order=sort_order.asc,name_ru.asc',
  settings: 'site_settings?select=key,value_ru,value_ky&order=key.asc',
  promos: 'promos?select=*&is_published=eq.true&order=sort_order.asc,created_at.asc',
};
