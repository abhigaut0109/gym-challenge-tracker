# 45×20 — Gym Challenge Tracker

A workout-challenge tracker for a friend group: create an account with your
email, log sessions (today or backdated up to 7 days), see everyone's
progress, request sick/travel exclusions, and win a 🏆 for hitting the
monthly target. Admins approve exclusion requests and can create accounts
for friends directly.

It's a plain static site (`index.html` + a few JS/CSS files, no build step,
no framework) that talks to a free [Supabase](https://supabase.com) Postgres
database and uses Supabase's built-in email/password auth for accounts.
Total hosting cost: **$0**.

## How it works out of the box

Open `index.html` (or deploy it) without any setup and the app runs in
**local demo mode**: data lives in your browser's `localStorage`, seeded with
8 sample friends and a few weeks of history so every screen has something to
show. Try signing in with `riya@example.com` / `password123` (seeded as
admin), or sign up your own local-only account. This is only visible to you
— nobody else sees your local demo data.

To make it a real, shared tool where everyone sees the same data, connect a
free Supabase project (10 minutes, one time).

## 1. Create the database (free)

1. Go to [supabase.com](https://supabase.com) → **New project** (the free
   tier gives you 500MB of Postgres, more than enough for this).
2. Once it's created, open **SQL Editor → New query**, paste in the contents
   of [`schema.sql`](schema.sql), and run it. This creates the
   `members`, `sessions`, `exclusions` and `holidays` tables and seeds a few
   holidays. (No members are seeded — accounts are created by signing up
   through the app, see step 4.)
3. Go to **Authentication → Providers → Email** (some Supabase UIs call this
   **Authentication → Sign In / Providers**) and turn **off** "Confirm
   email." That's what makes sign-up log people in immediately with no
   verification step, as you asked. If you leave it on, the app still
   works — people just have to click a confirmation link in their inbox
   once before their first sign-in.
4. Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public** (or newer-style **publishable**) key — not the
   `service_role`/**secret** key, that one must never go into client-side
   code.

## 2. Point the app at it

Open [`config.js`](config.js) and fill in:

```js
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbG...";
```

That's it — the app automatically switches from local demo mode to the
shared database the moment both values are non-empty. You can also tune
`CHALLENGE` in the same file (days/month needed to win, minutes/session,
squads, session types, exclusion reasons).

## 3. Deploy for free

### Vercel (recommended)
1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   the repo.
3. Framework preset: **Other**. Leave the build command empty and the output
   directory as the repo root (or set it to this folder if it's nested in a
   bigger repo).
4. Deploy. Free Hobby plan, HTTPS and a `*.vercel.app` URL included, custom
   domain optional.

Or via CLI, from inside this folder:
```bash
npm i -g vercel
vercel --prod
```

### Alternatives (also free)
- **Netlify Drop** — drag this folder onto app.netlify.com/drop for an
  instant URL, no account needed to start.
- **GitHub Pages** — push to a repo, enable Pages on the `main` branch.
- **Cloudflare Pages** — connect the repo, no build command.

Any of these work identically since it's just static files.

## Notes on the data model

- **Real accounts, via Supabase Auth**: sign-up asks for name, email and a
  password (min. 8 characters, enforced by the app) — no mobile number, no
  company SSO, no employee ID. Passwords are handled entirely by Supabase
  Auth; this app never sees or stores them itself.
- **The challenge is monthly**: each calendar month (1st to last day), hit
  `CHALLENGE.monthlyTargetDays` (default 20) valid days — sessions of at
  least `minMinutes` — and you win the month (🏆). Public holidays and
  approved sick/travel exclusions reduce the target for that month, same as
  before.
- **Logging is backdate-friendly, not future-friendly**: the log-session
  date picker allows today or up to 6 days back, never a future date (both
  enforced in the UI and re-checked before the write goes through).
- **Nobody is admin by default.** Once your first friend signs up, promote
  them (or yourself) from Supabase's SQL Editor:
  ```sql
  update members set is_admin = true where email = 'you@example.com';
  ```
  After that, admins can promote/demote others from the app's Admin tab.
- **Admins can create accounts for friends** directly from the Admin tab
  (name, email, squad, and an auto-generated or custom password) and get a
  one-time credentials panel to share with them. This uses a throwaway,
  non-persisted Supabase client under the hood so creating someone else's
  account never logs the admin out of their own session — no `service_role`
  key involved, just a normal signup done on the friend's behalf.
- **Admins can't edit or delete anyone else's logged sessions.** Their reach
  is limited to approving/declining exclusion requests, promoting/demoting
  admins, and creating accounts — never rewriting what someone else logged.
- **Row Level Security is scoped to signed-in users** (`schema.sql`):
  everyone who's logged in can read all members/sessions/exclusions (that's
  the point — the group sees the group), but you can only insert or delete
  your *own* sessions/exclusions, and only admins can approve/decline
  requests or promote members. See the `is_admin()` helper in the SQL file.
- **"Reset demo data"** in the Admin tab only appears in local demo mode —
  it's disabled once Supabase is connected so nobody accidentally wipes the
  group's real logged sessions.

## Local development

No build step. Any static file server works, e.g.:
```bash
python -m http.server 5173
```
then open `http://localhost:5173`.
