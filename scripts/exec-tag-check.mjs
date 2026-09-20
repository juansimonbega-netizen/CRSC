/*
 * The exec gate used to be four digits sitting in a publicly readable
 * record. Now it is an allowlist of addresses checked against the one the
 * person proved by signing in.
 *
 * This drives the real code with a stubbed auth module — the sign-in itself
 * is Google's to get right; what this pins down is everything that hangs
 * off it. Three people: one on the list, one signed in but not on it, and
 * one signed out. Only the first gets exec powers, and the list guards
 * against the two mistakes that would lock the club out of its own app.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const KEY = 'crsc-demo-v7';
const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
const DATE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fixture = {
  settings: { execEmails: ['juansimonbega@gmail.com', 'essma.snechi@gmail.com'], requireSignIn: true },
  removals: [], payments: [], log: [], players: {},
  events: [{ id: 'ev', title: 'S', date: DATE, status: 'open', location: 'X',
    sessions: [{ id: 's1', label: '5:30 - 7:30 PM' }],
    lists: [{ id: 'v1', sessionId: 's1', sport: 'volleyball', label: 'Advanced +', cap: 21, level: 0, priceE: 8, priceC: 10, teamCount: 3 }],
    bundles: [], createdAt: 1 }],
  signups: { ev: [] },
};

/* Stand in for Firebase Auth: whoever window.__WHO says is signed in. */
const authStub = `
let user = null, cb = () => {};
export function authReady() { return true; }
export function currentUser() { return user; }
export async function initAuth(app, onUser) {
  cb = onUser;
  user = window.__WHO || null;
  window.__setUser = (u) => { user = u; cb(u); };
  onUser(user);
  return true;
}
export async function signInWithGoogle() { window.__setUser({ email: 'new@x.com', name: 'New Person', photo: '' }); }
export async function sendEmailLink(email) { window.__linkSentTo = email; }
export async function signOutNow() { window.__setUser(null); }
`;

async function open(who, settings) {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
  await pg.route('**/js/auth.js', r => r.fulfill({ contentType: 'application/javascript', body: authStub }));
  await pg.addInitScript(({ KEY, fixture, who, settings }) => {
    const f = settings ? { ...fixture, settings: { ...fixture.settings, ...settings } } : fixture;
    localStorage.setItem(KEY, JSON.stringify(f));
    window.__WHO = who;
    if (who) localStorage.setItem('crsc-profile', JSON.stringify({ name: who.name, email: who.email, deviceId: 'd-' + who.email }));
  }, { KEY, fixture, who, settings: settings || null });
  await pg.goto('http://localhost:8099/#/', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1300);
  return pg;
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext();
const errs = [];

// 1. Signed out — the door, and nothing behind it.
const out = await open(null);
const door = await out.evaluate(() => ({
  signIn: !!document.querySelector('#si-google'),
  calendar: !!document.querySelector('.cal-grid, .calendar'),
  execTools: !!document.querySelector('#btn-players'),
}));
console.log('signed out       :', JSON.stringify(door));
await out.evaluate(() => document.querySelector('#si-link') && (document.querySelector('#si-email').value = 'someone@hotmail.com'));
await out.evaluate(() => document.querySelector('#si-link')?.click());
await out.waitForTimeout(300);
const linkTo = await out.evaluate(() => window.__linkSentTo);
console.log('email-link route :', linkTo);

// 2. Signed in, not on the list — a member, nothing more.
const member = await open({ email: 'rayansedraoui10@gmail.com', name: 'Rayan', photo: '' });
const asMember = await member.evaluate(() => ({
  execTools: !!document.querySelector('#btn-players'),
  execsBtn: !!document.querySelector('#btn-execs'),
  tag: !!document.querySelector('.chip-exec-tag'),
  canSeeCalendar: !!document.querySelector('.cal-grid, .calendar, .cal-month'),
}));
console.log('member           :', JSON.stringify(asMember));

// 3. On the list — exec.
const exec = await open({ email: 'Juansimonbega@GMAIL.com', name: 'Juan', photo: '' });
const asExec = await exec.evaluate(() => ({
  execTools: !!document.querySelector('#btn-players'),
  execsBtn: !!document.querySelector('#btn-execs'),
  tag: !!document.querySelector('.chip-exec-tag'),
}));
console.log('exec (odd case)  :', JSON.stringify(asExec));

// The two mistakes that would lock the club out.
await exec.evaluate(() => document.querySelector('#btn-execs')?.click());
await exec.waitForTimeout(500);
const guards = await exec.evaluate(() => ({
  rows: [...document.querySelectorAll('#ex-list .entry')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  canDropSelf: [...document.querySelectorAll('[data-drop]')].some(b => /juansimonbega/.test(b.dataset.drop)),
}));
console.log('exec list        :', JSON.stringify(guards.rows));
console.log('can remove self  :', guards.canDropSelf, '(must be false)');

// 4. The lockout that must not be possible.
//
// Sign-in shipped before the club had turned it on, and before Firebase had
// its sign-in methods enabled. If the door went up on its own, every member
// AND every exec would be standing outside an app nobody could open. Until
// the club sets requireSignIn, being signed out has to change nothing.
const notYet = await open(null, { requireSignIn: false });
const stillWorks = await notYet.evaluate(() => ({
  door: !!document.querySelector('#si-google'),
  calendar: !!document.querySelector('.cal-grid, .calendar, .cal-month'),
  offered: !!document.querySelector('#btn-signin'),
}));
console.log('door not turned on:', JSON.stringify(stillWorks), '(door must be false, calendar true)');

console.log('errors:', errs.length ? errs : 'none');
const ok = !stillWorks.door && stillWorks.calendar && stillWorks.offered
        && door.signIn && !door.calendar && !door.execTools && linkTo === 'someone@hotmail.com'
        && !asMember.execTools && !asMember.execsBtn && !asMember.tag
        && asExec.execTools && asExec.execsBtn && asExec.tag
        && guards.rows.length === 2 && guards.canDropSelf === false
        && !errs.length;
console.log('\n' + (ok
  ? 'only the tagged addresses can change anything, and nobody can lock the club out'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
