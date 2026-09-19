/*
 * The bug this guards against.
 *
 * renderEvent starts watching a week and seats the pass holders in the same
 * breath, so on the very first render the roster snapshot has not landed yet
 * and every existing sign-up is invisible. Auto-seating then concluded that
 * nobody was seated and seated everybody again — once per page load, which is
 * how six Saturdays ended up with 97 duplicate rows.
 *
 * This serves a store.js whose demo backend behaves like Firestore does:
 * init() hands over a week with NO roster, and watchEvent() delivers it half a
 * second later. That is the exact window the live app was writing into.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const V = (id, sess, label) => ({ id, sessionId: sess, sport: 'volleyball', label, cap: 21, level: 4, priceE: 8, priceC: 10, teamCount: 3 });
const seats = [{ sport: 'volleyball', sessionId: 's1', label: 'Advanced +' },
               { sport: 'volleyball', sessionId: 's2', label: 'Adv + Men' }];

const fixture = {
  settings: {}, removals: [], payments: [],
  players: {
    dG: { deviceId: 'dG', name: 'Giulio Graziani', email: 'ggraziani991@gmail.com', battlePass: '4h', passLists: seats, level: 4 },
    dR: { deviceId: 'dR', name: 'Rayan Sedraoui', email: 'rayansedraoui10@gmail.com', battlePass: '4h', passLists: seats, level: 4 },
  },
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 – 7:30 PM' }, { id: 's2', label: '7:30 – 9:30 PM' }],
    lists: [V('v1', 's1', 'Advanced +'), V('v2', 's2', 'Adv + Men')],
    bundles: [], createdAt: 1 }],
  signups: { ev: [] },
};

/* Serve the real store.js, with the demo backend made slow the way the
 * network is slow. Nothing else about it changes. */
const src = readFileSync(new URL('../public/js/store.js', import.meta.url), 'utf8');
const before = `    async init(cb) { onChange = cb; onChange(state); },
    watchEvent() {},`;
if (!src.includes(before)) { console.error('store.js no longer looks like this — update the patch'); process.exit(2); }
const after = `    async init(cb) {
      const delivered = new Set();
      const visible = () => {
        const sig = {};
        for (const k of Object.keys(state.signups)) if (delivered.has(k)) sig[k] = state.signups[k];
        return { ...state, signups: sig };
      };
      window.__deliver = (id) => { delivered.add(id); onChange(visible()); };
      onChange = (s) => cb(s === state ? visible() : s);
      onChange(state);
    },
    watchEvent(id) {
      if (window.__watching && window.__watching.has(id)) return;
      (window.__watching = window.__watching || new Set()).add(id);
      setTimeout(() => window.__deliver(id), 500);
    },`;
const patched = src.replace(before, after);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
await pg.route('**/js/store.js', r => r.fulfill({ contentType: 'application/javascript', body: patched }));
await pg.addInitScript(({ KEY, fixture }) => {
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(fixture));
  localStorage.setItem('crsc-profile', JSON.stringify({ name: 'Exec', email: 'e@x.com', deviceId: 'dExec' }));
  sessionStorage.setItem('crsc-exec', '1');
}, { KEY, fixture });

const count = () => pg.evaluate((K) => {
  const st = JSON.parse(localStorage.getItem(K));
  const rows = st.signups['ev'] || [];
  const by = {};
  for (const s of rows) { const k = (s.email || s.name) + ' @' + s.listId; by[k] = (by[k] || 0) + 1; }
  return { total: rows.length, worst: Math.max(0, ...Object.values(by)) };
}, KEY);

// Six page loads. Each one renders the week before its roster arrives.
for (let i = 1; i <= 6; i++) {
  // A distinct query string so this is a real page load, not a hash hop.
  await pg.goto(`http://localhost:8099/?load=${i}#/event/ev`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1600);
  console.log(`page load ${i} :`, JSON.stringify(await count()));
}

const c = await count();
// Two holders x two slots = four held spots, however slow the roster is.
const ok = c.total === 4 && c.worst === 1 && !errs.length;
console.log('errors:', errs.length ? errs : 'none');
console.log('\n' + (ok
  ? 'roster arrives late six times over and there are still four seats, one each'
  : `FAILED — ${c.total} rows, one person seated ${c.worst} times`));
await b.close();
process.exit(ok ? 0 : 1);
