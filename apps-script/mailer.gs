/**
 * CRSC — outgoing mailer.
 *
 * Runs inside the club Gmail. The app POSTs here to send sign-up
 * confirmations, 24h payment reminders, and waitlist-promotion emails —
 * all from the club's own address.
 *
 * SETUP: see the "Automatic emails" section of the README. In short:
 * paste into script.google.com (logged into the club Gmail), change SECRET,
 * Deploy → New deployment → Web app (Execute as: Me, Access: Anyone), then
 * put the web app URL + the same secret into window.MAILER in
 * public/firebase-config.js.
 */

var SECRET = 'crsc-oa7c0il73eq6vvtw';

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) {
    return ContentService.createTextOutput('forbidden');
  }
  MailApp.sendEmail({
    to: d.to,
    subject: d.subject,
    body: d.message,
    name: 'CRSC',
  });
  return ContentService.createTextOutput('ok');
}
