/*
 * The receipt for money an exec took by hand.
 *
 * The club settles most of its money in the gym: cash across the table, or a
 * transfer an exec reads off their phone and ticks off. Only a minority of
 * payments ever match to the cent by themselves. So if the receipt is wired
 * to automatic matching alone, almost nobody is ever told their spot is
 * paid — they ask an exec instead, which is the sheet all over again.
 *
 * Four things have to hold, and the middle two are why this is not a
 * one-liner:
 *   1. marking a player paid emails them,
 *   2. marking ONE of their two spots paid does NOT — they still owe, and
 *      "you're all set" would be a lie,
 *   3. marking the second one then does, exactly once,
 *   4. recording an odd amount that covers the bill counts as settled too,
 *      and an odd amount that does not cover it stays quiet.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const row = (id, listId, name, email, dev, order) => ({
  id, listId, name, email, phone: '', insta: '', photo: '', deviceId: dev,
  method: 'etransfer', paid: false, checkedIn: false, team: null, order, createdAt: order,
});

const fixture = {
  settings: {}, removals: [], payments: [], log: [], refunds: [], players: {},
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'Maisonneuve',
    sessions: [{ id: 's1', label: '5:30 - 7:30 PM' }, { id: 's2', label: '7:30 - 9:30 PM' }],
    lists: [
      { id: 'v1', sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 21, level: 0, priceE: 8, priceC: 10, teamCount: 3 },
      { id: 'v2', sessionId: 's2', sport: 'volleyball', label: 'Advanced',   cap: 21, level: 2, priceE: 8, priceC: 10, teamCount: 3 },
    ],
    // No both-slot bundle, so Ben's two spots are two separate $8 debts.
    bundles: [], createdAt: 1 }],
  signups: { ev: [
    row('su-ann', 'v1', 'Ann Diaz', 'ann@x.com', 'dA', 1),
    row('su-ben-1', 'v1', 'Ben Roy', 'ben@x.com', 'dB', 2),
    row('su-ben-2', 'v2', 'Ben Roy', 'ben@x.com', 'dB', 3),
    row('su-cara', 'v1', 'Cara Lin', 'cara@x.com', 'dC', 4),
    row('su-dan', 'v1', 'Dan Oke', 'dan@x.com', 'dD', 5),
  ] },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));

// Pretend the club mailer is live, and capture every message it is handed.
await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript',
  body: 'window.FIREBASE_CONFIG=null;window.MAILER={url:"https://mailer.test/exec",secret:"x"};' }));
// The demo store refuses to mail anybody, which is right in production and
// is the one thing in the way here. Drop that clause only.
await pg.route('**/js/app.js*', async (r) => {
  const res = await r.fetch();
  let body = await res.text();
  const before = body.split("store.mode === 'demo' || !mailerConfigured()").length - 1;
  if (before < 1) throw new Error('demo guard not found — has it been renamed?');
  body = body.split("store.mode === 'demo' || !mailerConfigured()").join('!mailerConfigured()');
  await r.fulfill({ contentType: 'application/javascript', body });
});
const sent = [];
await pg.route('https://mailer.test/**', r => {
  try { sent.push(JSON.parse(r.request().postData() || '{}')); } catch (e) { /* ignore */ }
  r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

await pg.addInitScript(({ KEY, fixture }) => {
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(fixture));
  localStorage.setItem('crsc-profile', JSON.stringify({ name: 'Juan', email: 'juan@x.com', deviceId: 'dExec' }));
  sessionStorage.setItem('crsc-exec', '1');
}, { KEY, fixture });

await pg.goto('http://localhost:8099/#/event/ev', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1500);

/* Open one player's row, do something, close it again. */
async function onPlayer(suId, act) {
  await pg.evaluate((id) => document.querySelector(`[data-signup="${id}"]`)?.click(), suId);
  await pg.waitForTimeout(500);
  await act();
  await pg.waitForTimeout(900);
  await pg.evaluate(() => document.querySelector('.modal-overlay [data-close]')?.click());
  await pg.waitForTimeout(400);
}
const markPaid = () => pg.evaluate(() => document.querySelector('#pa-paid')?.click());
const recordAmount = (n) => pg.evaluate((v) => {
  const inp = document.querySelector('#pa-amount');
  if (inp) { inp.value = String(v); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  document.querySelector('#pa-amount-go')?.click();
}, n);
const to = (addr) => sent.filter(m => m.to === addr);

// 1. Ann has one spot. Marking it paid settles her.
await onPlayer('su-ann', markPaid);
const annMails = to('ann@x.com').length;
console.log('Ann  · one spot, marked paid        → emails:', annMails, '(want 1)');

// 2. Ben has two. Paying one leaves him owing the other.
await onPlayer('su-ben-1', markPaid);
const benAfterOne = to('ben@x.com').length;
console.log('Ben  · 1 of 2 spots paid            → emails:', benAfterOne, '(want 0 — still owes)');

// 3. The second one settles him.
await onPlayer('su-ben-2', markPaid);
const benAfterTwo = to('ben@x.com').length;
console.log('Ben  · both spots paid              → emails:', benAfterTwo, '(want 1)');

// 4. Cara hands over $10 against an $8 bill. Rounded up is still settled.
await onPlayer('su-cara', () => recordAmount(10));
const caraMails = to('cara@x.com').length;
console.log('Cara · $10 recorded against $8      → emails:', caraMails, '(want 1)');

// 5. Dan hands over $5. He still owes $3, so he hears nothing yet.
await onPlayer('su-dan', () => recordAmount(5));
const danShort = to('dan@x.com').length;
console.log('Dan  · $5 recorded against $8       → emails:', danShort, '(want 0 — short)');

// 6. Un-ticking and re-ticking Ann must not send a second receipt: the claim
//    is on the sign-up row, not on the click.
await onPlayer('su-ann', async () => { await markPaid(); await pg.waitForTimeout(500); await markPaid(); });
const annAgain = to('ann@x.com').length;
console.log('Ann  · unpaid then paid again       → emails:', annAgain, '(want 1 — no repeat)');

const subjects = [...new Set(sent.map(m => m.subject))];
console.log('\nsubjects sent:', JSON.stringify(subjects));
const annBody = to('ann@x.com')[0]?.message || '';
console.log('Ann\'s receipt says:', JSON.stringify(annBody.replace(/\s+/g, ' ').slice(0, 130)));

console.log('errors:', errs.length ? errs : 'none');
const ok = annMails === 1 && benAfterOne === 0 && benAfterTwo === 1
        && caraMails === 1 && danShort === 0 && annAgain === 1
        && subjects.every(s => /payment received|paiement re/i.test(s))
        && /8\$/.test(annBody) && !errs.length;
console.log('\n' + (ok
  ? 'money taken by hand is confirmed to the player, once, and only when they owe nothing'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
