/*
 * Who is using the app.
 *
 * Until now the app took people at their word: you typed a name and an email
 * and that was your identity, which is why one person could end up as two
 * accounts and why the exec gate was a four-digit number anyone could read
 * out of the database. Signing in replaces both — the address is proven by
 * Google or by a link sent to the inbox, so it can be trusted as a key.
 *
 * Two ways in, because not everybody has a Google account:
 *   - Google, one tap for most people (they are usually already signed in).
 *   - A sign-in link emailed to any address at all. No password either way;
 *     a club has no business storing one.
 *
 * In demo mode there is no Firebase and therefore nobody to sign in. The
 * module still loads and simply reports that auth is unavailable, so the
 * demo and the tests keep working exactly as before.
 */

const EMAIL_KEY = 'crsc-pending-email';

let auth = null;          // the Firebase Auth instance, once it exists
let mod = null;           // the firebase-auth module
let user = null;          // the signed-in user, or null

export function authReady() { return !!auth; }

/* The signed-in person, flattened to what the app actually uses. */
export function currentUser() {
  if (!user) return null;
  return {
    email: (user.email || '').trim().toLowerCase(),
    name: user.displayName || '',
    photo: user.photoURL || '',
    uid: user.uid,
  };
}

/*
 * Start Firebase Auth and call back on every change, including the first
 * one. `onUser(null)` means signed out — the app shows the door.
 *
 * Resolves once the first state is known, so the app never renders a
 * sign-in screen to somebody who is already signed in.
 */
export async function initAuth(app, onUser) {
  if (!app) { onUser(null); return false; }
  mod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  auth = mod.getAuth(app);
  // Coming back from a redirect sign-in (the fallback when a popup is
  // blocked, which is most in-app browsers on a phone).
  try { await mod.getRedirectResult(auth); } catch (err) { console.error('redirect sign-in', err); }
  // Or from a sign-in link in somebody's inbox.
  await completeEmailLink();
  return new Promise(resolve => {
    let first = true;
    mod.onAuthStateChanged(auth, u => {
      user = u;
      onUser(currentUser());
      if (first) { first = false; resolve(true); }
    });
  });
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('auth not ready');
  const provider = new mod.GoogleAuthProvider();
  // Always ask which account: a shared or family device otherwise silently
  // signs in whoever used it last, which is how the wrong person ends up
  // on the list.
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await mod.signInWithPopup(auth, provider);
  } catch (err) {
    // A popup is blocked in most in-app browsers (Instagram, Messenger),
    // which is exactly where this link gets opened. Fall back to a redirect.
    if (/popup|blocked|cancelled|canceled/i.test(err?.code || err?.message || '')) {
      await mod.signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

/* Email the address a one-tap sign-in link. Works with any provider. */
export async function sendEmailLink(email) {
  if (!auth) throw new Error('auth not ready');
  const clean = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('bad email');
  await mod.sendSignInLinkToEmail(auth, clean, {
    // Back to the app itself, without whatever hash they were on.
    url: location.origin + location.pathname,
    handleCodeInApp: true,
  });
  try { localStorage.setItem(EMAIL_KEY, clean); } catch (e) { /* ignore */ }
}

/*
 * Finish a link sign-in. The address is normally remembered from the device
 * that asked for the link; when the link is opened somewhere else it has to
 * be typed again, which is the check that stops a forwarded link working.
 */
async function completeEmailLink() {
  if (!auth || !mod.isSignInWithEmailLink(auth, location.href)) return;
  let email = '';
  try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { /* ignore */ }
  if (!email) email = window.prompt('Confirm the email this link was sent to') || '';
  if (!email) return;
  try {
    await mod.signInWithEmailLink(auth, email.trim().toLowerCase(), location.href);
    try { localStorage.removeItem(EMAIL_KEY); } catch (e) { /* ignore */ }
    // Strip the sign-in parameters so a refresh does not try again.
    history.replaceState(null, '', location.origin + location.pathname + (location.hash || ''));
  } catch (err) {
    console.error('email link sign-in', err);
    throw err;
  }
}

export async function signOutNow() {
  if (!auth) return;
  await mod.signOut(auth);
}
