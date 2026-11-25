// Loads brands, products and site texts.
// Uses Supabase when configured, otherwise the bundled data/content.json.
import { SUPABASE_URL, SUPABASE_ANON_KEY, isDbConfigured } from './config.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let clientPromise = null;
export function getClient() {
  if (!isDbConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return clientPromise;
}

async function loadFallback() {
  const base = new URL('../../data/content.json', import.meta.url);
  const res = await fetch(base);
  return res.json();
}

export async function loadContent() {
  const sb = await getClient();
  if (!sb) {
    const data = await loadFallback();
    return { ...data, source: 'fallback' };
  }
  const [brands, products, settings] = await Promise.all([
    sb.from('brands').select('*').eq('is_published', true).order('sort_order'),
    sb.from('products').select('*').eq('is_published', true).order('sort_order'),
    sb.from('site_settings').select('*'),
  ]);
  const err = brands.error || products.error || settings.error;
  if (err) {
    console.error('Supabase error, using fallback content', err);
    const data = await loadFallback();
    return { ...data, source: 'fallback' };
  }
  const map = {};
  for (const row of settings.data) map[row.key] = { ru: row.value_ru ?? '', ky: row.value_ky ?? '' };
  return { brands: brands.data, products: products.data, settings: map, source: 'supabase' };
}
