// Time-grid layout: deciding where overlapping blocks actually sit.
//
// Shared by Today's spine and the Calendar week grid so the two can never
// disagree about the same day — the week view previously had no overlap
// handling at all and drew concurrent meetings directly on top of one
// another, which silently hid entire events.
//
// Three rules, in the order they matter:
//
//   1. CLUSTER. Only blocks that actually collide compete for width. The
//      naive approach divides the whole day by the busiest moment, so one
//      9am pile-up shrinks a 5pm block that overlaps nothing. Clusters are
//      transitive: A-B and B-C put all three together, because B has to
//      fit beside both.
//
//   2. PACK. Within a cluster, each block takes the first lane whose
//      previous occupant has already ended — the standard greedy interval
//      colouring, which uses the fewest lanes possible.
//
//   3. WIDEN. A block then expands rightwards across lanes that are free
//      for its whole span. Without this, a long block next to one short
//      meeting stays half-width for hours of empty space beside it.

/**
 * @param {Array<{start:number,end:number}>} items  minutes from midnight
 * @returns {Array} the same objects plus { lane, lanes, span }, where the
 *   block occupies lanes [lane, lane+span) of `lanes` total.
 */
export function packOverlaps(items) {
  if (!items?.length) return [];

  // Longer blocks first on a tie so the big one takes the left lane and
  // short meetings stack to its right — reads far better than the reverse.
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  let clusterId = 0;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    for (const it of cluster) {
      // First lane free at this block's start time.
      let lane = laneEnds.findIndex(end => end <= it.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); }
      else laneEnds[lane] = it.end;
      it.lane = lane;
    }
    const lanes = laneEnds.length;
    for (const it of cluster) {
      // Grow right while the next lane holds nothing overlapping in time.
      let span = 1;
      for (let L = it.lane + 1; L < lanes; L++) {
        const blocked = cluster.some(o =>
          o !== it && o.lane === L && o.start < it.end && o.end > it.start);
        if (blocked) break;
        span++;
      }
      it.lanes = lanes;
      it.span = span;
      it.cluster = clusterId;   // exact identity, not inferred later
      out.push(it);
    }
    cluster = [];
    clusterEnd = -Infinity;
    clusterId++;
  };

  for (const src of sorted) {
    const it = { ...src };
    // A gap with nothing running means the previous cluster is closed.
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();

  // Restore chronological order; callers render in DOM order and a stable
  // sequence keeps tab order and screen-reader reading order sensible.
  return out.sort((a, b) => a.start - b.start || a.lane - b.lane);
}

/**
 * CSS left/width for a packed block, as percentages of the day column.
 * `gap` is the visual gutter between neighbours, in PIXELS - the same unit
 * and the same value visibleLanes budgets for.
 */
/**
 * The shaded hours outside the focus window, as a background-image value.
 *
 * Lives here rather than in either view because both grids must agree, and
 * because the ordering cases are the whole point: a window can run forward
 * (09:00-17:00), wrap midnight (22:00-06:00, a night shift), or be empty.
 * Feeding an inverted pair to a gradient does not error - CSS silently
 * raises the lower stop to the higher one, the lit span collapses, and the
 * entire day goes dim. Ordering is decided here, once.
 */
export function offHoursBand(startMin, endMin, pph) {
  const a = (startMin / 60) * pph, b = (endMin / 60) * pph, full = 24 * pph;
  if (endMin > startMin) {
    return `linear-gradient(to bottom, var(--offhours) 0 ${a}px, transparent ${a}px ${b}px, var(--offhours) ${b}px ${full}px)`;
  }
  // start === end is a zero-length window: nothing is claimed, so nothing
  // is lit. Drawn explicitly rather than left to the fixup to stumble into.
  if (endMin === startMin) return `linear-gradient(var(--offhours) 0 ${full}px)`;
  // Wraps midnight: lit from 00:00 to end and from start to 24:00.
  return `linear-gradient(to bottom, transparent 0 ${b}px, var(--offhours) ${b}px ${a}px, transparent ${a}px ${full}px)`;
}

/** Is a minute inside the focus window, honouring a window that wraps? */
// A zero-length window is handled explicitly rather than falling into the
// wrap branch, where (m >= s || m <= e) is true for EVERY minute. The band
// dims the whole day in that case, so without this the axis labels would all
// claim to be in focus on a grid that is entirely dimmed - the two halves of
// the same idea disagreeing.
export const inFocusMin = (m, s, e) =>
  e > s ? (m >= s && m <= e) : e === s ? false : (m >= s || m <= e);

export function laneStyle(it, gap = GAP_PX, minPx = 0, reservePx = 0) {
  const unit = 100 / it.lanes;
  const left = it.lane * unit;
  const width = unit * it.span;
  // The last lane runs flush to the column edge; the others leave a gutter.
  const isLast = it.lane + it.span >= it.lanes;
  // reservePx is a strip the whole cluster gives up ONCE - the +N chip.
  // Callers used to subtract it per lane, which charged a four-lane
  // cluster four chips and left each block narrower than the floor the
  // cap existed to protect. Lanes divide what remains after the strip.
  const room = reservePx ? `(100% - ${reservePx}px)` : '100%';
  const frac = (n) => `calc(${room} * ${(n / 100).toFixed(6)})`;
  const pct = reservePx
    ? `calc(${room} * ${(width / 100).toFixed(6)} - ${isLast ? 0 : gap}px)`
    : `calc(${width}% - ${isLast ? 0 : gap}px)`;
  // Below a legibility floor, let the block outgrow its lane instead of
  // shrinking to an unreadable sliver. In a 90px week column a three-way
  // conflict splits to 28px each — wide enough for a colour and nothing
  // else, so the title renders as "D…" noise. max() keeps clean side-by-side
  // splitting whenever the column can afford it, and only where it cannot
  // do the blocks overlap, cascading from their existing lane offsets the
  // way Google shingles. Later lanes stack above earlier ones so each keeps
  // its left edge — rail, and the start of its title — visible.
  return {
    left: reservePx ? frac(left) : `${left}%`,
    width: minPx ? `max(${pct}, ${minPx}px)` : pct,
    z: it.lane
  };
}

/**
 * Scroll a time grid so a given minute sits near the top of the viewport.
 *
 * Both grids used to open at 00:00, so every visit began by scrolling past
 * six empty hours to reach the day. Today's view even computed the right
 * offset and then threw it away — it called scrollTo({top:0}) and a no-arg
 * scrollTo({}) instead of using it. Every reference calendar opens on the
 * live part of the day; this is that.
 *
 * `lead` keeps a little context above the target rather than pinning it to
 * the very top edge, so you can see what just finished.
 */
export function revealMinute(scroller, grid, minute, pph, lead = 75) {
  if (!scroller || !grid) return;
  let tries = 0;
  const apply = () => {
    const gridTop = grid.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const want = Math.max(0, Math.round(gridTop + ((minute - lead) / 60) * pph));
    const max = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = want;
    // A route swap animates the outgoing screen out of flow, so for the
    // first frames the container is not yet tall enough and the assignment
    // clamps short — which is exactly the midnight bug this exists to fix.
    // Retry until it lands, or until the grid genuinely cannot scroll that
    // far (a late-evening target on a 24h grid legitimately hits the end).
    if (scroller.scrollTop < Math.min(want, max) - 2 && tries++ < 10) schedule();
  };
  const schedule = () => {
    // rAF does not fire at all while the tab is hidden or not compositing,
    // so a timer backs it up. On rAF alone the grid silently opened at
    // midnight whenever it mounted in a background tab.
    requestAnimationFrame(apply);
    setTimeout(apply, 32);
  };
  apply();
  schedule();
}

/**
 * Which minute a grid should open on: the current time when you are looking
 * at today, otherwise the first thing actually scheduled, otherwise the
 * start of your focus hours. Opening a future day at "now" would be
 * meaningless, and opening it at midnight is what we are fixing.
 */
export function openingMinute({ isToday, nowMin, firstEventMin = null, focusStart = 540 }) {
  if (isToday) return nowMin;
  if (firstEventMin != null) return firstEventMin;
  return focusStart;
}

// ---------------------------------------------------------------- density
//
// Measured: at 11.5px/600 a six-character title plus an ellipsis needs 61px
// of block once padding and the rail are paid for. A week column at a
// 1000px viewport is 90px. So ONE event can be legible there — and five
// concurrent events shingled to 62px showed only 18px each once the block
// above covered them, which is a wall of coloured stubs, not information.
//
// Past two lanes, then, the honest move is to stop splitting and start
// summarising: show the events that can actually be read, and collect the
// rest behind a count that opens them. Readability over theoretical density.
export const MIN_LEGIBLE = 56;   // px of block width a title needs to read
export const OVERFLOW_W = 26;    // px reserved for the "+N" chip
// The gutter between neighbouring lanes. In PIXELS, deliberately: it used
// to be a percentage of the container, which cannot be budgeted against a
// pixel floor because it grows as the container does.
export const GAP_PX = 4;

/**
 * How many lanes a column of this width can show legibly.
 *
 * The two-lane split is what every calendar does and people read it fine —
 * but only where the column can actually carry two legible blocks. On a
 * phone the week column is 104px, so a two-way overlap gave each side 50px
 * and rendered "Morning workout" as "Mo…". Measured, not guessed: at that
 * width the title box is 35px. Showing one real title plus a +1 chip beats
 * showing two stubs, and it is the same trade already made at three lanes.
 *
 * MIN_LEGIBLE is now an invariant rather than an aspiration: nothing is
 * drawn narrower than a title can be read in.
 */
export function visibleLanes(colWidth, lanes, gapPx = GAP_PX) {
  if (lanes <= 1) return lanes;
  // Every lane but the last also pays for a gutter, so the budget is
  // (MIN_LEGIBLE + gutter) per lane with one gutter handed back for the
  // last one. Budgeting MIN_LEGIBLE alone and then charging the gutter in
  // laneStyle is how a "floor" ends up three pixels below itself.
  // laneStyle gives the LAST lane the full share and takes the gutter out of
  // every other one, so the binding constraint is share - gutter >= floor,
  // i.e. share >= MIN_LEGIBLE + gutter for every lane. Handing one gutter
  // back to the budget (the last lane does not pay it) is off by exactly the
  // amount that put 200 width/lane combinations back under the floor.
  if (lanes === 2 && colWidth >= 2 * (MIN_LEGIBLE + gapPx)) return 2;
  const fits = Math.floor((colWidth - OVERFLOW_W) / (MIN_LEGIBLE + gapPx));
  return Math.max(1, Math.min(lanes, fits));
}

/**
 * Split packed blocks into what to draw and what to summarise.
 * Blocks keep their own lane geometry; the hidden ones are grouped by
 * cluster so each pile gets one chip at the time it actually happens.
 *
 * @returns {{shown:Array, piles:Array<{start,end,lane,lanes,items}>}}
 */
export function capDensity(packed, colWidth) {
  if (!packed.length) return { shown: [], piles: [] };
  const shown = [], piles = [];
  const byCluster = new Map();
  for (const it of packed) {
    if (!byCluster.has(it.cluster)) byCluster.set(it.cluster, []);
    byCluster.get(it.cluster).push(it);
  }
  for (const group of byCluster.values()) {
    const lanes = group[0].lanes;
    const cap = visibleLanes(colWidth, lanes);
    if (lanes <= cap) {
      shown.push(...group);
    } else {
      const keep = group.filter(g => g.lane < cap);
      const hide = group.filter(g => g.lane >= cap);
      // Everything kept re-spans the room the chip does not take.
      keep.forEach(g => { g.lanes = cap; g.span = 1; g.capped = true; });
      shown.push(...keep);
      if (hide.length) piles.push({
        start: Math.min(...hide.map(h => h.start)),
        end: Math.max(...hide.map(h => h.end)),
        items: hide
      });
    }
  }
  return { shown, piles };
}
