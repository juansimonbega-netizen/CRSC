/*
 * Email automation: sign-up confirmations, 24h payment reminders, and
 * waitlist-promotion notices.
 *
 * Emails are sent FROM THE CLUB'S OWN GMAIL (the same account that receives
 * the e-transfers) through a tiny Google Apps Script "mailer" attached to
 * that account — free, no server, ~100 emails/day quota. Setup steps are in
 * the README; the deployed script's URL + shared secret go into
 * window.MAILER in firebase-config.js. Without config, everything still
 * works and the app just says the email was skipped/simulated.
 */

export function mailerConfigured() {
  const m = (typeof window !== 'undefined' && window.MAILER) || null;
  return !!(m && m.url);
}

export async function sendMail({ to, subject, message }) {
  if (!to) return { sent: false, reason: 'no-email' };
  if (!mailerConfigured()) return { sent: false, reason: 'not-configured' };
  const body = JSON.stringify({ secret: window.MAILER.secret || '', to, subject, message });
  // Plain body with no custom headers = a CORS "simple request", which Apps
  // Script web apps accept without preflight.
  try {
    const res = await fetch(window.MAILER.url, { method: 'POST', body });
    if (!res.ok) throw new Error('mailer responded ' + res.status);
    return { sent: true };
  } catch (err) {
    // Apps Script answers through a redirect, and some browsers refuse to let
    // the page read that response even though the request went through. Send
    // it again opaquely: the mail still goes out, we just cannot confirm it.
    await fetch(window.MAILER.url, { method: 'POST', mode: 'no-cors', body });
    return { sent: true, unconfirmed: true };
  }
}

/* Who gets promoted if `signup` leaves its list? (Call BEFORE the removal.) */
export function promotionCandidate(entries, cap, signup) {
  const idx = entries.findIndex(e => e.id === signup.id);
  if (idx === -1 || idx >= cap) return null;      // leaving from the waitlist frees nothing
  if (entries.length <= cap) return null;          // nobody is waiting
  return entries[cap];                             // first person on the waitlist
}

/*
 * Which reminder somebody who still owes should get right now.
 *
 * Three, because one was not enough: three days out, when there is still
 * time to send a transfer without thinking about it; the day before; and a
 * few hours before the whistle. The first session starts around 5:30 PM, so
 * every window is measured back from there.
 *
 * Only the most urgent one that applies is returned, and each is sent at
 * most once. That matters more than it looks: somebody who first opens the
 * app on Saturday morning gets the "in a few hours" note and not all three
 * at once, and a stage whose moment has passed is simply skipped rather
 * than arriving late and useless.
 */
export function reminderStage(ev, now = new Date()) {
  if (!ev.date || ev.status !== 'open') return null;
  const start = new Date(ev.date + 'T17:00:00');
  if (now > start) return null;                    // the game has started
  // Counted in nights, not hours, because that is how the email reads and
  // how the reader thinks. Friday lunchtime is "tomorrow" to a person and
  // twenty-nine hours to a clock; the subject line has to be true.
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(start) - midnight(now)) / 86400000);
  if (days === 0) return 'soon';                   // today
  if (days === 1) return 'day';                    // tomorrow
  if (days === 2 || days === 3) return 'three';    // later this week
  return null;                                      // too early to be useful
}
