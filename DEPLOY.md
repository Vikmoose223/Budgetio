# Deploying תקציב זוגי

Goal: get the app online (so both partners can use it from anywhere and install
it on their phones) and have CI run on every push.

Path: **GitHub (code + CI) → Vercel (hosting, auto-deploys on push) → Supabase (auth URL)**.

---

## 1. Push the code to a private GitHub repo

1. Go to <https://github.com/new> and create a **Private** repo named `budget-app`.
   Do **not** add a README, .gitignore, or license (the repo already has them).
2. In your terminal, from the project folder, run (replace `<USERNAME>`):

   ```bash
   cd /Users/vik/budget-app
   git remote add origin https://github.com/<USERNAME>/budget-app.git
   git branch -M main
   git push -u origin main
   ```

   When prompted to authenticate, sign in to GitHub (browser or a Personal
   Access Token as the password).

After this, the **CI** workflow (`.github/workflows/ci.yml`) runs automatically
on every push — typecheck, lint, unit tests, build, and Playwright smoke tests.

> The CI E2E job uses placeholder Supabase values and runs only the public smoke
> test (the live auth flow is skipped unless `RUN_AUTH_E2E=1`), so CI passes
> without any secrets.

---

## 2. Deploy on Vercel (no CLI needed)

1. Go to <https://vercel.com> and sign in **with GitHub**.
2. **Add New… → Project** → import the `budget-app` repo.
3. Framework is auto-detected as **Next.js**. Before deploying, add two
   **Environment Variables** (Settings → Environment Variables) — the same ones
   from your local `.env.local`:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://rxfcoztwidfrqikdfgrl.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_…` key |

   (These are the *publishable* values — safe to store in Vercel.)
4. Click **Deploy**. In ~1 minute you'll get a URL like
   `https://budget-app-xxxx.vercel.app`.

Every future `git push` to `main` auto-deploys.

---

## 3. Point Supabase auth at the live URL

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: set to your Vercel URL (e.g. `https://budget-app-xxxx.vercel.app`)
- **Redirect URLs**: add `https://budget-app-xxxx.vercel.app/**`

(Needed for email-based flows like password reset. Basic email+password login
works without it, but set it anyway.)

---

## 4. Install it on your phones 📱

Open the Vercel URL on each phone:

- **iPhone (Safari)**: Share → *Add to Home Screen*
- **Android (Chrome)**: menu → *Install app* / *Add to Home screen*

It launches full-screen with the piggy-bank icon, like a native app.

---

## Updating later

Just commit and push — Vercel redeploys automatically:

```bash
git add -A && git commit -m "…" && git push
```
