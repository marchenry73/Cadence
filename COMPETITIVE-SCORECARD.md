# Cadence vs. the premium calendar field

A scorecard, written 2026-09-07, after three research passes over
Fantastical, Notion Calendar (formerly Cron), Amie, Structured, Sunsama,
Motion, Google Calendar and Apple Calendar.

## How to read this, and what it is worth

Two very different kinds of number appear below and they should not be
trusted equally.

**Cadence's figures are measured.** Every one comes from instrumenting a
running build: sampling colours onto a canvas so the browser resolves
`oklab()` and `color-mix()` to real sRGB bytes, reading `scrollWidth`
against `clientWidth` on every text-bearing element, hit-testing tap targets
at named coordinates, and enumerating computed `font-size` across both themes
and all six routes. Where a figure is asserted here, it was observed, not
intended. That distinction earned its keep: reading the stylesheet said the
type scale was clean while three sizes were still off it, hidden in inline
`style` attributes and a browser default on `<button>`.

**The competitors' figures come mostly from documentation and from direct
pixel inspection of vendor screenshots.** That is good evidence for what a
vendor chooses to show and weaker evidence for edge cases they would rather
not photograph — nobody markets a screenshot of their calendar failing.

Rows are marked **[M]** measured in Cadence, **[V]** verified in a competitor
source, **[?]** searched for and not found.

---

## 1. Dense overlap: the sharpest comparison in the document

Lead with this, because it is where the evidence is strongest and least
flattering to the field.

**Three separate premium calendars are confirmed to shrink overlapping events
without any floor.**

- **Google Calendar's** day and week grid divides width equally among every
  event overlapping at that moment, scaling continuously as concurrency
  rises, with no cap **[V]**. Its *month* view does collapse to a "N more"
  link at roughly three events per cell **[V]** — so the mechanism exists in
  the product and simply is not applied to the time grid.
- **Fantastical** splits into side-by-side lanes and, at density, truncates
  titles to single characters. Directly observed in its own App Store
  screenshots: blocks reading `1…`, `3:…`, `O…` **[V]**. Flexibits documents
  a workaround — hold Shift+Control and hover to expand the overlapping items
  so they become readable **[V]**. A documented workaround is an admission
  that the default state is not readable.
- **Notion Calendar** lane-splits proportionally, and no "+N" collapse was
  found at any density in available material **[V]**.

**Apple** renders simultaneous events in side-by-side columns and **its own
users report the behaviour as inconsistent [V]** — two events at the same
start sometimes split, sometimes fully occlude one another, with no setting
and no visible pattern. One Apple Community thread calls it arbitrary.

**Cadence enforces an explicit floor: no block is ever drawn narrower than
56px, the width a title needs to read [M].** Above it, lanes split normally.
Below it, the surplus collapses behind a "+N" chip that opens a sheet listing
the whole pile. Verified across seven data scenarios at 320 / 375 / 390 /
1280: **zero blocks below the floor in any of them** — where the same
scenarios previously produced 44px and 50px blocks, and a 63px block rendered
"Design critique" as "Desig / n critiq…".

**Verdict: ahead, and this one is not hedged.** Three competitors shrink
without limit, a fourth is called arbitrary by its own users, and one of them
ships a keyboard workaround for the resulting illegibility. Cadence refuses
to draw what it has measured as unreadable, and the collapse chip is the same
idea Google already ships one view away.

The honest caveat: an enforced floor trades completeness for legibility. Four
blocks plus a chip tells you less at a glance than five slivers would, *if*
you could read five slivers. Fantastical's `O…` is the evidence you cannot.

---

## 2. Where the field has a standard

### The "now" indicator — a majority pattern, not a convention
Worth stating precisely, because an earlier draft of this document called it
a convention and that was too strong. The field splits **four ways** **[V]**:

| Treatment | Apps |
| --- | --- |
| Red line + round dot | Google, Apple, Fantastical |
| Red line + rectangular pill tab | Amie |
| Neutral black/white line, no marker | Notion Calendar |
| Black timeline bar, no line | Motion |

Red-line-with-dot is the majority at three of six, and Apple's red is
hardcoded and not user-recolourable **[V]**.

Cadence draws the majority form, then extends it for the multi-day case: in
week view the horizon renders at **two strengths** — full accent with a dot
on today's column, a 16% ghost across the other six. Measured: 1 full, 6
ghost **[M]**. The alternative is seven competing red stripes.

**Verdict: at parity on the majority form, ahead on the multi-day case.**

### Event colour derived systematically from one base hue
Cron's design changelog describes generating a colour family from each
calendar colour to tint ribbon, background, title, time and dimmed state
separately **[V]**. Amie runs a 15-hue by 9-step, 135-token system **[V]**.
Google ships 11 named event colours and 24 calendar colours **[V]**.

Fill philosophy splits: Fantastical and Notion Calendar both use rail plus a
lighter fill (Notion's tint the paler at roughly 10–15%); Amie is the outlier
with full-saturation pastel fills and no rail **[V]**.

Cadence derives everything live from one category hue: fill (`color-mix` at
14% light, 22% dark), text (a 50% / 56% mix toward a warm ink), and a 3px
left rail — squarely in the Fantastical/Notion camp, at the pale end **[M]**.

**Verdict: at parity with the best-documented practice.** Same mechanism,
computed in the browser rather than baked. Far fewer hues than Google, which
is a scope choice rather than an oversight.

### Tabular numerals in the time gutter
Notion Calendar uses `.monospacedDigit()` in its gutter specifically so the
time column aligns **[V]**. Cadence routes every numeral through IBM Plex
Mono, verified as actually loading rather than silently falling back **[M]**.

**Verdict: at parity.** Notion had the same idea first.

### Past events muted
Notion Calendar renders already-passed events in flat gray-blue against
vivid upcoming ones, independent of theme **[V]**.

Cadence re-derives fill and text from the category hue at reduced strength
rather than dropping opacity, and — the part not found anywhere else —
dims elapsed blocks **only while the day still has something ahead**, so a
finished day reads as finished rather than as washed out **[M]**.

**Verdict: at parity on the idea, ahead on the conditional.**

### Dark mode as a designed surface, not an inversion
Google **auto-lightens saturated event colours to pastel** in dark mode
rather than inverting **[V]**. Apple renders events **semi-transparent** so
overlapping ones remain mutually visible **[V]**.

Cadence re-tunes the derivation per theme: tint 14% to 22%, ink mix 50% to
56%, and the accent splits into three roles so the coral that works as a fill
under white ink is not the coral used as text on a bright page **[M]**. Zero
contrast failures in either theme **[M]**.

**Verdict: at parity.**

### Typography
Google moved to Google Sans Flex **[V]**. Apple uses SF Pro with automatic
optical-size switching at 20pt, and its own WWDC session cites Calendar
mixing weights within a screen for hierarchy **[V]**. Amie uses Inter; Notion
Calendar a fork of it, with roughly a 5:1 scale contrast **[V]**.

Cadence: three families with distinct jobs, and exactly **eight** sizes
rendering across both themes and all six routes **[M]**.

**Verdict: at parity on discipline.**

### Graceful degradation as space shrinks
Apple documents the clearest ladder: Details → Stacked → Compact → dots,
driven by view mode and system text size **[V]**, morphing continuously under
a pinch **[V]**. Fantastical drops location and the video icon first, then
most of the title **[V]**.

Cadence degrades on two axes: title lines clamp by block height (3 / 2 / 1),
lanes collapse to a chip by block width **[M]**.

**Verdict: at parity in kind, behind in reach.** Cadence's ladder is
automatic and correct; Apple's is also a gesture the user drives.

---

## 3. Where Cadence is behind

### Free time — Google is well ahead
An earlier draft claimed Cadence led here. It does not. **Google ships Focus
Time and Working Hours as first-class event types with their own colours,
renders non-working hours as diagonal grey striping, and turns availability
into a separate booking-page product [V].** Motion shades non-working hours
the same way and marks tentative work with dotted, lighter "ghost" blocks
**[V]**. Structured detects gaps and suggests what to put in them **[V]**.
Notion Calendar highlights open slots, but only inside an outbound
share-availability mode **[V]**. Fantastical, Amie and Apple: nothing found
**[V]/[?]**.

Cadence renders the gaps themselves as tappable pockets labelled with their
own duration — "2h free time", "7h free time", "4h 30m free time" — clamped
to waking hours so an empty day is not one 24-hour slab, and suppressed
entirely on a day with nothing on it **[M]**.

**Verdict: differentiated but behind on breadth.** Naming a gap by its
duration and making it the thing you tap to fill is genuinely distinct from
shading the hours around it. But Google covers working hours, focus
protection and external booking; Cadence covers one of the three.

### The rail carries a signal the fill already carries
Cron splits ribbon from background tint **[V]**. Sunsama spends its left
border on **provenance** — marking which calendar events began as tasks —
and its own public roadmap hosts users saying even that is too subtle
**[V]**. Notion Calendar encodes status in the block's edge and fill instead:
**dashed border for tentative, diagonal hatching for a declined or hold
slot** **[V]**.

Cadence's 3px rail repeats the category the fill already encodes **[M]**.

**Verdict: behind.** A free channel carrying a duplicate signal, on a problem
the field has publicly failed to solve. Notion's dashed/hatched treatment is
the most complete answer found and is worth copying outright.

### The empty day — Amie got there first
An earlier draft claimed nobody contests this. Wrong: **Amie shows a
dashed-outline card reading "Enjoy Your Tomorrow!" when a day's list is
exhausted [V]** — human microcopy rather than a blank void. Nobody else's
empty state could be verified **[?]**.

Cadence gives the empty day a state anchored at the start of the focus
window, naming the window and offering to plan it **[M]**.

**Verdict: at parity with the only competitor that has one**, and arguably
more useful, since Cadence's version offers the next action rather than a
sign-off. Amie's has more warmth.

### Density is user-controlled, but only just
An earlier draft claimed Cadence had no density control. Wrong: a Comfortable
/ Compact preference has always existed. What was true, and is now fixed, is
worse — **the week grid ignored it.** Today honoured the setting at 68px and
52px per hour; the week view, the densest surface in the app and the one
where it matters most, was pinned at 44 and never read it. Choosing Compact
changed one screen out of two. The week grid now honours it, measured at 56px
comfortable and 44px compact **[M]**.

Even so, two discrete steps behind a Settings screen is not Apple's pinch or
Sunsama's inline zoom buttons **[V]**.

**Verdict: behind.** The control exists and now reaches both screens, but it
is a preference, not a gesture.

### Overlap is only solved downstream
Notion Calendar's conflict avoidance and Sunsama's scheduling buffer both try
to stop dense overlaps existing **[V]**. Cadence renders collisions well and
does nothing to prevent them, though `suggest.js` already scores candidate
slots.

### Density-at-a-glance is missing entirely
Fantastical's year view shades every day on an olive-to-maroon busyness
gradient, and its DayTicker strip shows a diagonal dot cascade per day
**[V]**. Cadence has no equivalent overview of where the heavy days are.

### Elevation is unexamined
Amie's shadows are documented at 4% inner and 12% outer against a typical
10–20%, named as why its elevation feels almost invisible **[V]**. Cadence
has one `--shadow` token that has never been measured.

---

## 4. The short version

On what the field documents and reviewers notice — colour derivation, dark
mode, typographic discipline, tabular numerals, the now line — Cadence is at
parity, reached by measurement rather than taste.

On dense overlap it is ahead of the entire field on a specific, citable
weakness: Google, Fantastical and Notion Calendar all shrink without a floor,
Apple's behaviour is called arbitrary by its own users, and Fantastical ships
a keyboard workaround for the illegibility that results. Cadence refuses to
draw a block it has measured as unreadable.

It is behind on free-time breadth, on spending its left rail twice, on
density as a gesture rather than a preference, on any at-a-glance view of
where the busy days are, and on preventing collisions rather than surviving
them.

### Ranked next moves

1. **Give the rail a second job.** It repeats the fill today. Notion's
   dashed-border-for-tentative and hatched-fill-for-declined is a proven
   pattern; provenance is the one Sunsama's users are asking for out loud.
2. **Working hours as a rendered band.** Google and Motion both shade
   non-working hours. Cadence has a focus window in preferences and marks it
   only on the hour labels. Shading the grid outside it closes most of the
   free-time gap for very little work.
3. **Density as a gesture.** Pinch on the grid, mapped to the preference that
   now already reaches both screens.
4. **A busyness overview.** Fantastical's year heatmap is the reference;
   `dayLoad()` already computes the number this would need.
5. **Warn on conflicting create.** `suggest.js` scores slots already.
6. **Measure the shadow.** One token, never examined, against a competitor
   whose elevation numbers are deliberate and published.

### Where this document is weak

The competitor evidence leans on vendor screenshots, which show the state a
vendor chose to photograph. Amie's behaviour above two overlapping events is
undocumented; so is Fantastical's above three. Verdicts about what
competitors do at extreme density are therefore inferences from their
mechanism, not observations of it. Closing that properly means installing the
apps and building a deliberately overloaded day in each, which no amount of
searching substitutes for.

Three claims in earlier drafts of this file were wrong and are corrected
above: that Cadence had no density control, that it led on free time, and
that no competitor had an empty-day state. Each was overturned by better
evidence arriving after the claim was written.
