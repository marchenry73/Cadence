#!/usr/bin/env node
// Which Google events become blocks on your day.
//
// This rule was wrong in two ways for as long as Google sync has existed, and
// neither was easy to see: a meeting you declined and an event you marked
// "Free" both arrived as solid commitments. Nobody catches that by reading,
// because it is an absence - two conditions that were never written.
//
// skipGoogleEvent is exported from google.js purely so this file can reach it
// without a Google account.
//
//   node tools/test-gcal-filter.js
//
// Payload shapes are Google Calendar API v3 events.list responses, trimmed to
// the fields the rule reads.
const path = require('path');
const { pathToFileURL } = require('url');

const at = (h, m = 0) => `2026-09-09T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`;
const timed = (extra = {}) => ({ id: 'x', summary: 'Standup', start: { dateTime: at(9) }, end: { dateTime: at(9, 30) }, ...extra });

const CASES = [
  // [name, event, expectSkipped]
  ['an ordinary timed meeting', timed(), false],
  ['a meeting with no attendees at all', timed({ attendees: undefined }), false],

  ['an all-day event (date, no dateTime)',
    { id: 'a', summary: 'Bank holiday', start: { date: '2026-09-09' }, end: { date: '2026-09-10' } }, true],
  ['a cancelled event', timed({ status: 'cancelled' }), true],

  ['an event marked Free in Google', timed({ transparency: 'transparent' }), true],
  ['an event explicitly marked Busy', timed({ transparency: 'opaque' }), false],

  ['a meeting I declined', timed({ attendees: [{ email: 'me@x', self: true, responseStatus: 'declined' }] }), true],
  ['a meeting I accepted', timed({ attendees: [{ email: 'me@x', self: true, responseStatus: 'accepted' }] }), false],
  ['a meeting I have not answered', timed({ attendees: [{ email: 'me@x', self: true, responseStatus: 'needsAction' }] }), false],
  ['a meeting I tentatively accepted', timed({ attendees: [{ email: 'me@x', self: true, responseStatus: 'tentative' }] }), false],

  // The `self` flag is the whole reason this is not a one-liner.
  ['a meeting SOMEONE ELSE declined — still mine',
    timed({ attendees: [{ email: 'you@x', responseStatus: 'declined' }, { email: 'me@x', self: true, responseStatus: 'accepted' }] }), false],
  ['a meeting I declined among others who accepted',
    timed({ attendees: [{ email: 'you@x', responseStatus: 'accepted' }, { email: 'me@x', self: true, responseStatus: 'declined' }] }), true],
];

(async () => {
  const url = pathToFileURL(path.join(__dirname, '..', 'www', 'js', 'google.js')).href;
  let skipGoogleEvent;
  try {
    ({ skipGoogleEvent } = await import(url));
  } catch (e) {
    // google.js imports the app's state layer, which expects a browser. If that
    // ever starts failing, say so rather than reporting a pass on zero tests.
    console.error('Could not import google.js: ' + e.message);
    console.error('The rule is untested. That is a failure, not a skip.');
    process.exit(1);
  }

  let failed = 0;
  for (const [name, ev, expected] of CASES) {
    const got = !!skipGoogleEvent(ev);
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : 'FAIL  '}${name} — ${got ? 'skipped' : 'imported'}${ok ? '' : `, wanted ${expected ? 'skipped' : 'imported'}`}`);
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  process.exit(failed ? 1 : 0);
})();
