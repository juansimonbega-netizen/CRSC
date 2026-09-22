/*
 * Two execs on the door, one Payments screen each.
 *
 * One marks somebody paid; the other's screen has to agree. It painted once
 * and never again, so the second exec went on looking at a page saying the
 * money was still owed — same club, two different answers, and nothing to
 * say which was right.
 *
 * Driven here through the screen's own tick, which is the same store write a
 * Firestore snapshot delivers from the other exec's phone. The sheet has to
 * stay open and catch up in place; it used to close and reopen, which lost
 * whatever the exec was in the middle of.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const row = (id, name, email) => ({
  id, listId: 'v1', name, email, phone: '', insta: '', photo: '',
  deviceId: 'd-' + id, method: 'etransfer', paid: false, checkedIn: false,
  team: null, order: 1, createdAt: 1,
});

const fixture = {
  settings: {}, removals: [], log: [], players: {},
  // A transfer waiting to be confirmed by hand.
  payments: [{ id: 'pay1', sender: 'Ana Costa', amount: 8, message: '', matched: false, noAuto: true }],
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 - 7:30 PM' }],
    lists: [{ id: 'v1', sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 21, level: 0, priceE: 8, priceC: 10, teamCount: 0 }],
    bundles: [], createdAt: 1 }],
  signups: { ev: [row('su1', 'Ana Costa', 'ana@x.com'), row('su2', 'Bo Lin', 'bo@x.com')] },
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

const shown = () => pg.evaluate(() => {
  const ov = document.querySelector('.modal-overlay');
  if (!ov) return { open: false };
  const stat = [...ov.querySelectorAll('.stat')].find(s => /outstanding/i.test(s.textContent));
  const unpaid = [...ov.querySelectorAll('.section-sub')].find(h => /not paid/i.test(h.textContent));
  return {
    open: true,
    outstanding: stat ? stat.textContent.replace(/\s+/g, ' ').trim() : '?',
    unpaidHeading: unpaid ? unpaid.textContent.trim() : '(none)',
  };
});

await pg.goto('http://localhost:8099/#/event/ev', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1400);
await pg.evaluate(() => [...document.querySelectorAll('button')].find(b => /payments/i.test(b.textContent))?.click());
await pg.waitForTimeout(700);
const before = await shown();
console.log('before :', JSON.stringify(before));

// Confirm the transfer — the same write the other exec's phone would send.
await pg.evaluate(() => document.querySelector('[data-match-go]')?.click());
await pg.waitForTimeout(1200);
const after = await shown();
console.log('after  :', JSON.stringify(after));

console.log('errors:', errs.length ? errs : 'none');
const ok = before.open && /16\$/.test(before.outstanding)
        && after.open && /8\$/.test(after.outstanding)
        && /1/.test(after.unpaidHeading)
        && !errs.length;
console.log('\n' + (ok
  ? 'the screen caught up in place, still open, without being reopened'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
