# Cadence vs. the premium calendar field

A scorecard, written 2026-09-07, after a research pass over Fantastical,
Notion Calendar (formerly Cron), Amie, Structured, Sunsama, Google Calendar
and Apple Calendar.

## How to read this, and what it is worth

Two very different kinds of number appear below and they should not be
trusted equally.

**Cadence's figures are measured.** Every one comes from instrumenting a
running build: sampling colours onto a canvas so the browser resolves
`oklab()` and `color-mix()` to real sRGB bytes, reading `scrollWidth`
against `clientWidth` on every text-bearing element, hit-testing tap targets
at specific coordinates, and enumerating computed `font-size` across both
themes and all six routes. Where a figure is asserted here, it was observed,
not intended.

**The competitors' figures mostly are not, and several do not exist.** The
research pass looked hard and came back honest: for **not one** of the seven
apps could it verify the overlap threshold at which a calendar stops
splitting lanes and starts collapsing to a "+N" chip. Typography specifics
were verifiable for exactly one app (Amie). Empty-day design was verifiable
for none. The "now" line was verifiable for one (Google Calendar: a red line
with a round dot).

So the honest shape of this document is not a ten-row table of scores. It is
three lists: where the field has a documented standard and Cadence can be
judged against it; where the field has no visible answer at all, which is
where a small app can win; and where Cadence is behind.

Rows are marked **[M]** for measured in Cadence, **[V]** for verified in a
competitor source, **[?]** for could not verify.

---

## 1. Where the field has a standard, and how Cadence measures against it

### Event colour derived systematically from one base hue
The strongest confirmed pattern in the whole field. Cron's own design
changelog describes generating a family of colours from each calendar colour
to tint the ribbon, background, title, time and dimmed state separately
**[V]**. Amie runs a 15-hue by 9-step token system **[V]**.

Cadence does the same thing, in the browser rather than in a build step: one
category hue drives the fill (`color-mix` at 14% in light, 22% in dark), the
text (a 50% / 56% mix toward a warm ink), and the 3px left rail, with the
past state re-deriving the fill at 55% of the tint rather than dropping
opacity **[M]**.

**Verdict: at parity with the best-documented practice in the field.** The
mechanism is the same and the derivation is live rather than baked.

### Left-edge rail as a signal distinct from the fill
Cron uses a ribbon plus a tinted background; Sunsama uses a solid left border
specifically to mark that a calendar event originated as a task **[V]**.

Cadence has the rail (`inset 3px 0 0` in the category hue, plus a 1px
surface separator) but spends it on **category**, the same thing the fill
already encodes **[M]**.

**Verdict: behind.** The rail is doing a job the fill already does. Sunsama
spends the same pixels on provenance. This is a free channel currently
carrying a duplicate signal.

### The "now" indicator
Only verifiable for Google Calendar: a red horizontal line with a round dot
at one end **[V]**.

Cadence draws the same shape, and then does something none of the seven were
confirmed to do: in week view it renders the horizon at **two strengths** —
full accent with a dot on today's column, and a 16% ghost across the other
six, so you get an exact reading on today plus a scan line for the rest,
instead of seven competing red stripes. Measured: 1 full, 6 ghost **[M]**.

**Verdict: at parity on the standard, plausibly ahead on the multi-day case.**
Stated cautiously, because no competitor's multi-day behaviour was verified.

### Typography
Verifiable for one competitor. Amie: Inter variable, body 16px / 1.75,
h2 and h3 both 20px separated only by weight **[V]**.

Cadence: three families, each with a job — Instrument Sans for display,
Manrope for body, IBM Plex Mono for every numeral — and exactly **eight**
sizes rendering across both themes and all six routes, verified by
enumerating computed styles rather than by reading the stylesheet **[M]**.
That distinction matters: reading the stylesheet said "all on scale" while
three sizes were still off it, hidden in inline `style` attributes and a UA
default on `<button>`.

**Verdict: at parity or slightly ahead on discipline**, with the caveat that
there is almost nothing to compare against. Amie's h2/h3 sharing one size is
the same instinct as an eight-step scale.

### Dark mode as a first-class surface
Praised as a design feature for Cron and treated as the default framing for
Structured **[V]**.

Cadence ships one identity across both, not two themes bolted together: the
same coral, the same warm neutrals, with tint percentages and the ink mix
re-tuned per theme **[M]**. Zero contrast failures in either **[M]**.

**Verdict: at parity.**

---

## 2. Where the field has no visible answer

These are the openings. In each case the research looked specifically and
found nothing to compare against — which is not proof the competitors do
nothing, but does mean it is not something they talk about or that reviewers
notice.

### Dense-overlap behaviour with a stated, enforced floor
**No source gave a concrete overlap threshold for any of the seven apps [?].**
The commonly cited "equal width, maximum available" algorithm is associated
with Google Calendar but was not confirmed as what Google ships.

Cadence now enforces an explicit invariant: **no block is ever drawn narrower
than 56px**, the width a title needs to read. Above that, lanes split
normally; below it, the surplus collapses behind a "+N" chip that opens a
sheet. Verified across seven data scenarios at 320 / 375 / 390 / 1280:
**zero blocks below the floor** in any of them, where before the same
scenarios produced blocks of 44px and 50px **[M]**.

**Verdict: ahead, with a caveat.** Ahead because the rule is explicit,
enforced and tested rather than emergent. The caveat is that "ahead of what
could not be verified" is a weaker claim than it sounds.

### Free time as a thing you can see and act on
Only Structured has a confirmed free-time feature, and it is gap *detection
with suggestions*, not a rendered gap **[V]**. Sunsama's buffer is a
scheduling parameter, not a visual **[V]**. For the other five: nothing
found **[?]**.

Cadence renders the gaps themselves as tappable pockets labelled with their
own duration — "2h free time", "7h free time", "4h 30m free time" — clamped
to waking hours so an empty day does not become one 24-hour slab, and
suppressed entirely on a day with nothing on it **[M]**.

**Verdict: ahead.** This is the clearest differentiator in the product.
Structured is the only app with a comparable idea and it expresses it as a
suggestion engine rather than as something visible in the grid.

### The empty day
**Not verifiable for a single one of the seven apps [?].** The likeliest
reading is that most of them render a blank grid and leave it there.

Cadence gives the empty day a real state, anchored at the start of the focus
window, naming the window and offering to plan it **[M]**.

**Verdict: probably ahead, on a dimension nobody appears to be contesting.**

### Past events dimmed by contrast rather than opacity
Nothing found in the field **[?]**.

Cadence re-derives the fill and text from the category hue at reduced
strength instead of dropping opacity, and only dims elapsed blocks **while
the day still has something ahead** — so a wholly finished day reads as
finished rather than as washed out **[M]**.

**Verdict: a genuinely distinctive detail.** The conditional is the good
part; the blanket-opacity version is what most implementations do.

---

## 3. Where Cadence is behind

### The rail carries a duplicate signal
Covered above. Sunsama spends the same 3px on task-versus-event provenance,
and its own public roadmap hosts users complaining even that is too subtle
**[V]** — which means the problem is live and unsolved across the field, and
therefore worth winning rather than matching.

### Density is a fixed rule; the field is moving to user-controlled density
Apple morphs continuously between three information densities under one
pinch gesture; Sunsama ships the same idea as discrete zoom buttons **[V]**.
Cadence has a fixed `pph` with no zoom **[M]**.

This is the most substantial gap in the scorecard. Cadence decides density
*for* the user, correctly and defensibly, but decides it alone.

### Overlap is only solved downstream
Notion Calendar's conflict avoidance and Sunsama's scheduling buffer both
try to stop dense overlaps from existing **[V]**. Cadence renders collisions
well and does nothing to prevent them — although `suggest.js` scores
candidate slots and is the obvious place to hang this.

### Elevation and shadow are unexamined
Amie's shadows are documented at 4% inner and 12% outer, against a typical
10–20%, and the teardown names this as why its elevation feels almost
invisible **[V]**. Cadence has a single `--shadow` token that has never been
measured or tuned.

### No verified answer on motion
Nothing was verifiable about competitors' motion design **[?]**, and
Cadence's own entrance animations are transform-only, deliberately, after an
opacity-based version rendered every block invisible when the document was
backgrounded. Reduced-motion is honoured with a blanket rule **[M]**. This is
correct but not yet a strength.

---

## 4. The short version

Cadence's real position is not "a small app catching up to Fantastical". It
is narrower and more interesting than that.

On the dimensions the field documents and reviewers notice — systematic
colour derivation, dark mode, typographic discipline, the now line — Cadence
is at parity, and it got there by measurement rather than by taste.

On the dimensions nobody in the field appears to have answered — the
legibility floor under dense overlap, free time as a visible object, the
empty day, past events dimmed by contrast — Cadence has answers, and they
are enforced and tested rather than asserted.

What it lacks is user-controlled density, a second signal on the rail it is
currently wasting, and any attempt to prevent collisions rather than merely
survive them.

### Ranked next moves

1. **User-controlled density (zoom).** The clearest gap against Apple and
   Sunsama, and it compounds: more pixels per hour raises the effective lane
   count and pushes the +N chips back on their own.
2. **Give the rail a second job.** It currently repeats the fill. Provenance
   (synced from Google vs. created here vs. generated from a routine) is the
   signal Sunsama's users are asking for out loud.
3. **Prevent collisions, not just render them.** `suggest.js` already scores
   slots; warn on a conflicting create.
4. **Measure the shadow.** One token, never examined, against a competitor
   whose elevation numbers are documented and deliberate.

### Where this document is weak

The competitor column is thin, and thin in a specific direction: overlap
thresholds, empty states, typography and now-lines were all searched for
directly and not found. Several "ahead" verdicts therefore rest on absence
of evidence rather than evidence of absence. The honest way to close that
gap is to install the four or five apps and screenshot a deliberately
overloaded day in each, which no amount of searching substitutes for.
