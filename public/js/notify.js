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
 * Payment reminders go out in the 24 hours before the event (first session
 * starts around 5:30 PM, so the window opens the evening before) and stay
 * open through the event day itself.
 */
export function reminderDue(ev, now = new Date()) {
  if (!ev.date || ev.status !== 'open') return false;
  const eventStart = new Date(ev.date + 'T17:00:00');
  const windowStart = new Date(eventStart.getTime() - 24 * 3600 * 1000);
  const windowEnd = new Date(ev.date + 'T23:59:59');
  return now >= windowStart && now <= windowEnd;
}
