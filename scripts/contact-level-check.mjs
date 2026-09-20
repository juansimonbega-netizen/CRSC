/*
 * Two things a member could not do: find out what level they are, and reach
 * the club. They discovered their grade by finding a list locked, and the
 * only door was an email to an inbox somebody opens eventually.
 *
 * Also: a list made in the event editor carries the grade an exec chose,
 * rather than the gate guessing it from the label — a guess that breaks the
 * first time anyone renames "Advanced +" to "Adv+".
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const L = (id, label, level) => ({ id, sessionId: 's1', sport: 'volleyball', label, level, cap: 21, priceE: 8, priceC: 10, teamCount: 3 });

const fixture = {
  settings: { instagram: 'crsc_concordia' }, removals: [], payments: [],
  // Graded Advanced (2). "Adv+" is renamed, so only an explicit grade can
  // keep it locked — reading the label would let them straight in.
  players: { dMe: { deviceId: 'dMe', name: 'Sam Roy', email: 'sam@x.com', level: 2 } },
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 - 7:30 PM' }],
    lists: [L('v1', 'Advanced', 2), L('v2', 'Adv+', 4)],
    bundles: [], createdAt: 1 }],
  signups: { ev: [] },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
await pg.addInitScript(({ KEY, fixture }) => {
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(fixture));
  localStorage.setItem('crsc-profile', JSON.stringify({ name: 'Sam Roy', email: 'sam@x.com', deviceId: 'dMe' }));
  localStorage.setItem('crsc-device-id', 'dMe');
}, { KEY, fixture });

await pg.goto('http://localhost:8099/#/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1400);

const strip = await pg.evaluate(() => document.querySelector('.profile-strip')?.textContent.replace(/\s+/g, ' ').trim());
console.log('profile strip   :', JSON.stringify(strip));
const showsLevel = /Advanced/.test(strip || '');

await pg.evaluate(() => document.querySelector('#btn-contact')?.click());
await pg.waitForTimeout(500);
const contact = await pg.evaluate(() => {
  const m = document.querySelector('.modal-overlay');
  const a = m?.querySelector('a[href*="instagram"]');
  return { open: !!m, href: a?.getAttribute('href') || '', target: a?.getAttribute('target') || '' };
});
console.log('contact sheet   :', JSON.stringify(contact));
await pg.evaluate(() => document.querySelector('.modal-overlay [data-close]')?.click());
await pg.waitForTimeout(300);

// A renamed list still respects the grade an exec set.
await pg.goto('http://localhost:8099/#/event/ev', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1200);
const locked = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-join]')].find(b => b.dataset.join === 'v2');
  if (!btn) return 'no join button';
  btn.click();
  return 'clicked';
});
await pg.waitForTimeout(700);
const gate = await pg.evaluate(() => {
  const m = document.querySelector('.modal-overlay');
  return { open: !!m, says: m?.textContent.replace(/\s+/g, ' ').slice(0, 90) || '' };
});
console.log('tapping "Adv+"  :', locked, '→', JSON.stringify(gate));

console.log('errors:', errs.length ? errs : 'none');
const ok = showsLevel
        && contact.open && /instagram\.com\/crsc_concordia/.test(contact.href) && contact.target === '_blank'
        && gate.open && /above your grade|niveau/i.test(gate.says)
        && !errs.length;
console.log('\n' + (ok
  ? 'a member sees their own level, and a locked list points them at the club'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
