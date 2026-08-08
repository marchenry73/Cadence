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

## Table stakes we're MISSING (users will expect these)

Ordered by how badly their absence hurts.

| Gap | Why it matters | Effort |
|---|---|---|
| **Reminders / notifications** | The #1 reason people use a calendar at all. Currently Cadence can't tell you anything is happening. | Medium |
| **Drag to reschedule** | Every calendar has it. Editing via a form feels dated the moment someone compares. | Medium |
| **Month view** | Week + day only right now. Month is how people think about anything beyond ~10 days. | Low |
| **Search** | No way to find "that block I made last month." Painful past a few weeks of data. | Low |
| **Recurring end dates / exceptions** | Routines run forever with no "until Dec 31" and no "skip this one week." Real schedules have exceptions. | Low–Medium |
| **Time zones** | Any team spanning zones breaks immediately. Blocking issue for selling to distributed companies. | Medium |
| **Multi-day / all-day events** | Vacations, conferences, deadlines. Currently impossible to represent. | Medium |
| **Calendar import (.ics / Google)** | People won't retype their existing calendar. This is the #1 adoption blocker for switching tools. | Medium–High |
| **Undo** | Deleting a routine is instant and permanent. Every mature app has undo. | Low |
| **Keyboard shortcuts** | Power users judge productivity tools on this within five minutes. | Low |

---

## Goal-app features we're missing

Cadence currently has no goals layer at all.

| Gap | Why it matters | Effort |
|---|---|---|
| **Goals with tiers** | Short-term / this year / life goals. The core ask. | Medium |
| **Goal → milestone → task chain** | The thing that makes goals stick. Progress must roll up automatically. | Medium |
| **Streaks / habit tracking** | Habitica and Strides built entire businesses on this. Strong retention driver. | Low–Medium |
| **Check-in prompts** | Scheduled reflection. Without it, goals rot silently. | Medium (needs scheduled jobs) |
| **Progress history** | Charts over weeks/months, not just current %. | Low |
| **Vision board** | Images + target dates. Emotional pull, drives daily opens. | Medium (needs file storage) |

---

## Business features missing (blocking sales to companies)

| Gap | Why it matters |
|---|---|
| **Billing / subscriptions** | Cannot charge anyone today. |
| **Admin controls** | Owners can't manage members, reassign, or remove people. |
| **Roles & permissions** | Everyone in a workspace is effectively equal. |
| **Audit log** | Enterprise buyers ask for this in security review. |
| **Data export per workspace** | GDPR/CCPA requests and customer trust. |
| **Password reset** | *Currently missing entirely — users who forget a password are locked out permanently.* |
| **Email verification flow polish** | Confirmation emails currently use Supabase defaults, unbranded. |

**Note:** password reset is arguably the most urgent item on this entire document. It's small
work and its absence is a hard failure for real users.

---

## Recommended build order

Grouped into shippable phases rather than a flat list.

**Phase 1 — Don't embarrass yourself (do before any real users)**
1. Password reset
2. Search
3. Undo on delete
4. Month view
5. Recurring end dates + single-occurrence skip

**Phase 2 — Meet expectations**
6. Reminders / notifications (web push + Android local)
7. Drag to reschedule
8. All-day and multi-day events
9. Time zone support
10. Keyboard shortcuts

**Phase 3 — The reason people choose Cadence**
11. Goals: tiers, milestones, task linkage
12. Streaks and check-ins
13. Progress history charts
14. Voice reminders

**Phase 4 — Make money**
15. Stripe billing and plan tiers
16. Admin controls and roles
17. Calendar import (.ics, then Google/Outlook)

**Phase 5 — Differentiate**
18. Mini AI assistant
19. Vision board
20. Full two-way calendar sync

---

## Honest assessment

Cadence today is a solid **prototype with two genuinely novel ideas** (gap-filling and
live team availability). It is not yet a product a company would pay for, mostly because
of Phase 1 and the missing billing.

The fastest path to a sellable product is *not* adding more features — it's finishing
Phase 1, adding reminders, and putting billing in. A tool that does five things reliably
sells better than one that does twenty things partially.
