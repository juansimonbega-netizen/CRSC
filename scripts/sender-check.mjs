/* Sender extraction against the wordings Canadian banks actually use. */
import { readFileSync } from 'fs';
import vm from 'vm';
const ctx = { MailApp:{sendEmail(){}}, UrlFetchApp:{}, GmailApp:{}, Logger:{log(){}}, console };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../apps-script/payment-matcher.gs', import.meta.url),'utf8'), ctx);

const cases = [
  /* ---------------------------------------------------------------
   * The club's own inbox, copied out of the diagnostic on 25 September.
   * Every one of these was SKIPPED by the matcher — three real payments
   * from the first Saturday that nobody was ever credited for. The
   * subject shape is nothing like the one Interac documents, and the
   * French amount ("8,00 $") was read as zero.
   * --------------------------------------------------------------- */
  ['REAL · RBC, French',
   'Virement Interac : Vous avez re\u00e7u 8,00 $ de JOHNNY HOANG et ce montant a \u00e9t\u00e9 d\u00e9pos\u00e9 automatiquement.',
   'Ce courriel vous a \u00e9t\u00e9 envoy\u00e9 par Interac Corp., propri\u00e9taire du service Virement Interac, au nom de JOHNNY HOANG \u00e0 la RBC Banque Royale.',
   'JOHNNY HOANG <notify@payments.interac.ca>', 'JOHNNY HOANG', 8],
  ['REAL · Scotia, French',
   'Virement Interac : Vous avez re\u00e7u 10,00 $ de Humberto Campos et ce montant a \u00e9t\u00e9 d\u00e9pos\u00e9 automatiquement.',
   'Pr\u00e9cisions sur le virement\nMessage : Humberto intermediate\nEnvoy\u00e9 par : Humberto Campos\nMontant : 10,00 $ (CAD)\nCe courriel vous a \u00e9t\u00e9 envoy\u00e9 par Interac Corp., au nom de Humberto Campos \u00e0 la Banque Scotia.',
   'Humberto Campos <notify@payments.interac.ca>', 'Humberto Campos', 10],
  ['REAL · BMO, French',
   'Virement Interac : Vous avez re\u00e7u 7,00 $ de SEDRICK JODOIN et ce montant a \u00e9t\u00e9 d\u00e9pos\u00e9 automatiquement.',
   'Pr\u00e9cisions sur le virement\nEnvoy\u00e9 par : SEDRICK JODOIN\nMontant : 7,00 $ (CAD)\nCe courriel vous a \u00e9t\u00e9 envoy\u00e9 par Interac Corp., au nom de SEDRICK JODOIN \u00e0 la BMO Banque de Montreal.',
   'SEDRICK JODOIN <notify@payments.interac.ca>', 'SEDRICK JODOIN', 7],

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
for (const c of cases) {
  // Older cases are [label, subject, body, want]; the real ones carry a
  // From header and the amount too.
  const [label, subject, body] = c;
  const hasFrom = c.length >= 6;
  const from = hasFrom ? c[3] : '';
  const want = hasFrom ? c[4] : c[3];
  const wantAmount = hasFrom ? c[5] : null;

  const got = ctx.findSender(subject, body, from);
  let ok = got === want;
  let note = '';
  if (wantAmount !== null) {
    const amt = ctx.findAmount(subject, body);
    if (amt !== wantAmount) { ok = false; note = `  amount ${amt} want ${wantAmount}`; }
    else note = `  $${amt}`;
  }
  if (!ok) bad++;
  console.log((ok?'ok  ':'FAIL') + '  ' + label.padEnd(22) + ' → ' + JSON.stringify(got)
    + (got === want ? '' : '  want ' + JSON.stringify(want)) + note);
}
console.log('\n' + (bad ? bad + ' failing' : 'all ' + cases.length + ' wordings recognised, amounts included'));
process.exit(bad ? 1 : 0);
