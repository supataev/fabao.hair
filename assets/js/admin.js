import { isDbConfigured } from './config.js';
import { getClient } from './data.js';
import { CATEGORIES, STRINGS } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const BUCKET = 'product-images';
const TEXT_FIELDS = [
  { key: 'hero_title', label: 'Заголовок на главном экране' },
  { key: 'hero_subtitle', label: 'Подзаголовок на главном экране', long: true },
  { key: 'about_text', label: 'О компании', long: true },
  { key: 'delivery_text', label: 'Доставка', long: true },
  { key: 'wholesale_text', label: 'Оптовым партнёрам', long: true },
  { key: 'address', label: 'Адрес' },
  { key: 'hours', label: 'Часы работы (пусто = не показывать)' },
  { key: 'whatsapp', label: 'Номер WhatsApp (только цифры, с 996)', single: true },
  { key: 'instagram', label: 'Instagram (без @)', single: true },
];

let sb;
const state = { brands: [], products: [], settings: {}, editingProduct: null, editingBrand: null, pendingImage: undefined };

/* ---------- helpers ---------- */
function show(screen) {
  $$('.js-screen').forEach((s) => { s.hidden = s.dataset.screen !== screen; });
}
function toast(text, isError = false) {
  const n = $('.js-toast');
  n.textContent = text;
  n.classList.toggle('error', isError);
  n.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { n.hidden = true; }, 3500);
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}
const emptyToNull = (v) => (v === '' || v == null ? null : v);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-') || `brand-${Date.now()}`;
const brandName = (id) => state.brands.find((b) => b.id === id)?.name ?? '—';
const fmtPrice = (p) => (p == null ? 'по запросу' : `${Number(p).toLocaleString('ru-RU')} сом`);

/* ---------- auth ---------- */
async function boot() {
  if (!isDbConfigured()) { show('setup'); return; }
  // read the link type before the auth client consumes the URL hash
  const hash = new URLSearchParams(location.hash.slice(1));
  sb = await getClient();
  const needsPassword = ['invite', 'recovery'].includes(hash.get('type'));

  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') show('password');
  });

  const { data: { session } } = await sb.auth.getSession();
  if (needsPassword && session) { show('password'); return; }
  if (session) await enter(session); else show('login');
}

async function enter(session) {
  const { data: ok, error } = await sb.rpc('is_staff');
  if (error || !ok) {
    $('.js-denied-email').textContent = session.user.email;
    show('denied');
    return;
  }
  $('.js-who').textContent = session.user.email;
  show('app');
  await loadAll();
}

$('.js-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = $('.js-login-msg');
  msg.textContent = 'Входим…';
  const { data, error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) { msg.textContent = 'Неверная почта или пароль.'; return; }
  msg.textContent = '';
  await enter(data.session);
});

$('.js-forgot').addEventListener('click', async () => {
  const email = $('.js-login [name=email]').value.trim();
  const msg = $('.js-login-msg');
  if (!email) { msg.textContent = 'Сначала введите эл. почту.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  msg.textContent = error ? 'Не удалось отправить письмо. Попробуйте позже.' : 'Письмо со ссылкой отправлено на почту.';
});

$('.js-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('.js-password-msg');
  const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
  if (error) { msg.textContent = 'Не удалось сохранить пароль: ' + error.message; return; }
  history.replaceState(null, '', location.pathname);
  const { data: { session } } = await sb.auth.getSession();
  await enter(session);
});

$$('.js-logout').forEach((b) => b.addEventListener('click', async () => {
  await sb.auth.signOut();
  show('login');
}));

/* ---------- tabs ---------- */
$$('[data-tab][role=tab]').forEach((btn) => btn.addEventListener('click', () => {
  $$('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  $$('.js-tab').forEach((p) => { p.hidden = p.dataset.tab !== btn.dataset.tab; });
}));

/* ---------- data ---------- */
async function loadAll() {
  const [brands, products, settings] = await Promise.all([
    sb.from('brands').select('*').order('sort_order'),
    sb.from('products').select('*').order('sort_order').order('created_at'),
    sb.from('site_settings').select('*'),
  ]);
  const err = brands.error || products.error || settings.error;
  if (err) { toast('Ошибка загрузки: ' + err.message, true); return; }
  state.brands = brands.data;
  state.products = products.data;
  state.settings = Object.fromEntries(settings.data.map((r) => [r.key, r]));
  renderBrandOptions();
  renderProducts();
  renderBrands();
  renderTexts();
}

/* ---------- products ---------- */
function renderBrandOptions() {
  const filter = $('.js-brand-filter');
  const current = filter.value;
  filter.replaceChildren(el('option', { value: '', text: 'Все бренды' }), ...state.brands.map((b) => el('option', { value: b.id, text: b.name })));
  filter.value = current;
  $('.js-brand-select').replaceChildren(el('option', { value: '', text: '— без бренда —' }), ...state.brands.map((b) => el('option', { value: b.id, text: b.name })));
  $('.js-category-select').replaceChildren(el('option', { value: '', text: '—' }), ...CATEGORIES.map((c) => el('option', { value: c, text: STRINGS.ru.cat[c] })));
}

function renderProducts() {
  const q = $('.js-search').value.trim().toLowerCase();
  const brand = $('.js-brand-filter').value;
  const rows = state.products.filter((p) =>
    (!brand || p.brand_id === brand) &&
    (!q || `${p.name_ru} ${p.name_ky ?? ''}`.toLowerCase().includes(q)));
  const body = $('.js-products');
  if (!rows.length) {
    body.replaceChildren(el('tr', {}, el('td', { colspan: 7, class: 'empty', text: 'Товаров нет. Нажмите «Добавить товар».' })));
    return;
  }
  body.replaceChildren(...rows.map((p) => el('tr', {},
    el('td', { class: 'thumb' }, p.image_url ? el('img', { src: p.image_url, alt: '' }) : el('span', { class: 'noimg' })),
    el('td', {}, el('button', { type: 'button', class: 'row-link', text: p.name_ru, onclick: () => openProduct(p) }),
      p.is_featured ? el('span', { class: 'tag', text: 'хит' }) : null),
    el('td', { text: brandName(p.brand_id) }),
    el('td', { text: fmtPrice(p.price_kgs) }),
    el('td', {}, toggle(p.in_stock, (v) => quickUpdate(p, { in_stock: v }))),
    el('td', {}, toggle(p.is_published, (v) => quickUpdate(p, { is_published: v }))),
    el('td', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-small', text: 'Изменить', onclick: () => openProduct(p) })),
  )));
}

function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return el('label', { class: 'switch' }, input, el('span'));
}

async function quickUpdate(p, patch) {
  const { error } = await sb.from('products').update(patch).eq('id', p.id);
  if (error) { toast('Не сохранилось: ' + error.message, true); await loadAll(); return; }
  Object.assign(p, patch);
  toast('Сохранено');
}

$('.js-search').addEventListener('input', renderProducts);
$('.js-brand-filter').addEventListener('change', renderProducts);
$('.js-add-product').addEventListener('click', () => openProduct(null));

function openProduct(p) {
  state.editingProduct = p;
  state.pendingImage = undefined;
  const form = $('.js-product-form');
  form.reset();
  $('.js-product-title').textContent = p ? 'Редактировать товар' : 'Новый товар';
  $('.js-delete-product').hidden = !p;
  $('.js-product-msg').textContent = '';
  const data = p ?? { in_stock: true, is_published: true, is_featured: false, sort_order: (state.products.at(-1)?.sort_order ?? 0) + 1 };
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.type === 'checkbox') input.checked = Boolean(data[input.name]);
    else input.value = data[input.name] ?? '';
  }
  setPreview(p?.image_url ?? null);
  $('.js-product-dialog').showModal();
}

function setPreview(url) {
  const box = $('.js-image-preview');
  box.replaceChildren(url ? el('img', { src: url, alt: '' }) : el('span', { text: 'Нет фото' }));
  $('.js-image-remove').hidden = !url;
}

$('.js-image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingImage = await shrinkImage(file);
  setPreview(URL.createObjectURL(state.pendingImage));
  e.target.value = '';
});
$('.js-image-remove').addEventListener('click', () => { state.pendingImage = null; setPreview(null); });

// Resize to max 1600px and re-encode as JPEG so photos load fast on phones.
async function shrinkImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = el('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.86));
  } catch {
    return file;
  }
}

async function uploadImage(blob) {
  const path = `products/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStoredImage(url) {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return;
  await sb.storage.from(BUCKET).remove([url.slice(i + marker.length)]);
}

$('.js-product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $('.js-product-msg');
  msg.textContent = 'Сохраняем…';
  const f = new FormData(form);
  const p = state.editingProduct;
  const row = {
    name_ru: f.get('name_ru').trim(),
    name_ky: emptyToNull(f.get('name_ky').trim()),
    brand_id: emptyToNull(f.get('brand_id')),
    category: emptyToNull(f.get('category')),
    volume: emptyToNull(f.get('volume').trim()),
    price_kgs: emptyToNull(f.get('price_kgs')),
    description_ru: emptyToNull(f.get('description_ru').trim()),
    description_ky: emptyToNull(f.get('description_ky').trim()),
    usage_ru: emptyToNull(f.get('usage_ru').trim()),
    usage_ky: emptyToNull(f.get('usage_ky').trim()),
    sort_order: Number(f.get('sort_order') || 0),
    in_stock: form.elements.in_stock.checked,
    is_published: form.elements.is_published.checked,
    is_featured: form.elements.is_featured.checked,
  };
  try {
    const oldUrl = p?.image_url ?? null;
    if (state.pendingImage) row.image_url = await uploadImage(state.pendingImage);
    else if (state.pendingImage === null) row.image_url = null;

    const q = p ? sb.from('products').update(row).eq('id', p.id) : sb.from('products').insert(row);
    const { error } = await q;
    if (error) throw error;
    if (state.pendingImage !== undefined && oldUrl) await removeStoredImage(oldUrl);
    $('.js-product-dialog').close();
    toast(p ? 'Товар сохранён' : 'Товар добавлен');
    await loadAll();
  } catch (err) {
    msg.textContent = 'Ошибка: ' + err.message;
  }
});

$('.js-delete-product').addEventListener('click', async () => {
  const p = state.editingProduct;
  if (!p) return;
  const btn = $('.js-delete-product');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Точно удалить?';
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Удалить'; }, 4000);
    return;
  }
  btn.dataset.confirm = '';
  btn.textContent = 'Удалить';
  const { error } = await sb.from('products').delete().eq('id', p.id);
  if (error) { $('.js-product-msg').textContent = 'Ошибка: ' + error.message; return; }
  await removeStoredImage(p.image_url);
  $('.js-product-dialog').close();
  toast('Товар удалён');
  await loadAll();
});

/* ---------- brands ---------- */
function renderBrands() {
  $('.js-brands').replaceChildren(...state.brands.map((b) => el('tr', {},
    el('td', {}, el('button', { type: 'button', class: 'row-link', text: b.name, onclick: () => openBrand(b) })),
    el('td', { text: b.country_ru ?? '' }),
    el('td', { text: String(b.sort_order) }),
    el('td', {}, toggle(b.is_published, async (v) => {
      const { error } = await sb.from('brands').update({ is_published: v }).eq('id', b.id);
      if (error) toast('Не сохранилось: ' + error.message, true); else { b.is_published = v; toast('Сохранено'); }
    })),
    el('td', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-small', text: 'Изменить', onclick: () => openBrand(b) })),
  )));
}

$('.js-add-brand').addEventListener('click', () => openBrand(null));

function openBrand(b) {
  state.editingBrand = b;
  const form = $('.js-brand-form');
  form.reset();
  $('.js-brand-title').textContent = b ? 'Редактировать бренд' : 'Новый бренд';
  $('.js-delete-brand').hidden = !b;
  $('.js-brand-msg').textContent = '';
  const data = b ?? { is_published: true, sort_order: (state.brands.at(-1)?.sort_order ?? 0) + 1 };
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.type === 'checkbox') input.checked = Boolean(data[input.name]);
    else input.value = data[input.name] ?? '';
  }
  $('.js-brand-dialog').showModal();
}

$('.js-brand-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const b = state.editingBrand;
  const row = {
    name: f.get('name').trim(),
    country_ru: emptyToNull(f.get('country_ru').trim()),
    country_ky: emptyToNull(f.get('country_ky').trim()),
    description_ru: emptyToNull(f.get('description_ru').trim()),
    description_ky: emptyToNull(f.get('description_ky').trim()),
    sort_order: Number(f.get('sort_order') || 0),
    is_published: form.elements.is_published.checked,
  };
  if (!b) row.slug = slugify(row.name);
  const { error } = b ? await sb.from('brands').update(row).eq('id', b.id) : await sb.from('brands').insert(row);
  if (error) { $('.js-brand-msg').textContent = 'Ошибка: ' + error.message; return; }
  $('.js-brand-dialog').close();
  toast('Бренд сохранён');
  await loadAll();
});

$('.js-delete-brand').addEventListener('click', async () => {
  const b = state.editingBrand;
  if (!b) return;
  const count = state.products.filter((p) => p.brand_id === b.id).length;
  const btn = $('.js-delete-brand');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = count ? `Удалить? (${count} тов. останутся без бренда)` : 'Точно удалить?';
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Удалить'; }, 4000);
    return;
  }
  btn.dataset.confirm = '';
  btn.textContent = 'Удалить';
  const { error } = await sb.from('brands').delete().eq('id', b.id);
  if (error) { $('.js-brand-msg').textContent = 'Ошибка: ' + error.message; return; }
  $('.js-brand-dialog').close();
  toast('Бренд удалён');
  await loadAll();
});

/* ---------- texts ---------- */
function renderTexts() {
  $('.js-texts-fields').replaceChildren(...TEXT_FIELDS.map((field) => {
    const row = state.settings[field.key] ?? {};
    const input = (lang) => field.long
      ? el('textarea', { name: `${field.key}__${lang}`, rows: 3 })
      : el('input', { name: `${field.key}__${lang}` });
    const ru = input('ru'); ru.value = row.value_ru ?? '';
    if (field.single) {
      return el('fieldset', { class: 'text-field' }, el('legend', { text: field.label }), ru);
    }
    const ky = input('ky'); ky.value = row.value_ky ?? '';
    return el('fieldset', { class: 'text-field' }, el('legend', { text: field.label }),
      el('label', {}, 'RU', ru), el('label', {}, 'KG', ky));
  }));
}

$('.js-texts').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const rows = TEXT_FIELDS.map((field) => {
    const ru = (f.get(`${field.key}__ru`) ?? '').trim();
    return { key: field.key, value_ru: ru, value_ky: field.single ? ru : (f.get(`${field.key}__ky`) ?? '').trim() };
  });
  const { error } = await sb.from('site_settings').upsert(rows);
  if (error) { toast('Ошибка: ' + error.message, true); return; }
  toast('Тексты сохранены');
  await loadAll();
});

/* ---------- dialogs ---------- */
/* ---------- stats ---------- */
const WA_EVENTS = ['consult', 'order', 'wholesale'];

async function loadStats() {
  const days = Number($('.js-stats-days').value);
  const cards = $('.js-stats-cards');
  const products = $('.js-stats-products');
  const byDay = $('.js-stats-days-table');
  cards.replaceChildren(el('p', { class: 'stats-note', text: 'Загружаем…' }));
  products.replaceChildren();
  byDay.replaceChildren();
  const { data, error } = await sb.rpc('site_stats', { days });
  if (error) {
    cards.replaceChildren(el('p', { class: 'stats-note', text: 'Статистика заработает после запуска supabase/patches/2026-11-analytics.sql в Supabase.' }));
    return;
  }
  const sum = (pred) => data.filter(pred).reduce((a, r) => a + Number(r.n), 0);
  const stat = (n, label) => el('div', { class: 'stat' }, el('b', { text: n.toLocaleString('ru-RU') }), el('span', { text: label }));
  cards.replaceChildren(
    stat(sum((r) => r.event === 'pageview'), 'просмотров страницы'),
    stat(sum((r) => WA_EVENTS.includes(r.event)), 'нажатий на WhatsApp'),
    stat(sum((r) => r.event === 'order'), 'из них «Заказать» у товара'),
    stat(sum((r) => r.event === 'wholesale'), 'запросов на опт'),
    stat(sum((r) => r.event === 'instagram'), 'переходов в Instagram'),
  );

  const perProduct = {};
  for (const r of data) {
    if (!r.label || !['order', 'product_open'].includes(r.event)) continue;
    perProduct[r.label] ??= { open: 0, order: 0 };
    perProduct[r.label][r.event === 'order' ? 'order' : 'open'] += Number(r.n);
  }
  const rows = Object.entries(perProduct).sort((a, b) => b[1].order - a[1].order || b[1].open - a[1].open);
  const none = () => [el('tr', {}, el('td', { class: 'empty', colspan: 3, text: 'Пока нет данных' }))];
  products.replaceChildren(...(rows.length
    ? rows.map(([name, v]) => el('tr', {}, el('td', { text: name }), el('td', { class: 'num', text: String(v.open) }), el('td', { class: 'num', text: String(v.order) })))
    : none()));

  const perDay = {};
  for (const r of data) {
    perDay[r.day] ??= { views: 0, wa: 0 };
    if (r.event === 'pageview') perDay[r.day].views += Number(r.n);
    if (WA_EVENTS.includes(r.event)) perDay[r.day].wa += Number(r.n);
  }
  const dayRows = Object.entries(perDay).sort((a, b) => b[0].localeCompare(a[0]));
  byDay.replaceChildren(...(dayRows.length
    ? dayRows.map(([d, v]) => el('tr', {},
      el('td', { text: new Date(`${d}T00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }),
      el('td', { class: 'num', text: String(v.views) }),
      el('td', { class: 'num', text: String(v.wa) })))
    : none()));
}

$('.js-stats-days').addEventListener('change', loadStats);
$('[role=tab][data-tab=stats]').addEventListener('click', loadStats);

$$('dialog').forEach((d) => {
  $$('.js-close', d).forEach((b) => b.addEventListener('click', () => d.close()));
});

boot();
