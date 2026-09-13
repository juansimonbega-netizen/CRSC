/**
 * CRSC — automatic e-transfer matcher.
 *
 * Runs INSIDE THE CLUB GMAIL (the account that receives the e-transfers).
 * Every 15 minutes it looks for new Interac e-Transfer notification emails,
 * extracts the sender's name and the amount, and records them in the app's
 * database. They then appear on the exec Payments screen as
 * "Received e-transfers — match to a player" with a one-tap confirm.
 *
 * SETUP (~5 minutes, while logged into the club Gmail):
 *  1. Go to https://script.google.com → New project → paste this file.
 *  2. In the toolbar pick the function `checkTransfers` and press Run once →
 *     authorize Gmail access when asked.
 *  3. Left sidebar → Triggers (alarm-clock icon) → Add Trigger:
 *     function `checkTransfers` · event source "Time-driven" ·
 *     "Minutes timer" · "Every 15 minutes" → Save.
 *
 * Notes:
 *  - Each email is recorded once (the Gmail message id is the database key,
 *    so re-running never duplicates).
 *  - Only notification emails from interac.ca are read; nothing else in the
 *    inbox is touched.
 */

var PROJECT_ID = 'crsc-8fec4';
var API_KEY = 'AIzaSyB7tE4RwcQgmAIIxdyISjQwbamEDmts_hQ';

function checkTransfers() {
  var threads = GmailApp.search('from:(interac.ca) newer_than:3d');
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var subject = msg.getSubject() || '';
      // English + French Interac notification subjects.
      var m = subject.match(/INTERAC e-Transfer:\s*(.+?)\s+sent you/i)
           || subject.match(/Virement INTERAC\s*:\s*(.+?)\s+vous a envoy/i);
      if (!m) return;
      var sender = m[1].trim();
      var body = msg.getPlainBody() || '';
      var amt = body.match(/\$\s*([\d,]+(?:[.,]\d{2})?)/);
      var amount = amt ? parseFloat(amt[1].replace(',', '.').replace(/\.(?=.*\.)/g, '')) : 0;
      record(msg.getId(), sender, amount, msg.getDate());
    });
  });
}

function record(id, sender, amount, date) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/payments?documentId=' + encodeURIComponent(id) +
    '&key=' + API_KEY;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true, // 409 ALREADY_EXISTS = recorded before, fine
    payload: JSON.stringify({
      fields: {
        sender: { stringValue: sender },
        amount: { doubleValue: amount },
        receivedAt: { integerValue: String(date.getTime()) },
        matched: { booleanValue: false },
      },
    }),
  });
}
