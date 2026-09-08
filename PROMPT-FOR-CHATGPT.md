# Prompt for ChatGPT — Cadence design critique

Paste everything below the line into ChatGPT. Attach 3–5 screenshots of the
live app (https://marchenry73.github.io/Cadence/) — Today, Calendar→Week,
Calendar→Month, and the same two in dark mode. Screenshots matter more than
the words; without them you will get generic advice.

---

You are a senior product designer who has shipped calendar and planning
software. I want a specific, critical design review — not encouragement.

## The product

Cadence is a time-blocking planner that also works as a calendar. It is a
vanilla-JS PWA (no framework), wrapped in Capacitor for Android, backed by
Supabase, and it works fully offline.

Its position is deliberately NOT "a better Google Calendar". Google
Calendar records what you agreed to. Cadence is for deciding what to do
with your time. Its distinguishing features are:

- **Routines** — recurring weekly commitments that generate blocks
- **Goals** with milestones, surfaced on the home screen
- **"Find me a time"** — suggests when to do a task by scoring real open
  slots against focus hours, time-of-day fit, due date and elbow room
- **Free time drawn as an object** — gaps between commitments render as
  visible, tappable fields with their duration, not as blank grid
- **Two-way Google Calendar sync**, so it complements rather than replaces
  the calendar your colleagues use

## The design system (do not propose replacing this)

Identity is called "Daybreak" — dawn and dusk as one identity, not two
themes bolted together.

- Light ground `#F6EEE4` warm parchment, surface `#FFFCF7`
- Dark ground `#1C1620` deep plum, surface `#241D29`
- Accent coral `#E8604A`, lifting to a brighter coral in dark mode
- Display face **Instrument Sans**, body **Manrope**, numerals **IBM Plex Mono**
- Category palette: 8 muted, warm-leaning hues (not the saturated system
  palette most calendars use)

Events use one anatomy everywhere: a ~14–22% tint of the category colour,
a saturated 3px left rail drawn inside the block so it shares the radius,
and title text in a *darkened version of that same hue* rather than black.
Grid hour rules sit near 1.05:1 contrast so they read as paper texture;
day rules are roughly 1.6× stronger.

## What has already been done — do not re-suggest these

- Overlapping events pack into side-by-side lanes, clustered so one 9am
  conflict does not shrink an unrelated 5pm block; below a legibility floor
  they shingle instead of shrinking to slivers
- Current-time line spans the week at two strengths — full accent on
  today, a 16% ghost on other days — with the live time replacing the
  colliding hour label in the gutter
- Grids open on the live part of the day, never at midnight
- Month cells show event titles plus a load bar, with a day-detail list
- Agenda groups by relative day (Today / Tomorrow / "in 2d") with per-day
  totals; finished blocks dim and strike through
- Universal search across events, routines, tasks and goals
- WCAG AA contrast verified in both themes; visible focus rings; 44px
  touch targets; reduced-motion honoured
- Motion: blocks rise in with a capped stagger, the just-saved block
  pulses its rail once, the now-line dot breathes slowly
- Mobile: week grid scroll-snaps with a 104px column floor, month falls
  back to dots plus a detail list

## Known weak spots — I am most interested in these

1. **Density at a 3-way conflict.** In a 90px week column, three
   concurrent meetings shingle to ~62px each. Titles still truncate. Is
   shingling the right call, or should the week view do something else
   entirely at that density?
2. **The whole day dims when it is over.** Past blocks drop to 55% opacity
   and desaturate. Late in the evening every block on Today is dimmed, so
   the screen reads as washed out. Is per-block dimming wrong once the
   whole day is past?
3. **Free-time fields.** They are a dotted field with an uppercase
   duration label. Distinctive, but do they compete with real events?
4. **Typographic hierarchy on the Today screen** — hero panel, goal tiles,
   task list. Does it read as one system?
5. **Month view.** Better than dots, but is it genuinely good?

## What I want back

1. The five things that most undermine the impression of a premium
   product, ranked, each with the specific fix — actual values (px, hex,
   weight, ratio), not adjectives.
2. Anywhere the design is *incoherent* rather than merely imperfect: two
   components solving the same problem differently.
3. One thing to delete. Interfaces improve more by removal than addition,
   and I would rather hear what is unnecessary than what is missing.
4. An honest 1–10 against Apple Calendar, Fantastical and Notion Calendar
   on: visual polish, grid quality, typography, event design, month view,
   dark mode. Do not be generous.

Constraints for any suggestion:
- No new gradients, glassmorphism, or decorative shadows
- Every visual element must carry information
- Must survive both themes and pass WCAG AA
- Vanilla CSS, no framework
