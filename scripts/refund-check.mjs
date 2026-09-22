/*
 * Somebody paid, then could not come.
 *
 * Asking for the money back and giving up the spot are one action, not two:
 * the place goes to the waitlist the moment they ask, rather than when an
 * exec gets round to reading the message. Before this the promise lived in
 * whichever exec happened to see it.
 *
 * Marking one refunded records that an exec dealt with it. It moves no
 * money — the list exists so nobody is forgotten and nobody is paid twice.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const row = (id, name, email, dev, extra = {}) => ({
  id, listId: 'v1', name, email, phone: '', insta: '', photo: '', deviceId: dev,
  method: 'etransfer', paid: false, checkedIn: false, team: null,
  order: 1, createdAt: 1, ...extra,
});

const fixture = {
  // cap 1, so giving the spot up must promote the person waiting.
  settings: { cancelLockHours: 0 }, removals: [], payments: [], log: [], refunds: [], players: {},
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 - 7:30 PM' }],
    lists: [{ id: 'v1', sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 1, level: 0, priceE: 8, priceC: 10, teamCount: 0 }],
    bundles: [], createdAt: 1 }],
  signups: { ev: [
    row('su-me', 'Sam Roy', 'sam@x.com', 'dMe', { paid: true, order: 1 }),
    row('su-wait', 'Wanda Lee', 'wanda@x.com', 'dW', { order: 2 }),
  ] },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext();
const errs = [];

async function open(who, exec) {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
  await pg.addInitScript(({ KEY, fixture, who, exec }) => {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(fixture));
    localStorage.setItem('crsc-profile', JSON.stringify(who));
    localStorage.setItem('crsc-device-id', who.deviceId);
    if (exec) sessionStorage.setItem('crsc-exec', '1');
  }, { KEY, fixture, who, exec: !!exec });
  return pg;
}

// Sam paid, and cannot come.
const sam = await open({ name: 'Sam Roy', email: 'sam@x.com', deviceId: 'dMe' });
await sam.goto('http://localhost:8099/#/event/ev', { waitUntil: 'networkidle' });
await sam.waitForTimeout(1400);
const offered = await sam.evaluate(() => !!document.querySelector('[data-refund]'));
console.log('refund offered to a paid member :', offered);
await sam.evaluate(() => document.querySelector('[data-refund]')?.click());
await sam.waitForTimeout(500);
const asks = await sam.evaluate(() => document.querySelector('.confirm-msg')?.textContent || '');
console.log('it says   :', JSON.stringify(asks.slice(0, 96)));
await sam.evaluate(() => document.querySelector('#cf-yes')?.click());
await sam.waitForTimeout(1200);

const st = await sam.evaluate((K) => {
  const s = JSON.parse(localStorage.getItem(K));
  return {
    onList: (s.signups.ev || []).map(x => x.name),
    refunds: (s.refunds || []).map(r => ({ name: r.name, amount: r.amount, settled: r.settled })),
  };
}, KEY);
console.log('roster now:', JSON.stringify(st.onList), '· refunds:', JSON.stringify(st.refunds));

// An exec sees it waiting, and marks it done.
const exec = await open({ name: 'Juan', email: 'juan@x.com', deviceId: 'dExec' }, true);
await exec.goto('http://localhost:8099/#/', { waitUntil: 'networkidle' });
await exec.waitForTimeout(1400);
const badge = await exec.evaluate(() => document.querySelector('#btn-refunds')?.textContent.trim());
console.log('exec button:', JSON.stringify(badge));
await exec.evaluate(() => document.querySelector('#btn-refunds')?.click());
await exec.waitForTimeout(600);
await exec.evaluate(() => document.querySelector('[data-settle]')?.click());
await exec.waitForTimeout(500);
await exec.evaluate(() => document.querySelector('#cf-yes')?.click());
await exec.waitForTimeout(1000);
const done = await exec.evaluate((K) => (JSON.parse(localStorage.getItem(K)).refunds || [])
  .map(r => ({ name: r.name, settled: !!r.settled, by: r.settledBy })), KEY);
console.log('after settling:', JSON.stringify(done));

console.log('errors:', errs.length ? errs : 'none');
const ok = offered && /8\$/.test(asks)
        && !st.onList.includes('Sam Roy') && st.onList.includes('Wanda Lee')
        && st.refunds.length === 1 && st.refunds[0].amount === 8 && st.refunds[0].settled === false
        && /1/.test(badge || '')
        && done.length === 1 && done[0].settled === true && done[0].by === 'Juan'
        && !errs.length;
console.log('\n' + (ok
  ? 'the spot goes to the waitlist at once, and the club is left holding a note of what it owes'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
