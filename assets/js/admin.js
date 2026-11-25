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
  // SEO: tell Google which pages elsewhere are Fabao, and verify the site
  { key: 'same_as', label: 'Fabao в интернете: ссылки на 2ГИС, Google Maps, Яндекс Карты, Facebook… (каждая с новой строки, https://)', single: true, long: true },
  { key: 'google_site_verification', label: 'Google Search Console — код подтверждения (содержимое content из meta-тега)', single: true },
  { key: 'yandex_verification', label: 'Яндекс Вебмастер — код подтверждения (содержимое content из meta-тега)', single: true },
];

let sb;
const state = { brands: [], products: [], settings: {}, promos: [], promosReady: true, posts: [], postsReady: true, editingPost: null, pendingPostImage: undefined, slugTouched: false, editingProduct: null, editingBrand: null, editingPromo: null, pendingImage: undefined, pendingPromoImage: undefined };

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

/* ---------- sign out after 1 hour of inactivity ----------
   Supabase would otherwise keep a login alive for weeks. Any click, key,
   scroll or typing in the panel resets the clock. The last activity time is
   kept in localStorage, so it is shared by all admin tabs and survives a
   closed tab (coming back after more than an hour means signing in again). */
const IDLE_MAX_MS = 60 * 60 * 1000;
const ACTIVITY_KEY = 'fabao-admin-last-activity';
let idleTimer;
let lastWrite = 0;

const readActivity = () => { try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; } };
function markActivity(force = false) {
  const now = Date.now();
  if (!force && now - lastWrite < 15000) return; // write at most every 15 s
  lastWrite = now;
  try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* storage unavailable */ }
}
const forgetActivity = () => { try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* ignore */ } };
const idleFor = () => Date.now() - (readActivity() || Date.now());
const inApp = () => !$('[data-screen=app]').hidden;

async function expireSession() {
  clearTimeout(idleTimer);
  forgetActivity();
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  $$('dialog[open]').forEach((d) => d.close());
  show('login');
  $('.js-login-msg').textContent = 'Вы не работали в панели больше часа, поэтому вход закончился. Войдите снова.';
}

// Re-checks when the hour could be up, using the latest activity from any tab.
function scheduleIdleCheck() {
  clearTimeout(idleTimer);
  const left = IDLE_MAX_MS - idleFor();
  if (left <= 0) { expireSession(); return; }
  idleTimer = setTimeout(scheduleIdleCheck, Math.min(left + 1000, 5 * 60 * 1000));
}

['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach((type) => {
  document.addEventListener(type, () => { if (inApp()) markActivity(); }, { passive: true, capture: true });
});

// Timers can run late in a sleeping tab, so check again when it comes back.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && sb && inApp()) scheduleIdleCheck();
});

async function enter(session, freshSignIn = false) {
  if (freshSignIn || !readActivity()) markActivity(true);
  if (idleFor() > IDLE_MAX_MS) { await expireSession(); return; }
  const { data: ok, error } = await sb.rpc('is_staff');
  if (error || !ok) {
    $('.js-denied-email').textContent = session.user.email;
    show('denied');
    return;
  }
  $('.js-who').textContent = session.user.email;
  show('app');
  scheduleIdleCheck();
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
  await enter(data.session, true);
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
  await enter(session, true);
});

$$('.js-logout').forEach((b) => b.addEventListener('click', async () => {
  clearTimeout(idleTimer);
  forgetActivity();
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
  // slides: separate, so the panel still works before the structure patch runs
  const promos = await sb.from('promos').select('*').order('sort_order').order('created_at');
  state.promosReady = !promos.error;
  state.promos = promos.data ?? [];
  const posts = await sb.from('posts').select('*').order('published_on', { ascending: false }).order('created_at', { ascending: false });
  state.postsReady = !posts.error;
  state.posts = posts.data ?? [];
  renderBrandOptions();
  renderProducts();
  renderBrands();
  renderTexts();
  renderPromos();
  renderPosts();
  renderCarouselSettings();
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
      p.is_featured ? el('span', { class: 'tag', text: '★ популярное' }) : null),
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
  const data = { accent_color: '#1D5C40', ...(b ?? { is_published: true, sort_order: (state.brands.at(-1)?.sort_order ?? 0) + 1 }) };
  if (!data.accent_color) data.accent_color = '#1D5C40';
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
    tagline_ru: emptyToNull(f.get('tagline_ru').trim()),
    tagline_ky: emptyToNull(f.get('tagline_ky').trim()),
    story_ru: emptyToNull(f.get('story_ru').trim()),
    story_ky: emptyToNull(f.get('story_ky').trim()),
    features_ru: emptyToNull(f.get('features_ru').trim()),
    features_ky: emptyToNull(f.get('features_ky').trim()),
    accent_color: f.get('accent_color') || null,
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
/* ---------- promos (slider) ---------- */
const fmtDate = (d) => (d ? new Date(`${d}T00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '');
const todayIso = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Bishkek date

function renderPromoLinks() {
  const opts = [
    ['/products/', 'Все товары'], ['/brands/', 'Все бренды'], ['whatsapp', 'Написать в WhatsApp'], ['/#wholesale', 'Опт'],
    ...state.brands.flatMap((b) => [[`/brands/${b.slug}/`, `Страница ${b.name}`], [`/products/?brand=${b.slug}`, `Товары ${b.name}`]]),
    ['/blog/', 'Блог'], ...state.posts.map((x) => [`/blog/${x.slug}/`, `Статья: ${x.title_ru}`]),
  ];
  $('.js-promo-post').replaceChildren(el('option', { value: '', text: '— нет —' }), ...state.posts.map((x) => el('option', { value: x.id, text: x.title_ru })));
  $('.js-promo-links').replaceChildren(...opts.map(([v, label]) => el('option', { value: v, label })));
  $('.js-promo-brand').replaceChildren(el('option', { value: '', text: '— без логотипа —' }), ...state.brands.map((b) => el('option', { value: b.id, text: b.name })));
}

function renderPromos() {
  const body = $('.js-promos');
  if (!state.promosReady) {
    body.replaceChildren(el('tr', {}, el('td', { class: 'empty', colspan: 6, text: 'Слайды заработают после запуска supabase/patches/2026-11-structure.sql в Supabase.' })));
    $('.js-add-promo').disabled = true;
    return;
  }
  $('.js-add-promo').disabled = false;
  if (!state.promos.length) {
    body.replaceChildren(el('tr', {}, el('td', { class: 'empty', colspan: 6, text: 'Слайдов пока нет. Нажмите «+ Добавить слайд».' })));
    return;
  }
  body.replaceChildren(...state.promos.map((p) => {
    const ended = p.ends_on && p.ends_on < todayIso();
    const period = p.starts_on || p.ends_on ? `${fmtDate(p.starts_on) || '…'} — ${fmtDate(p.ends_on) || '…'}` : 'всегда';
    return el('tr', {},
      el('td', { class: 'thumb' }, p.image_url ? el('img', { class: 'promo-thumb', src: p.image_url, alt: '' }) : el('span', { class: 'noimg' })),
      el('td', {}, el('button', { type: 'button', class: 'row-link', text: p.title_ru, onclick: () => openPromo(p) }),
        p.theme === 'image' ? el('span', { class: 'tag', text: 'только фото' }) : null,
        p.post_id ? el('span', { class: 'tag', text: 'статья' }) : null),
      el('td', {}, el('span', { class: `period${ended ? ' off' : ''}`, text: ended ? `${period} (закончилась)` : period })),
      el('td', { class: 'order' },
        el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Выше', text: '↑', disabled: state.promos[0] === p, onclick: () => movePromo(p, -1) }),
        el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Ниже', text: '↓', disabled: state.promos.at(-1) === p, onclick: () => movePromo(p, 1) })),
      el('td', {}, toggle(p.is_published, async (v) => {
        const { error } = await sb.from('promos').update({ is_published: v, updated_at: new Date().toISOString() }).eq('id', p.id);
        if (error) toast('Не сохранилось: ' + error.message, true); else { p.is_published = v; toast('Сохранено'); }
      })),
      el('td', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-small', text: 'Изменить', onclick: () => openPromo(p) })),
    );
  }));
}

function setPromoPreview(url) {
  $('.js-promo-image-preview').replaceChildren(url ? el('img', { src: url, alt: '' }) : el('span', { text: 'Нет картинки' }));
  $('.js-promo-image-remove').hidden = !url;
}

function openPromo(p) {
  state.editingPromo = p;
  state.pendingPromoImage = undefined;
  const form = $('.js-promo-form');
  form.reset();
  renderPromoLinks();
  $('.js-promo-title').textContent = p ? 'Редактировать слайд' : 'Новый слайд';
  $('.js-delete-promo').hidden = !p;
  $('.js-promo-msg').textContent = '';
  const data = p ?? { is_published: true, theme: 'emerald', image_position: 'center', sort_order: (state.promos.at(-1)?.sort_order ?? 0) + 10 };
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.type === 'checkbox') input.checked = Boolean(data[input.name]);
    else input.value = data[input.name] ?? '';
  }
  setPromoPreview(p?.image_url ?? null);
  $('.js-title-hint').hidden = form.elements.theme.value !== 'image';
  $('.js-promo-dialog').showModal();
}

$('.js-add-promo').addEventListener('click', () => openPromo(null));
$('.js-promo-theme').addEventListener('change', (e) => { $('.js-title-hint').hidden = e.target.value !== 'image'; });
$('.js-promo-image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingPromoImage = await shrinkImage(file);
  setPromoPreview(URL.createObjectURL(state.pendingPromoImage));
  e.target.value = '';
});
$('.js-promo-image-remove').addEventListener('click', () => { state.pendingPromoImage = null; setPromoPreview(null); });

$('.js-promo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const p = state.editingPromo;
  const msg = $('.js-promo-msg');
  const str = (k) => emptyToNull(String(f.get(k) ?? '').trim());
  const link = str('link');
  if (f.get('theme') === 'image' && !state.pendingPromoImage && (state.pendingPromoImage === null || !p?.image_url)) {
    msg.textContent = 'Для «Только картинка» загрузите фото.';
    return;
  }
  if (link && !(link === 'whatsapp' || link.startsWith('/') || /^https:\/\//.test(link))) {
    msg.textContent = 'Ссылка должна начинаться с / или https://, либо быть «whatsapp».';
    return;
  }
  if (str('starts_on') && str('ends_on') && str('ends_on') < str('starts_on')) {
    msg.textContent = 'Дата «до» раньше даты «с».';
    return;
  }
  msg.textContent = 'Сохраняем…';
  const row = {
    title_ru: str('title_ru'), title_ky: str('title_ky'), text_ru: str('text_ru'), text_ky: str('text_ky'),
    cta_ru: str('cta_ru'), cta_ky: str('cta_ky'), link, theme: f.get('theme'), brand_id: str('brand_id'),
    starts_on: str('starts_on'), ends_on: str('ends_on'), sort_order: Number(f.get('sort_order') || 0),
    image_position: f.get('image_position') || 'center', post_id: str('post_id'),
    is_published: form.elements.is_published.checked, updated_at: new Date().toISOString(),
  };
  try {
    const oldUrl = p?.image_url ?? null;
    if (state.pendingPromoImage) row.image_url = await uploadImage(state.pendingPromoImage);
    else if (state.pendingPromoImage === null) row.image_url = null;
    const { error } = p ? await sb.from('promos').update(row).eq('id', p.id) : await sb.from('promos').insert(row);
    if (error) throw error;
    if (state.pendingPromoImage !== undefined && oldUrl) await removeStoredImage(oldUrl);
  } catch (err) {
    msg.textContent = 'Ошибка: ' + err.message;
    return;
  }
  $('.js-promo-dialog').close();
  toast('Слайд сохранён');
  await loadAll();
});

$('.js-delete-promo').addEventListener('click', async () => {
  const p = state.editingPromo;
  if (!p) return;
  const btn = $('.js-delete-promo');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Точно удалить?';
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Удалить'; }, 4000);
    return;
  }
  btn.dataset.confirm = '';
  btn.textContent = 'Удалить';
  const { error } = await sb.from('promos').delete().eq('id', p.id);
  if (error) { $('.js-promo-msg').textContent = 'Ошибка: ' + error.message; return; }
  await removeStoredImage(p.image_url);
  $('.js-promo-dialog').close();
  toast('Слайд удалён');
  await loadAll();
});

/* ---------- carousel settings ---------- */
function renderCarouselSettings() {
  const form = $('.js-carousel-settings');
  form.elements.autoplay.checked = (state.settings.carousel_autoplay?.value_ru ?? 'on') !== 'off';
  form.elements.interval.value = state.settings.carousel_interval?.value_ru || '6';
}
$('.js-carousel-settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const autoplay = form.elements.autoplay.checked ? 'on' : 'off';
  const interval = form.elements.interval.value;
  const { error } = await sb.from('site_settings').upsert([
    { key: 'carousel_autoplay', value_ru: autoplay, value_ky: autoplay },
    { key: 'carousel_interval', value_ru: interval, value_ky: interval },
  ]);
  if (error) { toast('Ошибка: ' + error.message, true); return; }
  toast('Настройки карусели сохранены');
  await loadAll();
});

// Move a slide up or down: swap its order number with its neighbour.
async function movePromo(p, dir) {
  const list = state.promos;
  const i = list.indexOf(p);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const other = list[j];
  // make orders distinct first, then swap
  const a = i * 10 + 10;
  const b = j * 10 + 10;
  const now = new Date().toISOString();
  const r1 = await sb.from('promos').update({ sort_order: b, updated_at: now }).eq('id', p.id);
  const r2 = await sb.from('promos').update({ sort_order: a, updated_at: now }).eq('id', other.id);
  const err = r1.error || r2.error;
  if (err) { toast('Не сохранилось: ' + err.message, true); return; }
  await loadAll();
}

/* ---------- blog ---------- */
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ң: 'n' };
const postSlug = (title) => String(title || '').toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('')
  .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || `post-${Date.now()}`;
const promoForPost = (post) => state.promos.find((x) => x.post_id === post.id);

function renderPosts() {
  const body = $('.js-posts');
  if (!state.postsReady) {
    body.replaceChildren(el('tr', {}, el('td', { class: 'empty', colspan: 6, text: 'Блог заработает после запуска supabase/patches/2026-11-blog.sql в Supabase.' })));
    $('.js-add-post').disabled = true;
    return;
  }
  $('.js-add-post').disabled = false;
  if (!state.posts.length) {
    body.replaceChildren(el('tr', {}, el('td', { class: 'empty', colspan: 6, text: 'Статей пока нет. Нажмите «+ Новая статья».' })));
    return;
  }
  body.replaceChildren(...state.posts.map((p) => el('tr', {},
    el('td', { class: 'thumb' }, p.cover_url ? el('img', { class: 'promo-thumb', src: p.cover_url, alt: '' }) : el('span', { class: 'noimg' })),
    el('td', {}, el('button', { type: 'button', class: 'row-link', text: p.title_ru, onclick: () => openPost(p) }),
      (p.tags || []).length ? el('span', { class: 'tag', text: p.tags.join(', ') }) : null),
    el('td', {}, el('span', { class: 'period', text: fmtDate(p.published_on) + (p.published_on > todayIso() ? ' (запланирована)' : '') })),
    el('td', { text: promoForPost(p) ? 'да' : '—' }),
    el('td', {}, toggle(p.is_published, async (v) => {
      const { error } = await sb.from('posts').update({ is_published: v, updated_at: new Date().toISOString() }).eq('id', p.id);
      if (error) toast('Не сохранилось: ' + error.message, true); else { p.is_published = v; toast('Сохранено'); }
    })),
    el('td', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-small', text: 'Изменить', onclick: () => openPost(p) })),
  )));
}

function setPostPreview(url) {
  $('.js-post-image-preview').replaceChildren(url ? el('img', { src: url, alt: '' }) : el('span', { text: 'Нет обложки' }));
  $('.js-post-image-remove').hidden = !url;
}

function openPost(p) {
  state.editingPost = p;
  state.pendingPostImage = undefined;
  state.slugTouched = Boolean(p);
  const form = $('.js-post-form');
  form.reset();
  $('.js-post-brand').replaceChildren(el('option', { value: '', text: '— без бренда —' }), ...state.brands.map((b) => el('option', { value: b.id, text: b.name })));
  $('.js-post-title').textContent = p ? 'Редактировать статью' : 'Новая статья';
  $('.js-delete-post').hidden = !p;
  $('.js-post-msg').textContent = '';
  const data = p ?? { is_published: true, published_on: todayIso(), tags: [] };
  for (const input of form.elements) {
    if (!input.name || input.name === 'in_carousel') continue;
    if (input.type === 'checkbox') input.checked = Boolean(data[input.name]);
    else if (input.name === 'tags') input.value = (data.tags || []).join(', ');
    else input.value = data[input.name] ?? '';
  }
  form.elements.in_carousel.checked = Boolean(p && promoForPost(p));
  $('.js-slug-preview').textContent = form.elements.slug.value || '…';
  const view = $('.js-post-view');
  view.hidden = !p;
  if (p) view.href = `../blog/${p.slug}/`;
  setPostPreview(p?.cover_url ?? null);
  $('.js-post-dialog').showModal();
}

$('.js-add-post').addEventListener('click', () => openPost(null));
$('.js-post-form').elements.title_ru.addEventListener('input', (e) => {
  if (state.slugTouched) return;
  const slug = postSlug(e.target.value);
  $('.js-post-form').elements.slug.value = slug;
  $('.js-slug-preview').textContent = slug || '…';
});
$('.js-post-slug').addEventListener('input', (e) => { state.slugTouched = true; $('.js-slug-preview').textContent = e.target.value || '…'; });
$('.js-post-image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.pendingPostImage = await shrinkImage(file, 2000);
  setPostPreview(URL.createObjectURL(state.pendingPostImage));
  e.target.value = '';
});
$('.js-post-image-remove').addEventListener('click', () => { state.pendingPostImage = null; setPostPreview(null); });

$('.js-post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const p = state.editingPost;
  const msg = $('.js-post-msg');
  const str = (k) => emptyToNull(String(f.get(k) ?? '').trim());
  const slug = str('slug');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) { msg.textContent = 'Адрес: только латинские буквы, цифры и дефисы.'; return; }
  if (state.posts.some((x) => x.slug === slug && x.id !== p?.id)) { msg.textContent = 'Статья с таким адресом уже есть.'; return; }
  msg.textContent = 'Сохраняем…';
  const row = {
    slug, title_ru: str('title_ru'), title_ky: str('title_ky'), excerpt_ru: str('excerpt_ru'), excerpt_ky: str('excerpt_ky'),
    body_ru: str('body_ru'), body_ky: str('body_ky'), brand_id: str('brand_id'), published_on: str('published_on'),
    tags: String(f.get('tags') || '').split(',').map((x) => x.trim()).filter(Boolean),
    is_published: form.elements.is_published.checked, updated_at: new Date().toISOString(),
  };
  let saved;
  try {
    const oldUrl = p?.cover_url ?? null;
    if (state.pendingPostImage) row.cover_url = await uploadImage(state.pendingPostImage);
    else if (state.pendingPostImage === null) row.cover_url = null;
    const res = p ? await sb.from('posts').update(row).eq('id', p.id).select().single()
      : await sb.from('posts').insert(row).select().single();
    if (res.error) throw res.error;
    saved = res.data;
    if (state.pendingPostImage !== undefined && oldUrl) await removeStoredImage(oldUrl);
    // «Показать в карусели»: one slide per story, linked by post_id
    const slide = promoForPost(saved);
    if (form.elements.in_carousel.checked && !slide) {
      const ins = await sb.from('promos').insert({
        title_ru: saved.title_ru, title_ky: saved.title_ky, text_ru: saved.excerpt_ru, text_ky: saved.excerpt_ky,
        theme: 'ivory', post_id: saved.id, image_url: saved.cover_url, is_published: true,
        sort_order: (state.promos.at(-1)?.sort_order ?? 0) + 10,
      });
      if (ins.error) throw ins.error;
    } else if (!form.elements.in_carousel.checked && slide) {
      const del = await sb.from('promos').delete().eq('id', slide.id);
      if (del.error) throw del.error;
    }
  } catch (err) {
    msg.textContent = 'Ошибка: ' + err.message;
    return;
  }
  $('.js-post-dialog').close();
  toast('Статья сохранена. На сайте — в течение часа.');
  await loadAll();
});

$('.js-delete-post').addEventListener('click', async () => {
  const p = state.editingPost;
  if (!p) return;
  const btn = $('.js-delete-post');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Точно удалить?';
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Удалить'; }, 4000);
    return;
  }
  btn.dataset.confirm = '';
  btn.textContent = 'Удалить';
  const { error } = await sb.from('posts').delete().eq('id', p.id); // its carousel slide goes with it
  if (error) { $('.js-post-msg').textContent = 'Ошибка: ' + error.message; return; }
  await removeStoredImage(p.cover_url);
  $('.js-post-dialog').close();
  toast('Статья удалена');
  await loadAll();
});

/* ---------- phone layout: label table cells with their column title ---------- */
function labelCells(tbody) {
  const heads = [...tbody.closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());
  for (const row of tbody.rows) [...row.cells].forEach((td, i) => { if (heads[i] && !td.dataset.label) td.dataset.label = heads[i]; });
}
$$('.table tbody').forEach((tb) => {
  labelCells(tb);
  new MutationObserver(() => labelCells(tb)).observe(tb, { childList: true });
});

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
