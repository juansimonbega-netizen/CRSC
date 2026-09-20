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

// The amounts that mean something other than one night's game fee: the test
// dollar, and the two season-pass prices. They are read from the club's own
// settings in the database, so changing a price in the app changes it here
// too — they used to be written down twice and could drift apart silently.
// The numbers below are only the fallback if the settings cannot be read.
var FALLBACK = { testAmount: 1, passPrice4h: 135, passPrice2h: 75 };

function clubSettings() {
  try {
    var doc = JSON.parse(UrlFetchApp.fetch(fsUrl('config/main'),
      { muteHttpExceptions: true }).getContentText() || '{}');
    if (!doc.fields) return FALLBACK;
    var n = function (k) {
      var v = val(doc, k);
      return (v === null || v === undefined || v === '') ? FALLBACK[k] : Number(v);
    };
    return { testAmount: n('testAmount'), passPrice4h: n('passPrice4h'), passPrice2h: n('passPrice2h') };
  } catch (e) {
    return FALLBACK;
  }
}

/*
 * Banks do not agree on how to word a transfer notification. The sender may
 * be Interac itself or the member's own bank; the subject may name the sender
 * before "sent you", after "from", or not at all. Real notifications arriving
 * in the club's inbox were matched by none of the original patterns, so the
 * search is deliberately wide and the sender is looked for in several shapes
 * before giving up — an unrecognised email costs a person being marked unpaid
 * when they have paid, which is the expensive direction to fail.
 */
function checkTransfers() {
  var threads = GmailApp.search(
    'newer_than:7d (from:(interac.ca) OR from:(payments.interac.ca) OR ' +
    'subject:(interac) OR subject:(virement) OR subject:("e-transfer") OR ' +
    'subject:("sent you money") OR subject:("vous a envoyé"))');
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var subject = msg.getSubject() || '';
      var body = msg.getPlainBody() || '';
      var sender = findSender(subject, body);
      if (!sender) return;
      var amt = body.match(/\$\s*([\d,]+(?:[.,]\d{2})?)/);
      var amount = amt ? parseFloat(amt[1].replace(',', '.').replace(/\.(?=.*\.)/g, '')) : 0;
      record(msg.getId(), sender, amount, message(body), msg.getDate());
    });
  });
  // Filing the transfers is only half the job — settle the ones that are
  // unambiguous right now, so nobody has to open the app for it to happen.
  settleTransfers();
}

/*
 * The note the sender typed. Interac labels it "Message:" in English and
 * "Message :" in French, sometimes with the sender's name in between. Capped
 * well short of a paragraph — it is read for names, not stored as mail.
 */
/*
 * Who sent the money. Tried against the subject first, then the body, in the
 * wordings Canadian banks actually use in English and French.
 */
function findSender(subject, body) {
  var patterns = [
    /INTERAC e-Transfer:?\s*(.+?)\s+sent you/i,
    /Virement INTERAC\s*:?\s*(.+?)\s+vous a envoy/i,
    /^(.+?)\s+sent you (?:money|\$)/i,
    /(.+?)\s+vous a envoyé/i,
    /money from\s+(.+?)(?:\s+has|\s*[.!,]|$)/i,
    /argent de\s+(.+?)(?:\s*[.!,]|$)/i,
    /transfer from\s+(.+?)(?:\s*[.!,]|$)/i,
    /de la part de\s+(.+?)(?:\s*[.!,]|$)/i,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = subject.match(patterns[i]) || body.match(patterns[i]);
    if (m && m[1]) {
      var name = m[1].replace(/["'\u201c\u201d]/g, '').trim();
      // A greedy capture runs past the name into the rest of the sentence
      // ("Rayan Sedraoui was auto-deposited"), so cut it at the first word
      // that can only be the sentence continuing, not part of a name.
      name = name.split(/\s+(?:was|has|have|is|a été|vous|to|into|on|for|and|et)\b/i)[0].trim();
      // A plausible human name, not a stray sentence fragment.
      if (name.length >= 2 && name.length <= 60 && !/\d{3}/.test(name)) return name;
    }
  }
  return '';
}

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

/* ==================================================================== *
 * Settling: mark people paid, without anyone having the app open.
 *
 * The app publishes what each person still owes for each open night (the
 * `dues` collection). All of the pricing — season passes, both-slot
 * bundles, late fees — is decided there and only there, so nothing below
 * has to know a single price. This reads names and adds up numbers.
 *
 * The two rules match the app's exactly, and both must hold:
 *   1. every name in the transfer lands on exactly one person who owes
 *   2. what those people owe equals the amount sent, to the cent
 * Anything else is left for an exec on the Payments screen.
 * ==================================================================== */

function settleTransfers() {
  var pending = listDocs('payments').filter(function (p) {
    return !val(p, 'matched') && !val(p, 'noAuto');
  });
  if (!pending.length) return;

  var dues = listDocs('dues').map(function (d) {
    return {
      eventId: d.name.split('/').pop(),
      date: val(d, 'date'),
      people: (val(d, 'people') || []).map(function (p) {
        return { name: p.name, owed: Number(p.owed), ids: p.ids || [], email: p.email || '', lang: p.lang || 'en' };
      }),
    };
  });

  var cfg = clubSettings();
  pending.forEach(function (pay) {
    var amount = cents(val(pay, 'amount'));
    if (amount <= 0 || amount === cents(cfg.testAmount)) return;   // $1 = pipeline test
    if (amount === cents(cfg.passPrice4h) || amount === cents(cfg.passPrice2h)) return; // pass: the app tags it

    var sender = val(pay, 'sender') || '';
    var text = sender + ' ' + (val(pay, 'message') || '');
    var hits = [];
    dues.forEach(function (night) {
      var all = resolve(text, night.people);
      if (!all || !all.length) return;        // names collide, or nobody named
      // The whole group first — that is the "paying for my friends" case the
      // message is there to describe. Falling back to the sender alone covers
      // a message that happens to name someone not being paid for.
      var sets = [all];
      var justSender = resolve(sender, night.people);
      if (justSender && justSender.length) sets.push(justSender);
      for (var i = 0; i < sets.length; i++) {
        var owed = sets[i].reduce(function (a, p) { return a + cents(p.owed); }, 0);
        if (owed === amount) { hits.push({ night: night, people: sets[i] }); return; }
      }
    });
    if (hits.length !== 1) return;   // nothing certain, or certain on two nights

    var night = hits[0].night, people = hits[0].people;
    var names = people.map(function (p) { return p.name; });
    people.forEach(function (p) {
      p.ids.forEach(function (id) {
        patch('events/' + night.eventId + '/signups/' + id,
          { paid: bool(true), paidAt: int(Date.now()), paidVia: str('auto-gmail'), paidEmailSentAt: int(Date.now()) },
          ['paid', 'paidAt', 'paidVia', 'paidEmailSentAt']);
      });
      receipt(p, pay, night, names);
    });
    patch('payments/' + pay.name.split('/').pop(),
      { matched: bool(true), matchedTo: str(names.join(', ')), matchedEvent: str(night.eventId),
        auto: bool(true), matchedAt: int(Date.now()) },
      ['matched', 'matchedTo', 'matchedEvent', 'auto', 'matchedAt']);
  });
}

/* Accents off, punctuation out — ANAIS COTE and Anaïs Côté are one name. */
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function words(s) {
  return norm(s).split(' ').filter(function (w) { return w.length >= 2; });
}
function cents(n) { return Math.round((Number(n) || 0) * 100); }

/*
 * Everyone named in the text: an array (empty when nobody is named), or
 * null when two people answer to the same words and nothing separates them.
 * Mirrors resolvePayment() in public/js/automatch.js.
 */
function resolve(text, people) {
  var set = {};
  words(text).forEach(function (w) { set[w] = true; });
  var hits = [];
  people.forEach(function (p) {
    var m = words(p.name).filter(function (w) { return set[w]; });
    if (m.length) hits.push({ person: p, matched: m, score: m.length });
  });
  // "Omar" and "Omar Khaled" both answer to "omar khaled"; the fuller name wins.
  hits = hits.filter(function (h) {
    return !hits.some(function (o) {
      return o !== h && o.score > h.score && h.matched.every(function (w) { return o.matched.indexOf(w) >= 0; });
    });
  });
  // Two people answering to the very same words: nothing separates them.
  var seen = {};
  for (var i = 0; i < hits.length; i++) {
    var key = hits[i].matched.slice().sort().join(' ');
    if (seen[key]) return null;
    seen[key] = true;
  }
  return hits.map(function (h) { return h.person; });
}

/* "We got your money" — sent from the club Gmail, in their own language. */
function receipt(person, pay, night, allNames) {
  if (!person.email) return;
  var fr = person.lang === 'fr';
  var sent = Number(val(pay, 'amount')) + '$';
  var others = allNames.filter(function (n) { return n !== person.name; });
  var sender = norm(val(pay, 'sender') || '');
  var isSender = words(person.name).some(function (w) { return sender.indexOf(w) >= 0; });
  var open;
  if (others.length === 0) {
    open = fr ? 'Nous avons reçu votre paiement de ' + sent + ' pour le ' + night.date + '. Tout est réglé — rien d’autre à faire.'
              : 'We received your payment of ' + sent + ' for ' + night.date + '. You’re all set — nothing else to do.';
  } else if (isSender) {
    open = fr ? 'Nous avons reçu votre paiement de ' + sent + ' pour le ' + night.date + ' — il couvrait vous et ' + others.join(', ') + '. Tout est réglé.'
              : 'We received your payment of ' + sent + ' for ' + night.date + ' — it covered you and ' + others.join(', ') + '. You’re all set.';
  } else {
    open = fr ? 'Votre place pour le ' + night.date + ' est payée — ' + val(pay, 'sender') + ' l’a couverte par virement. Tout est réglé.'
              : 'Your spot for ' + night.date + ' is paid — ' + val(pay, 'sender') + ' covered it with their e-transfer. You’re all set.';
  }
  MailApp.sendEmail({
    to: person.email,
    subject: fr ? 'CRSC — Paiement reçu pour le ' + night.date + ' ✓'
                : 'CRSC — Payment received for ' + night.date + ' ✓',
    body: (fr ? 'Salut ' : 'Hey ') + person.name + '!\n\n' + open +
      (fr ? '\n\nEn arrivant au gymnase, ouvrez la page d’inscription et touchez « Je suis là ».\n\n— CRSC'
          : '\n\nWhen you arrive at the gym, open the sign-up page and tap "I’m here".\n\n— CRSC'),
    name: 'CRSC',
  });
}

/* ---- Firestore REST helpers ---- */

function fsUrl(path) {
  return 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/' + path + '?key=' + API_KEY;
}

function listDocs(collection) {
  var out = [], token = '';
  do {
    var url = fsUrl(collection) + '&pageSize=300' + (token ? '&pageToken=' + token : '');
    var res = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText() || '{}');
    (res.documents || []).forEach(function (d) { out.push(d); });
    token = res.nextPageToken || '';
  } while (token);
  return out;
}

function patch(path, fields, mask) {
  var url = fsUrl(path) + mask.map(function (f) { return '&updateMask.fieldPaths=' + f; }).join('');
  UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ fields: fields }),
  });
}

function str(v) { return { stringValue: String(v) }; }
function int(v) { return { integerValue: String(v) }; }
function bool(v) { return { booleanValue: !!v }; }

/* Firestore's typed JSON back into plain values. */
function val(doc, field) {
  var f = (doc.fields || {})[field];
  return f === undefined ? undefined : decode(f);
}
function decode(f) {
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(decode);
  if ('mapValue' in f) {
    var o = {};
    Object.keys(f.mapValue.fields || {}).forEach(function (k) { o[k] = decode(f.mapValue.fields[k]); });
    return o;
  }
  return undefined;
}
