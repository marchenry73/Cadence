# Cadence — Feature Backlog

Parked ideas, not yet built. Add to this list as things come up.

---

## Calendar integration
Sync Cadence blocks into the calendar people already live in.

- **Google Calendar** — two-way sync (Cadence routines appear in Google; Google events appear as busy time in Cadence). Requires Google OAuth + Calendar API, and Google verification review if it goes public.
- **Outlook / Microsoft 365** — same idea via Microsoft Graph API. Important for business customers.
- **Apple Calendar** — usually handled via subscribing to an .ics feed rather than a true API.
- **.ics export/subscribe** — much simpler first step. Generate a live calendar feed URL per user that any calendar app can subscribe to. Read-only, but no OAuth, no app review, works everywhere. *Recommended as the v1 of this feature.*

**Note:** two-way sync is significantly harder than it sounds — conflict resolution (what wins when both sides change?), deleted events, recurring-event edge cases. Start read-only.

---

## Alarms & notifications
Remind people before blocks start.

- **Web push notifications** — works in browsers and on Android. Needs a service worker (we have a stub already) plus a push service. Free tier of Supabase can't schedule these on its own; needs a scheduled job (Supabase Edge Functions + cron, or a small external worker).
- **Native Android notifications** — via Capacitor's Local Notifications plugin. Works offline, more reliable than web push, no server needed for simple "remind me 10 min before" cases. *Recommended first, since Android is the near-term target.*
- **Email reminders** — daily agenda email each morning. Easiest of the three; can run off a scheduled function.
- **Per-block reminder settings** — let users set lead time (5/15/30 min) per routine, not one global setting.

---

## Goals & vision board

Longer-horizon planning, distinct from tasks (days) and routines (weeks).

- **Goal tiers** — short-term (weeks/months), medium-term (this year), and life goals (multi-year). Each tier displayed differently; life goals shouldn't sit in the same list as "call the dentist."
- **Goal → steps breakdown** — every goal decomposes into milestones, and milestones into actual tasks that land in the existing task list. The link matters: a task should be able to say "this moves Goal X forward," and progress should roll up automatically.
- **Vision board** — visual board with images, quotes, and target dates. Users upload their own images (needs Supabase Storage, not just the database). Should feel like a board, not a spreadsheet.
- **Check-ins** — scheduled prompts asking how a goal is progressing. Weekly for short-term, monthly or quarterly for life goals. Store the check-in history so people can see momentum over time, not just current status.
- **Progress signals** — surface stalled goals ("no activity in 3 weeks") rather than only showing completion percentages, since long-horizon goals mostly fail through neglect rather than difficulty.

**Design note:** the risk with goal features is that they become a graveyard people stop opening. The check-in cadence and the link between goals and daily tasks are what keep them alive — build those before the vision board visuals.

---

## Voice

- **Spoken reminders** — read out upcoming blocks and check-ins aloud, not just a notification chime. Browser Web Speech API handles this free; Capacitor has a text-to-speech plugin for Android.
- **Voice input** — speak a task or block instead of typing it ("add gym Thursday at six"). Needs speech-to-text plus parsing of the spoken phrase into structured data.
- **Hands-free morning brief** — read out today's schedule, open time, and top tasks. Useful for anyone driving to a job site.

**Note:** voice output is easy and cheap. Voice *input* with natural-language parsing is meaningfully harder, and overlaps with the AI assistant below.

---

## Mini AI assistant

An in-app assistant that knows the user's schedule and goals.

- **Natural-language scheduling** — "move my gym block to Thursday," "when do I have two free hours this week?"
- **Planning help** — break a goal into steps, suggest which tasks to drop when the week is overloaded.
- **Weekly review** — summarize where time went and flag drift from stated goals.
- **Check-in conversations** — a warmer version of the goal check-in, asking follow-up questions rather than showing a form.

**Cost note:** this is the one feature with real per-use cost — every AI response is a paid API call. Needs to be priced into whatever subscription tier includes it, or offered as an add-on. Also needs a backend proxy so the API key is never in the app itself (a Supabase Edge Function works).

---

## Other parked items

- **Billing / subscriptions** (Stripe) — needed before charging companies. Requires webhook handling and a plan/seat model.
- **Admin role** — workspace owners able to view/edit member schedules, not just view.
- **Desktop app** (Tauri or Electron) — reuses the same `www` folder.
- **Recurring task templates** — tasks that regenerate weekly, distinct from routines.
- **Time tracking vs. plan** — compare what was scheduled against what actually happened.

---

## Build order suggestion

1. Ship Android to Play Store (current focus)
2. Local notifications (Capacitor) — highest value, lowest complexity
3. Voice output for reminders — small addition once notifications exist
4. Goals & steps (the structure, linked to tasks) — before the vision board visuals
5. .ics calendar feed — gets Cadence into everyone's existing calendar
6. Goal check-ins — needs the scheduled-jobs plumbing that notifications establish
7. Stripe billing — before selling to companies
8. Mini AI assistant — has per-use cost, so it needs billing in place first
9. Vision board (image uploads, Supabase Storage)
10. Full Google/Outlook two-way sync — the heavy one, do last
