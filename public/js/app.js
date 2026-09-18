import {
  createStore, SPORTS, LEVELS, levelByRank, listLevel, uid, deviceId, setDeviceId, makeTemplateEvent, nextSaturday, saturdaysUntil, localISO,
} from './store.js';
import { t, tLang, getLang, setLang, locale } from './i18n.js';
import { promotionCandidate, sendMail, mailerConfigured, reminderDue } from './notify.js';
import { resolvePayment, nameHits, passPurchase, isTestTransfer, normalize } from './automatch.js';

/* ================================================================== */
/* Small utilities                                                     */
/* ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
}

/* Date + time of an action, e.g. "Sep 12, 8:14 p.m." */
function fmtStamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(locale(), {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtMoney(n) {
  return (n === Math.floor(n) ? n : n.toFixed(2)) + '$';
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

function openModal(html, { wide = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  $$('[data-close]', overlay).forEach(b => b.addEventListener('click', () => overlay.remove()));
  return overlay;
}

/* `alert: true` states something rather than asking it — one button, no
 * destructive option to tap by accident. */
function confirmModal(message, confirmLabel, { alert = false } = {}) {
  return new Promise(resolve => {
    const ov = openModal(`
      <div class="modal-body">
        <p class="confirm-msg">${esc(message)}</p>
        <div class="row gap">
          ${alert ? '' : `<button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>`}
          <button class="btn ${alert ? 'btn-primary' : 'btn-danger'} grow" id="cf-yes">${esc(confirmLabel || t('confirm'))}</button>
        </div>
      </div>`);
    $('#cf-yes', ov).addEventListener('click', () => { ov.remove(); resolve(true); });
    ov.addEventListener('click', e => { if (e.target === ov) resolve(false); });
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', () => resolve(false)));
  });
}

/* ================================================================== */
/* Local identity                                                      */
/* ================================================================== */

function getProfile() {
  try { return JSON.parse(localStorage.getItem('crsc-profile')) || null; } catch (e) { return null; }
}
function saveProfile(p) {
  try { localStorage.setItem('crsc-profile', JSON.stringify(p)); } catch (e) { /* ignore */ }
}

function isExec() { return sessionStorage.getItem('crsc-exec') === '1'; }
function setExec(on) {
  if (on) sessionStorage.setItem('crsc-exec', '1');
  else sessionStorage.removeItem('crsc-exec');
}

function fileToThumb(file, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ================================================================== */
/* App state                                                           */
/* ================================================================== */

let store = null;
let state = { settings: {}, events: [], signups: {} };
const DEVICE = deviceId();

/* ================================================================== */
/* Domain helpers                                                      */
/* ================================================================== */

function eventSignups(eventId) {
  return state.signups[eventId] || [];
}

/* Has this week's roster actually arrived? An undefined entry means "not
 * fetched yet" — very different from a night nobody signed up for, and the
 * difference matters when the screen is reporting a week's takings. */
function signupsLoaded(eventId) {
  return Array.isArray(state.signups[eventId]);
}

function listEntries(eventId, listId) {
  return eventSignups(eventId)
    .filter(s => s.listId === listId)
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
}

function splitByCap(entries, cap) {
  return { confirmed: entries.slice(0, cap), waitlist: entries.slice(cap) };
}

function mySignups(eventId) {
  return eventSignups(eventId).filter(s => s.deviceId === DEVICE);
}

function listById(event, listId) {
  return (event.lists || []).find(l => l.id === listId);
}

/* Team-count choices per sport (volleyball: at most 4 teams). */
function teamOptionsFor(sport) {
  const max = SPORTS[sport]?.maxTeams;
  const all = [2, 3, 4, 6];
  return max ? all.filter(n => n <= max) : all;
}
function sessionById(event, sessionId) {
  return (event.sessions || []).find(s => s.id === sessionId);
}

function todayStr() {
  return localISO();
}

/* An event whose Saturday has passed becomes a read-only record automatically. */
function isPastEvent(ev) {
  return !!ev.date && ev.date < todayStr();
}

/*
 * Registration opens on a rolling weekly window: a Saturday becomes
 * signable on the Sunday before it (6 days ahead by default), so only the
 * coming Saturday takes sign-ups while later ones sit on the calendar as
 * "opens later". An exec can open any date early from the event page.
 */
function eventOpensAt(ev) {
  if (!ev.date) return 0;
  const days = parseFloat(state.settings.signupOpenDaysBefore);
  const ahead = isNaN(days) ? 6 : days;
  const d = new Date(ev.date + 'T00:00:00');
  d.setDate(d.getDate() - ahead);
  return d.getTime();
}

/* A future event whose sign-up window has not started yet. */
function isScheduled(ev) {
  if (ev.status !== 'open' || isPastEvent(ev) || ev.openEarly) return false;
  return Date.now() < eventOpensAt(ev);
}

function isEventOpen(ev) {
  return ev.status === 'open' && !isPastEvent(ev) && !isScheduled(ev);
}

/*
 * Self-removal closes N hours before the first session (default 24h, so the
 * waitlist has time to fill freed spots). Execs can still remove anyone.
 */
function cancellationLocked(ev) {
  if (!ev.date) return false;
  const hours = parseFloat(state.settings.cancelLockHours) || 24;
  const start = new Date(ev.date + 'T17:00:00');
  return Date.now() >= start.getTime() - hours * 3600 * 1000;
}

/* Season Battle Pass (volleyball only): '4h' | '2h' | null, set by execs
 * on the player's registry entry. */
function playerPass(deviceId) {
  return (deviceId && (state.players || {})[deviceId]?.battlePass) || null;
}

/*
 * A player's graded level, set by an exec. Null until someone grades them —
 * a new member plays their first night wherever they like, and the club
 * decides afterwards where they belong.
 */
function playerLevel(deviceId) {
  const r = deviceId && (state.players || {})[deviceId]?.level;
  return r ? Number(r) : null;
}

/*
 * May this device sign itself up for this list?
 *
 * Ungraded players and ungraded lists are always allowed. A graded player
 * may play at their level and anything below it. Execs are never gated —
 * they place people by hand, which is how someone gets moved up.
 */
function canSelfJoin(list) {
  const need = listLevel(list);
  if (!need) return true;
  const mine = playerLevel(DEVICE);
  if (!mine) return true;
  return mine >= need;
}

/*
 * The lists a pass holder is seated in every week — sport + time slot +
 * level, matched by name so it follows the player into each new Saturday.
 * A 2h pass holds one; a 4h pass can hold one in each time slot.
 */
function passLists(player) {
  return Array.isArray(player?.passLists) ? player.passLists : [];
}

function findList(ev, want) {
  return (ev.lists || []).find(l =>
    l.sport === want.sport && l.sessionId === want.sessionId && l.label === want.label);
}

/*
 * Seat the season-pass holders.
 *
 * A pass is a standing reservation: the club took a season's money up front,
 * so the spot is theirs before sign-ups open and stays theirs whether or not
 * they remember to sign up. They tell an exec when they cannot make it and
 * the exec takes the name off for that week — which is why this only ever
 * ADDS a missing seat and never re-adds one somebody removed on purpose.
 *
 * `order: -1` puts them above the walk-up queue, so a held spot cannot be
 * pushed onto the waitlist by people signing up at midnight on Sunday.
 */
async function seatPassHolders(ev) {
  if (!isExec() || !state.settings.passAutoSeat) return;
  if (ev.status !== 'open' || isPastEvent(ev)) return;
  const existing = eventSignups(ev.id);
  const removed = new Set((state.removals || [])
    .filter(r => r.eventId === ev.id)
    .map(r => (r.deviceId || '') + '|' + r.listId));
  const adds = [];
  for (const player of Object.values(state.players || {})) {
    if (!player.battlePass) continue;
    for (const want of passLists(player)) {
      const list = findList(ev, want);
      if (!list) continue;
      if (existing.some(su => su.deviceId === player.deviceId && su.listId === list.id)) continue;
      if (removed.has(player.deviceId + '|' + list.id)) continue;   // taken off on purpose
      adds.push({
        id: uid('su'), listId: list.id, name: player.name,
        email: player.email || '', phone: player.phone || '', insta: player.insta || '',
        photo: player.photo || '', method: 'etransfer', deviceId: player.deviceId,
        paid: false, checkedIn: false, lang: player.lang || 'en',
        viaPass: true, order: -1, createdAt: Date.now(),
      });
    }
  }
  if (adds.length) {
    await store.addSignups(ev.id, adds);
    toast(t('passSeated', { n: adds.length }));
  }
}

/*
 * Price for a set of lists (one person, one event), applying bundles:
 * if a bundle exists for a sport and the person plays that sport in 2+
 * time slots, the bundle price replaces the per-slot prices for that sport.
 * A Battle Pass zeroes volleyball: '4h' covers everything, '2h' covers the
 * earliest slot and any extra volleyball is charged per list (no bundle) —
 * this must stay consistent with coveredSignupIds below.
 */
function computePrice(event, listIds, method, pass = null) {
  const key = method === 'cash' ? 'priceC' : 'priceE';
  const bySport = {};
  let total = 0;
  const parts = [];
  for (const id of listIds) {
    const l = listById(event, id);
    if (!l) continue;
    (bySport[l.sport] = bySport[l.sport] || []).push(l);
  }
  for (const [sport, lists] of Object.entries(bySport)) {
    if (sport === 'volleyball' && pass) {
      const sorted = [...lists].sort((a, b) => (a.sessionId || '').localeCompare(b.sessionId || ''));
      sorted.forEach((l, i) => {
        const covered = pass === '4h' || i === 0;
        const price = covered ? 0 : (l[key] ?? 0);
        total += price;
        parts.push({
          label: `${SPORTS[sport].label} — ${l.label}${covered ? ' · ' + t('battlePass') : ''}`,
          price,
        });
      });
      continue;
    }
    const sessions = new Set(lists.map(l => l.sessionId));
    const bundle = (event.bundles || []).find(b => b.sport === sport);
    if (bundle && sessions.size >= 2) {
      total += bundle[key] ?? 0;
      parts.push({ label: bundle.label || (SPORTS[sport].label + ' bundle'), price: bundle[key] ?? 0 });
    } else {
      for (const l of lists) {
        total += l[key] ?? 0;
        parts.push({
          label: `${SPORTS[l.sport]?.label || l.sport} — ${l.label}`,
          price: l[key] ?? 0,
        });
      }
    }
  }
  return { total, parts };
}

/*
 * Which signups of an event are covered by their owner's Battle Pass.
 * Mirrors the computePrice pass rule: '4h' covers every volleyball signup,
 * '2h' covers the one in the earliest slot.
 */
function coveredSignupIds(ev) {
  const set = new Set();
  const byPerson = {};
  for (const su of eventSignups(ev.id)) (byPerson[personKey(su)] = byPerson[personKey(su)] || []).push(su);
  for (const sus of Object.values(byPerson)) {
    const pass = playerPass(sus[0].deviceId);
    if (!pass) continue;
    const volley = sus
      .filter(s => listById(ev, s.listId)?.sport === 'volleyball')
      .sort((a, b) => (listById(ev, a.listId)?.sessionId || '').localeCompare(listById(ev, b.listId)?.sessionId || ''));
    if (pass === '4h') volley.forEach(s => set.add(s.id));
    else if (volley[0]) set.add(volley[0].id);
  }
  return set;
}

/* One-line price recap for an event: each distinct sport price shown once. */
function pricesSummary(ev) {
  const seen = new Set();
  const parts = [];
  for (const l of ev.lists || []) {
    const sport = SPORTS[l.sport] || SPORTS.other;
    const price = `${fmtMoney(l.priceE ?? 0)}${(l.priceC ?? l.priceE) !== l.priceE ? ` (${fmtMoney(l.priceC)} ${t('cash')})` : ''}`;
    const key = l.sport + '|' + price;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${esc(sport.label)} <strong>${price}</strong>`);
  }
  for (const b of ev.bundles || []) {
    const sport = SPORTS[b.sport] || SPORTS.other;
    parts.push(`${esc(sport.label)} ${t('bothSlots')} <strong>${fmtMoney(b.priceE ?? 0)}</strong>`);
  }
  return parts.join('&ensp;·&ensp;');
}

function personKey(s) {
  return s.deviceId !== 'exec-added' && s.deviceId ? s.deviceId + '|' + s.name.toLowerCase() : 'name|' + s.name.toLowerCase();
}

/*
 * The sign-ups that actually hold a place, as opposed to sitting on the
 * waitlist. Nobody owes for a spot they never got.
 */
function confirmedSignupIds(ev) {
  const set = new Set();
  for (const l of ev.lists || []) {
    const { confirmed } = splitByCap(listEntries(ev.id, l.id), l.cap || 0);
    confirmed.forEach(su => set.add(su.id));
  }
  return set;
}

function personTotals(ev) {
  const covered = coveredSignupIds(ev);
  const held = confirmedSignupIds(ev);
  const persons = {};
  for (const su of eventSignups(ev.id)) {
    const k = personKey(su);
    if (!persons[k]) persons[k] = { name: su.name, insta: su.insta, method: su.method, deviceId: su.deviceId, signups: [] };
    persons[k].signups.push(su);
  }
  return Object.values(persons).map(p => {
    const pass = playerPass(p.deviceId);
    // Money is owed per spot, so split the person's spots into what is
    // settled (paid, or covered by their pass) and what is still owed.
    // Someone who paid for volleyball but also signed up for basketball
    // owes the basketball price only — never the whole evening again.
    // The pass is already accounted for by coveredSignupIds, so the
    // remaining spots are priced without it.
    const settled = p.signups.filter(x => x.paid && !covered.has(x.id));
    // A waitlisted name is not a debt. They never got on the court, so they
    // are not billed, not reminded, and not chased — and their spot is not
    // counted in what the club is owed.
    const owing = p.signups.filter(x => !x.paid && !covered.has(x.id) && held.has(x.id));
    const { total: paidAmount } = computePrice(ev, settled.map(x => x.listId), p.method, null);
    let { total } = computePrice(ev, owing.map(x => x.listId), p.method, null);
    const paid = owing.length === 0;   // nothing owed: settled, covered, or waitlisted
    // Automatic late fee once the Saturday has passed and they still owe.
    const late = isPastEvent(ev) && !paid && total > 0;
    if (late) total += parseFloat(state.settings.lateFeeAmount) || 0;
    return {
      ...p, total, paidAmount, pass, late, paid,
      checkedIn: p.signups.some(x => x.checkedIn),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/* ================================================================== */
/* Emails: confirmation, payment reminders, waitlist promotion         */
/* ================================================================== */

/* Emails render in the recipient's own language (stored on their signup). */
function fmtDateLang(iso, lang) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA',
    { weekday: 'long', month: 'long', day: 'numeric' });
}

function payLineFor(lang, method, total) {
  const key = method === 'cash' ? 'payLineC' : 'payLineE';
  return tLang(lang, key, { total: fmtMoney(total), email: state.settings.etransferEmail || '' });
}

async function sendConfirmationEmail(ev, profile, listIds, method) {
  const lang = getLang();
  const myPass = playerPass(DEVICE);
  const allMine = [...new Set([...mySignups(ev.id).map(m => m.listId), ...listIds])];
  const { total } = computePrice(ev, allMine, method, myPass);
  const lists = allMine.map(id => {
    const l = listById(ev, id);
    const sess = l ? sessionById(ev, l.sessionId) : null;
    return `- ${SPORTS[l?.sport]?.label || ''} ${l?.label || ''} (${sess?.label || ''})`;
  }).join('\n');
  const vars = {
    name: profile.name,
    date: fmtDateLang(ev.date, lang),
    lists,
    payLine: total === 0 && myPass ? tLang(lang, 'battlePassCovered') : payLineFor(lang, method, total),
    late: state.settings.lateFeeNote || '',
    location: ev.location || state.settings.location || '',
    club: state.settings.clubFullName || 'CRSC',
  };
  try {
    if (store.mode === 'demo' || !mailerConfigured()) {
      toast(t('confEmailSim', { email: profile.email }));
      return;
    }
    const r = await sendMail({
      to: profile.email,
      subject: tLang(lang, 'emailConfSubject', { date: vars.date }),
      message: tLang(lang, 'emailConfBody', vars),
    });
    if (r.sent) toast(t('confEmailSent', { email: profile.email }));
  } catch (err) {
    console.error('confirmation email', err);
    toast(t('confEmailFail'), 'err');
  }
}

/*
 * "We got your money" — the receipt.
 *
 * Without it, automatic matching is invisible to the player: they send an
 * e-transfer and hear nothing, so they ask an exec anyway and the club is
 * back to answering messages by hand. Sent once per person per event
 * (claimed before sending, so two execs' open tabs cannot both send it).
 */
async function notifyPaymentReceived(ev, people, pay = null) {
  if (store.mode === 'demo' || !mailerConfigured()) return;
  // One transfer often pays for several people. The person who actually sent
  // it must see the amount they really sent and who it covered — telling a
  // player "we received 8$" when they sent 16$ reads like half of it vanished.
  const senderName = pay && people.length > 1
    ? (nameHits(pay.sender || '', people)[0]?.person?.name || null)
    : null;
  for (const p of people) {
    const sus = (p.signups || []).filter(su => su.email && !su.paidEmailSentAt);
    if (!sus.length) continue;
    const su = sus[0];
    const lang = su.lang === 'fr' ? 'fr' : 'en';
    const lists = sus.map(x => {
      const l = listById(ev, x.listId);
      const sess = l ? sessionById(ev, l.sessionId) : null;
      return `• ${SPORTS[l?.sport]?.label || ''} ${l?.label || ''}${sess ? ' (' + sess.label + ')' : ''}`;
    }).join('\n');
    const isSender = senderName && p.name === senderName;
    const others = people.filter(x => x.name !== p.name).map(x => x.name);
    const date = fmtDateLang(ev.date, lang);
    const openLine = !senderName
      ? tLang(lang, 'paidOpenSelf', { total: fmtMoney(p.paidAmount || p.total || 0), date })
      : isSender
        ? tLang(lang, 'paidOpenGroup', { total: fmtMoney(pay.amount || 0), date, names: others.join(', ') })
        : tLang(lang, 'paidOpenCovered', { date, sender: senderName });
    await Promise.all(sus.map(x => store.updateSignup(ev.id, x.id, { paidEmailSentAt: Date.now() })));
    try {
      await sendMail({
        to: su.email,
        subject: tLang(lang, 'emailPaidSubject', { date }),
        message: tLang(lang, 'emailPaidBody', {
          name: su.name,
          date,
          openLine,
          lists,
          location: ev.location || state.settings.location || '',
          club: state.settings.clubFullName || 'CRSC',
        }),
      });
    } catch (err) { console.error('payment receipt', err); }
  }
}

/* A season pass is real money and a standing commitment — it gets its own
 * receipt explaining what the player just bought. */
async function notifyPassActivated(player, type, amount) {
  if (store.mode === 'demo' || !mailerConfigured() || !player.email) return;
  const lang = player.lang === 'fr' ? 'fr' : 'en';
  try {
    await sendMail({
      to: player.email,
      subject: tLang(lang, 'emailPassSubject', { type: type.toUpperCase() }),
      message: tLang(lang, 'emailPassBody', {
        name: player.name, type: type.toUpperCase(),
        total: fmtMoney(amount), club: state.settings.clubFullName || 'CRSC',
      }),
    });
  } catch (err) { console.error('pass receipt', err); }
}

/*
 * 24h-before payment reminders. A static site has no scheduler, so this runs
 * whenever anyone has the app open inside the reminder window; each person's
 * signups are flagged (claim-first) so nobody is emailed twice.
 */
let remindersRunning = false;
let remindersSimulated = false;
async function runPaymentReminders() {
  if (remindersRunning) return;
  remindersRunning = true;
  try {
    const live = store.mode !== 'demo' && mailerConfigured();
    let sent = 0;
    for (const ev of state.events) {
      if (!reminderDue(ev)) continue;
      store.watchEvent(ev.id);
      const signups = state.signups[ev.id];
      if (!signups) continue; // not loaded yet; a later pass will handle it
      // one reminder per person, bundle-aware total
      const covered = coveredSignupIds(ev);
      const persons = {};
      for (const su of signups) {
        if (su.paid || covered.has(su.id) || !su.email || su.paymentReminderSentAt) continue;
        const k = personKey(su);
        (persons[k] = persons[k] || []).push(su);
      }
      for (const sus of Object.values(persons)) {
        const su = sus[0];
        const lang = su.lang === 'fr' ? 'fr' : 'en';
        const { total } = computePrice(ev, sus.map(x => x.listId), su.method, playerPass(su.deviceId));
        if (total === 0) continue;
        if (live) {
          // claim before sending so a second open tab can't double-send
          await Promise.all(sus.map(x => store.updateSignup(ev.id, x.id, { paymentReminderSentAt: Date.now() })));
          try {
            await sendMail({
              to: su.email,
              subject: tLang(lang, 'emailRemSubject', { date: fmtDateLang(ev.date, lang) }),
              message: tLang(lang, 'emailRemBody', {
                name: su.name,
                date: fmtDateLang(ev.date, lang),
                total: fmtMoney(total),
                payLine: payLineFor(lang, su.method, total),
                late: state.settings.lateFeeNote || '',
                club: state.settings.clubFullName || 'CRSC',
              }),
            });
            sent++;
          } catch (err) {
            console.error('reminder email', err);
          }
        } else if (isExec() && !remindersSimulated) {
          // Demo mode: count only. Writing a flag per person would mean a
          // store write and a re-render for every unpaid player.
          sent++;
        }
      }
    }
    if (sent) {
      if (!live) remindersSimulated = true;
      toast(t(live ? 'remindersSent' : 'remindersSim', { n: sent }));
    }
  } finally {
    remindersRunning = false;
  }
}

/* ================================================================== */
/* Waitlist promotion (automatic, with email)                          */
/* ================================================================== */

/*
 * Call BEFORE `leaving` is removed/moved out of its list. Figures out who
 * crosses from the waitlist into the confirmed group, then (after the
 * mutation) emails them and records it on their signup.
 */
function prePromotion(ev, leaving) {
  const l = listById(ev, leaving.listId);
  if (!l) return null;
  const entries = listEntries(ev.id, leaving.listId);
  const cand = promotionCandidate(entries, l.cap || 0, leaving);
  return cand ? { cand, list: l } : null;
}

async function notifyPromotion(ev, promo) {
  if (!promo) return;
  const { cand, list } = promo;
  const sess = sessionById(ev, list.sessionId);
  try {
    if (store.mode === 'demo' || !mailerConfigured()) {
      if (cand.email) toast(t('promotedEmailSim', { name: cand.name }));
      else toast(t('promotedNoEmail', { name: cand.name }));
      await store.updateSignup(ev.id, cand.id, { promotedAt: Date.now(), promotedNotified: !!cand.email });
      return;
    }
    if (!cand.email) {
      toast(t('promotedNoEmail', { name: cand.name }));
      await store.updateSignup(ev.id, cand.id, { promotedAt: Date.now(), promotedNotified: false });
      return;
    }
    const lang = cand.lang === 'fr' ? 'fr' : 'en';
    const pass = playerPass(cand.deviceId);
    const { total } = computePrice(ev, [list.id], cand.method, pass);
    await sendMail({
      to: cand.email,
      subject: tLang(lang, 'emailPromoSubject', { date: fmtDateLang(ev.date, lang) }),
      message: tLang(lang, 'emailPromoBody', {
        name: cand.name,
        date: fmtDateLang(ev.date, lang),
        list: `${SPORTS[list.sport]?.label || list.sport} — ${list.label}`,
        session: sess ? sess.label : '',
        payLine: total === 0 && pass ? tLang(lang, 'battlePassCovered') : payLineFor(lang, cand.method, total),
        location: ev.location || state.settings.location || '',
        club: state.settings.clubFullName || 'CRSC',
      }),
    });
    toast(t('promotedEmailSent', { name: cand.name }));
    await store.updateSignup(ev.id, cand.id, { promotedAt: Date.now(), promotedNotified: true });
  } catch (err) {
    console.error('promotion email', err);
    toast(t('promotedEmailFail', { name: cand.name }), 'err');
  }
}

/*
 * Removing a name frees the spot, so the signup itself has to go — but a
 * record of it is kept forever. That record is the proof trail: if someone
 * signed up, was checked in (or removed their name after the game had
 * started), and then took their name off the list, the club can still see
 * they played and ask them to pay.
 */
async function logRemoval(ev, su, by) {
  const l = listById(ev, su.listId);
  const sess = l ? sessionById(ev, l.sessionId) : null;
  const covered = coveredSignupIds(ev).has(su.id);
  const { total } = covered ? { total: 0 } : computePrice(ev, [su.listId], su.method, playerPass(su.deviceId));
  const now = Date.now();
  const started = ev.date ? now >= new Date(ev.date + 'T17:00:00').getTime() : false;
  try {
    await store.addRemoval({
      id: uid('rm'),
      eventId: ev.id,
      eventDate: ev.date || '',
      name: su.name,
      email: su.email || '',
      phone: su.phone || '',
      insta: su.insta || '',
      deviceId: su.deviceId || '',
      listLabel: l ? l.label : '',
      sportLabel: l ? (SPORTS[l.sport]?.label || l.sport) : '',
      sessionLabel: sess ? sess.label : '',
      signedUpAt: su.createdAt || 0,
      removedAt: now,
      by,
      wasPaid: !!su.paid,
      wasCheckedIn: !!su.checkedIn,
      afterStart: started,
      // Owed only if they never paid and the pass doesn't cover it.
      amountOwed: su.paid ? 0 : total,
      // Proof they were there: checked in, or pulled out mid-game.
      flagged: (!!su.checkedIn || started) && !su.paid && !covered,
    });
  } catch (err) {
    console.error('logRemoval', err);
  }
}

async function removeSignup(ev, su, by = 'self') {
  const promo = prePromotion(ev, su);
  await logRemoval(ev, su, by);
  await store.deleteSignup(ev.id, su.id);
  await notifyPromotion(ev, promo);
}

async function moveSignup(ev, su, newListId) {
  const promo = prePromotion(ev, su);
  await store.updateSignup(ev.id, su.id, { listId: newListId, team: null, order: Date.now() });
  await notifyPromotion(ev, promo);
}

/* ================================================================== */
/* Rendering: shell + routing                                          */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Profile portability                                                  */
/*                                                                      */
/* A profile lives in this browser's storage, so opening the app from a */
/* different browser (or from the Claude artifact versus the real site) */
/* would otherwise look like a brand new person. Two ways across:       */
/*  - a personal link that carries the player id and contact details;   */
/*  - "I already have a profile", which looks the email up in the club  */
/*    registry (works once the club is on the shared database).         */
/* ------------------------------------------------------------------ */

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function profileLink() {
  const p = getProfile() || {};
  const payload = b64urlEncode(JSON.stringify({
    i: DEVICE, n: p.name || '', e: p.email || '', p: p.phone || '', g: p.insta || '',
  }));
  return location.href.split('#')[0] + '#/me/' + payload;
}

/* Take over the identity in a personal link, then reload so everything
 * derived from the player id is rebuilt. */
function adoptIdentity(raw) {
  let d = null;
  try { d = JSON.parse(b64urlDecode(raw)); } catch (e) { d = null; }
  if (!d || !d.i) {
    location.hash = '#/';
    toast(t('linkBad'), 'err');
    return;
  }
  const old = getProfile();
  setDeviceId(d.i);
  saveProfile({
    name: d.n || '', email: d.e || '', phone: d.p || '', insta: d.g || '',
    photo: (old && old.photo) || '',
  });
  $('#view').innerHTML = `<div class="empty">${esc(t('adopting'))}</div>`;
  const base = location.href.split('#')[0];
  location.replace(base + '#/');
  location.reload();
}

function findPlayerByEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return null;
  return Object.values(state.players || {}).find(p => (p.email || '').toLowerCase() === e) || null;
}

function openRestoreModal() {
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('restoreTitle'))}</h2>
      <p class="hint">${esc(t('restoreHint'))}</p>
      <input class="input" id="rs-email" type="email" placeholder="${esc(t('emailPh').replace(' *', ''))}" autofocus>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="rs-go">${esc(t('restoreBtn'))}</button>
      </div>
    </div>`);
  const go = () => {
    const found = findPlayerByEmail($('#rs-email', ov).value);
    if (!found) { toast(t('restoreNotFound'), 'err'); return; }
    setDeviceId(found.deviceId);
    saveProfile({
      name: found.name || '', email: found.email || '', phone: found.phone || '',
      insta: found.insta || '', photo: found.photo || '',
    });
    toast(t('welcomeBack', { name: found.name || '' }));
    setTimeout(() => location.reload(), 400);
  };
  $('#rs-go', ov).addEventListener('click', go);
  $('#rs-email', ov).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $('#rs-email', ov).focus();
}

function openTransferModal() {
  const link = profileLink();
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('transferTitle'))}</h2>
      <p class="hint">${esc(t('transferHint'))}</p>
      <input class="input transfer-link" id="tr-link" value="${esc(link)}" readonly>
      <div class="row gap">
        <button class="btn btn-ghost grow" id="tr-copy">${esc(t('copyLink'))}</button>
        ${navigator.share ? `<button class="btn btn-primary grow" id="tr-share">${esc(t('shareLink'))}</button>` : ''}
      </div>
      <p class="hint">${esc(t('photoNotCarried'))}</p>
      <button class="btn btn-ghost wide" data-close>${esc(t('close'))}</button>
    </div>`);
  $('#tr-copy', ov).addEventListener('click', async () => {
    const input = $('#tr-link', ov);
    try {
      await navigator.clipboard.writeText(link);
      toast(t('copiedToast'));
    } catch (e) {
      // Clipboard access is blocked in some embedded views; select instead.
      input.focus();
      input.setSelectionRange(0, link.length);
    }
  });
  $('#tr-share', ov)?.addEventListener('click', () => {
    navigator.share({ title: 'CRSC', url: link }).catch(() => {});
  });
}

function route() {
  const hash = location.hash || '#/';
  const me = hash.match(/^#\/me\/(.+)$/);
  if (me) return { view: 'adopt', payload: me[1] };
  const m = hash.match(/^#\/event\/([^/]+)/);
  if (m) return { view: 'event', eventId: m[1] };
  return { view: 'home' };
}

function render() {
  const r = route();
  renderHeader();
  if (r.view === 'adopt') { adoptIdentity(r.payload); return; }
  if (!getProfile()) { renderWelcome(); return; }
  if (r.view === 'event') {
    const ev = state.events.find(e => e.id === r.eventId);
    const hidden = ev && isPastEvent(ev) && !isExec();
    if (ev && !hidden) { store.watchEvent(ev.id); renderEvent(ev); }
    else $('#view').innerHTML = `<div class="empty">${esc(hidden ? t('pastHidden') : t('notFound'))} <a href="#/">${esc(t('backHome'))}</a></div>`;
  } else {
    renderHome();
  }
}

function renderHeader() {
  const s = state.settings;
  const other = getLang() === 'fr' ? 'EN' : 'FR';
  $('#header').innerHTML = `
    <a class="brand" href="#/">
      <span class="brand-mark">CRSC</span>
      <span class="brand-sub">${esc(s.clubFullName || '')}</span>
    </a>
    <div class="header-actions">
      ${store.mode === 'demo' ? `<span class="chip chip-demo" title="${esc(t('demoTitle'))}">DEMO</span>` : ''}
      <button class="btn btn-tiny btn-ghost" id="btn-lang">${other}</button>
      ${isExec()
        ? `<button class="btn btn-small btn-exec" id="btn-exec-off">${esc(t('execOnBtn'))}</button>`
        : `<button class="btn btn-small btn-ghost" id="btn-exec-on">${esc(t('execBtn'))}</button>`}
    </div>`;
  $('#btn-lang').addEventListener('click', () => {
    setLang(getLang() === 'fr' ? 'en' : 'fr');
    render();
  });
  const on = $('#btn-exec-on');
  if (on) on.addEventListener('click', openPinModal);
  const off = $('#btn-exec-off');
  if (off) off.addEventListener('click', () => { setExec(false); toast(t('execModeOff')); render(); });
}

/* ================================================================== */
/* Registration gate: everyone makes a profile before using the app    */
/* ================================================================== */

function registerPlayer(profile) {
  store.savePlayer({
    deviceId: DEVICE,
    name: profile.name,
    email: profile.email,
    phone: profile.phone || '',
    insta: profile.insta || '',
    photo: profile.photo || '',
    lang: getLang(),
    lastSeen: Date.now(),
  }).catch(err => console.error('savePlayer', err));
}

function renderWelcome() {
  $('#view').innerHTML = `
    <section class="hero">
      <h1>${esc(t('welcomeTitle'))}</h1>
      <p>${esc(t('tagline'))}</p>
    </section>
    <div class="card welcome-card">
      <p class="hint">${esc(t('welcomeText'))}</p>
      ${profileFieldsHtml(null)}
      <p class="hint">${esc(t('welcomePrivacy'))}</p>
      <button class="btn btn-primary wide" id="welcome-save">${esc(t('continueBtn'))}</button>
      <button class="btn btn-ghost wide" id="welcome-restore">${esc(t('haveProfile'))}</button>
    </div>`;
  wireProfileFields(document, null);
  $('#welcome-restore').addEventListener('click', openRestoreModal);
  $('#welcome-save').addEventListener('click', () => {
    const np = readProfileFields(document);
    if (!np) return;
    saveProfile(np);
    registerPlayer(np);
    toast(t('profileSaved'));
    render();
  });
}

/* ================================================================== */
/* Home: season calendar                                               */
/* ================================================================== */

function calDayState(ev) {
  if (isPastEvent(ev)) return 'past';
  if (ev.status !== 'open') return 'closed';
  if (isScheduled(ev)) return 'scheduled';
  const anySpace = (ev.lists || []).some(l => listEntries(ev.id, l.id).length < (l.cap || 0));
  return anySpace ? 'open' : 'full';
}

function renderCalendar() {
  const end = state.settings.seasonEnd || nextSaturday(12);
  const exec = isExec();
  const byDate = {};
  // A finished Saturday becomes the club's record of that night — who played,
  // who paid, who was checked in, who took their name off. Players see only
  // the weeks still to come; execs keep every past week.
  for (const ev of state.events) {
    if (!ev.date) continue;
    if (isPastEvent(ev) && !exec) continue;
    byDate[ev.date] = ev;
  }

  const startM = new Date(); startM.setDate(1);
  const endM = new Date(end + 'T12:00:00');
  const months = [];
  const cur = new Date(startM);
  while (cur.getFullYear() < endM.getFullYear() || (cur.getFullYear() === endM.getFullYear() && cur.getMonth() <= endM.getMonth())) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
    if (months.length > 12) break;
  }

  const dow = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 1, i + 1); // Feb 1 2026 is a Sunday
    dow.push(d.toLocaleDateString(locale(), { weekday: 'narrow' }));
  }

  const monthsHtml = months.map(m => {
    const y = m.getFullYear(), mo = m.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const offset = new Date(y, mo, 1).getDay();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="cal-day cal-blank"></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const ev = byDate[iso];
      if (ev) {
        const st = calDayState(ev);
        const mine = mySignups(ev.id).length > 0;
        cells += `<a class="cal-day cal-sat is-${st} ${mine ? 'is-mine' : ''}" href="#/event/${esc(ev.id)}">${day}</a>`;
      } else {
        cells += `<span class="cal-day">${day}</span>`;
      }
    }
    return `
      <div class="cal-month">
        <div class="cal-month-name">${esc(m.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))}</div>
        <div class="cal-grid">
          ${dow.map(d => `<span class="cal-dow">${esc(d)}</span>`).join('')}
          ${cells}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="cal-months">${monthsHtml}</div>
    <div class="cal-legend">
      <span><i class="dot dot-open"></i>${esc(t('legendOpen'))}</span>
      <span><i class="dot dot-scheduled"></i>${esc(t('legendScheduled'))}</span>
      <span><i class="dot dot-full"></i>${esc(t('legendFull'))}</span>
      <span><i class="dot dot-mine"></i>${esc(t('legendMine'))}</span>
    </div>`;
}

function avatarHtml(p, size = '') {
  if (p.photo) return `<img class="avatar ${size}" src="${p.photo}" alt="">`;
  const initial = (p.name || '?').trim().charAt(0).toUpperCase();
  return `<span class="avatar avatar-letter ${size}">${esc(initial)}</span>`;
}

function myGamesHtml() {
  const items = [];
  for (const ev of state.events) {
    if (isPastEvent(ev)) continue;
    const covered = coveredSignupIds(ev);
    for (const m of mySignups(ev.id)) {
      const l = listById(ev, m.listId);
      items.push({ ev, m, l, covered: covered.has(m.id) });
    }
  }
  if (!items.length) return '';
  items.sort((a, b) => (a.ev.date > b.ev.date ? 1 : -1));
  return `
    <h2 class="section-title">${esc(t('yourGames'))}</h2>
    <div class="card my-games">
      ${items.map(({ ev, m, l, covered }) => `
        <a class="my-game" href="#/event/${esc(ev.id)}">
          <span class="my-game-date">${esc(fmtDateShort(ev.date))}</span>
          <span class="grow">${esc(SPORTS[l?.sport]?.label || '')} — ${esc(l?.label || '?')}</span>
          ${paymentChip(m, covered)}
        </a>`).join('')}
    </div>`;
}

function weekRecordCard(ev) {
  if (!signupsLoaded(ev.id)) {
    return `
    <a class="record-row" href="#/event/${esc(ev.id)}">
      <span class="record-date">${esc(fmtDateShort(ev.date))}</span>
      <span class="grow hint">${esc(t('loadingWeek'))}</span>
    </a>`;
  }
  const people = personTotals(ev);
  const collected = people.reduce((a, p) => a + (p.paidAmount || 0), 0);
  const outstanding = people.filter(p => !p.paid).reduce((a, p) => a + p.total, 0);
  return `
    <a class="record-row" href="#/event/${esc(ev.id)}">
      <span class="record-date">${esc(fmtDateShort(ev.date))}</span>
      <span class="grow">${people.length} ${esc(t('players'))}</span>
      <span class="rec-good">${fmtMoney(collected)} ${esc(t('collected'))}</span>
      ${outstanding ? `<span class="rec-bad">${fmtMoney(outstanding)} ${esc(t('unpaid'))}</span>` : ''}
    </a>`;
}

function renderHome() {
  const exec = isExec();
  const s = state.settings;
  const profile = getProfile();
  const upcoming = state.events.filter(e => !isPastEvent(e));
  const past = state.events.filter(isPastEvent).sort((a, b) => (a.date < b.date ? 1 : -1));
  // Scheduled weeks have no sign-ups yet, so there is nothing to watch.
  upcoming.filter(e => !isScheduled(e)).forEach(e => store.watchEvent(e.id));
  if (exec) {
    past.forEach(e => store.watchEvent(e.id));
    store.watchPlayers();
    store.watchPayments();
    store.watchRemovals();
  }

  $('#view').innerHTML = `
    ${store.mode === 'demo' ? `<div class="offline-banner">${esc(t('offlineBanner'))}</div>` : ''}
    <section class="hero">
      <h1>${esc(t('heroTitle'))}</h1>
      <p>${esc(t('tagline'))}</p>
    </section>

    ${profile ? `
      <div class="profile-strip">
        ${avatarHtml(profile)}
        <div class="grow">
          <strong>${esc(profile.name)}</strong>
          ${profile.insta ? `<small>@${esc(profile.insta)}</small>` : ''}
        </div>
        <button class="btn btn-small btn-ghost" id="btn-edit-profile">${esc(t('edit'))}</button>
      </div>` : ''}

    <h2 class="section-title">${esc(t('chooseSaturday'))}</h2>
    <p class="hint">${esc(t('calendarHint', { end: fmtDate(s.seasonEnd || '') }))} ${esc(t('weeklyRule'))}</p>
    ${upcoming.length
      ? renderCalendar()
      : `<div class="empty">${t('noEvents', { insta: `<a href="https://instagram.com/${esc(s.instagram || '')}" target="_blank" rel="noopener">@${esc(s.instagram || '')}</a>` })}</div>`}

    ${myGamesHtml()}

    ${exec ? `
      <div class="exec-panel">
        <h2 class="section-title">${esc(t('execTools'))}</h2>
        <div class="row gap wrap">
          <button class="btn btn-primary" id="btn-new-event">${esc(t('newEvent'))}</button>
          ${state.events.length ? `<button class="btn btn-ghost" id="btn-season">${esc(t('openSeason'))}</button>` : ''}
          <button class="btn btn-ghost" id="btn-players">${esc(t('playersBtn'))}</button>
          <button class="btn btn-ghost" id="btn-ledger">${esc(t('ledgerBtn'))}</button>
          <button class="btn btn-ghost" id="btn-settings">${esc(t('clubSettings'))}</button>
          ${store.mode === 'demo' ? `<button class="btn btn-ghost" id="btn-reset-demo">${esc(t('resetDemo'))}</button>` : ''}
        </div>
        ${past.length ? `<h3 class="section-sub">${esc(t('weekRecord'))}</h3><div class="card record-card">${past.map(weekRecordCard).join('')}</div>
          <button class="btn btn-ghost wide" id="btn-season-csv">${esc(t('exportSeason'))}</button>
          <p class="hint">${esc(t('archiveNote'))}</p>` : ''}
      </div>` : ''}

    <footer class="info-box">
      <h3>${esc(t('importantInfo'))}</h3>
      <p><strong>${esc(t('locationLbl'))}</strong> ${esc(s.location || '')}</p>
      <p><strong>${esc(t('paymentLbl'))}</strong> ${esc(t('paymentLine', { email: s.etransferEmail || '' }))}</p>
      ${s.battlePassNote ? `<p><strong>${esc(t('battlePass'))}:</strong> ${esc(s.battlePassNote)}</p>` : ''}
      <ul>${(s.policies || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <p class="late-fee">${esc(s.lateFeeNote || '')}</p>
      ${s.policiesUrl ? `<a class="policies-link" href="${esc(s.policiesUrl)}" target="_blank" rel="noopener">${esc(t('policiesLink'))}</a>` : ''}
    </footer>`;

  $('#btn-edit-profile')?.addEventListener('click', () => openProfileModal());
  $('#btn-new-event')?.addEventListener('click', () => openEventEditor(null));
  $('#btn-season')?.addEventListener('click', openSeason);
  $('#btn-players')?.addEventListener('click', openPlayersModal);
  $('#btn-ledger')?.addEventListener('click', openLedgerModal);
  $('#btn-season-csv')?.addEventListener('click', exportSeasonCsv);
  $('#btn-settings')?.addEventListener('click', openSettingsModal);
  $('#btn-reset-demo')?.addEventListener('click', async () => {
    if (await confirmModal(t('resetDemoConfirm'))) {
      // Also forget this device's profile so the demo replays the
      // brand-new-visitor flow (registration gate first).
      try { localStorage.removeItem('crsc-profile'); } catch (e) { /* ignore */ }
      setExec(false);
      store.resetDemo();
      toast(t('demoReset'));
      render();
    }
  });
}

/* Create an event for every remaining Saturday until seasonEnd. */
async function openSeason() {
  const end = state.settings.seasonEnd || nextSaturday(12);
  const have = new Set(state.events.map(e => e.date));
  const missing = saturdaysUntil(end).filter(d => !have.has(d));
  if (!missing.length) { toast(t('seasonComplete', { end: fmtDate(end) })); return; }
  if (!await confirmModal(t('openSeasonConfirm', { end: fmtDate(end), n: missing.length }), t('openSeason'))) return;
  const src = [...state.events].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  for (const date of missing) {
    const copy = src
      ? { ...JSON.parse(JSON.stringify(src)), id: uid('ev'), date, status: 'open', createdAt: Date.now() }
      : makeTemplateEvent(date, 'Saturday Drop-in');
    copy.lists = copy.lists.map(l => ({ ...l, id: uid('l') }));
    await store.saveEvent(copy);
  }
  toast(t('seasonOpened', { n: missing.length }));
}

/* ================================================================== */
/* Event view                                                          */
/* ================================================================== */

/* "Battle Pass 2H" / "Battle Pass 4H" chip. `short` fits narrow phone rows. */
/* A player's grade, shown to execs only — like payment status, it is the
 * club's note about somebody, not a badge for the room to read. */
function levelChipHtml(deviceId) {
  const l = levelByRank(playerLevel(deviceId));
  return l ? `<span class="chip chip-level" title="${esc(l.label)}">${esc(l.short)}</span>` : '';
}

function passChipHtml(type, short = false) {
  const label = short ? 'PASS' : t('battlePass');
  return `<span class="chip chip-pass">${esc(label)}${type ? ' ' + esc(String(type).toUpperCase()) : ''}</span>`;
}

function paymentChip(s, covered = false, short = false) {
  if (covered) return passChipHtml(playerPass(s.deviceId), short);
  if (s.paid) return `<span class="chip chip-paid">${esc(t('paid'))}</span>`;
  return `<span class="chip chip-unpaid">${esc(s.method === 'cash' ? t('cashUnpaid') : t('etransferUnpaid'))}</span>`;
}

/*
 * Status chips at the right of a list row. A Battle Pass is always visible
 * to execs: filled gold when it covers this spot (nothing to collect), and
 * outlined when the person holds a pass that does NOT cover this spot (a 2h
 * pass on their second slot, or another sport) so nobody gets asked twice.
 */
function statusChips(s, covered, exec) {
  const pass = playerPass(s.deviceId);
  const here = exec && s.checkedIn
    ? `<span class="chip ${s.paid || covered ? 'chip-in-ok' : 'chip-in-warn'}">${esc(t('here'))}</span>`
    : '';
  const passMark = !covered && pass
    ? `<span class="chip chip-pass-off" title="${esc(t('battlePassLbl'))}">${esc(String(pass).toUpperCase())}</span>`
    : '';
  return here + passMark + paymentChip(s, covered, true);
}

/*
 * Payment status (paid/unpaid/Battle Pass) is private: execs see everyone's,
 * players only see their own.
 */
function entryRow(ev, s, { waitlistPos = null, exec = false, covered = false } = {}) {
  const mine = s.deviceId === DEVICE;
  return `
    <div class="entry ${mine ? 'entry-mine' : ''} ${exec ? 'entry-clickable' : ''}" ${exec ? `data-signup="${esc(s.id)}"` : ''}>
      ${avatarHtml(s, 'avatar-sm')}
      <div class="grow entry-name">
        <span>${esc(s.name)} ${mine ? `<em>${esc(t('you'))}</em>` : ''}</span>
        ${s.insta ? `<small>@${esc(s.insta)}</small>` : ''}
      </div>
      ${waitlistPos !== null ? `<span class="chip chip-wl">${esc(t('wlShort', { n: waitlistPos }))}</span>` : ''}
      ${exec ? levelChipHtml(s.deviceId) : ''}
      ${exec || mine ? statusChips(s, covered, exec) : ''}
      ${mine && !exec && !cancellationLocked(ev) ? `<button class="btn btn-tiny btn-ghost" data-cancel="${esc(s.id)}" title="${esc(t('remove'))}">✕</button>` : ''}
    </div>`;
}

/* Confirmed entries, grouped into teams when the list has them. */
function confirmedHtml(ev, l, confirmed, exec, coveredSet) {
  if (!confirmed.length) return `<div class="empty-list">${esc(t('beFirst'))}</div>`;
  const row = e => entryRow(ev, e, { exec, covered: coveredSet.has(e.id) });
  const teamCount = l.teamCount || 0;
  const anyAssigned = confirmed.some(e => e.team);
  if (!teamCount || !anyAssigned) {
    return confirmed.map(row).join('')
      + (teamCount && !anyAssigned ? `<div class="hint team-hint">${esc(t('noTeamYet'))}</div>` : '');
  }
  let html = '';
  for (let n = 1; n <= teamCount; n++) {
    const members = confirmed.filter(e => e.team === n);
    if (!members.length) continue;
    html += `<div class="team-divider">${esc(t('team', { n }))}</div>`;
    html += members.map(row).join('');
  }
  const rest = confirmed.filter(e => !e.team || e.team > teamCount);
  if (rest.length) {
    html += `<div class="team-divider team-unassigned">${esc(t('unassigned'))}</div>`;
    html += rest.map(row).join('');
  }
  return html;
}

/*
 * The summary an exec wants when they open a Saturday that has been played:
 * how it went, in numbers, and who took their name off. The rosters below
 * already carry the detail — this is the part that was only ever reachable
 * through the Payments modal.
 */
function eventRecordHtml(ev) {
  const people = personTotals(ev);
  const held = confirmedSignupIds(ev);
  const collected = people.reduce((a, p) => a + (p.paidAmount || 0), 0);
  const outstanding = people.filter(p => !p.paid).reduce((a, p) => a + p.total, 0);
  const checkedIn = people.filter(p => p.checkedIn).length;
  const noShows = people.filter(p => !p.checkedIn && p.signups.some(su => held.has(su.id)));
  const rms = (state.removals || []).filter(r => r.eventId === ev.id)
    .sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0));

  return `
    <div class="record-banner">${esc(t('recordBanner'))}</div>
    <div class="stat-row">
      <div class="stat"><strong>${people.length}</strong><span>${esc(t('signedUp'))}</span></div>
      <div class="stat stat-good"><strong>${checkedIn}</strong><span>${esc(t('showedUp'))}</span></div>
      <div class="stat ${noShows.length ? 'stat-bad' : ''}"><strong>${noShows.length}</strong><span>${esc(t('didNotShow'))}</span></div>
      <div class="stat stat-good"><strong>${fmtMoney(collected)}</strong><span>${esc(t('collected'))}</span></div>
      <div class="stat ${outstanding ? 'stat-bad' : ''}"><strong>${fmtMoney(outstanding)}</strong><span>${esc(t('outstanding'))}</span></div>
    </div>
    ${noShows.length ? `
      <h3 class="section-sub">${esc(t('didNotShowTitle', { n: noShows.length }))}</h3>
      <div class="summary-list">
        ${noShows.map(p => `
          <div class="entry">
            <span class="grow">${esc(p.name)}</span>
            ${p.paid ? `<span class="chip chip-paid">${esc(t('paidChip'))}</span>`
              : `<span class="chip chip-unpaid">${fmtMoney(p.total)}</span>`}
          </div>`).join('')}
      </div>` : ''}
    ${rms.length ? `
      <h3 class="section-sub">${esc(t('removalsTitle', { n: rms.length }))}</h3>
      <div class="summary-list">
        ${rms.map(r => `
          <div class="entry removal-row ${r.flagged ? 'removal-flagged' : ''}">
            <div class="grow entry-name">
              <span>${esc(r.name)}${r.flagged ? ` <span class="chip chip-flag">${esc(r.wasCheckedIn ? t('wasCheckedIn') : t('removedAfterStart'))}</span>` : ''}</span>
              <small>${esc(r.sportLabel || '')} ${esc(r.listLabel || '')}${r.sessionLabel ? ' · ' + esc(r.sessionLabel) : ''} · ${esc(fmtStamp(r.removedAt))} · ${esc(r.by === 'exec' ? t('removedByExec') : t('removedBySelf'))}</small>
            </div>
            ${r.flagged && r.amountOwed ? `<span class="chip chip-unpaid">${esc(t('stillOwes', { amount: fmtMoney(r.amountOwed) }))}</span>` : ''}
          </div>`).join('')}
      </div>` : ''}`;
}

function renderEvent(ev) {
  const exec = isExec();
  const s = state.settings;
  const mine = mySignups(ev.id);
  const isOpen = isEventOpen(ev);
  const coveredSet = coveredSignupIds(ev);
  if (exec) { store.watchPayments(); store.watchRemovals(); seatPassHolders(ev); }

  const sessionsHtml = (ev.sessions || []).map(sess => {
    const lists = (ev.lists || []).filter(l => l.sessionId === sess.id);
    if (!lists.length) return '';
    return `
      <section class="session">
        <h2 class="session-title">${esc(sess.label)}</h2>
        <div class="lists-grid">
          ${lists.map(l => {
            const entries = listEntries(ev.id, l.id);
            const { confirmed, waitlist } = splitByCap(entries, l.cap || 0);
            const spotsLeft = Math.max(0, (l.cap || 0) - confirmed.length);
            const full = spotsLeft === 0;
            const sport = SPORTS[l.sport] || SPORTS.other;
            const iAmIn = entries.some(e => e.deviceId === DEVICE);
            return `
              <div class="card list-card" style="--c:${sport.color}">
                <div class="list-head">
                  <span class="list-sport">${sport.emoji} ${esc(sport.label)}</span>
                  <span class="list-level">${esc(l.label)}</span>
                </div>
                <div class="list-cap">
                  <div class="capbar"><div class="capbar-fill ${full ? 'full' : ''}" style="width:${l.cap ? Math.min(100, confirmed.length / l.cap * 100) : 0}%"></div></div>
                  <span class="cap-text">${isPastEvent(ev)
                    ? esc(t('playedCount', { n: confirmed.length }))
                    : `${confirmed.length}/${l.cap || 0}${full ? ` · ${esc(t('full'))}` : ` · ${esc(t('spotsLeft', { n: spotsLeft }))}`}`}</span>
                </div>
                <div class="entries">
                  ${confirmedHtml(ev, l, confirmed, exec, coveredSet)}
                  ${waitlist.length ? `<div class="wl-divider">${esc(t('waitlist'))}</div>${waitlist.map((e, i) => entryRow(ev, e, { waitlistPos: i + 1, exec, covered: coveredSet.has(e.id) })).join('')}` : ''}
                </div>
                ${isOpen && !iAmIn ? `<button class="btn ${full ? 'btn-ghost' : 'btn-primary'} btn-join" data-join="${esc(l.id)}">${esc(full ? t('joinWaitlist') : t('join'))}</button>` : ''}
                ${exec ? `
                  <div class="row gap exec-list-tools">
                    <button class="btn btn-tiny btn-ghost" data-exec-add="${esc(l.id)}">${esc(t('addPlayer'))}</button>
                    <label class="teams-ctl">${esc(t('teams'))}
                      <select data-teams="${esc(l.id)}">
                        <option value="0" ${!l.teamCount ? 'selected' : ''}>${esc(t('noTeams'))}</option>
                        ${teamOptionsFor(l.sport).map(n => `<option value="${n}" ${l.teamCount === n ? 'selected' : ''}>${n}</option>`).join('')}
                      </select>
                    </label>
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  $('#view').innerHTML = `
    <a class="back" href="#/">${esc(t('back'))}</a>
    <div class="event-head card">
      <div class="row gap wrap">
        <div class="grow">
          <h1 class="event-h1">${esc(fmtDate(ev.date))}</h1>
          <div class="event-sub">${esc(ev.location || s.location || '')}</div>
          <div class="event-prices">${pricesSummary(ev)}</div>
        </div>
        ${!isOpen ? `<span class="chip ${isScheduled(ev) ? 'chip-wl' : 'chip-muted'}">${esc(isScheduled(ev) ? t('opensOn', { date: fmtDateShort(localISO(new Date(eventOpensAt(ev)))) }) : (isPastEvent(ev) ? t('pastEvent') : t('closed')))}</span>` : ''}
      </div>
      ${mine.length ? `
        <div class="my-spots">
          <strong>${esc(t('yourSpots'))}</strong>
          ${mine.map(m => {
            const l = listById(ev, m.listId);
            const sess = l ? sessionById(ev, l.sessionId) : null;
            return `<span class="chip chip-mine">${esc(SPORTS[l?.sport]?.label || '')} ${esc(l ? l.label : '?')}${sess ? ' · ' + esc(sess.label) : ''}</span>`;
          }).join('')}
          ${mine.some(m => !m.paid && !coveredSet.has(m.id)) ? `<button class="btn btn-small btn-warn" id="btn-how-pay">${esc(t('howToPay'))}</button>` : (mine.every(m => coveredSet.has(m.id)) ? passChipHtml(playerPass(DEVICE)) : `<span class="chip chip-paid">${esc(t('allPaid'))}</span>`)}
          ${ev.date === todayStr() && isOpen ? (mine.every(m => m.checkedIn)
            ? `<span class="chip chip-in-ok">${esc(t('selfCheckedIn'))}</span><button class="btn btn-tiny btn-ghost" id="btn-self-out">${esc(t('undo'))}</button>`
            : `<button class="btn btn-small btn-success" id="btn-self-in">${esc(t('imHere'))}</button>`) : ''}
        </div>
        ${!exec && isOpen && cancellationLocked(ev) ? `<p class="hint">${esc(t('cancelLocked'))}</p>` : ''}` : ''}
      ${isScheduled(ev) ? `<p class="hint scheduled-note">${esc(t('notOpenYet', { date: fmtDate(localISO(new Date(eventOpensAt(ev)))) }))}</p>` : ''}
      ${exec && isPastEvent(ev) ? eventRecordHtml(ev) : ''}
      ${exec ? `
        <div class="row gap wrap exec-toolbar">
          ${isScheduled(ev) ? `<button class="btn btn-small btn-primary" id="btn-open-now">${esc(t('openNow'))}</button>` : ''}
          <button class="btn btn-small btn-ghost" id="btn-edit-event">${esc(t('editEvent'))}</button>
          <button class="btn btn-small ${(state.payments || []).some(p => !p.matched) ? 'btn-warn' : 'btn-ghost'}" id="btn-summary">${esc(t('payments'))}${(state.payments || []).filter(p => !p.matched).length ? ` · ${(state.payments || []).filter(p => !p.matched).length}` : ''}</button>
          <button class="btn btn-small btn-ghost" id="btn-csv">${esc(t('exportCsv'))}</button>
          <button class="btn btn-small btn-ghost" id="btn-toggle-open">${esc(isOpen ? t('closeSignups') : t('reopenSignups'))}</button>
          <button class="btn btn-small btn-ghost" id="btn-find">${esc(t('findPlayer'))}</button>
        </div>` : ''}
    </div>
    ${sessionsHtml}
  `;

  $$('[data-join]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    openJoinSheet(ev, b.dataset.join);
  }));
  $$('[data-cancel]').forEach(b => b.addEventListener('click', async e => {
    e.preventDefault();
    const su = eventSignups(ev.id).find(x => x.id === b.dataset.cancel);
    if (!su) return;
    if (await confirmModal(t('removeSelfConfirm', { name: su.name }), t('removeMe'))) {
      await removeSignup(ev, su, 'self');
      toast(t('removedSelf'));
    }
  }));
  $('#btn-find')?.addEventListener('click', () => openFindModal(ev));
  $('#btn-how-pay')?.addEventListener('click', () => openPayInfoModal(ev));
  $('#btn-self-in')?.addEventListener('click', async () => {
    await Promise.all(mySignups(ev.id).map(m => store.updateSignup(ev.id, m.id, { checkedIn: true, selfCheckIn: true })));
    toast(t('selfCheckedInToast'));
  });
  $('#btn-self-out')?.addEventListener('click', async () => {
    await Promise.all(mySignups(ev.id).map(m => store.updateSignup(ev.id, m.id, { checkedIn: false, selfCheckIn: false })));
    toast(t('selfCheckOutToast'));
  });

  if (exec) {
    $$('[data-signup]').forEach(row => row.addEventListener('click', e => {
      if (e.target.closest('[data-cancel]')) return;
      const su = eventSignups(ev.id).find(x => x.id === row.dataset.signup);
      if (su) openPlayerAdminModal(ev, su);
    }));
    $$('[data-exec-add]').forEach(b => b.addEventListener('click', () => openExecAddModal(ev, b.dataset.execAdd)));
    $$('[data-teams]').forEach(sel => sel.addEventListener('change', async () => {
      const lists = ev.lists.map(l => l.id === sel.dataset.teams ? { ...l, teamCount: +sel.value } : l);
      await store.saveEvent({ ...ev, lists });
    }));
    $('#btn-open-now')?.addEventListener('click', async () => {
      await store.saveEvent({ ...ev, openEarly: true });
      toast(t('openedNow'));
    });
    $('#btn-edit-event')?.addEventListener('click', () => openEventEditor(ev));
    $('#btn-summary')?.addEventListener('click', () => openSummaryModal(ev));
    $('#btn-csv')?.addEventListener('click', () => exportCsv(ev));
    $('#btn-toggle-open')?.addEventListener('click', async () => {
      await store.saveEvent({ ...ev, status: isOpen ? 'closed' : 'open' });
      toast(isOpen ? t('signupsClosed') : t('signupsReopened'));
    });
  }
}

/* ================================================================== */
/* Profile + join flow                                                 */
/* ================================================================== */

function profileFieldsHtml(p) {
  return `
    <div class="row gap center">
      <label class="avatar-pick" title="${esc(t('addPhoto'))}">
        <span id="pf-avatar">${p ? avatarHtml(p) : '<span class="avatar avatar-letter">+</span>'}</span>
        <input type="file" accept="image/*" id="pf-photo" hidden>
      </label>
      <div class="grow stack">
        <input class="input" id="pf-name" placeholder="${esc(t('namePh'))}" value="${esc(p?.name || '')}" maxlength="40">
        <input class="input" id="pf-email" type="email" placeholder="${esc(t('emailPh'))}" value="${esc(p?.email || '')}" maxlength="80">
        <div class="row gap">
          <input class="input" id="pf-phone" type="tel" placeholder="${esc(t('phonePh'))}" value="${esc(p?.phone || '')}" maxlength="20">
          <input class="input" id="pf-insta" placeholder="${esc(t('instaPh'))}" value="${esc(p?.insta || '')}" maxlength="40">
        </div>
      </div>
    </div>`;
}

let pendingPhoto = null;

function wireProfileFields(ov, existing) {
  pendingPhoto = existing?.photo || '';
  $('#pf-photo', ov).addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      pendingPhoto = await fileToThumb(f);
      $('#pf-avatar', ov).innerHTML = `<img class="avatar" src="${pendingPhoto}" alt="">`;
    } catch (err) { toast(t('badImage'), 'err'); }
  });
}

function readProfileFields(ov) {
  const name = $('#pf-name', ov).value.trim();
  const email = $('#pf-email', ov).value.trim();
  const phone = $('#pf-phone', ov).value.trim();
  const insta = $('#pf-insta', ov).value.trim().replace(/^@/, '');
  if (!name) { toast(t('nameRequired'), 'err'); return null; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast(t('emailRequired'), 'err'); return null; }
  return { name, email, phone, insta, photo: pendingPhoto || '' };
}

function openProfileModal() {
  const p = getProfile();
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('yourProfile'))}</h2>
      <p class="hint">${esc(t('profileHint'))}</p>
      ${profileFieldsHtml(p)}
      <button class="btn btn-ghost wide" id="pf-transfer">${esc(t('useOtherDevice'))}</button>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="pf-save">${esc(t('save'))}</button>
      </div>
    </div>`);
  wireProfileFields(ov, p);
  $('#pf-transfer', ov).addEventListener('click', () => { ov.remove(); openTransferModal(); });
  $('#pf-save', ov).addEventListener('click', () => {
    const np = readProfileFields(ov);
    if (!np) return;
    saveProfile(np);
    registerPlayer(np);
    ov.remove(); toast(t('profileSaved')); render();
  });
}

function openJoinSheet(ev, preselectedListId) {
  const wanted = preselectedListId && listById(ev, preselectedListId);
  if (wanted && !canSelfJoin(wanted)) { toast(t('levelBlocked'), 'err'); return; }
  const p = getProfile();
  const myIds = new Set(mySignups(ev.id).map(m => m.listId));
  const s = state.settings;

  const listCheckboxes = (ev.sessions || []).map(sess => {
    const lists = (ev.lists || []).filter(l => l.sessionId === sess.id && !myIds.has(l.id));
    if (!lists.length) return '';
    return `
      <div class="join-session">
        <div class="join-session-label">${esc(sess.label)}</div>
        ${lists.map(l => {
          const entries = listEntries(ev.id, l.id);
          const full = entries.length >= (l.cap || 0);
          const sport = SPORTS[l.sport] || SPORTS.other;
          // Levels above the player's grade stay visible but locked. Hiding
          // them would just prompt "where did Advanced + go?" — this says
          // the spot exists and who to ask for it.
          const barred = !canSelfJoin(l);
          return `
            <label class="join-list ${full ? 'join-full' : ''} ${barred ? 'join-barred' : ''}">
              <input type="checkbox" data-list="${esc(l.id)}" ${barred ? 'disabled' : ''} ${l.id === preselectedListId && !barred ? 'checked' : ''}>
              <span class="grow">${esc(sport.label)} — ${esc(l.label)}</span>
              ${barred ? `<span class="chip chip-muted">${esc(t('askExec'))}</span>`
                : full ? `<span class="chip chip-wl">${esc(t('waitlist').toLowerCase())}</span>` : ''}
            </label>`;
        }).join('')}
      </div>`;
  }).join('');

  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('signupTitle', { date: fmtDate(ev.date) }))}</h2>
      ${profileFieldsHtml(p)}
      <h3 class="section-sub">${esc(t('pickLists'))}</h3>
      <div class="prices-once">${pricesSummary(ev)}</div>
      ${listCheckboxes || `<p class="hint">${esc(t('onEveryList'))}</p>`}
      <h3 class="section-sub">${esc(t('payMethod'))}</h3>
      <div class="row gap">
        <label class="pay-opt"><input type="radio" name="paym" value="etransfer" checked> <span>${esc(t('etransfer'))}</span></label>
        <label class="pay-opt"><input type="radio" name="paym" value="cash"> <span>${esc(t('cashOnSite'))}</span></label>
      </div>
      <div class="price-box" id="join-price"></div>
      <div class="pay-instructions" id="join-payinfo"></div>
      <p class="hint">${esc(t('levelNote'))} ${esc(t('waitlistNote'))}</p>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="join-confirm">${esc(t('confirmSignup'))}</button>
      </div>
      ${s.policiesUrl ? `<a class="policies-link" href="${esc(s.policiesUrl)}" target="_blank" rel="noopener">${esc(t('policiesLink'))}</a>` : ''}
    </div>`);

  wireProfileFields(ov, p);

  function refreshPrice() {
    const method = $('input[name="paym"]:checked', ov).value;
    const myPass = playerPass(DEVICE);
    const chosen = $$('input[data-list]:checked', ov).map(c => c.dataset.list);
    const already = [...myIds];
    const { total: totalAll } = computePrice(ev, [...chosen, ...already], method, myPass);
    const { total: totalOld } = computePrice(ev, already, method, myPass);
    const due = totalAll - totalOld;
    const { parts } = computePrice(ev, chosen.length ? [...chosen, ...already] : [], method, myPass);
    $('#join-price', ov).innerHTML = chosen.length
      ? `${parts.map(pt => `<div class="price-line"><span>${esc(pt.label)}</span><span>${fmtMoney(pt.price)}</span></div>`).join('')}
         <div class="price-line price-total"><span>${esc(already.length ? t('newTotal') : t('toPay'))}</span><span>${fmtMoney(already.length ? totalAll : due)}</span></div>
         ${(already.length ? totalAll : due) === 0 && myPass ? `<p class="hint">${esc(t('battlePassCovered'))}</p>` : ''}`
      : `<p class="hint">${esc(t('selectOne'))}</p>`;
    $('#join-payinfo', ov).innerHTML = method === 'etransfer'
      ? `<p>${esc(t('etransferTo'))} <strong>${esc(s.etransferEmail)}</strong><br><small>${esc(t('mentionName'))}</small></p>`
      : `<p>${esc(t('bringCash'))} <small>${esc(s.lateFeeNote || '')}</small></p>`;
  }
  $$('input[data-list], input[name="paym"]', ov).forEach(i => i.addEventListener('change', refreshPrice));
  refreshPrice();

  $('#join-confirm', ov).addEventListener('click', async () => {
    const np = readProfileFields(ov);
    if (!np) return;
    const chosen = $$('input[data-list]:checked', ov).map(c => c.dataset.list);
    if (!chosen.length) { toast(t('pickOne'), 'err'); return; }
    // The checkbox is disabled, but never trust the form alone.
    if (chosen.some(id => !canSelfJoin(listById(ev, id)))) { toast(t('levelBlocked'), 'err'); return; }
    const method = $('input[name="paym"]:checked', ov).value;
    saveProfile(np);
    registerPlayer(np);
    const now = Date.now();
    const signups = chosen.map((listId, i) => ({
      id: uid('su'),
      listId,
      name: np.name,
      email: np.email,
      phone: np.phone,
      insta: np.insta,
      photo: np.photo,
      deviceId: DEVICE,
      method,
      paid: false,
      checkedIn: false,
      team: null,
      lang: getLang(),
      order: now + i,
      createdAt: now + i,
      addedByExec: false,
    }));
    try {
      await store.addSignups(ev.id, signups);
      ov.remove();
      toast(t('onTheList'));
      openPayInfoModal(ev, method);
      sendConfirmationEmail(ev, np, chosen, method);
    } catch (err) {
      console.error(err);
      toast(t('errGeneric'), 'err');
    }
  });
}

function openPayInfoModal(ev, method) {
  const s = state.settings;
  const mine = mySignups(ev.id).filter(m => !m.paid);
  const m = method || (mine[0]?.method) || 'etransfer';
  const ids = mySignups(ev.id).map(x => x.listId);
  const { total } = computePrice(ev, ids, m, playerPass(DEVICE));
  if (total === 0 && playerPass(DEVICE)) {
    openModal(`
      <div class="modal-body">
        <h2>${esc(t('howToPay'))}</h2>
        <p class="pay-email">${esc(t('battlePass'))}</p>
        <p class="hint">${esc(t('battlePassCovered'))}</p>
        <button class="btn btn-primary wide" data-close>${esc(t('gotIt'))}</button>
      </div>`);
    return;
  }
  openModal(`
    <div class="modal-body">
      <h2>${esc(t('howToPay'))}</h2>
      <div class="price-box">
        <div class="price-line price-total"><span>${esc(t('yourTotal', { date: fmtDate(ev.date) }))}</span><span>${fmtMoney(total)}</span></div>
      </div>
      ${m === 'etransfer' ? `
        <p>${esc(t('etransferTo'))}</p>
        <p class="pay-email">${esc(s.etransferEmail)}</p>
        <p class="hint">${esc(t('mentionName'))}</p>` : `
        <p>${esc(t('bringCash'))}</p>`}
      <p class="hint">${esc(s.lateFeeNote || '')}</p>
      <button class="btn btn-primary wide" data-close>${esc(t('gotIt'))}</button>
    </div>`);
}

/* ================================================================== */
/* Exec: PIN                                                           */
/* ================================================================== */

function openPinModal() {
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('execAccess'))}</h2>
      <input class="input input-pin" id="pin-input" type="password" inputmode="numeric" placeholder="${esc(t('clubPin'))}" maxlength="12" autofocus>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="pin-go">${esc(t('unlock'))}</button>
      </div>
    </div>`);
  const tryPin = () => {
    const val = $('#pin-input', ov).value.trim();
    if (val && val === String(state.settings.execPin || '')) {
      setExec(true); ov.remove(); toast(t('execModeOn')); render();
    } else {
      toast(t('wrongPin'), 'err');
    }
  };
  $('#pin-go', ov).addEventListener('click', tryPin);
  $('#pin-input', ov).addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
  $('#pin-input', ov).focus();
}

/* ================================================================== */
/* Exec: player admin                                                  */
/* ================================================================== */

function openPlayerAdminModal(ev, su) {
  const curList = listById(ev, su.listId);
  const listsOptions = (ev.lists || []).map(l => {
    const sess = sessionById(ev, l.sessionId);
    return `<option value="${esc(l.id)}" ${l.id === su.listId ? 'selected' : ''}>${esc(sess ? sess.label : '')} · ${esc(SPORTS[l.sport]?.label || '')} ${esc(l.label)}</option>`;
  }).join('');
  const teamCount = curList?.teamCount || 0;
  const ov = openModal(`
    <div class="modal-body">
      <div class="row gap center">
        ${avatarHtml(su)}
        <div class="grow">
          <h2 class="m0">${esc(su.name)}</h2>
          <small class="hint">
            ${su.insta ? `<a href="https://instagram.com/${esc(su.insta)}" target="_blank" rel="noopener">@${esc(su.insta)}</a>` : esc(t('noInsta'))}
            · ${su.email ? esc(su.email) : esc(t('noEmail'))}${su.phone ? ` · ${esc(su.phone)}` : ''}
          </small>
        </div>
      </div>
      <div class="row gap">
        <button class="btn grow cb" id="pa-paid"></button>
        <button class="btn grow cb" id="pa-in"></button>
      </div>
      <p class="hint">${esc(su.method === 'cash' ? t('cashOnSite') : t('etransfer'))}${su.addedByExec ? ' · ' + esc(t('addedByExec')) : ''}</p>
      ${teamCount ? (() => {
        // Enforce per-team size limits (volleyball: max 7 per team).
        const size = SPORTS[curList?.sport]?.teamSize || 0;
        const { confirmed } = splitByCap(listEntries(ev.id, su.listId), curList?.cap || 0);
        return `
        <label class="field-label">${esc(t('putInTeam'))}${size ? ` (max ${size})` : ''}</label>
        <div class="row gap wrap" id="pa-teams">
          <button class="btn btn-small ${!su.team ? 'btn-exec' : 'btn-ghost'}" data-team="0">—</button>
          ${Array.from({ length: teamCount }, (_, i) => {
            const n = i + 1;
            const members = confirmed.filter(e => e.team === n).length;
            const full = size && members >= size && su.team !== n;
            return `<button class="btn btn-small ${su.team === n ? 'btn-exec' : 'btn-ghost'}" data-team="${n}" ${full ? 'disabled' : ''}>${n}${size ? ` · ${members}/${size}` : ''}</button>`;
          }).join('')}
        </div>`;
      })() : ''}
      ${su.deviceId && su.deviceId !== 'exec-added' ? `
        <label class="field-label">${esc(t('levelLbl'))}</label>
        <div class="row gap wrap" id="pa-level">
          <button class="btn btn-small grow" data-level="" title="${esc(t('noLevel'))}">—</button>
          ${LEVELS.map(l => `<button class="btn btn-small grow" data-level="${l.rank}" title="${esc(l.label)}">${esc(l.short)}</button>`).join('')}
        </div>
        <label class="field-label">${esc(t('battlePassLbl'))}</label>
        <button class="btn btn-small wide ${playerPass(su.deviceId) ? 'btn-exec' : 'btn-ghost'}" id="pa-pass">
          ${esc(playerPass(su.deviceId) ? t('passSetTo', { type: playerPass(su.deviceId).toUpperCase() }) : t('setPass'))}
        </button>` : ''}
      <label class="field-label">${esc(t('moveTo'))}</label>
      <select class="input" id="pa-move">${listsOptions}</select>
      <div class="row gap">
        <button class="btn btn-ghost grow" id="pa-top">${esc(t('topOfList'))}</button>
        <button class="btn btn-danger grow" id="pa-remove">${esc(t('remove'))}</button>
      </div>
      <button class="btn btn-ghost wide" data-close>${esc(t('done'))}</button>
    </div>`);

  /*
   * Paid / checked-in as checkboxes with traffic-light colors:
   * both off = red, exactly one on = yellow, both on = green.
   * A Battle Pass counts as paid (its checkbox is locked on).
   */
  const coveredHere = coveredSignupIds(ev).has(su.id);
  function paintStatus() {
    const p = su.paid || coveredHere;
    const c = !!su.checkedIn;
    const onCls = p && c ? 'cb-green' : 'cb-yellow';
    const paidBtn = $('#pa-paid', ov);
    const inBtn = $('#pa-in', ov);
    paidBtn.className = 'btn grow cb ' + (p ? onCls : (c ? 'cb-off' : 'cb-red'));
    inBtn.className = 'btn grow cb ' + (c ? onCls : (p ? 'cb-off' : 'cb-red'));
    paidBtn.textContent = (p ? '☑ ' : '☐ ') + (coveredHere ? `${t('battlePass')} ${(playerPass(su.deviceId) || '').toUpperCase()}` : (p ? t('paid') : t('markPaid')));
    inBtn.textContent = (c ? '☑ ' : '☐ ') + (c ? t('checkedIn') : t('checkIn'));
    paidBtn.disabled = coveredHere;
  }
  paintStatus();
  $('#pa-paid', ov).addEventListener('click', async () => {
    if (coveredHere) return;
    const next = !su.paid;
    await store.updateSignup(ev.id, su.id, { paid: next, paidAt: next ? Date.now() : null });
    su.paid = next;
    paintStatus();
  });
  $('#pa-in', ov).addEventListener('click', async () => {
    const next = !su.checkedIn;
    await store.updateSignup(ev.id, su.id, { checkedIn: next });
    su.checkedIn = next;
    paintStatus();
  });
  $$('#pa-teams [data-team]', ov).forEach(b => b.addEventListener('click', async () => {
    const n = +b.dataset.team || null;
    await store.updateSignup(ev.id, su.id, { team: n });
    su.team = n;
    $$('#pa-teams [data-team]', ov).forEach(x => {
      x.className = `btn btn-small ${(+x.dataset.team || null) === n ? 'btn-exec' : 'btn-ghost'}`;
    });
  }));
  const paintLevel = () => {
    const now = playerLevel(su.deviceId);
    $$('#pa-level [data-level]', ov).forEach(b =>
      b.className = 'btn btn-small grow ' + ((Number(b.dataset.level) || null) === now ? 'btn-exec' : 'btn-ghost'));
  };
  $$('#pa-level [data-level]', ov).forEach(b => b.addEventListener('click', async () => {
    await setPlayerLevel({ deviceId: su.deviceId, name: su.name }, Number(b.dataset.level) || null);
    paintLevel();
  }));
  paintLevel();

  const passBtn = $('#pa-pass', ov);
  if (passBtn) passBtn.addEventListener('click', () => {
    openPassModal({ deviceId: su.deviceId, name: su.name, battlePass: playerPass(su.deviceId) }, (type) => {
      passBtn.className = 'btn btn-small wide ' + (type ? 'btn-exec' : 'btn-ghost');
      passBtn.textContent = type ? t('passSetTo', { type: type.toUpperCase() }) : t('setPass');
    });
  });
  $('#pa-move', ov).addEventListener('change', async e => {
    await moveSignup(ev, su, e.target.value);
    toast(t('moved', { name: su.name }));
    ov.remove();
  });
  $('#pa-top', ov).addEventListener('click', async () => {
    const first = listEntries(ev.id, su.listId)[0];
    const newOrder = first ? (first.order ?? first.createdAt) - 1000 : Date.now();
    await store.updateSignup(ev.id, su.id, { order: newOrder });
    toast(t('movedTop', { name: su.name }));
    ov.remove();
  });
  $('#pa-remove', ov).addEventListener('click', async () => {
    ov.remove();
    if (await confirmModal(t('removeConfirm', { name: su.name }), t('remove'))) {
      await removeSignup(ev, su, 'exec');
      toast(t('removed', { name: su.name }));
    }
  });
}

function openExecAddModal(ev, listId) {
  const l = listById(ev, listId);
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('addPlayer').replace('＋ ', ''))}</h2>
      <p class="hint">${esc(SPORTS[l?.sport]?.label || '')} — ${esc(l?.label || '')}</p>
      <div class="stack">
        <input class="input" id="ea-name" placeholder="${esc(t('nameOnly'))}" maxlength="40">
        <input class="input" id="ea-email" type="email" placeholder="${esc(t('emailPh').replace(' *', ''))}" maxlength="80">
        <input class="input" id="ea-insta" placeholder="${esc(t('instaPh'))}" maxlength="40">
        <label class="pay-opt"><input type="checkbox" id="ea-paid"> <span>${esc(t('alreadyPaid'))}</span></label>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="ea-save">${esc(t('add'))}</button>
      </div>
    </div>`);
  $('#ea-save', ov).addEventListener('click', async () => {
    const name = $('#ea-name', ov).value.trim();
    if (!name) { toast(t('nameReq'), 'err'); return; }
    await store.addSignups(ev.id, [{
      id: uid('su'),
      listId,
      name,
      email: $('#ea-email', ov).value.trim(),
      phone: '',
      insta: $('#ea-insta', ov).value.trim().replace(/^@/, ''),
      photo: '',
      deviceId: 'exec-added',
      method: 'cash',
      paid: $('#ea-paid', ov).checked,
      checkedIn: false,
      team: null,
      order: Date.now(),
      createdAt: Date.now(),
      addedByExec: true,
    }]);
    ov.remove();
    toast(t('added', { name }));
  });
}

/* ================================================================== */
/* Exec: players directory                                             */
/* ================================================================== */

/*
 * Every registered player (from the registration gate) merged with their
 * game history from the loaded events. People who signed up on someone
 * else's phone or were added by an exec appear too, via their signups.
 */
/*
 * What the club is owed, and who never showed up — across the whole season.
 *
 * Both were invisible before this. Outstanding money was only ever totalled
 * one night at a time, so somebody who plays six Saturdays and pays for none
 * of them appeared as a small number on six separate screens and never as
 * "$48". And a no-show left no mark at all: the removal log catches people
 * who take their name off, but the commoner case — name on the list, never
 * turned up, never paid — was recorded and never read.
 *
 * A no-show only counts against a CONFIRMED spot. Someone who sat on the
 * waitlist and did not play was never given a place to waste.
 */
function seasonLedger() {
  const by = {};
  const person = (key, p) => {
    if (!by[key]) by[key] = {
      key, name: p.name, email: '', deviceId: p.deviceId,
      owed: 0, nights: [], noShows: [], games: 0,
    };
    return by[key];
  };

  for (const ev of state.events) {
    if (!state.signups[ev.id]) continue;      // week not loaded on this device
    const past = isPastEvent(ev);
    const confirmed = confirmedSignupIds(ev);
    for (const p of personTotals(ev)) {
      const rec = person(personKey(p.signups[0]), p);
      if (!rec.email) rec.email = p.signups.find(su => su.email)?.email || '';
      if (past) rec.games++;
      if (!p.paid && p.total > 0) {
        rec.owed += p.total;
        rec.nights.push({ id: ev.id, date: ev.date, amount: p.total, late: p.late });
      }
      // Held a spot on a night that has been and gone, never checked in.
      if (past && p.signups.some(su => confirmed.has(su.id)) && !p.checkedIn) {
        rec.noShows.push({ id: ev.id, date: ev.date, paid: p.paid });
      }
    }
  }
  return Object.values(by)
    .filter(r => r.owed > 0 || r.noShows.length)
    .sort((a, b) => b.owed - a.owed || b.noShows.length - a.noShows.length);
}

/*
 * The money screen: everyone who owes, most first, plus repeat no-shows.
 * The club's founding problem was that nobody could answer "who owes us
 * what" — so that number is the first thing on the page.
 */
/*
 * The whole season in one file. Per-event CSV answers "what happened that
 * night"; this answers "what happened this season", which is the question
 * asked when the club hands over to next year's execs.
 */
function exportSeasonCsv() {
  const covered = {};
  const rows = [['Date', 'Session', 'Sport', 'List', 'Status', 'Name', 'Email', 'Phone',
                 'Instagram', 'Team', 'Payment method', 'Paid', 'Checked in']];
  const played = state.events.filter(e => signupsLoaded(e.id) && eventSignups(e.id).length)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const ev of played) {
    const cov = coveredSignupIds(ev);
    for (const l of ev.lists || []) {
      const sess = sessionById(ev, l.sessionId);
      const { confirmed, waitlist } = splitByCap(listEntries(ev.id, l.id), l.cap || 0);
      const add = (su, status) => rows.push([ev.date, sess?.label || '', SPORTS[l.sport]?.label || l.sport,
        l.label, status, su.name, su.email || '', su.phone || '', su.insta || '', su.team || '',
        su.method, su.paid ? 'yes' : (cov.has(su.id) ? 'BATTLE PASS' : 'no'), su.checkedIn ? 'yes' : 'no']);
      confirmed.forEach(su => add(su, 'confirmed'));
      waitlist.forEach(su => add(su, 'waitlist'));
    }
  }
  // Removals belong in the archive too — they are the proof trail.
  for (const r of state.removals || []) {
    const ev = state.events.find(e => e.id === r.eventId);
    rows.push([ev?.date || '', r.sessionLabel || '', r.sportLabel || '', r.listLabel || '',
      'REMOVED' + (r.flagged ? ' (was checked in)' : ''), r.name, r.email || '', '', '', '',
      '', '', '']);
  }
  const csv = rows.map(x => x.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crsc-season-' + todayStr() + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t('seasonExported', { n: played.length }));
}

function openLedgerModal() {
  const rows = seasonLedger();
  const debtors = rows.filter(r => r.owed > 0);
  const total = debtors.reduce((a, r) => a + r.owed, 0);
  const ghosts = rows.filter(r => r.noShows.length >= 2);

  const ov = openModal(`
    <div class="modal-body">
      <h2 class="m0">${esc(t('ledgerTitle'))}</h2>
      <div class="stat-row">
        <div class="stat stat-bad"><strong>${fmtMoney(total)}</strong><span>${esc(t('outstanding'))}</span></div>
        <div class="stat"><strong>${debtors.length}</strong><span>${esc(t('peopleOwing'))}</span></div>
        <div class="stat ${ghosts.length ? 'stat-bad' : ''}"><strong>${ghosts.length}</strong><span>${esc(t('repeatNoShows'))}</span></div>
      </div>
      ${debtors.length ? `
        <h3 class="section-sub">${esc(t('whoOwes', { n: debtors.length }))}</h3>
        <div class="summary-list">
          ${debtors.map(r => `
            <div class="entry">
              <div class="grow entry-name">
                <span>${esc(r.name)}${r.noShows.length ? ` <span class="chip chip-flag">${esc(t('noShowChip', { n: r.noShows.length }))}</span>` : ''}</span>
                <small>
                  ${r.nights.map(n => esc(fmtDate(n.date)) + (n.late ? ' ⚠' : '')).join(' · ')}
                  ${r.email ? ' · ' + esc(r.email) : ' · ' + esc(t('noEmail'))}
                </small>
              </div>
              <span class="chip chip-unpaid">${fmtMoney(r.owed)}</span>
            </div>`).join('')}
        </div>
        <button class="btn btn-warn wide" id="lg-chase" ${mailerConfigured() ? '' : 'disabled'}>
          ${esc(mailerConfigured() ? t('chaseAll', { n: debtors.filter(r => r.email).length }) : t('mailerOff'))}
        </button>
        <p class="hint">${esc(t('chaseNote'))}</p>`
      : `<p class="hint">${esc(t('nobodyOwes'))}</p>`}
      ${ghosts.length ? `
        <h3 class="section-sub">${esc(t('noShowsTitle', { n: ghosts.length }))}</h3>
        <div class="summary-list">
          ${ghosts.map(r => `
            <div class="entry">
              <div class="grow entry-name">
                <span>${esc(r.name)}</span>
                <small>${r.noShows.map(n => esc(fmtDate(n.date))).join(' · ')}</small>
              </div>
              <span class="chip chip-flag">${esc(t('noShowChip', { n: r.noShows.length }))}</span>
            </div>`).join('')}
        </div>
        <p class="hint">${esc(t('noShowNote'))}</p>` : ''}
      <div class="row gap">
        <button class="btn btn-ghost grow" id="lg-csv">${esc(t('exportLedger'))}</button>
        <button class="btn btn-primary grow" data-close>${esc(t('close'))}</button>
      </div>
    </div>`, { wide: true });

  // One email each, with that person's own total — never a group mail-out
  // that tells everybody what everybody else owes.
  $('#lg-chase', ov)?.addEventListener('click', async () => {
    const targets = debtors.filter(r => r.email);
    if (!targets.length) { toast(t('noEmails'), 'err'); return; }
    if (!await confirmModal(t('chaseConfirm', { n: targets.length, total: fmtMoney(total) }), t('sendThem'))) return;
    let sent = 0;
    for (const r of targets) {
      const lang = 'en';
      try {
        await sendMail({
          to: r.email,
          subject: tLang(lang, 'emailOwedSubject'),
          message: tLang(lang, 'emailOwedBody', {
            name: r.name,
            total: fmtMoney(r.owed),
            nights: r.nights.map(n => '• ' + fmtDateLang(n.date, lang) + ' — ' + fmtMoney(n.amount)).join('\n'),
            email: state.settings.etransferEmail || '',
            club: state.settings.clubFullName || 'CRSC',
          }),
        });
        sent++;
      } catch (err) { console.error('chase email', err); }
    }
    toast(t('chaseSent', { n: sent }));
  });

  $('#lg-csv', ov).addEventListener('click', () => {
    const out = [['Name', 'Email', 'Owes', 'Unpaid nights', 'No-shows', 'No-show dates']];
    for (const r of rows) out.push([r.name, r.email, r.owed,
      r.nights.map(n => n.date).join(' '), r.noShows.length, r.noShows.map(n => n.date).join(' ')]);
    const csv = out.map(x => x.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crsc-owed.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function allPlayers() {
  const byId = {};
  for (const p of Object.values(state.players || {})) {
    byId[p.deviceId] = { ...p, games: 0, unpaid: 0 };
  }
  for (const [evId, signups] of Object.entries(state.signups)) {
    const ev = state.events.find(e => e.id === evId);
    if (!ev) continue;
    const covered = coveredSignupIds(ev);
    for (const su of signups) {
      const key = su.deviceId && su.deviceId !== 'exec-added' ? su.deviceId : 'name:' + su.name.toLowerCase();
      if (!byId[key]) byId[key] = { deviceId: key, name: su.name, insta: su.insta, email: su.email || '', phone: su.phone || '', photo: su.photo || '', games: 0, unpaid: 0 };
      byId[key].games++;
      if (!su.paid && !covered.has(su.id)) byId[key].unpaid++;
      if (!byId[key].email && su.email) byId[key].email = su.email;
      if (!byId[key].photo && su.photo) byId[key].photo = su.photo;
    }
  }
  // No-shows and money owed come from the season ledger, so the directory
  // and the money screen can never tell an exec two different stories.
  for (const r of seasonLedger()) {
    const rec = byId[r.deviceId] || Object.values(byId).find(p => p.name === r.name);
    if (rec) { rec.noShows = r.noShows.length; rec.owes = r.owed; }
  }
  // Removal history (the proof trail) follows the player too.
  for (const r of state.removals || []) {
    const key = r.deviceId && r.deviceId !== 'exec-added' ? r.deviceId : 'name:' + (r.name || '').toLowerCase();
    if (!byId[key]) byId[key] = { deviceId: key, name: r.name, insta: r.insta || '', email: r.email || '', phone: r.phone || '', photo: '', games: 0, unpaid: 0 };
    byId[key].removals = (byId[key].removals || 0) + 1;
    if (r.flagged) byId[key].flagged = (byId[key].flagged || 0) + 1;
  }
  return Object.values(byId).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/*
 * Grade a player. From then on they can sign themselves up for this level
 * and anything below it; execs can still place them anywhere by hand, which
 * is how somebody moves up.
 */
async function setPlayerLevel(player, rank) {
  if (playerLevel(player.deviceId) === (rank || null)) return;
  await store.savePlayer({ deviceId: player.deviceId, name: player.name, level: rank || null });
  const l = rank ? levelByRank(rank) : null;
  toast(l ? t('levelSet', { name: player.name, level: l.label }) : t('levelCleared', { name: player.name }));
}

/* Set/clear a player's Battle Pass (execs only; volleyball season pass). */
async function setBattlePass(player, type, lists = null) {
  await store.savePlayer({
    deviceId: player.deviceId,
    name: player.name,
    battlePass: type || null,
    // Clearing the pass clears the standing reservation with it.
    passLists: type ? (lists || passLists(player)) : [],
  });
  toast(type ? t('battlePassSet', { name: player.name, type: type.toUpperCase() }) : t('battlePassRemoved', { name: player.name }));
}

/*
 * Set a player's season pass and the level their seat is held in.
 *
 * The level matters as much as the pass: holding a spot is meaningless until
 * the club knows WHICH list to hold it in, and pass holders are usually
 * regulars in one specific level. A 4h pass can hold a spot in both time
 * slots, which is what it is paying for.
 */
function openPassModal(player, onDone) {
  const ev = state.events.find(e => !isPastEvent(e) && e.status === 'open') || state.events[0];
  const chosen = passLists(state.players[player.deviceId] || player).slice();
  const has = (l) => chosen.some(c => c.sport === l.sport && c.sessionId === l.sessionId && c.label === l.label);
  let type = player.battlePass || null;
  let level = playerLevel(player.deviceId);

  const ov = openModal(`
    <div class="modal-body">
      <h2 class="m0">${esc(player.name)}</h2>
      <label class="field-label">${esc(t('levelLbl'))}</label>
      <div class="row gap wrap" id="pm-level">
        <button class="btn btn-small grow" data-level="">${esc(t('noLevel'))}</button>
        ${LEVELS.map(l => `<button class="btn btn-small grow" data-level="${l.rank}">${esc(l.label)}</button>`).join('')}
      </div>
      <p class="hint">${esc(t('levelModalHint'))}</p>
      <p class="hint">${esc(t('passModalHint'))}</p>
      <label class="field-label">${esc(t('battlePassLbl'))}</label>
      <div class="row gap" id="pm-type">
        <button class="btn btn-small grow" data-type="">${esc(t('noPass'))}</button>
        <button class="btn btn-small grow" data-type="2h">2H · ${fmtMoney(state.settings.passPrice2h)}</button>
        <button class="btn btn-small grow" data-type="4h">4H · ${fmtMoney(state.settings.passPrice4h)}</button>
      </div>
      <div id="pm-seats">
        <label class="field-label">${esc(t('heldSpotLbl'))}</label>
        <div class="pass-lists">
          ${(ev?.sessions || []).map(sess => `
            <div class="pass-sess">
              <small class="hint">${esc(sess.label)}</small>
              ${(ev.lists || []).filter(l => l.sessionId === sess.id).map(l => `
                <label class="pass-opt">
                  <input type="checkbox" data-list="${esc(l.id)}" ${has(l) ? 'checked' : ''}>
                  <span>${esc(SPORTS[l.sport]?.emoji || '')} ${esc(SPORTS[l.sport]?.label || l.sport)} — ${esc(l.label)}</span>
                </label>`).join('')}
            </div>`).join('')}
        </div>
        <p class="hint">${esc(t('heldSpotNote'))}</p>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="pm-save">${esc(t('save'))}</button>
      </div>
    </div>`, { wide: true });

  function paint() {
    $$('#pm-type [data-type]', ov).forEach(b =>
      b.className = 'btn btn-small grow ' + ((b.dataset.type || null) === type ? 'btn-exec' : 'btn-ghost'));
    $('#pm-seats', ov).hidden = !type;
    $$('#pm-level [data-level]', ov).forEach(b =>
      b.className = 'btn btn-small grow ' + ((Number(b.dataset.level) || null) === level ? 'btn-exec' : 'btn-ghost'));
  }
  $$('#pm-level [data-level]', ov).forEach(b => b.addEventListener('click', () => {
    level = Number(b.dataset.level) || null;
    paint();
  }));
  $$('#pm-type [data-type]', ov).forEach(b => b.addEventListener('click', () => {
    type = b.dataset.type || null;
    paint();
  }));
  paint();

  $('#pm-save', ov).addEventListener('click', async () => {
    const lists = [];
    if (type) {
      for (const cb of $$('[data-list]', ov)) {
        if (!cb.checked) continue;
        const l = (ev.lists || []).find(x => x.id === cb.dataset.list);
        if (l) lists.push({ sport: l.sport, sessionId: l.sessionId, label: l.label });
      }
    }
    await setBattlePass(player, type, lists);
    await setPlayerLevel(player, level);
    ov.remove();
    if (onDone) onDone(type, level);
  });
}

function openPlayersModal() {
  const ov = openModal(`
    <div class="modal-body">
      <h2 id="pl-title"></h2>
      <input class="input" id="pl-search" placeholder="${esc(t('searchPh'))}">
      <div class="summary-list players-list" id="pl-list"></div>
      <div class="row gap">
        <button class="btn btn-ghost grow" id="pl-csv">${esc(t('exportPlayers'))}</button>
        <button class="btn btn-primary grow" data-close>${esc(t('close'))}</button>
      </div>
    </div>`, { wide: true });

  function renderList() {
    const q = $('#pl-search', ov).value.trim().toLowerCase();
    const players = allPlayers().filter(p => matchesQuery([p.name, p.insta, p.email, p.phone], q));
    $('#pl-title', ov).textContent = t('playersTitle', { n: players.length });
    $('#pl-list', ov).innerHTML = players.map((p, i) => `
      <div class="entry player-row">
        ${avatarHtml(p, 'avatar-sm')}
        <div class="grow entry-name">
          <span>${esc(p.name)}</span>
          <small>
            ${p.insta ? '@' + esc(p.insta) + ' · ' : ''}${esc(p.email || '')}${p.phone ? ' · ' + esc(p.phone) : ''}
          </small>
        </div>
        ${levelChipHtml(p.deviceId)}
        ${p.noShows >= 2 ? `<span class="chip chip-flag">${esc(t('noShowChip', { n: p.noShows }))}</span>` : ''}
        ${p.flagged ? `<span class="chip chip-flag">${esc(t('flaggedRemovals', { n: p.flagged }))}</span>` : (p.removals ? `<span class="chip chip-muted">${esc(t('removalsCount', { n: p.removals }))}</span>` : '')}
        ${p.owes ? `<span class="chip chip-unpaid">${esc(t('owesAmount', { amount: fmtMoney(p.owes) }))}</span>`
          : p.unpaid ? `<span class="chip chip-unpaid">${esc(t('unpaidCount', { n: p.unpaid }))}</span>`
          : `<span class="chip ${p.games ? 'chip-mine' : 'chip-muted'}">${esc(p.games ? t('gamesPlayed', { n: p.games }) : t('neverPlayed'))}</span>`}
        ${p.deviceId.startsWith('name:')
          ? (p.battlePass ? `<span class="chip chip-pass">${esc(p.battlePass.toUpperCase())}</span>` : '')
          : `<button class="btn btn-tiny ${p.battlePass ? 'btn-exec' : 'btn-ghost'}" data-pass="${i}" title="${esc(t('battlePassLbl'))}">${esc(p.battlePass ? 'PASS ' + p.battlePass.toUpperCase() : 'PASS')}</button>`}
      </div>`).join('') || `<p class="hint">${esc(t('noMatches'))}</p>`;
    // Tap PASS to set the pass and the level the player's spot is held in.
    $$('[data-pass]', ov).forEach(b => b.addEventListener('click', () => {
      const p = players[+b.dataset.pass];
      openPassModal(p, (type) => { p.battlePass = type; renderList(); });
    }));
  }
  $('#pl-search', ov).addEventListener('input', renderList);
  $('#pl-csv', ov).addEventListener('click', () => {
    const rows = [['Name', 'Email', 'Phone', 'Instagram', 'Games', 'Unpaid signups', 'Removals', 'Played then removed']];
    for (const p of allPlayers()) rows.push([p.name, p.email || '', p.phone || '', p.insta || '', p.games, p.unpaid, p.removals || 0, p.flagged || 0]);
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crsc-players.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  renderList();
}

/*
 * Find one person on a night with nine lists and a couple of hundred names.
 *
 * Scrolling for a name at the door is the single most common thing an exec
 * does, so this searches every list at once and opens the same row controls
 * — paid, checked in, team, move, remove — straight from the result.
 */
/* Accent- and case-blind "does this record contain what they typed". */
function matchesQuery(fields, q) {
  const needle = normalize(q);
  if (!needle) return true;
  return fields.some(v => normalize(v).includes(needle));
}

function openFindModal(ev) {
  const covered = coveredSignupIds(ev);
  const ov = openModal(`
    <div class="modal-body">
      <h2 class="m0">${esc(t('findTitle'))}</h2>
      <input class="input" id="fp-q" placeholder="${esc(t('findPh'))}" autocomplete="off">
      <div class="summary-list" id="fp-list"></div>
      <button class="btn btn-ghost wide" data-close>${esc(t('close'))}</button>
    </div>`, { wide: true });

  function paint() {
    const q = $('#fp-q', ov).value.trim().toLowerCase();
    const rows = !q ? [] : eventSignups(ev.id).filter(su =>
      matchesQuery([su.name, su.insta, su.email, su.phone], q));
    $('#fp-list', ov).innerHTML = !q
      ? `<p class="hint">${esc(t('findEmpty'))}</p>`
      : (rows.map(su => {
          const l = listById(ev, su.listId);
          const sess = l ? sessionById(ev, l.sessionId) : null;
          const entries = listEntries(ev.id, su.listId);
          const pos = entries.findIndex(e => e.id === su.id);
          const waiting = pos >= (l?.cap || 0);
          const paid = su.paid || covered.has(su.id);
          return `
          <div class="entry find-row" data-find="${esc(su.id)}">
            ${avatarHtml(su, 'avatar-sm')}
            <div class="grow entry-name">
              <span>${esc(su.name)}</span>
              <small>
                ${esc(SPORTS[l?.sport]?.label || '')} ${esc(l?.label || '?')}${sess ? ' · ' + esc(sess.label) : ''}
                · ${esc(waiting ? t('onWaitlist', { n: pos - (l?.cap || 0) + 1 }) : t('confirmedSpot'))}
                ${su.email ? ' · ' + esc(su.email) : ''}${su.phone ? ' · ' + esc(su.phone) : ''}
              </small>
            </div>
            ${levelChipHtml(su.deviceId)}
            ${su.viaPass ? `<span class="chip chip-pass-off">${esc(t('heldChip'))}</span>` : ''}
            <span class="chip ${paid ? 'chip-paid' : 'chip-unpaid'}">${esc(paid ? t('paidChip') : t('unpaidChip'))}</span>
            <span class="chip ${su.checkedIn ? 'chip-in-ok' : 'chip-muted'}">${esc(su.checkedIn ? t('inChip') : t('outChip'))}</span>
          </div>`;
        }).join('') || `<p class="hint">${esc(t('noMatches'))}</p>`);
    $$('[data-find]', ov).forEach(row => row.addEventListener('click', () => {
      const su = eventSignups(ev.id).find(x => x.id === row.dataset.find);
      if (su) { ov.remove(); openPlayerAdminModal(ev, su); }
    }));
  }
  $('#fp-q', ov).addEventListener('input', paint);
  paint();
  $('#fp-q', ov).focus();
}

/* ================================================================== */
/* Automatic e-transfer matching                                       */
/* ================================================================== */

/*
 * Which weeks a received transfer could be paying for. Money shows up late
 * (someone sends it Sunday morning) and early (the pass-holder who pays on
 * sight), so the search reaches either side of today rather than assuming
 * the transfer belongs to tonight's game.
 */
function matchableEvents() {
  const day = 86400000;
  const now = Date.now();
  return state.events.filter(ev => {
    if (!ev.date || ev.status !== 'open') return false;
    const at = new Date(ev.date + 'T12:00:00').getTime();
    return at > now - 30 * day && at < now + 14 * day;
  });
}

function unpaidFor(ev) {
  return personTotals(ev).filter(p => !p.paid && p.total > 0);
}

/*
 * Publish what each person still owes, for the Gmail matcher to settle
 * against while nobody has the app open.
 *
 * Pricing is genuinely intricate — season passes, both-slot bundles, late
 * fees, someone who paid for volleyball and also played basketball — and it
 * lives here, in one place. Rather than reimplement any of that inside a
 * Google Apps Script (where it would drift out of sync the first time a
 * price changed), the app publishes the ANSWER: a plain list of who owes
 * what. The matcher only has to read names and add up numbers.
 *
 * Republished whenever the night changes, which is exactly when someone is
 * looking at it: signing up, being marked paid, gaining a pass, being
 * removed. A player signing up at 2 AM refreshes it by that very act.
 */
async function publishDues(ev) {
  if (store.mode === 'demo' || !ev || ev.status !== 'open') return;
  const people = personTotals(ev)
    .filter(p => !p.paid && p.total > 0)
    .map(p => ({
      name: p.name,
      owed: p.total,
      ids: p.signups.map(su => su.id),
      email: p.signups.find(su => su.email)?.email || '',
      lang: p.signups[0]?.lang === 'fr' ? 'fr' : 'en',
    }));
  try {
    await store.saveDues(ev.id, { date: ev.date, updatedAt: Date.now(), people });
  } catch (err) { console.error('publish dues', err); }
}

/* Keep every open night's dues current, debounced so a burst of changes
 * publishes once. */
let duesTimer = null;
function scheduleDues() {
  clearTimeout(duesTimer);
  duesTimer = setTimeout(() => {
    // Exactly the nights the matcher considers — no wider, so nothing is
    // published that will not be kept current, and no narrower, so a stale
    // total can never out-live the payment that settled it. Someone paying
    // last week's game late (the club allows it until Tuesday) still settles.
    for (const ev of matchableEvents()) {
      if (!isScheduled(ev)) publishDues(ev);
    }
  }, 2000);
}

/*
 * Mark people paid for the transfers that speak for themselves.
 *
 * Runs on any exec's device whenever the data changes — the Gmail script
 * writes a payment row, every open app sees it within seconds. Two execs
 * doing this at once write the same answer, so no coordination is needed.
 *
 * A transfer is only applied when exactly one week reconciles: a $20 sender
 * who owes $20 this Saturday AND $20 last Saturday is a question for a human,
 * not a coin flip.
 */
async function runAutoMatch() {
  if (!isExec()) return;
  // `noAuto` is an exec having undone this one by hand. The matcher does not
  // get to argue: a transfer a human took back stays back, and waits for them
  // on the review list instead.
  const pending = (state.payments || []).filter(p => !p.matched && !p.noAuto);
  if (!pending.length) return;
  const events = matchableEvents();
  if (!events.length) return;

  for (const pay of pending) {
    // A test transfer proves the plumbing and nothing else: it is shown on
    // the Payments screen with everything the club parsed out of it, and no
    // player is touched.
    if (isTestTransfer(pay, state.settings)) continue;

    // Season passes are bought outright, often weeks before the player signs
    // up for anything, so they are matched against the whole player registry
    // rather than one night's unpaid list.
    const pass = passPurchase(pay, state.settings);
    if (pass) {
      const who = nameHits((pay.sender || '') + ' ' + (pay.message || ''), allPlayers());
      const top = who.length === 1 ? who[0].person : null;
      if (top && !top.deviceId.startsWith('name:')) {
        await setBattlePass(top, pass, passLists(state.players[top.deviceId]));
        await store.updatePayment(pay.id, {
          matched: true, matchedTo: top.name, auto: true,
          matchedAt: Date.now(), kind: 'pass',
        });
        await notifyPassActivated(top, pass, pay.amount || 0);
        toast(t('passAutoToast', { name: top.name, type: pass.toUpperCase() }));
      }
      continue;   // never spend a pass payment on a single night's game fee
    }

    const hits = [];
    for (const ev of events) {
      const res = resolvePayment(pay, unpaidFor(ev));
      if (res.status === 'matched') hits.push({ ev, people: res.people });
    }
    if (hits.length !== 1) continue;   // nothing certain, or certain twice over
    const { ev, people } = hits[0];
    const names = people.map(p => p.name).join(', ');
    await Promise.all(people.flatMap(p => p.signups.map(su =>
      store.updateSignup(ev.id, su.id, { paid: true, paidAt: Date.now(), paidVia: 'auto' }))));
    await store.updatePayment(pay.id, {
      matched: true, matchedTo: names, matchedEvent: ev.id,
      auto: true, matchedAt: Date.now(),
    });
    await notifyPaymentReceived(ev, people, pay);
    toast(t('autoMatchedToast', { names, amount: fmtMoney(pay.amount || 0) }));
  }
}

/* ================================================================== */
/* Exec: payments summary + CSV                                        */
/* ================================================================== */

/* Best guess for which unpaid player a transfer the matcher left behind is
 * for — the same name reading as the automatic pass, minus the certainty. */
function suggestMatch(pay, unpaid) {
  const hits = nameHits((pay.sender || '') + ' ' + (pay.message || ''), unpaid);
  let best = null; let bestScore = 0;
  for (const h of hits) if (h.score > bestScore) { best = h.person; bestScore = h.score; }
  return best;
}

function openSummaryModal(ev) {
  const people = personTotals(ev);
  const paid = people.filter(p => p.paid);
  const unpaid = people.filter(p => !p.paid);
  const collected = people.reduce((a, p) => a + (p.paidAmount || 0), 0);
  const outstanding = unpaid.reduce((a, p) => a + p.total, 0);
  const pays = (state.payments || []).filter(p => !p.matched && !isTestTransfer(p, state.settings));
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('paymentsTitle', { date: fmtDate(ev.date) }))}</h2>
      <div class="stat-row">
        <div class="stat"><strong>${people.length}</strong><span>${esc(t('players'))}</span></div>
        <div class="stat stat-good"><strong>${fmtMoney(collected)}</strong><span>${esc(t('collected'))}</span></div>
        <div class="stat stat-bad"><strong>${fmtMoney(outstanding)}</strong><span>${esc(t('outstanding'))}</span></div>
      </div>
      ${pays.length ? `
        <h3 class="section-sub">${esc(t('moneyReceived'))}</h3>
        <div class="summary-list">
          ${pays.map(pay => {
            const sug = suggestMatch(pay, unpaid);
            return `
            <div class="pay-match" data-pay="${esc(pay.id)}">
              <div class="row gap center">
                <strong class="grow">${esc(pay.sender || '?')}</strong>
                <span class="pay-amt">${fmtMoney(pay.amount || 0)}</span>
              </div>
              ${pay.message ? `<p class="pay-note">${esc(t('transferNote', { note: pay.message }))}</p>` : ''}
              <div class="row gap">
                ${unpaid.length ? `
                  <select class="input grow" data-match-sel>
                    ${unpaid.map(u => `<option value="${esc(u.name)}" ${sug && sug.name === u.name ? 'selected' : ''}>${esc(u.name)} (${fmtMoney(u.total)})</option>`).join('')}
                  </select>
                  <button class="btn btn-small btn-success" data-match-go>✓</button>` : `<span class="hint grow">${esc(t('noUnpaidHere'))}</span>`}
                <button class="btn btn-small btn-ghost" data-match-x title="${esc(t('dismiss'))}">✕</button>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}
      ${(() => {
        const tests = (state.payments || []).filter(p => !p.matched && isTestTransfer(p, state.settings));
        if (!tests.length) return '';
        return `
        <h3 class="section-sub">${esc(t('testTitle'))}</h3>
        <div class="summary-list">
          ${tests.map(p => `
            <div class="entry" data-test="${esc(p.id)}">
              <div class="grow entry-name">
                <span>${esc(t('testOk'))}</span>
                <small>${esc(t('testFrom', { sender: p.sender || '?', amount: fmtMoney(p.amount || 0) }))}${p.message ? ' · ' + esc(t('transferNote', { note: p.message })) : ''}</small>
              </div>
              <button class="btn btn-small btn-ghost" data-test-x>\u2715</button>
            </div>`).join('')}
        </div>
        <p class="hint">${esc(t('testNote', { amount: fmtMoney(state.settings.testAmount) }))}</p>`;
      })()}
      ${(() => {
        const autos = (state.payments || [])
          .filter(p => p.auto && p.matchedEvent === ev.id)
          .sort((a, b) => (b.matchedAt || 0) - (a.matchedAt || 0));
        if (!autos.length) return '';
        return `
        <h3 class="section-sub">${esc(t('autoMatchedTitle', { n: autos.length }))}</h3>
        <div class="summary-list">
          ${autos.map(p => `
            <div class="entry" data-auto="${esc(p.id)}">
              <div class="grow entry-name">
                <span>${esc(p.matchedTo || '')}</span>
                <small>${esc(t('autoFrom', { sender: p.sender || '?' }))}${p.message ? ' · ' + esc(p.message) : ''}</small>
              </div>
              <span class="chip chip-paid">${fmtMoney(p.amount || 0)} \u2713</span>
              <button class="btn btn-small btn-ghost" data-auto-undo title="${esc(t('undo'))}">\u21ba</button>
            </div>`).join('')}
        </div>
        <p class="hint">${esc(t('autoMatchNote'))}</p>`;
      })()}
      ${unpaid.length ? `
        <h3 class="section-sub">${esc(t('notPaidYet', { n: unpaid.length }))}</h3>
        <div class="summary-list">
          ${unpaid.map(p => `<div class="entry"><span class="grow">${esc(p.name)}${p.insta ? ` <small>@${esc(p.insta)}</small>` : ''}${p.late ? ` <small>(${esc(t('lateFee'))})</small>` : ''}</span>${p.pass ? `<span class="chip chip-pass-off">${esc(String(p.pass).toUpperCase())}</span>` : ''}<span class="chip chip-unpaid">${esc(p.method === 'cash' ? t('cash') : t('etransfer'))} ${fmtMoney(p.total)}</span></div>`).join('')}
        </div>` : `<p class="hint">${esc(t('everyonePaid'))}</p>`}
      ${(() => {
        const rms = (state.removals || []).filter(r => r.eventId === ev.id)
          .sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0));
        if (!rms.length) return '';
        return `
        <h3 class="section-sub">${esc(t('removalsTitle', { n: rms.length }))}</h3>
        <div class="summary-list">
          ${rms.map(r => `
            <div class="entry removal-row ${r.flagged ? 'removal-flagged' : ''}">
              <div class="grow entry-name">
                <span>${esc(r.name)}${r.flagged ? ` <span class="chip chip-flag">${esc(r.wasCheckedIn ? t('wasCheckedIn') : t('removedAfterStart'))}</span>` : ''}</span>
                <small>
                  ${esc(r.sportLabel)} ${esc(r.listLabel)}${r.sessionLabel ? ' · ' + esc(r.sessionLabel) : ''}
                  · ${esc(fmtStamp(r.removedAt))} · ${esc(r.by === 'exec' ? t('removedByExec') : t('removedBySelf'))}
                  ${r.email ? ' · ' + esc(r.email) : ''}
                </small>
              </div>
              ${r.flagged && r.amountOwed ? `<span class="chip chip-unpaid">${esc(t('stillOwes', { amount: fmtMoney(r.amountOwed) }))}</span>` : ''}
            </div>`).join('')}
        </div>
        <p class="hint">${esc(t('removalNote'))}</p>`;
      })()}
      ${paid.length ? `
        <h3 class="section-sub">${esc(t('paidList', { n: paid.length }))}</h3>
        <div class="summary-list">
          ${paid.map(p => `<div class="entry"><span class="grow">${esc(p.name)}</span>${p.pass && !p.paidAmount ? passChipHtml(p.pass) : `<span class="chip chip-paid">${fmtMoney(p.paidAmount || 0)} ✓</span>`}</div>`).join('')}
        </div>` : ''}
      <button class="btn btn-primary wide" data-close>${esc(t('close'))}</button>
    </div>`, { wide: true });

  $$('.pay-match', ov).forEach(row => {
    const pay = pays.find(p => p.id === row.dataset.pay);
    const go = $('[data-match-go]', row);
    if (go) go.addEventListener('click', async () => {
      const name = $('[data-match-sel]', row).value;
      const person = unpaid.find(u => u.name === name);
      if (!person) return;
      await Promise.all(person.signups.map(su => store.updateSignup(ev.id, su.id, { paid: true, paidAt: Date.now() })));
      await store.updatePayment(pay.id, { matched: true, matchedTo: name, matchedEvent: ev.id });
      await notifyPaymentReceived(ev, [person], pay);
      toast(t('matchedToast', { name, amount: fmtMoney(pay.amount || 0) }));
      ov.remove();
      openSummaryModal(state.events.find(e => e.id === ev.id) || ev);
    });
    $('[data-match-x]', row).addEventListener('click', async () => {
      await store.updatePayment(pay.id, { matched: true, matchedTo: '' });
      toast(t('dismissedToast'));
      row.remove();
    });
  });

  $$('[data-test]', ov).forEach(row => {
    $('[data-test-x]', row).addEventListener('click', async () => {
      await store.updatePayment(row.dataset.test, { matched: true, matchedTo: '', kind: 'test' });
      row.remove();
    });
  });

  // Undo an automatic match: the transfer goes back to the review list above
  // and only the spots the matcher marked are cleared, never a cash payment
  // or a tick an exec made by hand.
  $$('[data-auto]', ov).forEach(row => {
    const pay = (state.payments || []).find(p => p.id === row.dataset.auto);
    $('[data-auto-undo]', row).addEventListener('click', async () => {
      const names = (pay.matchedTo || '').split(',').map(n => n.trim()).filter(Boolean);
      const targets = people.filter(p => names.includes(p.name));
      await Promise.all(targets.flatMap(p => p.signups
        .filter(su => su.paidVia === 'auto')
        .map(su => store.updateSignup(ev.id, su.id, { paid: false, paidVia: '' }))));
      await store.updatePayment(pay.id, { matched: false, matchedTo: '', auto: false, noAuto: true });
      toast(t('autoUndone', { names: pay.matchedTo || '' }), 'warn');
      ov.remove();
      openSummaryModal(state.events.find(e => e.id === ev.id) || ev);
    });
  });
}

function exportCsv(ev) {
  const covered = coveredSignupIds(ev);
  const rows = [['Name', 'Email', 'Phone', 'Instagram', 'Session', 'List', 'Sport', 'Team', 'Status', 'Payment method', 'Paid', 'Checked in']];
  for (const l of ev.lists || []) {
    const sess = sessionById(ev, l.sessionId);
    const entries = listEntries(ev.id, l.id);
    const { confirmed, waitlist } = splitByCap(entries, l.cap || 0);
    const row = (su, status) => [su.name, su.email || '', su.phone || '', su.insta, sess?.label || '', l.label, SPORTS[l.sport]?.label || l.sport, su.team || '', status, su.method, su.paid ? 'yes' : (covered.has(su.id) ? 'BATTLE PASS' : 'NO'), su.checkedIn ? 'yes' : ''];
    for (const su of confirmed) rows.push(row(su, 'confirmed'));
    for (const su of waitlist) rows.push(row(su, 'waitlist'));
  }
  // Removed names stay in the export as the proof trail.
  for (const r of (state.removals || []).filter(x => x.eventId === ev.id)) {
    rows.push([r.name, r.email || '', r.phone || '', r.insta || '', r.sessionLabel || '', r.listLabel || '', r.sportLabel || '', '',
      `REMOVED ${r.by === 'exec' ? 'by exec' : 'by player'} ${fmtStamp(r.removedAt)}${r.flagged ? ' — PLAYED, OWES ' + fmtMoney(r.amountOwed) : ''}`,
      '', r.wasPaid ? 'yes' : 'NO', r.wasCheckedIn ? 'yes' : '']);
  }
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crsc-${ev.date || 'event'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ================================================================== */
/* Exec: event editor                                                  */
/* ================================================================== */

function sportOptions(sel) {
  return Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.label}</option>`).join('');
}

function openEventEditor(ev, { isNew = false } = {}) {
  const creating = !ev || isNew;
  const draft = ev ? JSON.parse(JSON.stringify(ev)) : makeTemplateEvent(nextSaturday(), 'Saturday Drop-in');
  if (!ev) draft.lists = draft.lists || [];

  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(creating ? t('newEventTitle') : t('editEventTitle'))}</h2>
      <div class="stack">
        <label class="field-label">${esc(t('title'))}</label>
        <input class="input" id="ee-title" value="${esc(draft.title || '')}" maxlength="60">
        <label class="field-label">${esc(t('date'))}</label>
        <input class="input" id="ee-date" type="date" value="${esc(draft.date || '')}">
        <label class="field-label">${esc(t('location'))}</label>
        <input class="input" id="ee-location" value="${esc(draft.location || state.settings.location || '')}" maxlength="120">
        <div class="row gap">
          <div class="grow stack">
            <label class="field-label">${esc(t('slot1'))}</label>
            <input class="input" id="ee-s1" value="${esc(draft.sessions?.[0]?.label || '5:30 – 7:30 PM')}">
          </div>
          <div class="grow stack">
            <label class="field-label">${esc(t('slot2'))}</label>
            <input class="input" id="ee-s2" value="${esc(draft.sessions?.[1]?.label || '7:30 – 9:30 PM')}">
          </div>
        </div>
      </div>
      <h3 class="section-sub">${esc(t('lists'))}</h3>
      <div id="ee-lists"></div>
      <button class="btn btn-ghost wide" id="ee-addlist">${esc(t('addList'))}</button>
      <h3 class="section-sub">${esc(t('bundleLabel'))}</h3>
      <div class="row gap center">
        <select class="input grow" id="ee-bsport">
          <option value="">${esc(t('noBundle'))}</option>
          ${sportOptions(draft.bundles?.[0]?.sport)}
        </select>
        <input class="input input-num" id="ee-bprice" type="number" min="0" step="1" placeholder="$" value="${esc(draft.bundles?.[0]?.priceE ?? '')}">
      </div>
      <div class="row gap sticky-actions">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        ${!creating ? `<button class="btn btn-danger" id="ee-delete">${esc(t('deleteBtn'))}</button>` : ''}
        <button class="btn btn-primary grow" id="ee-save">${esc(creating ? t('createEvent') : t('saveChanges'))}</button>
      </div>
    </div>`, { wide: true });

  function renderLists() {
    $('#ee-lists', ov).innerHTML = draft.lists.map((l, i) => `
      <div class="ee-list" data-i="${i}">
        <div class="row gap">
          <select class="input" data-f="sessionId">
            <option value="s1" ${l.sessionId === 's1' ? 'selected' : ''}>${esc(t('slotN', { n: 1 }))}</option>
            <option value="s2" ${l.sessionId === 's2' ? 'selected' : ''}>${esc(t('slotN', { n: 2 }))}</option>
          </select>
          <select class="input grow" data-f="sport">${sportOptions(l.sport)}</select>
          <select class="input input-num" data-f="teamCount" title="${esc(t('teams'))}">
            ${[0, ...teamOptionsFor(l.sport)].map(n => `<option value="${n}" ${(l.teamCount || 0) === n ? 'selected' : ''}>${n || '—'}</option>`).join('')}
          </select>
          <button class="btn btn-tiny btn-danger" data-del="${i}">✕</button>
        </div>
        <div class="row gap">
          <input class="input grow" data-f="label" placeholder="${esc(t('levelPh'))}" value="${esc(l.label)}">
          <input class="input input-num" data-f="cap" type="number" min="0" step="1" value="${esc(l.cap)}">
          <input class="input input-num" data-f="priceE" type="number" min="0" step="1" value="${esc(l.priceE)}">
          <input class="input input-num" data-f="priceC" type="number" min="0" step="1" value="${esc(l.priceC)}">
        </div>
        <div class="ee-cols"><span>${esc(t('listCols'))}</span><span>${esc(t('listCols2'))}</span></div>
      </div>`).join('');
    $$('.ee-list', ov).forEach(rowEl => {
      const i = +rowEl.dataset.i;
      $$('[data-f]', rowEl).forEach(inp => inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        draft.lists[i][f] = (f === 'cap' || f === 'priceE' || f === 'priceC' || f === 'teamCount') ? (parseFloat(inp.value) || 0) : inp.value;
      }));
    });
    $$('[data-del]', ov).forEach(b => b.addEventListener('click', () => {
      draft.lists.splice(+b.dataset.del, 1);
      renderLists();
    }));
  }
  renderLists();

  $('#ee-addlist', ov).addEventListener('click', () => {
    draft.lists.push({ id: uid('l'), sessionId: 's1', sport: 'volleyball', label: '', cap: 14, priceE: 8, priceC: 10, teamCount: 0 });
    renderLists();
  });

  $('#ee-save', ov).addEventListener('click', async () => {
    draft.title = $('#ee-title', ov).value.trim() || 'Saturday Drop-in';
    draft.date = $('#ee-date', ov).value;
    draft.location = $('#ee-location', ov).value.trim();
    draft.sessions = [
      { id: 's1', label: $('#ee-s1', ov).value.trim() || t('slotN', { n: 1 }) },
      { id: 's2', label: $('#ee-s2', ov).value.trim() || t('slotN', { n: 2 }) },
    ];
    const bsport = $('#ee-bsport', ov).value;
    const bprice = parseFloat($('#ee-bprice', ov).value);
    draft.bundles = bsport && !isNaN(bprice)
      ? [{ sport: bsport, label: `${SPORTS[bsport].label} 4h`, priceE: bprice, priceC: bprice }]
      : [];
    if (!draft.date) { toast(t('pickDate'), 'err'); return; }
    if (!draft.lists.length) { toast(t('addOneList'), 'err'); return; }
    draft.status = draft.status || 'open';
    await store.saveEvent(draft);
    ov.remove();
    toast(creating ? t('eventCreated') : t('eventSaved'));
    location.hash = '#/event/' + draft.id;
  });

  const del = $('#ee-delete', ov);
  if (del) del.addEventListener('click', async () => {
    const played = isPastEvent(draft) && eventSignups(draft.id).length;
    if (played) {
      ov.remove();
      await confirmModal(t('cannotDeletePast', { n: played, date: fmtDate(draft.date) }), t('ok'), { alert: true });
      return;
    }
    ov.remove();
    if (await confirmModal(t('deleteEventConfirm'), t('deleteEvent'))) {
      await store.deleteEvent(draft.id);
      location.hash = '#/';
      toast(t('eventDeleted'));
    }
  });
}

/* ================================================================== */
/* Exec: club settings                                                 */
/* ================================================================== */

function openSettingsModal() {
  const s = state.settings;
  const ov = openModal(`
    <div class="modal-body">
      <h2>${esc(t('clubSettings'))}</h2>
      <div class="stack">
        <label class="field-label">${esc(t('etransferEmailLbl'))}</label>
        <input class="input" id="cs-email" value="${esc(s.etransferEmail || '')}">
        <label class="field-label">${esc(t('defaultLocation'))}</label>
        <input class="input" id="cs-location" value="${esc(s.location || '')}">
        <label class="field-label">${esc(t('instaHandle'))}</label>
        <input class="input" id="cs-insta" value="${esc(s.instagram || '')}">
        <label class="field-label">${esc(t('execPinLbl'))}</label>
        <input class="input" id="cs-pin" value="${esc(s.execPin || '')}" maxlength="12">
        <label class="field-label">${esc(t('seasonEndLbl'))}</label>
        <input class="input" id="cs-season" type="date" value="${esc(s.seasonEnd || '')}">
        <label class="field-label">${esc(t('lateFeeLbl'))}</label>
        <input class="input" id="cs-latefee" value="${esc(s.lateFeeNote || '')}">
        <label class="field-label">${esc(t('lateFeeAmountLbl'))}</label>
        <input class="input input-num" id="cs-latefeeamt" type="number" min="0" step="1" value="${esc(s.lateFeeAmount ?? 5)}">
        <label class="field-label">${esc(t('signupOpenLbl'))}</label>
        <input class="input input-num" id="cs-openahead" type="number" min="0" step="1" value="${esc(s.signupOpenDaysBefore ?? 6)}">
        <label class="field-label">${esc(t('battlePassNoteLbl'))}</label>
        <textarea class="input" id="cs-bpnote" rows="3">${esc(s.battlePassNote || '')}</textarea>
        <label class="field-label">${esc(t('policiesLbl'))}</label>
        <textarea class="input" id="cs-policies" rows="6">${esc((s.policies || []).join('\n'))}</textarea>
        <label class="field-label">${esc(t('policiesUrlLbl'))}</label>
        <input class="input" id="cs-policies-url" value="${esc(s.policiesUrl || '')}" placeholder="https://">
      </div>
      <div class="row gap">
        <button class="btn btn-ghost grow" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary grow" id="cs-save">${esc(t('save'))}</button>
      </div>
    </div>`, { wide: true });
  $('#cs-save', ov).addEventListener('click', async () => {
    await store.saveSettings({
      etransferEmail: $('#cs-email', ov).value.trim(),
      location: $('#cs-location', ov).value.trim(),
      instagram: $('#cs-insta', ov).value.trim().replace(/^@/, ''),
      execPin: $('#cs-pin', ov).value.trim() || '1405',
      seasonEnd: $('#cs-season', ov).value || s.seasonEnd || '',
      lateFeeNote: $('#cs-latefee', ov).value.trim(),
      lateFeeAmount: parseFloat($('#cs-latefeeamt', ov).value) || 0,
      signupOpenDaysBefore: parseFloat($('#cs-openahead', ov).value) || 0,
      battlePassNote: $('#cs-bpnote', ov).value.trim(),
      policies: $('#cs-policies', ov).value.split('\n').map(x => x.trim()).filter(Boolean),
      policiesUrl: $('#cs-policies-url', ov).value.trim(),
    });
    ov.remove();
    toast(t('settingsSaved'));
  });
}

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

let reminderTimer = null;
let matchTimer = null;

async function main() {
  document.documentElement.lang = getLang();
  // Reaching the shared database can take a few seconds on a phone; never
  // leave the screen blank while it happens.
  $('#view').innerHTML = `<div class="empty">${esc(t('connecting'))}</div>`;
  store = await createStore();
  window.addEventListener('hashchange', render);
  const existing = getProfile();
  if (existing) registerPlayer(existing); // keep the directory's "last seen" fresh
  // Everyone watches the player registry: Battle Pass status must be known
  // on every device for prices, chips, and reminder emails to be right.
  store.watchPlayers();
  await store.init(newState => {
    state = newState;
    render();
    // Check for due payment reminders shortly after data settles.
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(runPaymentReminders, 1500);
    // Received e-transfers land here the moment the Gmail script files them.
    clearTimeout(matchTimer);
    matchTimer = setTimeout(runAutoMatch, 1200);
    // Keep the Gmail matcher's view of who owes what current.
    scheduleDues();
  });
}

main();
