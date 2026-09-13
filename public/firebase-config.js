/*
 * Firebase configuration.
 *
 * Leave this as `null` to run in DEMO MODE (data stays in the browser —
 * perfect for trying the app out).
 *
 * To go live:
 *   1. Create a free Firebase project at https://console.firebase.google.com
 *   2. Add a "Web app" to the project and copy its config object here.
 *   3. Enable Cloud Firestore (production mode) in the console.
 *   4. Paste the config below, e.g.:
 *
 *      window.FIREBASE_CONFIG = {
 *        apiKey: "AIza....",
 *        authDomain: "crsc-app.firebaseapp.com",
 *        projectId: "crsc-app",
 *        storageBucket: "crsc-app.appspot.com",
 *        messagingSenderId: "123456789",
 *        appId: "1:123456789:web:abcdef",
 *      };
 *
 * Full steps: see README.md at the root of this repository.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB7tE4RwcQgmAIIxdyISjQwbamEDmts_hQ",
  authDomain: "crsc-8fec4.firebaseapp.com",
  projectId: "crsc-8fec4",
  storageBucket: "crsc-8fec4.firebasestorage.app",
  messagingSenderId: "261800380925",
  appId: "1:261800380925:web:b03e3046949d1aacd4b194",
};

/*
 * Club mailer — powers the automatic emails (sign-up confirmations, 24h
 * payment reminders, waitlist promotions). Emails are sent FROM THE CLUB'S
 * OWN GMAIL — the same account that receives the e-transfers — via a small
 * Google Apps Script attached to that account. Free, ~100 emails/day.
 *
 * Leave as `null` to skip sending (everything else still works; the app
 * shows a toast that the email was skipped/simulated).
 *
 * Setup (5 minutes, full steps in README.md):
 *   1. While logged into the club Gmail, go to https://script.google.com
 *      → New project, and paste the mailer script from the README.
 *   2. Change the SECRET in the script to something random.
 *   3. Deploy → New deployment → Web app → Execute as: Me,
 *      Who has access: Anyone → copy the web app URL.
 *   4. Fill in:
 *
 *      window.MAILER = {
 *        url: "https://script.google.com/macros/s/XXXX/exec",
 *        secret: "the-same-secret-you-put-in-the-script",
 *      };
 */
window.MAILER = null;
