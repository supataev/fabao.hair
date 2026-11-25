# fabao.hair

Website of Fabao, the official distributor of ZhangGuang 101, DekoHair and Follicell in Kyrgyzstan.

- `index.html` (ru) and `ky/index.html` (ky): the public site, **generated** by `npm run build`. Don't edit them by hand.
- `scripts/build.mjs` + `scripts/page.mjs`: read the published content from Supabase (read-only) and bake it into static HTML, `sitemap.xml` and AVIF/WebP images in `assets/img/p/`.
- `assets/js/render.js`: HTML templates shared by the build and the browser. `assets/js/site.js` adds the brand filter and product dialog and re-renders if the database changed since the last bake.
- `assets/js/i18n.js`: interface texts in Russian and Kyrgyz.
- `admin/`: staff panel at fabao.hair/admin for products, brands and site texts.
- `supabase/schema.sql`: database tables, security rules and starter content. `supabase/patches/`: one-off SQL changes, run by hand in the SQL Editor.
- `.github/workflows/bake.yml`: re-bakes every hour, after each push and on demand; commits only real changes and asks Pages to rebuild.
- `_config.yml`: keeps this README, `docs/`, `supabase/`, `scripts/` and `data/` off the published site.

## Work on it

```bash
npm install
npm run build                          # bake from the live database
python3 -m http.server 8640            # preview at http://localhost:8640
node scripts/build.mjs --data f.json --root /tmp/preview   # bake a saved snapshot elsewhere
```

GitHub Pages publishes `main` from the repository root (Jekyll, no front matter in any page).

Setup: [docs/SETUP.md](docs/SETUP.md). Staff guide (RU): [docs/STAFF_GUIDE.md](docs/STAFF_GUIDE.md).
