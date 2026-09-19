/*
 * The waitlist is not a separate list — it is the back of the same one, so a
 * duplicate there is a duplicate full stop, and it is where a duplicate lands
 * when the list is full.
 *
 * The exec's "move to" menu offers every list on the night, including ones
 * the player is already on. Sam plays 5:30 and 7:30, which is allowed;
 * moving his 7:30 spot into his 5:30 list would put him on that list twice,
 * the second time on its waitlist. That move has to be refused.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// cap 2, so a third name on a list sits on its waitlist.
const L = (id, sess, label) => ({ id, sessionId: sess, sport: 'volleyball', label, cap: 2, level: 4, priceE: 8, priceC: 10, teamCount: 3 });
const row = (id, listId, name, email, order) => ({
  id, listId, name, email, phone: '', insta: '', photo: '', deviceId: 'dev-' + name.toLowerCase(),
  method: 'etransfer', paid: false, checkedIn: false, team: null, order, createdAt: order,
});

const fixture = {
  settings: {}, removals: [], payments: [],
  players: {},
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 – 7:30 PM' }, { id: 's2', label: '7:30 – 9:30 PM' }],
    lists: [L('v1', 's1', 'Advanced +'), L('w1', 's2', 'Adv + Men')],
    bundles: [], createdAt: 1 }],
  signups: { ev: [
    row('s-a', 'v1', 'Ana', 'ana@x.com', 10),
    row('s-b', 'v1', 'Bo', 'bo@x.com', 20),
    row('s-sam1', 'v1', 'Sam Roy', 'sam@x.com', 30),   // Sam waits at 5:30
    row('s-sam2', 'w1', 'Sam Roy', 'sam@x.com', 40),   // and plays at 7:30
  ] },
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

const state = () => pg.evaluate((K) => {
  const rows = (JSON.parse(localStorage.getItem(K)).signups['ev'] || []);
  const by = {};
  for (const s of rows) { const k = (s.email || s.name) + ' @' + s.listId; by[k] = (by[k] || 0) + 1; }
  return { total: rows.length, worst: Math.max(0, ...Object.values(by)),
           sam: rows.filter(s => s.email === 'sam@x.com').map(s => s.listId).sort() };
}, KEY);

await pg.goto('http://localhost:8099/#/event/ev', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1400);
console.log('start                 :', JSON.stringify(await state()));

// Open Sam's 7:30 row the way an exec does: tap the name on the roster.
const opened = await pg.evaluate(() => {
  const rows = [...document.querySelectorAll('.entry')];
  const sam = rows.filter(r => /Sam Roy/.test(r.textContent));
  if (sam.length < 2) return 'found ' + sam.length + ' Sam rows';
  sam[sam.length - 1].click();      // the later one is the 7:30 spot
  return 'clicked';
});
await pg.waitForTimeout(600);
const hasMove = await pg.evaluate(() => !!document.querySelector('#pa-move'));
console.log('player sheet open     :', hasMove, '(' + opened + ')');
if (!hasMove) { console.log('FAILED — could not open the exec player sheet'); await b.close(); process.exit(1); }

// Move it into the 5:30 list he is already waiting on.
await pg.evaluate(() => {
  const sel = document.querySelector('#pa-move');
  sel.value = 'v1';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await pg.waitForTimeout(1000);

const st = await state();
console.log('after the exec move   :', JSON.stringify(st));
console.log('errors:', errs.length ? errs : 'none');
const ok = st.total === 4 && st.worst === 1
        && st.sam.length === 2 && new Set(st.sam).size === 2 && !errs.length;
console.log('\n' + (ok
  ? 'the move is refused — Sam keeps one spot per slot and lands on no waitlist twice'
  : `FAILED — Sam is on ${JSON.stringify(st.sam)}`));
await b.close();
process.exit(ok ? 0 : 1);
