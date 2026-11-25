import { loadContent } from './data.js';
import { STRINGS } from './i18n.js';

const state = { lang: 'ru', brandFilter: 'all', data: null };

try {
  const saved = localStorage.getItem('fabao-lang');
  if (saved === 'ru' || saved === 'ky') state.lang = saved;
} catch { /* storage unavailable */ }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const t = (key) => STRINGS[state.lang][key] ?? STRINGS.ru[key] ?? key;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

// pick localized field, falling back to Russian
const loc = (obj, field) => (state.lang === 'ky' && obj[`${field}_ky`]) || obj[`${field}_ru`] || '';
const setting = (key) => {
  const s = state.data?.settings?.[key];
  if (!s) return '';
  return (state.lang === 'ky' && s.ky) || s.ru || '';
};

const waNumber = () => (setting('whatsapp') || '996505017013').replace(/\D/g, '');
const waLink = (text) => `https://wa.me/${waNumber()}?text=${encodeURIComponent(text)}`;
const igHandle = () => (setting('instagram') || 'fabao_kg').replace(/^@/, '');

function formatPrice(p) {
  if (p == null || p === '') return t('price_on_request');
  return `${Number(p).toLocaleString('ru-RU')} ${t('som')}`;
}

function renderStatic() {
  document.documentElement.lang = state.lang === 'ky' ? 'ky' : 'ru';
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  $$('[data-setting]').forEach((n) => { n.textContent = setting(n.dataset.setting); });
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));

  $$('.js-wa-consult').forEach((a) => { a.href = waLink(t('wa_consult_msg')); });
  $$('.js-wa-wholesale').forEach((a) => { a.href = waLink(t('wa_wholesale_msg')); });
  $$('.js-wa-number').forEach((a) => { a.textContent = `+${waNumber()}`; });
  $$('.js-ig').forEach((a) => { a.href = `https://instagram.com/${igHandle()}`; a.textContent = `@${igHandle()}`; });
  $('.js-row-address').hidden = !setting('address');
  $('.js-row-hours').hidden = !setting('hours');
  $('.js-year').textContent = new Date().getFullYear();

  const pts = $('.js-wholesale-points');
  pts.replaceChildren(...t('wholesale_points').map((p) => el('li', { text: p })));
}

function renderBrands() {
  const { brands } = state.data;
  $('.js-hero-brands').replaceChildren(...brands.map((b) => el('li', { text: b.name })));
  $('.js-brands').replaceChildren(...brands.map((b) => el('article', { class: 'brand-card' },
    el('p', { class: 'brand-country', text: loc(b, 'country') }),
    el('h3', { text: b.name }),
    el('p', { text: loc(b, 'description') }),
    el('a', {
      class: 'link-arrow', href: '#catalog', text: t('brand_see'),
      onclick: () => { state.brandFilter = b.id; renderCatalog(); },
    }),
  )));
}

function productImage(p, cls = 'product-img') {
  if (p.image_url) {
    return el('div', { class: cls }, el('img', { src: p.image_url, alt: loc(p, 'name'), loading: 'lazy' }));
  }
  const cat = STRINGS[state.lang].cat[p.category] || '';
  return el('div', { class: `${cls} product-img-empty` }, el('span', { class: 'wordmark' }), cat ? el('small', { text: cat }) : null);
}

function renderCatalog() {
  const { brands, products } = state.data;
  const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));

  const filters = [{ id: 'all', name: t('filter_all') }, ...brands];
  $('.js-filters').replaceChildren(...filters.map((f) => el('button', {
    type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(state.brandFilter === f.id), text: f.name,
    onclick: () => { state.brandFilter = f.id; renderCatalog(); },
  })));

  const list = products.filter((p) => state.brandFilter === 'all' || p.brand_id === state.brandFilter);
  const grid = $('.js-products');
  if (!list.length) {
    grid.replaceChildren(el('p', { class: 'empty', text: t('empty_catalog') }));
    return;
  }
  grid.replaceChildren(...list.map((p) => {
    const brand = brandById[p.brand_id];
    const name = loc(p, 'name');
    return el('article', { class: `product-card${p.in_stock ? '' : ' is-out'}` },
      el('button', { type: 'button', class: 'product-open', 'aria-label': `${t('details')}: ${name}`, onclick: () => openProduct(p) },
        productImage(p)),
      el('div', { class: 'product-info' },
        el('p', { class: 'product-brand', text: [brand?.name, p.volume].filter(Boolean).join(' · ') }),
        el('h3', {}, el('button', { type: 'button', class: 'product-title', text: name, onclick: () => openProduct(p) })),
        el('div', { class: 'product-meta' },
          el('span', { class: 'price', text: formatPrice(p.price_kgs) }),
          el('span', { class: `stock ${p.in_stock ? 'ok' : 'no'}`, text: p.in_stock ? t('in_stock') : t('out_of_stock') })),
        el('a', { class: 'btn btn-emerald btn-block', href: waLink(t('wa_order_msg') + name), target: '_blank', rel: 'noopener', text: t('order_whatsapp') }),
      ));
  }));
}

function openProduct(p) {
  const brand = state.data.brands.find((b) => b.id === p.brand_id);
  const name = loc(p, 'name');
  const usage = loc(p, 'usage');
  const body = $('.js-modal-body');
  body.replaceChildren(
    el('button', { type: 'button', class: 'modal-close', 'aria-label': t('close'), text: '×', onclick: () => $('.js-modal').close() }),
    productImage(p, 'modal-img'),
    el('div', { class: 'modal-text' },
      el('p', { class: 'product-brand', text: [brand?.name, p.volume].filter(Boolean).join(' · ') }),
      el('h3', { text: name }),
      el('p', { class: 'price', text: formatPrice(p.price_kgs) }),
      el('p', { class: 'pre', text: loc(p, 'description') }),
      usage ? el('h4', { text: t('how_to_use') }) : null,
      usage ? el('p', { class: 'pre', text: usage }) : null,
      el('a', { class: 'btn btn-emerald', href: waLink(t('wa_order_msg') + name), target: '_blank', rel: 'noopener', text: t('order_whatsapp') }),
    ),
  );
  $('.js-modal').showModal();
}

function renderAll() {
  renderStatic();
  renderBrands();
  renderCatalog();
}

$$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  state.lang = b.dataset.lang;
  try { localStorage.setItem('fabao-lang', state.lang); } catch { /* ignore */ }
  renderAll();
}));
$('.js-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

state.data = await loadContent();
renderAll();
