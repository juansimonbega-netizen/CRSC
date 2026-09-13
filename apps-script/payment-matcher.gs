/**
 * CRSC — automatic e-transfer matcher.
 *
 * Runs INSIDE THE CLUB GMAIL (the account that receives the e-transfers).
 * Every 15 minutes it looks for new Interac e-Transfer notification emails
 * and records the sender's name, the amount, and the message they typed with
 * the transfer. The app reads those rows and marks people paid on its own
 * when the names and the money both add up — including when one person sends
 * for a group and lists everyone in the message, which is why the message is
 * captured and not just the amount. Anything that does not reconcile is left
 * on the exec Payments screen to confirm by hand.
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
      record(msg.getId(), sender, amount, message(body), msg.getDate());
    });
  });
}

/*
 * The note the sender typed. Interac labels it "Message:" in English and
 * "Message :" in French, sometimes with the sender's name in between. Capped
 * well short of a paragraph — it is read for names, not stored as mail.
 */
function message(body) {
  var m = body.match(/Message(?:\s+(?:from|de)\s+[^:]{0,60})?\s*:\s*(.+)/i);
  return m ? m[1].trim().slice(0, 200) : '';
}

function record(id, sender, amount, note, date) {
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
        message: { stringValue: note },
        receivedAt: { integerValue: String(date.getTime()) },
        matched: { booleanValue: false },
      },
    }),
  });
}
