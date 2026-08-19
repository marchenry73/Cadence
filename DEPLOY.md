# Deploying Cadence

Cadence is already live at **https://marchenry73.github.io/Cadence/** via GitHub Pages —
not Vercel (an earlier version of this doc described a Vercel setup that was never
actually used; ignore any mention of it elsewhere).

---

## How a deploy happens

Every push to `main` triggers `.github/workflows/pages.yml`, which publishes the whole
`www/` folder to GitHub Pages automatically — typically live within a minute or two.
There is no manual upload step. `git push`, then check the Actions tab if you want to
watch it happen.

The landing page is at `/welcome/`; the app itself is at the root (`/`) — Capacitor's
`server.url` in `capacitor.config.json` points the Android app straight at that root
URL, so it must keep serving the sign-in screen, not the landing page.

---

## Building the Android APK

The web app and the Android app are the same code — Capacitor just wraps the live site
in a native shell. To produce an installable APK:

```
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`.

**If the build fails with an `AccessDeniedException` or "unable to delete directory"
error inside `android/app/build/`:** this project lives inside a OneDrive-synced
folder, and OneDrive locks files while Gradle is trying to write/delete them. Either
pause OneDrive sync during the build, or build from a copy of the project outside any
synced folder (e.g. a plain temp directory) and copy the resulting APK back.

After a successful build, two places need the new file, both by simple overwrite (same
filename every time, so the links below never change):

1. `www/downloads/cadence-latest.apk` in this repo, then commit and push — this is what
   `https://marchenry73.github.io/Cadence/downloads/cadence-latest.apk` serves.
2. `G:\My Drive\Professional Documents\Projects\Cadence\cadence-latest.apk` — Google
   Drive Desktop syncs this automatically, no manual upload needed.

**Also bump three version numbers together**, or the update-checker and Android's own
update mechanism will disagree with each other:
- `www/js/config.js` → `CONFIG.version`
- `www/version.json` → `version` (this is what the in-app "Update available" banner
  actually compares against — it's fetched fresh, never cached)
- `android/app/build.gradle` → `versionCode` (must increase by at least 1) and
  `versionName`. Android uses `versionCode` — not `versionName`, not
  `CONFIG.version` — to decide whether a new APK counts as an update; forgetting this
  one means people can't install the new build over the old one.

This build is **debug-signed**, fine for sideloading or handing to testers. A Play
Store submission needs a proper release signing key — a separate, one-time step (see
`README.md` Part 3 for the general shape of it) not yet set up on this project.

---

## Database changes

Run new `supabase-schema-*.sql` files in the Supabase SQL Editor:
https://supabase.com/dashboard/project/eznsmotrmzeryduwkuuf/sql/new

**Known gap:** the core tables (`categories`, `routines`, `events`, `tasks`, `goals`,
`milestones`, `checkins`, `activity`, `prefs`) were created directly in the SQL Editor
early on and were never captured as a migration file here — so the live schema and its
RLS policies can't currently be reviewed or rebuilt from this repo. `dump-live-schema.sql`
has a ready-to-run query for pulling the real structure back out; run it and check the
result in as a baseline migration when there's a spare few minutes.

---

## Before charging anyone

- **Privacy policy and terms** — required by app stores and expected by business buyers
- **Billing** (Stripe) — currently no way to take payment
- See `GAP-ANALYSIS.md` for the full list of what's missing before this is sellable
