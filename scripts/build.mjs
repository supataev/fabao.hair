#!/usr/bin/env node
// Bakes the database content into static HTML so the page has its text, prices
// and photos before any JavaScript runs (search engines, slow phones).
//
//   npm run build                       read live content (public, read-only) and write the site
//   node scripts/build.mjs --data f.json   use a saved snapshot instead of the database
//   node scripts/build.mjs --root dir      write into another folder (previews)
//
// Writes: index.html (ru), ky/index.html (ky), sitemap.xml, assets/img/p/* (AVIF + WebP).
// The output only changes when the content changes, so the scheduled GitHub
// Action commits nothing on quiet days.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../assets/js/config.js';
import { normalize, signature, QUERIES } from '../assets/js/render.js';
import { renderPage, renderSitemap } from './page.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const root = resolve(arg('--root') ?? repo);
const WIDTHS = [480, 960];
const IMG_DIR = 'assets/img/p';

async function fromDatabase() {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const get = async (q) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
    if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
    return res.json();
  };
  const [brands, products, settings] = await Promise.all([get(QUERIES.brands), get(QUERIES.products), get(QUERIES.settings)]);
  return normalize(brands, products, settings);
}

async function fromFile(file) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  if (Array.isArray(raw.site_settings)) return normalize(raw.brands, raw.products, raw.site_settings);
  return { brands: raw.brands, products: raw.products, settings: raw.settings };
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
  const urls = [...new Set(data.products.map((p) => p.image_url).filter(Boolean))];
  for (const url of urls) {
    let buf;
    try { buf = await readSource(url); } catch (e) { console.warn(`! skipped ${e.message}`); continue; }
    const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
    const meta = await sharp(buf).metadata();
    const variants = [];
    for (const w of WIDTHS) {
      const width = Math.min(w, meta.width);
      const height = Math.round((meta.height * width) / meta.width);
      const v = { w: width };
      for (const fmt of ['avif', 'webp']) {
        const name = `${hash}-${width}.${fmt}`;
        keep.add(name);
        v[fmt] = `/${IMG_DIR}/${name}`;
        const out = join(root, IMG_DIR, name);
        if (await exists(out)) continue;
        const img = sharp(buf).resize({ width, withoutEnlargement: true }).flatten({ background: '#ffffff' });
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

async function writeIfChanged(rel, content) {
  const file = join(root, rel);
  const old = await readFile(file, 'utf8').catch(() => null);
  if (old === content) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  return true;
}

const dataFile = arg('--data');
const data = dataFile ? await fromFile(resolve(dataFile)) : await fromDatabase();
if (!data.brands?.length || !data.settings || !Object.keys(data.settings).length) {
  throw new Error('Content looks empty; refusing to overwrite the site.');
}
const images = await buildImages(data);
const sig = signature(data);
const lastmod = [...data.brands, ...data.products]
  .map((r) => r.updated_at).filter(Boolean).sort().pop()?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

const changed = [];
for (const [lang, rel] of [['ru', 'index.html'], ['ky', 'ky/index.html']]) {
  if (await writeIfChanged(rel, renderPage({ lang, data, images }, sig))) changed.push(rel);
}
if (await writeIfChanged('sitemap.xml', renderSitemap(lastmod))) changed.push('sitemap.xml');
console.log(`Baked ${data.brands.length} brands, ${data.products.length} products, ${Object.keys(images).length} images.`);
console.log(changed.length ? `Changed: ${changed.join(', ')}` : 'No changes.');
