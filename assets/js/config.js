// FABAO site configuration.
// After creating the Supabase project (see docs/SETUP.md), paste its
// Project URL and publishable (anon) key here. The anon key is safe to publish:
// the database rules only let signed-in staff change anything.
export const SUPABASE_URL = 'https://psvnemuqvokrzmijwnbp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_iRrZMxkxIDobjQJSfUy4jA_F_ifqTXc';

export const isDbConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
