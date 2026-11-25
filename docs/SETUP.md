# Setting up the FABAO website database (one time, ~15 minutes)

The public site works right away, using the starter content in `data/content.json`.
The staff panel at **fabao.hair/admin** needs a free Supabase database. Do this once.

## 1. Create the Supabase project
1. Go to <https://supabase.com>, sign up (GitHub sign-in is fine) and click **New project**.
2. Name: `fabao`. Region: **Central EU (Frankfurt)** is closest to Bishkek. Choose a strong database password and keep it somewhere safe.
3. Wait about 2 minutes for the project to start.

## 2. Create the tables
1. In the project, open **SQL Editor → New query**.
2. Paste the whole content of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
   This creates brands, products and site texts, the security rules, the photo storage and the starter content.

## 3. Lock down sign-ups
1. **Authentication → Sign In / Providers → Email**: keep Email enabled.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
   Only people you invite can get an account.
3. **Authentication → URL Configuration**:
   - Site URL: `https://www.fabao.hair/admin/`
   - Redirect URLs: add `https://www.fabao.hair/admin/` and `https://fabao.hair/admin/`

## 4. Add staff
For each staff member:
1. **Authentication → Users → Add user → Send invitation**, enter their e-mail.
   They receive an e-mail, click the link, land on fabao.hair/admin and choose a password.
2. In **SQL Editor**, run (with their real e-mail):
   ```sql
   insert into public.staff (email, name) values ('name@example.com', 'Name');
   ```
   Both steps are needed. An account that is not in the `staff` list can sign in but cannot see or change anything.

To remove someone: delete them in **Authentication → Users** and run
`delete from public.staff where email = 'name@example.com';`

## 5. Connect the website
1. **Project Settings → API** (or **Data API**): copy the **Project URL** and the **publishable** key (`sb_publishable_...`, called "anon public" on older projects).
2. Paste them into [`assets/js/config.js`](../assets/js/config.js):
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   The anon key is meant to be public. The security rules from step 2 decide what it may do: read published content only.
   Never put the **service_role** key in the website.
3. Commit the change. GitHub Pages republishes the site within about a minute.

From then on the public site reads everything from the database, and staff edit it at fabao.hair/admin.

## Notes
- The free Supabase plan pauses a project after 7 days with no activity at all. Normal site visits count as activity, so this should not happen to a live site. If it ever does, click **Restore** in the Supabase dashboard.
- Back up from **Database → Backups**. The free plan has daily backups for 7 days.
