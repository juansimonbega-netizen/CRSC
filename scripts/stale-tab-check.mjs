/*
 * A tab left open must not keep running old code.
 *
 * This is the hole that let a pass holder be seated twice two days AFTER the
 * duplicate fix shipped: an exec's phone had the page open from before it,
 * and giving each deploy its own script URLs does nothing for a page that
 * never reloads.
 *
 * Here the page is served as build "old" while version.json says "new". It
 * has to notice and reload itself — but not while a sheet is open, because
 * that would throw away whatever the exec was in the middle of.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const KEY = 'crsc-demo-v7';
let VERSION = '{"v":"old"}';                  // matches the build at first

const page404 = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  // Serve the app stamped as build "old", the way a real deploy does.
  .replace('src="js/app.js"', 'src="js/app.js?v=old"');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
let loads = 0; pg.on('load', () => loads++);

await pg.route('**/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.FIREBASE_CONFIG=null;window.MAILER=null;' }));
await pg.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: VERSION }));
await pg.route('http://localhost:8099/', r => r.fulfill({ contentType: 'text/html', body: page404 }));
await pg.addInitScript(() => {
  localStorage.setItem('crsc-profile', JSON.stringify({ name: 'Exec', email: 'e@x.com', deviceId: 'dExec' }));
  sessionStorage.setItem('crsc-exec', '1');
});

await pg.goto('http://localhost:8099/#/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1500);
const build = await pg.evaluate(() => document.querySelector('script[src*="app.js"]')?.getAttribute('src'));
console.log('loaded as          :', build);
const after1 = loads;

// Same version: it must sit still. A page that reloads on every check is
// worse than one that never does.
await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForTimeout(900);
console.log('same build, reloads:', loads - after1, '(must be 0)');
const quiet = loads - after1 === 0;

// Now an exec opens a sheet, and the club ships something new mid-action.
await pg.evaluate(() => document.querySelector('#btn-players')?.click());
await pg.waitForTimeout(500);
const sheetOpen = await pg.evaluate(() => !!document.querySelector('.modal-overlay'));
VERSION = '{"v":"new"}';
await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForTimeout(1200);
const stillOpen = await pg.evaluate(() => !!document.querySelector('.modal-overlay'));
console.log('sheet open         :', sheetOpen, '→ still open after a new build lands:', stillOpen, '(must stay open)');

// They close it. That is the quiet moment the reload was waiting for.
await pg.evaluate(() => document.querySelector('.modal-overlay [data-close]')?.click());
await pg.waitForTimeout(2500);
console.log('reloaded after close:', loads > after1);

console.log('errors:', errs.length ? errs : 'none');
const ok = quiet && sheetOpen && stillOpen && loads > after1 && !errs.length;
console.log('\n' + (ok
  ? 'a stale tab reloads itself, and never while somebody is mid-action'
  : 'FAILED'));
await b.close();
process.exit(ok ? 0 : 1);
