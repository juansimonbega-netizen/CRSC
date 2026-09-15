/* Sender extraction against the wordings Canadian banks actually use. */
import { readFileSync } from 'fs';
import vm from 'vm';
const ctx = { MailApp:{sendEmail(){}}, UrlFetchApp:{}, GmailApp:{}, Logger:{log(){}}, console };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../apps-script/payment-matcher.gs', import.meta.url),'utf8'), ctx);

const cases = [
  ['Interac EN classic',  'INTERAC e-Transfer: MARC TREMBLAY sent you $8.00 (CAD)', '', 'MARC TREMBLAY'],
  ['Interac FR classic',  'Virement INTERAC : ANAIS COTE vous a envoyé 8,00 $', '', 'ANAIS COTE'],
  ['bare EN subject',     'Marc Tremblay sent you money', '', 'Marc Tremblay'],
  ['bare FR subject',     'Anais Cote vous a envoyé de l\'argent', '', 'Anais Cote'],
  ['name only in body',   'You received an INTERAC e-Transfer', 'You have received money from Marc Tremblay. Amount: $8.00', 'Marc Tremblay'],
  ['FR body',             'Virement reçu', 'Vous avez reçu de l\'argent de Anais Cote. Montant : 8,00 $', 'Anais Cote'],
  ['transfer from',       'Deposit complete', 'A transfer from Rayan Sedraoui was auto-deposited.', 'Rayan Sedraoui'],
  ['quoted name',         'INTERAC e-Transfer: "Sonia Goujon" sent you $8.00', '', 'Sonia Goujon'],
  ['not a transfer',      'Your monthly statement is ready', 'Nothing to see here.', ''],
  ['phone-like junk',     'Alert 5145551234 sent you money', '', ''],
];
let bad = 0;
for (const [label, subject, body, want] of cases) {
  const got = ctx.findSender(subject, body);
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok?'ok  ':'FAIL') + '  ' + label.padEnd(20) + ' → ' + JSON.stringify(got) + (ok?'':'  want ' + JSON.stringify(want)));
}
console.log('\n' + (bad ? bad + ' failing' : 'all ' + cases.length + ' wordings recognised'));
process.exit(bad ? 1 : 0);
