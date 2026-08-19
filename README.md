# Cadence — Build & Launch Guide

Everything below is in order. Do them in sequence — each step unlocks the next.

---

## PART 1 — Cloud sync (accounts + data on every device)

### Step 1: Create your Supabase project
1. Go to https://supabase.com and sign up (free tier is enough to start).
2. Click "New Project." Name it `kingdomos`, set a database password (save it somewhere), pick the region closest to you.
3. Wait ~2 minutes for it to provision.

### Step 2: Run the database schema
1. In your new project, open the **SQL Editor** (left sidebar).
2. Click "New query," paste in everything from `supabase-schema.sql` (included in this folder), and click **Run**.
3. This creates the table that stores each user's app data, locked down so users can only ever see their own data.

### Step 3: Turn on email auth
1. In Supabase, go to **Authentication → Providers**.
2. Make sure "Email" is enabled (it is by default).
3. Go to **Authentication → URL Configuration** and, for now during testing, you can leave defaults.

### Step 4: Connect the app to your project
1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `www/app.js` in this folder, find these two lines near the top:
   ```js
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
4. Replace both placeholder strings with what you copied.

That's it — the app now has real accounts and syncs across every device someone signs into.

---

## PART 2 — Test it as a website first

1. From this folder, run a local server: `npx serve www` (or open `www/index.html` directly in a browser for a quick check, though some features need a real server).
2. Create an account, add some priorities, then open the same URL in a different browser (or incognito window) and sign in — your data should show up there too. That confirms sync is working.
3. When ready to give it a real address, deploy the `www` folder to **Vercel** or **Netlify** (both free, both take about 5 minutes — drag-and-drop the folder on their dashboard).

---

## PART 3 — Turn it into a real Android app

### Step 1: Install the tools
On your computer, with Node.js installed, run inside this project folder:
```
npm install
npx cap init KingdomOS com.yourname.kingdomos --web-dir=www
npx cap add android
npx cap sync
```
(Replace `com.yourname.kingdomos` with your own reverse-domain style ID — this becomes your app's permanent identity in the store, so pick it once and keep it.)

### Step 2: Open and run in Android Studio
`npx cap open android` — opens Android Studio (free, runs on Windows/Mac/Linux). From here you can run the app on an emulator or a real Android phone plugged into your computer.

### Step 3: Submit to Google Play
Since you already have a Google Play Developer account:
1. In Android Studio: Build → Generate Signed Bundle/APK, and follow the prompts (you'll create a signing key the first time — keep this file and its password safe, you'll need it for every future update).
2. Go to https://play.google.com/console, create a new app entry, and upload the signed bundle.
3. Fill in the store listing (description, screenshots, privacy policy URL — see Part 5 below).
4. Submit for review — usually same-day to a couple days.

---

## PART 4 — Desktop app (Windows/Mac/Linux)

Once the web version is solid, wrapping it for desktop uses **Tauri** (lightweight) or **Electron** (bigger but more common) — same idea as Capacitor, just targeting desktop instead of mobile. Ask me when you're ready for this step and I'll set it up the same way, reusing this same `www` folder.

---

## PART 5 — Before you submit to Google Play

Google requires a **privacy policy URL** in your store listing, since the app collects email/password and personal schedule data. I can draft this with you — it just needs to live at a public URL (a simple page on your Vercel/Netlify deploy works fine).

---

## What to do if something breaks

- **"Cloud sync not configured yet" message**: You haven't replaced the `SUPABASE_URL`/`SUPABASE_ANON_KEY` placeholders yet (Part 1, Step 4).
- **Data not syncing between devices**: Make sure you're signed into the *same* account on both, and check the browser console for errors.
- **Capacitor commands fail**: Make sure you ran `npm install` first in this folder, and that Node.js is installed (`node -v` should show a version number).
