// Points, streaks, badges, the monthly challenge and the weekly leaderboard.
// Nothing here invents a new source of truth: every point is derived from
// activity the user already confirmed (blocks ticked off, tasks completed,
// focus sessions finished), so the score can never drift from reality.
import { S, mine, logActivity } from './state.js';
import { todayISO, addDays } from './util.js';
import { sb } from './net.js';

export const POINTS = {
  block: 10,      // confirming a scheduled block actually happened
  task: 6,        // completing a task
  focus: 8,       // finishing a focus session
  goalWeek: 40,   // hitting a goal's weekly target hours
  review: 30,     // doing the weekly review
  plan: 8,        // planning tomorrow the night before
  login: 2        // showing up
};

const acts = kind => S.activity.filter(a => a.user_id === S.user?.id && a.kind === kind);
const dayOf = s => String(s || '').slice(0, 10);

// ------------------------------------------------------------------ points

export function pointsOn(day) {
  let p = 0;
  acts('block-done').forEach(a => { if (String(a.detail || '').startsWith(day + '|')) p += POINTS.block; });
  mine('tasks').forEach(t => { if (dayOf(t.done_at) === day) p += POINTS.task; });
  acts('focus').forEach(a => { if (dayOf(a.at) === day) p += POINTS.focus; });
  acts('plan-ahead').forEach(a => { if (dayOf(a.at) === day) p += POINTS.plan; });
  acts('review-done').forEach(a => { if (dayOf(a.at) === day) p += POINTS.review; });
  acts('goal-week').forEach(a => { if (dayOf(a.at) === day) p += POINTS.goalWeek; });
  acts('login').forEach(a => { if (dayOf(a.at) === day) p += POINTS.login; });
  return p;
}

export const weekPoints = days => days.reduce((a, d) => a + pointsOn(d), 0);

export function totalPoints() {
  const seen = new Set();
  acts('block-done').forEach(a => seen.add(dayOf(a.at)));
  mine('tasks').forEach(t => { if (t.done_at) seen.add(dayOf(t.done_at)); });
  ['focus', 'plan-ahead', 'review-done', 'goal-week', 'login'].forEach(k =>
    acts(k).forEach(a => seen.add(dayOf(a.at))));
  return [...seen].reduce((a, d) => a + pointsOn(d), 0);
}

// Levels get gently harder: 100, 400, 900, 1600 … so early wins come fast
// and later ones mean something.
export function level(points = totalPoints()) {
  const lv = Math.floor(Math.sqrt(points / 100)) + 1;
  const at = lv * lv * 100;
  const from = (lv - 1) * (lv - 1) * 100;
  return { level: lv, points, nextAt: at, pct: Math.round(((points - from) / (at - from)) * 100) };
}

// ----------------------------------------------------------------- streaks

// A day counts if something real happened on it: a block confirmed, a task
// finished, or a focus session completed. Logging in alone is not a day.
export function activeDays() {
  const set = new Set();
  acts('block-done').forEach(a => { const d = String(a.detail || '').split('|')[0]; if (d) set.add(d); });
  mine('tasks').forEach(t => { if (t.done_at) set.add(dayOf(t.done_at)); });
  acts('focus').forEach(a => { if (a.at) set.add(dayOf(a.at)); });
  return set;
}

export function streakNow() {
  const set = activeDays();
  const today = todayISO();
  let n = 0;
  // Today not being done yet must not read as a broken streak.
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export function longestStreak() {
  const days = [...activeDays()].sort();
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    prev = d; best = Math.max(best, run);
  });
  return best;
}

// ------------------------------------------------------------------ badges

export const BADGES = [
  { code: 'first-block', name: 'First step', hint: 'Confirm your first block', icon: '🌱', test: s => s.blocks >= 1 },
  { code: 'week-1', name: 'Seven straight', hint: 'A 7-day streak', icon: '🔥', test: s => s.streak >= 7 },
  { code: 'week-4', name: 'Month of momentum', hint: 'A 30-day streak', icon: '🏔️', test: s => s.streak >= 30 },
  { code: 'blocks-50', name: 'Fifty kept', hint: 'Confirm 50 blocks', icon: '🧱', test: s => s.blocks >= 50 },
  { code: 'blocks-250', name: 'Two-fifty', hint: 'Confirm 250 blocks', icon: '🏛️', test: s => s.blocks >= 250 },
  { code: 'tasks-100', name: 'Century of done', hint: 'Finish 100 tasks', icon: '✅', test: s => s.tasks >= 100 },
  { code: 'focus-25', name: 'Deep worker', hint: '25 focus sessions', icon: '🎧', test: s => s.focus >= 25 },
  { code: 'reviewer', name: 'Honest witness', hint: 'Do 4 weekly reviews', icon: '🔍', test: s => s.reviews >= 4 },
  { code: 'planner', name: 'Night before', hint: 'Plan tomorrow 10 times', icon: '🌙', test: s => s.plans >= 10 },
  { code: 'aligned', name: 'Becoming', hint: 'Score 80+ efficiency in a week', icon: '🧭', test: s => s.bestEff >= 80 },
  { code: 'level-5', name: 'Level five', hint: 'Reach level 5', icon: '⭐', test: s => s.level >= 5 }
];

export function earnedBadges() {
  return new Set(acts('badge').map(a => String(a.detail || '')));
}

export function badgeStats(bestEff = 0) {
  return {
    blocks: acts('block-done').length,
    tasks: mine('tasks').filter(t => t.done_at).length,
    focus: acts('focus').length,
    reviews: acts('review-done').length,
    plans: acts('plan-ahead').length,
    streak: Math.max(streakNow(), longestStreak()),
    level: level().level,
    bestEff
  };
}

// Awards anything newly earned and returns it, so the UI can celebrate.
export function checkBadges(bestEff = 0) {
  const have = earnedBadges();
  const stats = badgeStats(bestEff);
  const fresh = BADGES.filter(b => !have.has(b.code) && b.test(stats));
  fresh.forEach(b => logActivity('badge', b.code));
  return fresh;
}

// --------------------------------------------------------------- challenge

// One challenge a month, the same for everybody, rotating so it never goes
// stale. Progress is counted from the same confirmed activity as everything else.
const CHALLENGES = [
  { code: 'blocks-60', name: 'Keep 60 blocks', target: 60, count: m => m.blocks },
  { code: 'focus-20', name: 'Finish 20 focus sessions', target: 20, count: m => m.focus },
  { code: 'streak-20', name: 'Be active on 20 days', target: 20, count: m => m.days },
  { code: 'tasks-80', name: 'Finish 80 tasks', target: 80, count: m => m.tasks },
  { code: 'goal-40h', name: 'Put 40 hours into your goals', target: 40, count: m => m.goalHours },
  { code: 'reviews-4', name: 'Review every week this month', target: 4, count: m => m.reviews }
];

export function monthChallenge(goalHoursThisMonth = 0) {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const spec = CHALLENGES[(now.getFullYear() * 12 + now.getMonth()) % CHALLENGES.length];
  const inMonth = d => String(d || '').startsWith(prefix);
  const m = {
    blocks: acts('block-done').filter(a => inMonth(String(a.detail || '').split('|')[0])).length,
    focus: acts('focus').filter(a => inMonth(a.at)).length,
    tasks: mine('tasks').filter(t => inMonth(t.done_at)).length,
    reviews: acts('review-done').filter(a => inMonth(a.at)).length,
    days: [...activeDays()].filter(inMonth).length,
    goalHours: Math.round(goalHoursThisMonth / 60)
  };
  const have = spec.count(m);
  return { ...spec, have, pct: Math.min(100, Math.round((have / spec.target) * 100)), done: have >= spec.target };
}

// ------------------------------------------------------------- leaderboard

export function nickname() {
  return S.prefs.nickname || '';
}

export async function publishScore({ weekStart, points, streak, efficiency }) {
  if (S.guest || !S.user?.id || !S.prefs.nickname || S.prefs.leaderboard_opt_in === false) return;
  await sb.from('scores').upsert({
    user_id: S.user.id, week_start: weekStart, nickname: S.prefs.nickname,
    points, streak, efficiency, updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,week_start' }).then(() => {}, () => {});
}

export async function leaderboard(weekStart, limit = 25) {
  const { data, error } = await sb.from('scores')
    .select('nickname, points, streak, efficiency, user_id')
    .eq('week_start', weekStart)
    .order('points', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map((r, i) => ({ ...r, rank: i + 1, me: r.user_id === S.user?.id }));
}
