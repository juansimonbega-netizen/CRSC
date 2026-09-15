/**
 * CRSC — inbox diagnostic. TEMPORARY, read-only, changes nothing.
 *
 * Paste at the BOTTOM of the CRSC PAYMENTS script, save, pick `diagnose`
 * in the function dropdown and press Run. Then copy the Execution log.
 *
 * It prints what the club's e-transfer notifications actually look like, so
 * the matcher can be pointed at the real format instead of the one Interac
 * documents. It only prints the sender, the subject, and the few lines that
 * mention money — never a whole email.
 */
function diagnose() {
  var queries = [
    'from:(interac.ca) newer_than:30d',
    'newer_than:30d (interac OR virement OR "e-transfer" OR "e-Transfer" OR "sent you money" OR "vous a envoyé")',
    'newer_than:30d subject:(interac OR virement)',
  ];

  queries.forEach(function (q) {
    var threads = GmailApp.search(q, 0, 10);
    Logger.log('════════════════════════════════════════');
    Logger.log('QUERY: ' + q);
    Logger.log('threads found: ' + threads.length);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        Logger.log('  ── FROM    : ' + msg.getFrom());
        Logger.log('     SUBJECT : ' + msg.getSubject());
        Logger.log('     DATE    : ' + msg.getDate());
        // Only the lines that mention money or a message — never the whole mail.
        var body = msg.getPlainBody() || '';
        body.split('\n').forEach(function (line) {
          if (/\$|montant|amount|message|envoy|sent you/i.test(line)) {
            var t = line.trim();
            if (t) Logger.log('     > ' + t.slice(0, 160));
          }
        });
      });
    });
  });

  Logger.log('════════════════════════════════════════');
  Logger.log('What the matcher currently requires:');
  Logger.log('  search  : from:(interac.ca) newer_than:3d');
  Logger.log('  subject : "INTERAC e-Transfer: NAME sent you"');
  Logger.log('        or: "Virement INTERAC : NOM vous a envoy"');
}
