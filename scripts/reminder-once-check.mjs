/*
 * A reminder that cannot be recorded must not be sent.
 *
 * The Gmail script keeps a note of who it has already chased. If that note
 * cannot be written — the rules for the collection not published yet, say —
 * and it sends anyway, then fifteen minutes later it sends again, and again.
 * Everybody who owes money gets chased four times an hour until somebody
 * notices.
 *
 * So it claims first and only sends if the claim stuck. The worst case
 * becomes a reminder that never arrives, instead of thirty that do.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function run({ writesAllowed }) {
  const sentTo = [];
  const stored = {};          // stands in for the reminders collection
  const saturday = new Date();
  saturday.setDate(saturday.getDate() + 1);   // tomorrow → the "day" reminder
  const date = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`;

  const ctx = {
    console,
    MailApp: { sendEmail: (m) => sentTo.push(m.to) },
    GmailApp: {},
    UrlFetchApp: {
      fetch(url, opts) {
        const path = decodeURIComponent(url.split('/documents/')[1].split('?')[0]);
        if (!opts || opts.method !== 'patch') {
          // Reads: the club's settings, the dues, and whatever we stored.
          if (path === 'config/main') return res(200, { fields: {
            etransferEmail: { stringValue: 'club@x.com' }, lateFeeAmount: { integerValue: '5' } } });
          if (path === 'dues') return res(200, { documents: [{
            name: 'projects/p/databases/(default)/documents/dues/ev1',
            fields: {
              date: { stringValue: date },
              location: { stringValue: 'The gym' },
              people: { arrayValue: { values: [
                mapOf({ name: 'Ana', owed: 8, email: 'ana@x.com', lang: 'en' }),
                mapOf({ name: 'Bo', owed: 8, email: 'bo@x.com', lang: 'fr' }),
              ] } },
            } }] });
          if (path.startsWith('reminders/')) {
            return stored[path] ? res(200, { fields: stored[path] }) : res(404, {});
          }
          if (path === 'payments') return res(200, { documents: [] });
          return res(200, {});
        }
        if (!writesAllowed) return res(403, {});
        stored[path] = { ...(stored[path] || {}), ...JSON.parse(opts.payload).fields };
        return res(200, {});
      },
    },
  };
  function res(code, body) {
    return { getResponseCode: () => code, getContentText: () => JSON.stringify(body) };
  }
  function mapOf(o) {
    const fields = {};
    for (const [k, v] of Object.entries(o)) {
      fields[k] = typeof v === 'number' ? { doubleValue: v } : { stringValue: v };
    }
    return { mapValue: { fields } };
  }
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'apps-script/payment-matcher.gs'), 'utf8'), ctx);

  // Four runs — an hour of the fifteen-minute trigger.
  for (let i = 0; i < 4; i++) ctx.sendReminders();
  return sentTo;
}

const okRules = run({ writesAllowed: true });
console.log('rules published     : sent to', JSON.stringify(okRules));

const noRules = run({ writesAllowed: false });
console.log('rules NOT published : sent to', JSON.stringify(noRules));

const ok = okRules.length === 2
        && new Set(okRules).size === 2
        && noRules.length === 0;
console.log('\n' + (ok
  ? 'each person is chased once an hour of runs, and nobody at all when it cannot keep track'
  : `FAILED — ${okRules.length} sent with rules, ${noRules.length} without`));
process.exit(ok ? 0 : 1);
