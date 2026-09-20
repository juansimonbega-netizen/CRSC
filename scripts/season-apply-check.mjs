/*
 * Thirty-two Saturdays run on the same shape, so changing a cap meant
 * opening thirty-two editors — or not bothering, which is how a season
 * drifts apart from the one before it.
 *
 * The dangerous half is that sign-ups point at list ids. A list that already
 * exists on a later Saturday has to keep its own id, or everybody on it is
 * orphaned; and a list this template does not have can only be removed when
 * nobody has signed up for it.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date();
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const wk = (n) => { const x = new Date(d); x.setDate(d.getDate() + n); return iso(x); };
const sessions = [{ id: 's1', label: '5:30 - 7:30 PM' }];
const V = (id, label, cap, level) => ({ id, sessionId: 's1', sport: 'volleyball', label, cap, level, priceE: 8, priceC: 10, teamCount: 3 });

const fixture = {
  settings: {}, removals: [], payments: [], players: {},
  events: [
    // The template: cap raised to 30, graded, and Intermediate dropped.
    { id: 'evA', title: 'S', date: wk(7), status: 'open', location: 'X', sessions,
      lists: [V('a1', 'Advanced +', 30, 4)], bundles: [], createdAt: 1 },
    // Later: same list under a different id (must survive with its people),
    // an empty list the template drops, and one with a name on it.
    { id: 'evB', title: 'S', date: wk(14), status: 'open', location: 'X', sessions,
      lists: [V('b1', 'Advanced +', 21, 0), V('b2', 'Intermediate', 21, 1), V('b3', 'Advanced', 21, 2)],
      bundles: [], createdAt: 1 },
    // Earlier: must not be touched at all.
    { id: 'evOld', title: 'S', date: wk(1), status: 'open', location: 'X', sessions,
      lists: [V('o1', 'Advanced +', 21, 0)], bundles: [], createdAt: 1 },
  ],
  signups: {
    evA: [], evOld: [],
    evB: [
      { id: 'su1', listId: 'b1', name: 'Ana', email: 'ana@x.com', phone: '', insta: '', photo: '',
        deviceId: 'dA', method: 'etransfer', paid: true, checkedIn: false, team: null, order: 1, createdAt: 1 },
      { id: 'su2', listId: 'b3', name: 'Bo', email: 'bo@x.com', phone: '', insta: '', photo: '',
        deviceId: 'dB', method: 'etransfer', paid: false, checkedIn: false, team: null, order: 2, createdAt: 2 },
    ],
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
await pg.addInitScript(({ KEY, fixture }) => {
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(fixture));
  localStorage.setItem('crsc-profile', JSON.stringify({ name: 'Exec', email: 'e@x.com', deviceId: 'dExec' }));
  sessionStorage.setItem('crsc-exec', '1');
}, { KEY, fixture });

await pg.goto('http://localhost:8099/#/event/evA', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1300);
await pg.evaluate(() => document.querySelector('#btn-edit-event')?.click());
await pg.waitForTimeout(600);
await pg.evaluate(() => document.querySelector('#ee-apply')?.click());
await pg.waitForTimeout(700);
await pg.evaluate(() => document.querySelector('#cf-yes')?.click());
await pg.waitForTimeout(1500);

const out = await pg.evaluate((K) => {
  const st = JSON.parse(localStorage.getItem(K));
  const ev = (id) => st.events.find(e => e.id === id);
  const shape = (id) => (ev(id).lists || []).map(l => `${l.label}:${l.cap}:${l.level}`).sort();
  return {
    later: shape('evB'),
    earlier: shape('evOld'),
    // Ana was on b1 and Bo on b3. Both list ids must still exist.
    orphans: (st.signups.evB || []).filter(su => !(ev('evB').lists || []).some(l => l.id === su.listId)).map(s => s.name),
    anaPaid: (st.signups.evB || []).find(s => s.name === 'Ana')?.paid,
  };
}, KEY);

console.log('later Saturday  :', JSON.stringify(out.later));
console.log('earlier one     :', JSON.stringify(out.earlier), '(must be untouched)');
console.log('orphaned people :', JSON.stringify(out.orphans), '· Ana still paid:', out.anaPaid);
console.log('errors:', errs.length ? errs : 'none');

const ok = out.later.includes('Advanced +:30:4')          // template applied
        && out.later.includes('Advanced:21:2')             // kept: Bo is on it
        && !out.later.some(x => x.startsWith('Intermediate'))  // dropped: empty
        && out.earlier.includes('Advanced +:21:0')         // earlier untouched
        && out.orphans.length === 0 && out.anaPaid === true
        && !errs.length;
console.log('\n' + (ok
  ? 'the season follows the template, and nobody loses a spot or a payment'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
