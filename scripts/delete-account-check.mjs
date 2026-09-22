/*
 * One person, two addresses — the app cannot know they are the same human,
 * so an exec has to be able to retire the account that should not exist.
 *
 * Deleting takes the account and its spots on Saturdays still to come, held
 * spots included. Saturdays already played keep every row: that is the club's
 * record of who was on the court and who owed for it.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date();
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const soon = new Date(d); soon.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7) || 7);
const past = new Date(d); past.setDate(d.getDate() - 7);
const L = (id, sess, label) => ({ id, sessionId: sess, sport: 'volleyball', label, cap: 21, level: 4, priceE: 8, priceC: 10, teamCount: 3 });
const sessions = [{ id: 's1', label: '5:30 – 7:30 PM' }];
const mk = (id, date) => ({ id, title: 'S', date, status: 'open', location: 'X', sessions,
  lists: [L(id + '-v1', 's1', 'Advanced +')], bundles: [], createdAt: 1 });
const row = (id, listId, name, email, dev, extra = {}) => ({
  id, listId, name, email, phone: '', insta: '', photo: '', deviceId: dev,
  method: 'etransfer', paid: false, checkedIn: false, team: null,
  order: 10, createdAt: 10, ...extra,
});

const fixture = {
  settings: {}, payments: [],
  // An empty removal record, the kind a mis-click in the Firebase console
  // leaves behind. The log is append-only, so it cannot be cleaned up from
  // the app — it must not become a nameless player in the directory.
  removals: [{ id: '_probe' }],
  players: {
    dR1: { deviceId: 'dR1', name: 'Rayan S', email: 'rayan@x.com', battlePass: '4h', level: 4,
           passLists: [{ sport: 'volleyball', sessionId: 's1', label: 'Advanced +' }] },
    dR2: { deviceId: 'dR2', name: 'Rayan S', email: 'rayoun@x.com', level: 2 },
  },
  events: [mk('evPast', iso(past)), mk('evNext', iso(soon))],
  signups: {
    evPast: [row('p1', 'evPast-v1', 'Rayan S', 'rayoun@x.com', 'dR2', { paid: true, checkedIn: true })],
    evNext: [row('n1', 'evNext-v1', 'Rayan S', 'rayoun@x.com', 'dR2')],
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

const state = () => pg.evaluate((K) => {
  const st = JSON.parse(localStorage.getItem(K));
  return {
    accounts: Object.values(st.players || {}).map(p => p.email).sort(),
    past: (st.signups.evPast || []).length,
    next: (st.signups.evNext || []).length,
  };
}, KEY);

await pg.goto('http://localhost:8099/#/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1500);
console.log('start        :', JSON.stringify(await state()));

// Exec → players directory.
await pg.evaluate(() => document.querySelector('#btn-players')?.click());
await pg.waitForTimeout(700);
await pg.fill('#pl-search', 'rayoun');
await pg.waitForTimeout(400);
const rows = await pg.evaluate(() => [...document.querySelectorAll('.player-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
console.log('directory    :', JSON.stringify(rows));

// Nobody nameless, from the malformed removal record in the fixture.
await pg.fill('#pl-search', '');
await pg.waitForTimeout(350);
const everyone = await pg.evaluate(() => [...document.querySelectorAll('.player-row')]
  .map(r => r.querySelector('.entry-name span')?.textContent.trim() ?? ''));
const nameless = everyone.filter(n => !n || n === 'undefined');
console.log('all rows     :', JSON.stringify(everyone), '\u00b7 nameless:', nameless.length);
await pg.fill('#pl-search', 'rayoun');
await pg.waitForTimeout(350);

// Tap the ✕ and read what it warns about before agreeing.
await pg.evaluate(() => document.querySelector('.player-row [data-del]')?.click());
await pg.waitForTimeout(500);
const ask = await pg.evaluate(() => document.querySelector('.confirm-msg')?.textContent || '');
console.log('it warns     :', JSON.stringify(ask));
await pg.evaluate(() => document.querySelector('#cf-yes')?.click());
await pg.waitForTimeout(1200);

const st = await state();
console.log('after delete :', JSON.stringify(st));
console.log('errors:', errs.length ? errs : 'none');
// The exec's own profile registers itself, so check the two Rayans by name:
// the duplicate is gone, the one they kept is untouched.
const ok = nameless.length === 0
        && !st.accounts.includes('rayoun@x.com') && st.accounts.includes('rayan@x.com')
        && st.past === 1 && st.next === 0
        && /1 upcoming spot off/.test(ask) && !errs.length;
console.log('\n' + (ok
  ? 'the duplicate account is gone with its upcoming spot, and last Saturday still has its record'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
