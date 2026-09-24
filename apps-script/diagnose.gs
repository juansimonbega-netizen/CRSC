/**
 * CRSC — inbox diagnostic. TEMPORARY, read-only, changes nothing.
 *
 * Paste as a second file in the CRSC PAYMENTS script (Files → + → Script,
 * call it `diagnose`), save, pick `diagnose` in the function dropdown and
 * press Run. Then open Executions in the left sidebar and copy the log.
 *
 * It answers three questions in order, because they fail in that order:
 *
 *   1. Did the notification arrive in this inbox at all? If the bank has
 *      not sent it, or it went to spam, nothing else matters. So this
 *      lists recent mail REGARDLESS of any search — that is the question
 *      the old version could not answer.
 *   2. Does the matcher's search find it? A mail that is there but not
 *      matched means the search terms are wrong for this bank.
 *   3. Can the sender, the amount and the message be pulled out of it?
 *      Found but unreadable means a wording to add.
 *
 * It prints senders and subjects, and only the body lines that mention
 * money or a message — never a whole email.
 */
function diagnose() {
  Logger.log('════════ 1. WHAT IS IN THE INBOX ════════');
  Logger.log('Recent mail, no search applied. Is the notification even here?');
  var recent = GmailApp.search('newer_than:3d', 0, 20);
  Logger.log('threads in the last 3 days: ' + recent.length);
  recent.forEach(function (thread) {
    var m = thread.getMessages()[0];
    Logger.log('  · ' + m.getDate() + '  ' + m.getFrom());
    Logger.log('      ' + m.getSubject());
  });

  Logger.log('');
  Logger.log('════════ 2. WHAT THE MATCHER SEARCHES FOR ════════');
  var query = 'newer_than:7d (from:(interac.ca) OR from:(payments.interac.ca) OR ' +
    'subject:(interac) OR subject:(virement) OR subject:("e-transfer") OR ' +
    'subject:("sent you money") OR subject:("vous a envoyé"))';
  Logger.log(query);
  var threads = GmailApp.search(query, 0, 20);
  Logger.log('threads matched: ' + threads.length);
  if (!threads.length) {
    Logger.log('  NOTHING MATCHED. If the notification is listed in part 1,');
    Logger.log('  its sender and subject are what the search has to be widened to.');
  }

  Logger.log('');
  Logger.log('════════ 3. WHAT CAN BE READ OUT OF EACH ════════');
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var subject = msg.getSubject() || '';
      var body = msg.getPlainBody() || '';
      Logger.log('  ── FROM    : ' + msg.getFrom());
      Logger.log('     SUBJECT : ' + subject);
      Logger.log('     DATE    : ' + msg.getDate());

      // Exactly what checkTransfers would do with it.
      var sender = (typeof findSender === 'function') ? findSender(subject, body) : '';
      var amt = body.match(/\$\s*([\d,]+(?:[.,]\d{2})?)/);
      var amount = amt ? parseFloat(amt[1].replace(',', '.').replace(/\.(?=.*\.)/g, '')) : 0;
      var note = (typeof message === 'function') ? message(body) : '';

      Logger.log('     → sender read as : ' + (sender ? '"' + sender + '"' : 'NOTHING — this is why it was skipped'));
      Logger.log('     → amount read as : $' + amount + (amount ? '' : '  ← no dollar figure found'));
      Logger.log('     → message read as: ' + (note ? '"' + note + '"' : '(none)'));

      Logger.log('     lines mentioning money or a message:');
      var shown = 0;
      body.split('\n').forEach(function (line) {
        if (shown >= 12) return;
        if (/\$|montant|amount|message|envoy|sent you|transfer|virement/i.test(line)) {
          var t = line.trim();
          if (t) { Logger.log('       > ' + t.slice(0, 160)); shown++; }
        }
      });
    });
  });

  Logger.log('');
  Logger.log('════════ WHAT TO DO WITH THIS ════════');
  Logger.log('Part 1 empty of any Interac mail → the bank has not sent it yet,');
  Logger.log('  or it is in Spam. Check Spam before anything else.');
  Logger.log('Part 1 has it but part 2 is empty → the search needs its sender.');
  Logger.log('Part 3 says "sender read as NOTHING" → the subject wording needs adding.');
}
