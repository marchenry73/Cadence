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
      out.push(it);
    }
    cluster = [];
    clusterEnd = -Infinity;
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
 * `gap` is the visual gutter between neighbours, in percent.
 */
export function laneStyle(it, gap = 1.5) {
  const unit = 100 / it.lanes;
  const left = it.lane * unit;
  const width = unit * it.span;
  // The last lane runs flush to the column edge; the others leave a gutter.
  const isLast = it.lane + it.span >= it.lanes;
  return {
    left: `${left}%`,
    width: `calc(${width}% - ${isLast ? 0 : gap}%)`
  };
}
