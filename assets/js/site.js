// Pages arrive fully rendered (scripts/build.mjs). This script adds the
// interactive parts — sidebar menu, cart, promo slider, catalog filters,
// product dialog — and quietly checks the database: if staff changed something
// since the last bake, it re-renders the affected parts.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as R from './render.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const bake = JSON.parse($('#bake-data').textContent);
const ctx = { lang: bake.lang, data: bake.data, images: bake.images, brandLogos: bake.brandLogos, popularity: bake.popularity };
const T = (k) => R.t(ctx.lang, k);
const productById = (id) => ctx.data.products.find((p) => String(p.id) === String(id));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- statistics ----------
   One row per event in site_events (no cookies, no IP, nothing personal).
   Only on the real site; add ?track=debug to print events instead. */
const debugTrack = new URLSearchParams(location.search).get('track') === 'debug';
const liveSite = /(^|\.)fabao\.hair$/.test(location.hostname);
function track(event, { label = null, product = null, brandId = null } = {}) {
  const row = {
    event,
    lang: ctx.lang,
    label: label ? String(label).slice(0, 160) : null,
    referrer_host: (() => {
      try { const h = new URL(document.referrer).hostname; return h && h !== location.hostname ? h.slice(0, 100) : null; } catch { return null; }
    })(),
    device: matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop',
  };
  // product_id / brand_id exist after supabase/patches/2026-11-structure.sql
  if (product) { row.product_id = product.id; row.brand_id = product.brand_id ?? null; }
  if (brandId) row.brand_id = brandId;
  document.dispatchEvent(new CustomEvent('fabao:track', { detail: row }));
  if (debugTrack) { console.info('[track]', row); return; }
  if (!liveSite || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
    method: 'POST',
    keepalive: true, // still sent when the click opens WhatsApp
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => {});
}

/* ---------- toast ---------- */
const toastEl = $('.js-toast');
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the animation
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

/* ---------- dialogs (sidebar, cart, product) ---------- */
function setupDialog(dialog, closeSel) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest(closeSel)) dialog.close();
  });
}
const sidebar = $('.js-sidebar');
setupDialog(sidebar, '.js-sidebar-close');
$('.js-menu-open').addEventListener('click', () => sidebar.showModal());
sidebar.addEventListener('click', (e) => { if (e.target.closest('.sidebar-nav a')) sidebar.close(); });

const modal = $('.js-modal');
let opener = null;
setupDialog(modal, '.modal-close');
modal.addEventListener('close', () => {
  opener?.focus();
  opener = null;
  if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
});
function openProduct(id, from) {
  const p = productById(id);
  if (!p) return;
  opener = from;
  $('.js-modal-body').innerHTML = R.productModal(ctx, p);
  modal.showModal();
  track('product_open', { label: R.loc(ctx.lang, p, 'name'), product: p });
}

/* ---------- cart ----------
   Kept in this browser (localStorage), shared by every page and tab. */
const CART_KEY = 'fabao-cart-v1';
const cartDialog = $('.js-cart');
setupDialog(cartDialog, '.js-cart-close');
let cart = loadCart();

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => x && x.id && x.qty > 0) : [];
  } catch { return []; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode: cart lives for this page only */ }
  renderCart();
}
const cartItems = () => cart.map(({ id, qty }) => ({ p: productById(id), qty })).filter((x) => x.p);

function renderCart() {
  const items = cartItems();
  const count = items.reduce((s, x) => s + x.qty, 0);
  $$('.js-cart-count').forEach((n) => { n.textContent = count; n.hidden = !count; });
  $('.js-cart-open').setAttribute('aria-label', count ? `${T('cart_open')}: ${count}` : T('cart_open'));
  $('.js-cart-lines').innerHTML = R.cartLines(ctx, items);
  $('.js-cart-empty').hidden = items.length > 0;
  $('.js-cart-form').hidden = !items.length;
  const { sum, unpriced } = R.cartTotal(items);
  $('.js-cart-total').innerHTML = sum
    ? `${R.esc(T('cart_total'))}: <b>${R.esc(R.formatPrice(ctx.lang, sum))}</b>${unpriced ? ` <small>+ ${R.esc(T('cart_plus_unpriced'))}</small>` : ''}`
    : R.esc(T('cart_plus_unpriced'));
}

function addToCart(id, button) {
  const p = productById(id);
  if (!p || !p.in_stock) return;
  const line = cart.find((x) => x.id === p.id);
  if (line) line.qty = Math.min(line.qty + 1, 99); else cart.push({ id: p.id, qty: 1 });
  saveCart();
  toast(`${T('cart_added')}: ${R.loc(ctx.lang, p, 'name')}`);
  $$('.js-cart-count').forEach((n) => { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); });
  if (button) {
    button.classList.add('is-added');
    setTimeout(() => button.classList.remove('is-added'), 1400);
  }
  track('add_to_cart', { label: R.loc(ctx.lang, p, 'name'), product: p });
}

$('.js-cart-open').addEventListener('click', () => { renderCart(); $('.js-cart-sent').hidden = true; cartDialog.showModal(); });
$('.js-cart-lines').addEventListener('click', (e) => {
  const line = e.target.closest('.cart-line');
  if (!line) return;
  const item = cart.find((x) => String(x.id) === line.dataset.id);
  if (!item) return;
  const step = e.target.closest('[data-qty]');
  if (step) item.qty = Math.max(0, Math.min(99, item.qty + Number(step.dataset.qty)));
  if (e.target.closest('[data-remove]')) item.qty = 0;
  cart = cart.filter((x) => x.qty > 0);
  saveCart();
});
$('.js-cart-clear').addEventListener('click', () => { cart = []; saveCart(); $('.js-cart-sent').hidden = true; });
$('.js-cart-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const items = cartItems();
  if (!items.length) return;
  const f = new FormData(e.target);
  const form = { name: f.get('name')?.trim(), address: f.get('address')?.trim(), comment: f.get('comment')?.trim() };
  window.open(R.waLink(ctx, R.cartMessage(ctx, items, form)), '_blank', 'noopener');
  track('checkout', { label: `${items.reduce((s, x) => s + x.qty, 0)} items` });
  items.forEach(({ p }) => track('order', { label: R.loc(ctx.lang, p, 'name'), product: p }));
  $('.js-cart-sent').hidden = false;
});
addEventListener('storage', (e) => { if (e.key === CART_KEY) { cart = loadCart(); renderCart(); } });
renderCart();

/* ---------- clicks ---------- */
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { addToCart(add.dataset.add, add); return; }
  const p = e.target.closest('[data-product]');
  if (p) { openProduct(p.dataset.product, $('.product-title', p.closest('.product-card')) ?? p); return; }
  const tr = e.target.closest('[data-track]');
  if (tr) track(tr.dataset.track, { label: tr.dataset.label });
});

/* ---------- promo slider ---------- */
function setupSlider() {
  const root = $('.js-promo');
  if (!root) return;
  const trackEl = $('.js-promo-track', root);
  const slides = () => $$('.promo-slide', trackEl);
  const dots = $('.js-promo-dots', root);
  let index = 0;
  let timer = null;
  // autoplay and speed come from admin → «Карусель»
  const interval = Math.min(20, Math.max(3, Number(root.dataset.interval) || 6)) * 1000;
  let paused = reducedMotion || root.dataset.autoplay === 'off';

  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'promo-arrow promo-pause';
  const setPauseLabel = () => {
    pauseBtn.setAttribute('aria-label', paused ? T('slide_play') : T('slide_pause'));
    pauseBtn.innerHTML = paused
      ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  };

  function renderDots() {
    const n = slides().length;
    dots.innerHTML = slides().map((_, i) => `<button type="button" class="promo-dot" aria-label="${R.esc(T('slide_go'))} ${i + 1}"${i === index ? ' aria-current="true"' : ''}></button>`).join('');
    root.classList.toggle('single', n < 2);
    if (n > 1) $('.js-promo-next', root).after(pauseBtn);
  }
  function go(i, smooth = true) {
    const list = slides();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    trackEl.scrollTo({ left: list[index].offsetLeft - trackEl.offsetLeft, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
    $$('.promo-dot', dots).forEach((d, k) => d.toggleAttribute('aria-current', k === index));
  }
  function schedule() {
    clearInterval(timer);
    if (!paused && slides().length > 1) timer = setInterval(() => { if (!document.hidden) go(index + 1); }, interval);
  }
  // keep the index in sync with swipes
  let scrollTimer;
  trackEl.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const i = Math.round(trackEl.scrollLeft / trackEl.clientWidth);
      if (i !== index) { index = i; $$('.promo-dot', dots).forEach((d, k) => d.toggleAttribute('aria-current', k === index)); }
    }, 80);
  }, { passive: true });
  $('.js-promo-prev', root).addEventListener('click', () => { go(index - 1); schedule(); });
  $('.js-promo-next', root).addEventListener('click', () => { go(index + 1); schedule(); });
  dots.addEventListener('click', (e) => { const d = e.target.closest('.promo-dot'); if (d) { go($$('.promo-dot', dots).indexOf(d)); schedule(); } });
  pauseBtn.addEventListener('click', () => { paused = !paused; setPauseLabel(); schedule(); });
  // pause while the visitor is reading or using it
  root.addEventListener('mouseenter', () => clearInterval(timer));
  root.addEventListener('mouseleave', schedule);
  root.addEventListener('focusin', () => clearInterval(timer));
  root.addEventListener('focusout', schedule);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { go(index + 1); schedule(); }
    if (e.key === 'ArrowLeft') { go(index - 1); schedule(); }
  });
  setPauseLabel();
  renderDots();
  schedule();
  setupSlider.refresh = () => { index = 0; renderDots(); go(0, false); schedule(); };
}
setupSlider();

/* ---------- products page: search, filters, sort ---------- */
function setupCatalog() {
  const grid = $('.js-catalog');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  const state = { brand: params.get('brand') || '', cat: params.get('cat') || '', q: params.get('q') || '' };
  const q = $('.js-q');
  const sort = $('.js-sort');
  q.value = state.q;
  sort.value = ['popular', 'price_asc', 'price_desc', 'name'].includes(params.get('sort')) ? params.get('sort') : 'popular';
  let tracked = '';

  function apply() {
    const cards = $$('.product-card', grid);
    cards.forEach((c, i) => { if (!c.dataset.rank) c.dataset.rank = i; });
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const ok = (!state.brand || c.dataset.brand === state.brand)
        && (!state.cat || c.dataset.cat === state.cat)
        && words.every((w) => c.dataset.search.includes(w));
      c.hidden = !ok;
      if (ok) shown += 1;
    }
    const price = (c) => (c.dataset.price === '' ? null : Number(c.dataset.price));
    const name = (c) => $('.product-title', c).textContent;
    const by = {
      popular: (a, b) => a.dataset.rank - b.dataset.rank,
      price_asc: (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity) || a.dataset.rank - b.dataset.rank,
      price_desc: (a, b) => (price(b) ?? -Infinity) - (price(a) ?? -Infinity) || a.dataset.rank - b.dataset.rank,
      name: (a, b) => name(a).localeCompare(name(b), ctx.lang),
    }[sort.value];
    cards.sort(by).forEach((c) => grid.append(c));
    $$('[data-filter-brand]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterBrand === state.brand)));
    $$('[data-filter-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterCat === state.cat)));
    $('.js-count').textContent = T('found').replace('{n}', shown);
    const active = Number(Boolean(state.brand)) + Number(Boolean(state.cat));
    $('.js-filter-count').textContent = active;
    $('.js-filter-count').hidden = !active;
    $('.js-no-results').hidden = shown > 0;
    const next = new URLSearchParams();
    if (state.brand) next.set('brand', state.brand);
    if (state.cat) next.set('cat', state.cat);
    if (state.q) next.set('q', state.q);
    if (sort.value !== 'popular') next.set('sort', sort.value);
    history.replaceState(null, '', `${location.pathname}${next.toString() ? `?${next}` : ''}${location.hash}`);
  }
  setupCatalog.apply = apply;

  // phones: «Фильтр» opens / closes the chips; the button shows how many filters are on
  const toggle = $('.js-filter-toggle');
  const root = $('.js-catalog-filters');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
  });
  if (state.brand || state.cat) { toggle.setAttribute('aria-expanded', 'true'); root.classList.add('is-open'); }

  $('.js-catalog-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter-brand]');
    if (b) { state.brand = b.dataset.filterBrand; apply(); return; }
    const c = e.target.closest('[data-filter-cat]');
    if (c) { state.cat = c.dataset.filterCat; apply(); }
  });
  let debounce;
  q.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = q.value.trim();
      apply();
      if (state.q.length >= 3 && state.q !== tracked) { tracked = state.q; track('search', { label: state.q }); }
    }, 180);
  });
  sort.addEventListener('change', apply);
  apply();
}
setupCatalog();

/* ---------- blog: filter by topic ---------- */
(() => {
  const list = $('.js-blog-list');
  const tags = $('.js-blog-tags');
  if (!list || !tags) return;
  const apply = (tag) => {
    $$('.post-card', list).forEach((c) => { c.hidden = Boolean(tag) && !c.dataset.tags.split(' ').includes(tag); });
    $$('[data-tag]', tags).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
    history.replaceState(null, '', location.pathname + (tag ? '?tag=' + encodeURIComponent(tag) : ''));
  };
  tags.addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (b) apply(b.dataset.tag); });
  const initial = new URLSearchParams(location.search).get('tag');
  if (initial) apply(initial);
})();

/* ---------- brand page ---------- */
if (bake.page === 'brand') {
  const b = ctx.data.brands.find((x) => x.slug === bake.brand);
  if (b) track('brand_view', { label: b.name, brandId: b.id });
}

/* ---------- deep link to a product: …#p=<id> ---------- */
if (location.hash.startsWith('#p=')) openProduct(decodeURIComponent(location.hash.slice(3)), null);

/* ---------- live refresh ---------- */
const currentPost = () => (bake.post ? (ctx.data.posts || []).find((p) => p.id === bake.post) : null);
const RENDERERS = {
  promos: () => R.promoSlides(ctx),
  'hero-brands': () => R.heroBrands(ctx),
  'home-brands': () => R.brandCards(ctx, R.rankBrands(ctx).slice(0, R.HOME_BRANDS)),
  'home-products': () => R.productCards(ctx, R.rankProducts(ctx).slice(0, R.HOME_PRODUCTS)),
  'brands-all': () => R.brandCards(ctx),
  'home-posts': () => R.postCards(ctx, R.publishedPosts(ctx).slice(0, 3)),
  'blog-list': () => R.postCards(ctx, R.publishedPosts(ctx)),
  // story page (by id, so a renamed address still updates); null = leave as baked
  'post-head': () => { const p = currentPost(); return p ? R.postHead(ctx, p) : null; },
  // product and category pages: price, stock and texts follow the database
  'product-main': () => { const p = bake.product && productById(bake.product); return p ? R.productMain(ctx, p) : null; },
  category: () => {
    const cat = $('[data-r="category"]')?.dataset.cat;
    return cat ? R.productCards(ctx, R.rankProducts(ctx, ctx.data.products.filter((p) => p.category === cat))) : null;
  },
  'post-body': () => { const p = currentPost(); return p ? R.postBody(ctx, p) : null; },
  'post-more': () => R.postCards(ctx, R.publishedPosts(ctx).filter((p) => p.id !== bake.post).slice(0, 3)),
  'brand-posts': () => {
    const b = ctx.data.brands.find((x) => x.slug === bake.brand);
    return b ? R.postCards(ctx, R.publishedPosts(ctx).filter((p) => p.brand_id === b.id).slice(0, 3)) : null;
  },
  catalog: () => R.productCards(ctx, R.rankProducts(ctx)),
  'brand-products': () => {
    const b = ctx.data.brands.find((x) => x.slug === bake.brand);
    return b ? R.productCards(ctx, R.rankProducts(ctx, ctx.data.products.filter((p) => p.brand_id === b.id))) : '';
  },
};

function rerender() {
  $$('[data-setting]').forEach((n) => { n.textContent = R.setting(ctx, n.dataset.setting); });
  $$('.js-row-address').forEach((n) => { n.hidden = !R.setting(ctx, 'address'); });
  $$('.js-row-hours').forEach((n) => { n.hidden = !R.setting(ctx, 'hours'); });
  $$('.js-wa-consult').forEach((a) => { a.href = R.waLink(ctx, T('wa_consult_msg')); });
  $$('.js-wa-wholesale').forEach((a) => { a.href = R.waLink(ctx, T('wa_wholesale_msg')); });
  $$('.js-wa-number').forEach((a) => { a.textContent = `+${R.waNumber(ctx)}`; });
  $$('.js-ig').forEach((a) => { a.href = `https://instagram.com/${R.igHandle(ctx)}`; a.textContent = `@${R.igHandle(ctx)}`; });
  $$('[data-r]').forEach((n) => {
    const html = RENDERERS[n.dataset.r]?.();
    if (html != null) n.innerHTML = html;
  });
  const post = currentPost();
  if (post) document.title = `${R.loc(ctx.lang, post, 'title')} · Fabao`;
  setupSlider.refresh?.();
  setupCatalog.apply?.();
  renderCart();
}

async function refresh() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const get = async (q) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    const [brands, products, settings, promos, posts] = await Promise.all([
      get(R.QUERIES.brands), get(R.QUERIES.products), get(R.QUERIES.settings),
      get(R.QUERIES.promos).catch(() => ctx.data.promos || []),
      get(R.QUERIES.posts).catch(() => ctx.data.posts || [])]);
    const data = R.normalize(brands, products, settings, promos, posts);
    if (R.signature(data) === bake.sig) return;
    ctx.data = data;
    ctx.productSlugs = null; // new or renamed products get their addresses again
    rerender();
  } catch {
    // keep the baked content
  }
}

addEventListener('load', () => track('pageview'), { once: true });
// After the page has settled, so the check never slows the first view.
const later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
addEventListener('load', () => later(refresh, { timeout: 4000 }));
