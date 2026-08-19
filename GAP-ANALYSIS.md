# Cadence — Feature Gap Analysis

Comparing Cadence against what established calendar apps (Google Calendar, Outlook,
Fantastical, Notion Calendar, Motion, Reclaim, Sunsama) and goal apps (Todoist,
Things, ClickUp, Monday, Habitica, Strides, Notion) actually ship.

---

## What Cadence already does well

These are genuine differentiators, not table stakes:

- **Open-gap detection** — most calendars show what's booked; few compute what's *free* and suggest what fits. Motion and Reclaim do this and charge $30+/user/month for it.
- **Routines as first-class objects** — separate from one-off events. Most calendars bury recurrence inside individual events, which makes "what does my normal week look like" hard to answer.
- **Live team availability** — computed from schedules rather than manual status. Slack/Teams show presence; almost nothing shows *why* someone is unavailable and until when.
- **Importance × urgency ranking** — most task apps use a single flat priority field.

---

## Table stakes: status (this section had gone stale — several "missing" items below had actually shipped)

Ordered by how badly the remaining gaps hurt.

| Gap | Status | Why it matters | Effort |
|---|---|---|---|
| **Search** | Still missing | No way to find "that block I made last month." Painful past a few weeks of data. | Low |
| **Recurring end dates** | Partial — single-occurrence skip exists (`routines.skip_dates`); no "series ends on this date" | Routines run forever with no "until Dec 31." | Low–Medium |
| **Time zones** | Still missing | Any team spanning zones breaks immediately. Blocking issue for selling to distributed companies. | Medium |
| **Multi-day / all-day events** | Still missing | Vacations, conferences, deadlines. Currently impossible to represent. | Medium |
| **Undo** | Still missing | Deleting a routine is instant and permanent. Every mature app has undo. | Low |
| **Keyboard shortcuts** | Still missing | Power users judge productivity tools on this within five minutes. | Low |
| ~~Reminders / notifications~~ | **Shipped** — `notify.js`: local reminders, tone selection, native notifications, task-shade | | |
| ~~Drag to reschedule~~ | **Shipped** — both Today's spine and the calendar week view support it | | |
| ~~Month view~~ | **Shipped** — `view.calendar.js` week/month/agenda modes | | |
| ~~Calendar import~~ | **Shipped** — both .ics (`ics.js`) and Google Calendar (`google.js`) | | |

---

## Goal-app features: status

The goals layer shipped since this doc was first written — most of this section was
wrong. What's actually still missing:

| Gap | Status | Why it matters | Effort |
|---|---|---|---|
| **Check-in prompts** | Partial — manual "Add check-in" exists; nothing *scheduled* nudges you to do it | Without a prompt, goals rot silently between check-ins. | Medium (needs scheduled jobs) |
| **Progress history** | Still missing | Charts over weeks/months, not just current %. | Low |
| **Vision board** | Still missing | Images + target dates. Emotional pull, drives daily opens. | Medium (needs file storage) |
| ~~Goals with tiers~~ | **Shipped** — quarter / year / life horizons | | |
| ~~Goal → milestone chain~~ | **Shipped** — milestones roll up into goal progress automatically | | |
| ~~Streaks / habit tracking~~ | **Shipped** — `gamify.js`: streaks, badges, monthly challenge, weekly leaderboard | | |

---

## Business features: status (blocking sales to companies)

| Gap | Status | Why it matters |
|---|---|---|
| **Billing / subscriptions** | Still missing | Cannot charge anyone today. |
| **Audit log** | Still missing | Enterprise buyers ask for this in security review. |
| **Data export per workspace** | Still missing | GDPR/CCPA requests and customer trust. |
| **Email verification flow polish** | Still missing | Confirmation emails currently use Supabase defaults, unbranded. |
| ~~Password reset~~ | **Shipped** — "Forgot password" on the sign-in screen, `resetPassword()` in `auth.js` | |
| ~~Admin controls / roles~~ | **Shipped** — owner/admin/member/viewer roles, `setRole`/`removeMember` in `org.js` + `view.team.js` | |

Also new since this doc was written and not previously anticipated: **guest mode** ("Continue
as guest," nothing persisted) and an Android APK with an in-app update checker. Neither was on
this list because neither was being considered as a Cadence feature at the time — both help
adoption (guest mode removes signup friction for evaluation; the APK+updater gives Android
users a real distribution path without waiting on a Play Store submission), even though
neither directly moves the "sellable to companies" needle this document is scoped to.

---

## Recommended build order (revised — most of Phases 1–4 already shipped)

What's actually left, grouped into shippable phases.

**Phase 1 — Don't embarrass yourself**
1. Search
2. Undo on delete
3. Recurring series end date (skip-a-single-occurrence already works)

**Phase 2 — Meet expectations**
4. All-day and multi-day events
5. Time zone support
6. Keyboard shortcuts

**Phase 3 — The reason people choose Cadence**
7. Scheduled check-in prompts (manual check-ins already work)
8. Progress history charts
9. Voice reminders

**Phase 4 — Make money**
10. Stripe billing and plan tiers
11. Audit log
12. Data export per workspace

**Phase 5 — Differentiate**
13. Mini AI assistant
14. Vision board
15. Full two-way calendar sync

---

## Honest assessment

This assessment is overdue for an update: Cadence has moved well past "prototype." Reminders,
drag-to-reschedule, month view, calendar import (.ics + Google), password reset, the full goals
layer (tiers, milestones, streaks, check-ins), roles/admin controls, guest mode, and an Android
distribution path with in-app updates are all shipped and working. The two original
differentiators (gap-filling, live team availability) are still the most novel ideas here, but
they're no longer standing alone.

What's actually blocking a sale to a company today is narrower than this document used to
suggest: **billing** (there's no way to charge anyone) and the smaller Phase 1/2 items above.
Nothing on the current list is a hard failure for real individual users the way missing
password reset used to be.
