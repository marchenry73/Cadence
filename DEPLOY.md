# Deploying Cadence to a real website

Right now Cadence only runs on your computer at `localhost`. This puts it on a public
URL that anyone can sign into.

**Time:** about 20 minutes. **Cost:** free to start.

---

## Step 1 — Run the v3 database changes

Open your SQL editor:
https://supabase.com/dashboard/project/eznsmotrmzeryduwkuuf/sql/new

Paste and run `supabase-schema-v3-profiles.sql`. This adds usernames and profiles.

You'll get the "destructive operations" warning again — it's the same `drop policy`
pattern as before, recreating security rules. No data is deleted. Click Run query.

---

## Step 2 — Put the code on GitHub

Deploy services pull from GitHub. If you don't have an account, make one at github.com.

1. Go to https://github.com/new
2. Repository name: `cadence`
3. Set it to **Private** (your Supabase URL is in the code — not secret, but no reason to publish it)
4. Click "Create repository"
5. On the next screen, click "uploading an existing file"
6. Drag in the contents of your `kingdomos` folder — **but not** the `node_modules` or
   `android` folders (they're large and get rebuilt automatically)
7. Click "Commit changes"

---

## Step 3 — Deploy with Vercel

1. Go to https://vercel.com and sign in **with your GitHub account**
2. Click "Add New" → "Project"
3. Find your `cadence` repository, click "Import"
4. Under **Framework Preset**, choose **Other**
5. Under **Root Directory**, click Edit and select the `www` folder
6. Click "Deploy"

About a minute later you'll get a live URL like `cadence-xyz.vercel.app`. That address
works for anyone, anywhere.

---

## Step 4 — Point Supabase at your new address

Supabase needs to know your real URL so confirmation and password-reset emails link
to the right place.

1. Go to your Supabase project → Authentication → URL Configuration
2. Set **Site URL** to your Vercel address (e.g. `https://cadence-xyz.vercel.app`)
3. Under **Redirect URLs**, add the same address
4. Save

Without this, password reset emails will send people to `localhost` and fail.

---

## Step 5 — Test it properly

Open your live URL on your **phone**, on mobile data (not your home wifi). That proves
it works from anywhere, not just your network.

Create a second test account with a different email to check the signup flow end to end.

---

## Optional — your own domain

1. Buy a domain (Namecheap, Cloudflare, Google Domains — roughly $10–15/year)
2. In Vercel: Project → Settings → Domains → Add
3. Vercel shows you exactly which DNS records to create at your registrar
4. Update the Supabase Site URL from step 4 to the new domain

---

## Updating after this

Once connected, updates are automatic: change a file, push to GitHub, and Vercel
redeploys in under a minute. No manual upload step.

---

## Before charging anyone

- **Privacy policy and terms** — required by app stores and expected by business buyers
- **Billing** (Stripe) — currently no way to take payment
- **Password reset tested end to end** — now built, but verify it works on the live URL
- See `GAP-ANALYSIS.md` for the full list of what's missing before this is sellable
