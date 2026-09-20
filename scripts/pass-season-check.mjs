/*
 * A pass buys a season, not a lifetime.
 *
 * Twenty-one winter Saturdays already exist, so a fall pass with no end date
 * would keep holding spots — and keep paying for volleyball — right through
 * to the end of May. Here the pass runs out on 5 December: it must hold and
 * cover the Saturday before that, and neither hold nor cover the one after.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const KEY = 'crsc-demo-v7';
const L = (id) => ({ id, sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 21, level: 4, priceE: 8, priceC: 10, teamCount: 3 });
const sessions = [{ id: 's1', label: '5:30 - 7:30 PM' }];
const mk = (id, date) => ({ id, title: 'S', date, status: 'open', location: 'X', sessions,
  lists: [L(id + '-v1')], bundles: [], createdAt: 1 });

// Today has to sit before both Saturdays for them to be open at all.
const d = new Date(); d.setDate(d.getDate() + 7);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const inSeason = iso(d);
const after = new Date(d); after.setDate(d.getDate() + 7);
const outOfSeason = iso(after);

const fixture = {
  settings: { passAutoSeat: true, signupOpenDaysBefore: 60 }, removals: [], payments: [],
  players: {
    dG: { deviceId: 'dG', name: 'Giulio Graziani', email: 'g@x.com', battlePass: '4h', level: 4,
          passUntil: inSeason,
          passLists: [{ sport: 'volleyball', sessionId: 's1', label: 'Advanced +' }] },
  },
  events: [mk('evIn', inSeason), mk('evOut', outOfSeason)],
  // He signs himself up for the Saturday after his pass ends: if the pass
  // still covered him he would owe nothing, and he must owe the $8.
  signups: { evIn: [], evOut: [{
    id: 'su-out', listId: 'evOut-v1', name: 'Giulio Graziani', email: 'g@x.com',
    phone: '', insta: '', photo: '', deviceId: 'dG', method: 'etransfer',
    paid: false, checkedIn: false, team: null, order: 10, createdAt: 10,
  }] },
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

const rows = (id) => pg.evaluate(([K, e]) =>
  (JSON.parse(localStorage.getItem(K)).signups[e] || []).length, [KEY, id]);

for (const id of ['evIn', 'evOut']) {
  await pg.goto(`http://localhost:8099/?e=${id}#/event/${id}`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1600);
}
const seatedIn = await rows('evIn');
const seatedOut = await rows('evOut') - 1;   // minus the sign-up seeded above
console.log(`pass runs out ${inSeason}`);
console.log(`  ${inSeason}  (in season)     : ${seatedIn} seat(s)  — want 1`);
console.log(`  ${outOfSeason}  (after it ends) : ${seatedOut} seat(s)  — want 0`);

// And the money: the pass covers the night it is valid for, not the one after.
const owed = await pg.evaluate(async () => {
  const out = {};
  for (const id of ['evIn', 'evOut']) {
    location.hash = '#/event/' + id;
    await new Promise(r => setTimeout(r, 700));
    const btn = [...document.querySelectorAll('button')].find(b => /payments/i.test(b.textContent));
    if (!btn) { out[id] = 'no payments button'; continue; }
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const stat = [...document.querySelectorAll('.stat')].find(s => /outstanding/i.test(s.textContent));
    out[id] = stat ? stat.textContent.replace(/\s+/g, ' ').trim() : '?';
    document.querySelector('.modal-overlay [data-close]')?.click();
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
});
console.log('  outstanding             :', JSON.stringify(owed), '— want 0$ then 8$');

console.log('errors:', errs.length ? errs : 'none');
const ok = seatedIn === 1 && seatedOut === 0
        && /0\$/.test(owed.evIn) && /8\$/.test(owed.evOut) && !errs.length;
console.log('\n' + (ok
  ? 'the pass holds and covers its own season, and stops at the end of it'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
