#!/usr/bin/env node
// Bakes the database content into static HTML so the page has its text, prices
// and photos before any JavaScript runs (search engines, slow phones).
//
//   npm run build                       read live content (public, read-only) and write the site
//   node scripts/build.mjs --data f.json   use a saved snapshot instead of the database
//   node scripts/build.mjs --root dir      write into another folder (previews)
//
// Writes every page in ru (/) and ky (/ky/): home, brands/, brands/<slug>/,
// products/; plus sitemap.xml and assets/img/p/* (AVIF + WebP).
// The output only changes when the content changes, so the scheduled GitHub
// Action commits nothing on quiet days.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../assets/js/config.js';
import { normalize, normalizePopularity, signature, rankProducts, rankBrands, QUERIES } from '../assets/js/render.js';
import { renderSite, pagePaths, renderSitemap } from './page.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const root = resolve(arg('--root') ?? repo);
const WIDTHS = [480, 960];
const WIDE_WIDTHS = [640, 1280, 1920];
const IMG_DIR = 'assets/img/p';

async function fromDatabase() {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const get = async (q) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
    if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
    return res.json();
  };
  // optional parts: until supabase/patches/2026-11-structure.sql runs they don't exist
  const optional = (p) => p.catch((e) => { console.warn(`! ${e.message} (skipped)`); return []; });
  const [brands, products, settings, promos, posts] = await Promise.all([
    get(QUERIES.brands), get(QUERIES.products), get(QUERIES.settings), optional(get(QUERIES.promos)), optional(get(QUERIES.posts))]);
  const popRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/catalog_popularity`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"days":60}' });
  const popularity = popRes.ok ? normalizePopularity(await popRes.json()) : (console.warn(`! popularity: HTTP ${popRes.status} (skipped)`), normalizePopularity());
  return { data: normalize(brands, products, settings, promos, posts), popularity };
}

async function fromFile(file) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const data = Array.isArray(raw.site_settings)
    ? normalize(raw.brands, raw.products, raw.site_settings, raw.promos || [], raw.posts || [])
    : { brands: raw.brands, products: raw.products, settings: raw.settings, promos: raw.promos || [], posts: raw.posts || [] };
  return { data, popularity: normalizePopularity(raw.popularity || []) };
}

async function readSource(url) {
  if (url.startsWith('/')) return readFile(join(root, url));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const exists = (p) => access(p).then(() => true, () => false);

// One set of AVIF/WebP files per source image, named by a hash of its bytes.
async function buildImages(data) {
  const images = {};
  const keep = new Set();
  await mkdir(join(root, IMG_DIR), { recursive: true });
  // full-width slides and story covers need large sizes; everything else 480/960
  const wide = new Set([
    ...(data.promos || []).filter((p) => p.theme === 'image').map((p) => p.image_url),
    ...(data.posts || []).map((p) => p.cover_url),
  ].filter(Boolean));
  const urls = [...new Set([
    ...data.products.map((p) => p.image_url),
    ...(data.promos || []).map((p) => p.image_url),
    ...data.brands.map((b) => b.cover_url),
    ...(data.posts || []).map((p) => p.cover_url),
  ].filter(Boolean))];
  for (const url of urls) {
    let buf;
    try { buf = await readSource(url); } catch (e) { console.warn(`! skipped ${e.message}`); continue; }
    const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
    const meta = await sharp(buf).metadata();
    const variants = [];
    for (const w of (wide.has(url) ? WIDE_WIDTHS : WIDTHS)) {
      const width = Math.min(w, meta.width);
      const height = Math.round((meta.height * width) / meta.width);
      const v = { w: width };
      for (const fmt of ['avif', 'webp']) {
        const name = `${hash}-${width}.${fmt}`;
        keep.add(name);
        v[fmt] = `/${IMG_DIR}/${name}`;
        const out = join(root, IMG_DIR, name);
        if (await exists(out)) continue;
        const img = sharp(buf).resize({ width, withoutEnlargement: true }).flatten({ background: '#ffffff' }).keepXmp(); // keeps AI-content labels
        await (fmt === 'avif' ? img.avif({ quality: 52, effort: 6 }) : img.webp({ quality: 78 })).toFile(out);
      }
      variants.push(v);
      if (width === meta.width) { v.h = height; break; }
      v.h = height;
    }
    const largest = variants[variants.length - 1];
    images[url] = { w: largest.w, h: largest.h, variants: variants.map(({ w, avif, webp }) => ({ w, avif, webp })) };
  }
  for (const f of await readdir(join(root, IMG_DIR))) if (!keep.has(f)) await rm(join(root, IMG_DIR, f));
  return images;
}

// A brand shows its logo when assets/img/brands/<slug>.svg or .png exists;
// otherwise its name is shown as text.
async function findBrandLogos(data) {
  const logos = {};
  for (const b of data.brands) {
    for (const ext of ['svg', 'png']) {
      const rel = `assets/img/brands/${b.slug}.${ext}`;
      if (!(await exists(join(root, rel)))) continue;
      const meta = await sharp(join(root, rel)).metadata();
      logos[b.slug] = { src: `/${rel}`, w: meta.width, h: meta.height };
      break;
    }
  }
  return logos;
}

async function writeIfChanged(rel, content) {
  const file = join(root, rel);
  const old = await readFile(file, 'utf8').catch(() => null);
  if (old === content) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  return true;
}

// Popularity goes into the pages as RANKS, not raw scores: the pages then only
// change when the order changes, not after every visitor click.
function toRanks(base, raw) {
  const ctx = { ...base, popularity: raw };
  const ranks = (list) => Object.fromEntries(list.map((x, i) => [x.id, list.length - i]));
  const unfeatured = { ...ctx, data: { ...ctx.data, products: ctx.data.products.map((p) => ({ ...p, is_featured: false, in_stock: true })) } };
  return { products: ranks(rankProducts(unfeatured)), brands: ranks(rankBrands(ctx)) };
}

// Remove pages of brands and stories that no longer exist (or are unpublished).
async function removeStaleBrandPages(data) {
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Bishkek date
  const groups = [
    [['brands', 'ky/brands'], new Set(data.brands.map((x) => x.slug))],
    [['blog', 'ky/blog'], new Set((data.posts || []).filter((p) => !p.published_on || p.published_on <= today).map((p) => p.slug))],
  ];
  for (const [dirs, keep] of groups) {
    for (const dir of dirs) {
      const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
      for (const e of entries) if (e.isDirectory() && !keep.has(e.name)) await rm(join(root, dir, e.name), { recursive: true });
    }
  }
}

const dataFile = arg('--data');
const { data, popularity: rawPopularity } = dataFile ? await fromFile(resolve(dataFile)) : await fromDatabase();
if (!data.brands?.length || !data.settings || !Object.keys(data.settings).length) {
  throw new Error('Content looks empty; refusing to overwrite the site.');
}
const images = await buildImages(data);
const brandLogos = await findBrandLogos(data);
const sig = signature(data);
const popularity = toRanks({ data }, rawPopularity);
const lastmod = [...data.brands, ...data.products, ...(data.promos || [])]
  .map((r) => r.updated_at).filter(Boolean).sort().pop()?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

const changed = [];
for (const [rel, html] of renderSite({ data, images, brandLogos, popularity, sig })) {
  if (await writeIfChanged(rel, html)) changed.push(rel);
}
await removeStaleBrandPages(data);
if (await writeIfChanged('sitemap.xml', renderSitemap(pagePaths(data), lastmod))) changed.push('sitemap.xml');
console.log(`Baked ${data.brands.length} brands, ${data.products.length} products, ${(data.promos || []).length} slides, ${(data.posts || []).length} posts, ${Object.keys(images).length} images.`);
console.log(changed.length ? `Changed (${changed.length}): ${changed.join(', ')}` : 'No changes.');
