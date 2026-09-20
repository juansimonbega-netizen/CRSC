/*
 * Three reminders, not one: three days out, the day before, and a few hours
 * before the whistle — and each at most once.
 *
 * The subtle rule is that only the most urgent one that applies is sent.
 * Somebody who first opens the app on Saturday morning must get "in a few
 * hours" and not all three at once, and a stage whose moment has passed is
 * skipped rather than arriving late and useless.
 */
import { reminderStage } from '../public/js/notify.js';

const ev = { date: '2026-11-07', status: 'open' };      // a Saturday, games at 17:00
const at = (iso) => new Date(iso);

const cases = [
  ['2026-11-01T12:00:00', null,    'a week out — too early to be useful'],
  ['2026-11-03T23:00:00', null,    'four nights out — too early to be useful'],
  ['2026-11-04T08:00:00', 'three', 'three nights out, first thing'],
  ['2026-11-05T12:00:00', 'three', 'two days out'],
  ['2026-11-06T09:00:00', 'day',   'Friday morning — "tomorrow" is true all day'],
  ['2026-11-06T18:00:00', 'day',   'Friday evening — the old single reminder'],
  ['2026-11-07T09:00:00', 'soon',  'Saturday morning — it is today, so say today'],
  ['2026-11-07T13:30:00', 'soon',  'a few hours before the whistle'],
  ['2026-11-07T16:59:00', 'soon',  'a minute to go'],
  ['2026-11-07T17:30:00', null,    'the game has started'],
  ['2026-11-08T10:00:00', null,    'the day after'],
];

let bad = 0;
for (const [when, want, why] of cases) {
  const got = reminderStage(ev, at(when));
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${when}  → ${String(got).padEnd(6)} ${ok ? '' : '(wanted ' + want + ') '}${why}`);
}

// A closed Saturday never chases anybody.
const closed = reminderStage({ date: '2026-11-07', status: 'closed' }, at('2026-11-06T18:00:00'));
console.log(`${closed === null ? 'ok  ' : 'FAIL'}  sign-ups closed          → ${closed}`);
if (closed !== null) bad++;

console.log('\n' + (bad ? `FAILED — ${bad} wrong` : 'every reminder fires in its own window, most urgent only'));
process.exit(bad ? 1 : 0);
