// HTML renderers shared by the browser (assets/js/site.js) and the build
// script (scripts/build.mjs), so the baked page and live updates look the same.
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

const SIZES = {
  card: '(max-width: 640px) calc(100vw - 32px), (max-width: 960px) 45vw, 290px',
  modal: '(max-width: 640px) calc(100vw - 32px), 430px',
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

const brandLine = (ctx, p) => {
  const brand = ctx.data.brands.find((b) => b.id === p.brand_id);
  return [brand?.name, p.volume].filter(Boolean).map(esc).join(' · ');
};

// Brand logos live in assets/img/brands/<slug>.svg|png (see scripts/build.mjs).
const brandLogo = (ctx, b) => ctx.brandLogos?.[b.slug];

export function heroBrands(ctx) {
  return ctx.data.brands.map((b) => {
    const logo = brandLogo(ctx, b);
    if (!logo) return `<li>${esc(b.name)}</li>`;
    // drawn as a mask so it takes the panel's gold colour
    return `<li class="hero-brand-logo"><span style="--logo:url('${esc(logo.src)}');aspect-ratio:${logo.w}/${logo.h}"></span><span class="visually-hidden">${esc(b.name)}</span></li>`;
  }).join('');
}

export function brandCards(ctx) {
  const { lang } = ctx;
  return ctx.data.brands.map((b) => `<article class="brand-card">`
    + `<p class="brand-country">${esc(loc(lang, b, 'country'))}</p>`
    + (brandLogo(ctx, b)
      ? `<h3 class="brand-logo"><img src="${esc(brandLogo(ctx, b).src)}" width="${brandLogo(ctx, b).w}" height="${brandLogo(ctx, b).h}" alt="${esc(b.name)}" loading="lazy" decoding="async"></h3>`
      : `<h3>${esc(b.name)}</h3>`)
    + `<p>${esc(loc(lang, b, 'description'))}</p>`
    + `<a class="link-arrow" href="#catalog" data-brand="${esc(b.id)}">${esc(t(lang, 'brand_see'))}</a>`
    + `</article>`).join('');
}

export function filters(ctx, active = 'all') {
  const list = [{ id: 'all', name: t(ctx.lang, 'filter_all') }, ...ctx.data.brands];
  return list.map((f) => `<button type="button" class="chip" data-filter="${esc(f.id)}" aria-pressed="${f.id === active}">${esc(f.name)}</button>`).join('');
}

export function productCards(ctx) {
  const { lang, data } = ctx;
  if (!data.products.length) return `<p class="empty">${esc(t(lang, 'empty_catalog'))}</p>`;
  return data.products.map((p) => {
    const name = loc(lang, p, 'name');
    const desc = loc(lang, p, 'description');
    return `<article class="product-card${p.in_stock ? '' : ' is-out'}" data-brand-id="${esc(p.brand_id)}">`
      + `<button type="button" class="product-open" data-product="${esc(p.id)}" aria-label="${esc(`${t(lang, 'details')}: ${name}`)}" tabindex="-1">${productImage(ctx, p, 'product-img', 'card')}</button>`
      + `<div class="product-info">`
      + `<p class="product-brand">${brandLine(ctx, p)}</p>`
      + `<h3><button type="button" class="product-title" data-product="${esc(p.id)}">${esc(name)}</button></h3>`
      + (desc ? `<p class="product-desc">${esc(desc)}</p>` : '')
      + `<div class="product-meta">`
      + `<span class="price">${esc(formatPrice(lang, p.price_kgs))}</span>`
      + `<span class="stock ${p.in_stock ? 'ok' : 'no'}">${esc(p.in_stock ? t(lang, 'in_stock') : t(lang, 'out_of_stock'))}</span>`
      + `</div>`
      + `<a class="btn btn-emerald btn-block" href="${esc(waLink(ctx, t(lang, 'wa_order_msg') + name))}" target="_blank" rel="noopener" data-track="order" data-label="${esc(name)}">${esc(t(lang, 'order_whatsapp'))}</a>`
      + `</div></article>`;
  }).join('');
}

export function productModal(ctx, p) {
  const { lang } = ctx;
  const name = loc(lang, p, 'name');
  const usage = loc(lang, p, 'usage');
  return `<button type="button" class="modal-close" aria-label="${esc(t(lang, 'close'))}">×</button>`
    + productImage(ctx, p, 'modal-img', 'modal')
    + `<div class="modal-text">`
    + `<p class="product-brand">${brandLine(ctx, p)}</p>`
    + `<h3 id="modal-title">${esc(name)}</h3>`
    + `<p class="price">${esc(formatPrice(lang, p.price_kgs))}</p>`
    + `<p class="pre">${esc(loc(lang, p, 'description'))}</p>`
    + (usage ? `<h4>${esc(t(lang, 'how_to_use'))}</h4><p class="pre">${esc(usage)}</p>` : '')
    + `<a class="btn btn-emerald" href="${esc(waLink(ctx, t(lang, 'wa_order_msg') + name))}" target="_blank" rel="noopener" data-track="order" data-label="${esc(name)}">${esc(t(lang, 'order_whatsapp'))}</a>`
    + `</div>`;
}

export const wholesalePoints = (ctx) => t(ctx.lang, 'wholesale_points').map((p) => `<li>${esc(p)}</li>`).join('');

// A short fingerprint of the content, to tell whether the database changed since the bake.
export function signature(data) {
  const rows = [...data.brands, ...data.products].map((r) => `${r.id}@${r.updated_at ?? ''}`);
  const s = Object.entries(data.settings).map(([k, v]) => `${k}=${v.ru}|${v.ky}`);
  return [...rows, ...s].sort().join(';');
}

// Rows as returned by the database -> the shape the renderers use.
export function normalize(brands, products, settingsRows) {
  const settings = {};
  for (const row of settingsRows) settings[row.key] = { ru: row.value_ru ?? '', ky: row.value_ky ?? '' };
  return { brands, products, settings };
}

export const QUERIES = {
  brands: 'brands?select=*&is_published=eq.true&order=sort_order.asc,name.asc',
  products: 'products?select=*&is_published=eq.true&order=sort_order.asc,name_ru.asc',
  settings: 'site_settings?select=key,value_ru,value_ky&order=key.asc',
};
