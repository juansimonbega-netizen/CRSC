/* The app and the Gmail script must reach the SAME verdict on every transfer.
 * Two matchers that disagree are worse than one. */
import { readFileSync } from 'fs';
import vm from 'vm';
import { resolvePayment } from '../public/js/automatch.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { MailApp:{sendEmail(){}}, UrlFetchApp:{}, GmailApp:{}, console };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, 'apps-script/payment-matcher.gs'), 'utf8'), ctx);

/* What the .gs would conclude: same two rules, run the same way. */
function gsVerdict(pay, people) {
  const all = ctx.resolve((pay.sender||'') + ' ' + (pay.message||''), people);
  if (!all) return 'ambiguous';
  if (!all.length) return 'unmatched';
  const sets = [all];
  const js = ctx.resolve(pay.sender||'', people);
  if (js && js.length) sets.push(js);
  const amt = ctx.cents(pay.amount);
  for (const set of sets) {
    if (set.reduce((a,p)=>a+ctx.cents(p.owed),0) === amt && amt > 0)
      return 'matched:' + set.map(p=>p.name).sort().join('+');
  }
  // One person named and an amount that is not what they owe: record it
  // against them rather than leaving it for an exec.
  if (all.length === 1 && amt > 0) return 'partial:' + all[0].name;
  return 'unmatched';
}
function appVerdict(pay, people) {
  const r = resolvePayment(pay, people.map(p => ({ ...p, total: p.owed })));
  if (r.status === 'matched') return 'matched:' + r.people.map(p=>p.name).sort().join('+');
  if (r.status === 'partial') return 'partial:' + r.people[0].name;
  if (r.status === 'ambiguous') return 'ambiguous';
  return 'unmatched';
}

const people = [
  { name:'Juan Simon Bega', owed:8 }, { name:'Anaïs Côté', owed:8 },
  { name:'Omar Khaled', owed:8 },     { name:'Omar Saleh', owed:8 },
  { name:'Marc Tremblay', owed:12 },  { name:'Li Wei', owed:8 },
];
const cases = [
  ['self exact',            { sender:'JUAN SIMON BEGA', amount:8 }],
  ['accents stripped',      { sender:'ANAIS COTE', amount:8 }],
  ['pays for a friend',     { sender:'JUAN BEGA', message:'for me and Marc Tremblay', amount:20 }],
  ['french message',        { sender:'JUAN BEGA', message:'pour moi et Marc Tremblay', amount:20 }],
  ['three-way split',       { sender:'JUAN BEGA', message:'Anais Cote, Marc Tremblay', amount:28 }],
  ['two Omars',             { sender:'OMAR', amount:8 }],
  ['Omar disambiguated',    { sender:'OMAR KHALED', amount:8 }],
  ['names a non-player',    { sender:'JUAN BEGA', message:'volleyball with Steve', amount:8 }],
  ['mentions someone else', { sender:'JUAN BEGA', message:'playing with Marc Tremblay', amount:8 }],
  ['wrong amount',          { sender:'JUAN BEGA', amount:15 }],
  ['stranger',              { sender:'RANDOM PERSON', amount:8 }],
  ['short name',            { sender:'LI WEI', amount:8 }],
  ['zero',                  { sender:'JUAN BEGA', amount:0 }],
  ['cents exact',           { sender:'MARC TREMBLAY', amount:12.00 }],
  ['cents off by one',      { sender:'MARC TREMBLAY', amount:11.99 }],
  // A group with an amount that does not add up: no honest way to split it,
  // so it still waits for an exec rather than marking the wrong people paid.
  ['group, odd amount',     { sender:'JUAN BEGA', message:'me and Marc Tremblay', amount:25 }],
  ['overpays alone',        { sender:'LI WEI', amount:20 }],
  ['part of what is owed',  { sender:'MARC TREMBLAY', amount:5 }],
];

let bad = 0;
for (const [label, pay] of cases) {
  const a = appVerdict(pay, people), g = gsVerdict(pay, people);
  const same = a === g;
  if (!same) bad++;
  console.log((same ? 'agree  ' : 'DIVERGE') + '  ' + label.padEnd(22) + '  app=' + a.padEnd(34) + ' gs=' + g);
}
console.log('\n' + (bad ? bad + ' DIVERGENCES' : 'all ' + cases.length + ' cases agree'));
process.exit(bad ? 1 : 0);
