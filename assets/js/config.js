// FABAO site configuration.
// After creating the Supabase project (see docs/SETUP.md), paste its
// Project URL and anon public key here. The anon key is safe to publish:
// the database rules only let signed-in staff change anything.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const isDbConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
