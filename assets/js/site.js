// The page arrives fully rendered (scripts/build.mjs). This script adds the
// interactive parts (brand filter, product details) and quietly checks the
// database: if staff changed something since the last bake, it re-renders.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as R from './render.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const bake = JSON.parse($('#bake-data').textContent);
const ctx = { lang: bake.lang, data: bake.data, images: bake.images };
let filter = 'all';

// Statistics: one row per page view or click in the site_events table
// (supabase/patches/2026-11-analytics.sql). No cookies, no IP, nothing personal.
// Only on the real site; add ?track=debug to print events instead of sending.
const debugTrack = new URLSearchParams(location.search).get('track') === 'debug';
const liveSite = /(^|\.)fabao\.hair$/.test(location.hostname);
function track(event, label) {
  const row = {
    event,
    lang: ctx.lang,
    label: label ? String(label).slice(0, 160) : null,
    referrer_host: (() => {
      try { const h = new URL(document.referrer).hostname; return h && h !== location.hostname ? h.slice(0, 100) : null; } catch { return null; }
    })(),
    device: matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop',
  };
  document.dispatchEvent(new CustomEvent('fabao:track', { detail: row }));
  if (debugTrack) { console.info('[track]', row); return; }
  if (!liveSite || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
    method: 'POST',
    keepalive: true, // still sent when the click opens WhatsApp
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {});
}

function applyFilter() {
  $$('.product-card').forEach((c) => { c.hidden = filter !== 'all' && c.dataset.brandId !== filter; });
  $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
}

const modal = $('.js-modal');
let opener = null;

function openProduct(id, from) {
  const p = ctx.data.products.find((x) => String(x.id) === id);
  if (!p) return;
  opener = from;
  $('.js-modal-body').innerHTML = R.productModal(ctx, p);
  modal.showModal();
  track('product_open', R.loc(ctx.lang, p, 'name'));
}

modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('.modal-close')) modal.close();
});
modal.addEventListener('close', () => { opener?.focus(); opener = null; });

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; applyFilter(); return; }
  const b = e.target.closest('[data-brand]');
  if (b) { filter = b.dataset.brand; applyFilter(); return; }
  const p = e.target.closest('[data-product]');
  if (p) { openProduct(p.dataset.product, $('.product-title', p.closest('.product-card')) ?? p); return; }
  const tr = e.target.closest('[data-track]');
  if (tr) track(tr.dataset.track, tr.dataset.label);
});

addEventListener('load', () => track('pageview'), { once: true });

// Mobile nav: show a fade on the side that has more links.
const nav = $('.nav');
function navEdges() {
  const more = nav.scrollWidth - nav.clientWidth;
  nav.classList.toggle('fade-end', more > 2 && nav.scrollLeft < more - 2);
  nav.classList.toggle('fade-start', nav.scrollLeft > 2);
}
nav.addEventListener('scroll', navEdges, { passive: true });
addEventListener('resize', navEdges);
navEdges();

function rerender() {
  $$('[data-setting]').forEach((n) => { n.textContent = R.setting(ctx, n.dataset.setting); });
  $('.js-row-address').hidden = !R.setting(ctx, 'address');
  $('.js-row-hours').hidden = !R.setting(ctx, 'hours');
  $$('.js-wa-consult').forEach((a) => { a.href = R.waLink(ctx, R.t(ctx.lang, 'wa_consult_msg')); });
  $$('.js-wa-wholesale').forEach((a) => { a.href = R.waLink(ctx, R.t(ctx.lang, 'wa_wholesale_msg')); });
  $$('.js-wa-number').forEach((a) => { a.textContent = `+${R.waNumber(ctx)}`; });
  $$('.js-ig').forEach((a) => { a.href = `https://instagram.com/${R.igHandle(ctx)}`; a.textContent = `@${R.igHandle(ctx)}`; });
  $('.js-hero-brands').innerHTML = R.heroBrands(ctx);
  $('.js-brands').innerHTML = R.brandCards(ctx);
  $('.js-filters').innerHTML = R.filters(ctx, filter);
  $('.js-products').innerHTML = R.productCards(ctx);
  applyFilter();
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
    const [brands, products, settings] = await Promise.all([get(R.QUERIES.brands), get(R.QUERIES.products), get(R.QUERIES.settings)]);
    const data = R.normalize(brands, products, settings);
    if (R.signature(data) === bake.sig) return;
    ctx.data = data;
    rerender();
  } catch {
    // keep the baked content
  }
}

// After the page has settled, so the check never slows the first view.
const later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
addEventListener('load', () => later(refresh, { timeout: 4000 }));
