/*
 * Automatic e-transfer matching.
 *
 * The Gmail script records every Interac notification as a payment row: who
 * sent it, how much, and the message they typed with it. This module turns
 * those rows into "these people have paid" — including the case the club
 * runs into constantly, where one person sends the money for a group and
 * writes everyone's names in the transfer message.
 *
 * Two rules keep it honest, and both must hold before anything is marked
 * paid on its own:
 *
 *   1. Every name in the transfer has to land on exactly one unpaid player.
 *      Three Omars on the list means an exec decides, not the computer.
 *   2. What the named players owe has to add up to the amount sent, to the
 *      cent. A number that does not reconcile is a question, not a payment.
 *
 * Anything that fails either rule is still shown on the Payments screen for
 * an exec to confirm by hand, with the best guess pre-selected. The cost of
 * a wrong guess here is someone being told they owe nothing when they do, so
 * the matcher would rather hand the decision over than be clever.
 */

/* Accents off, punctuation out: "Anaïs Côté" and "anais cote" are one name. */
export function normalize(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/* Words worth matching on. Two letters is short, but real names are ("Li"),
 * and a stray collision cannot spend anyone's money on its own — the amount
 * still has to reconcile. */
export function tokens(s) {
  return normalize(s).split(' ').filter(w => w.length >= 2);
}

export function cents(n) {
  return Math.round((parseFloat(n) || 0) * 100);
}

/*
 * Everyone in `people` whose name appears in `text`, with the words that
 * matched. The text is the sender's name and their message together, matched
 * against the roster rather than parsed for phrasing — "for Ana and Marc",
 * "pour Ana et Marc" and "ana marc" all come out the same, which is the point.
 */
export function nameHits(text, people) {
  const words = new Set(tokens(text));
  const out = [];
  for (const p of people) {
    const matched = tokens(p.name).filter(w => words.has(w));
    if (matched.length) out.push({ person: p, matched: new Set(matched), score: matched.length });
  }
  return out;
}

/*
 * "Omar" and "Omar Khaled" both answer to the words in "omar khaled", but
 * only one of them is being named. When one player's matched words are
 * entirely contained in another's, the fuller name is the one meant.
 */
function dropSubsumed(hits) {
  return hits.filter(h => !hits.some(other =>
    other !== h
    && other.score > h.score
    && [...h.matched].every(w => other.matched.has(w))));
}

/* Two people answering to the very same words is the club's Omar problem:
 * nothing in the transfer separates them, so nothing should guess. */
function ambiguous(hits) {
  const seen = {};
  for (const h of hits) {
    const key = [...h.matched].sort().join(' ');
    if (seen[key]) return true;
    seen[key] = h;
  }
  return false;
}

/*
 * Decide what a single received transfer means for one event's unpaid list.
 *
 * Returns one of:
 *   { status: 'matched', people, named }  — safe to mark paid
 *   { status: 'ambiguous', named }        — names collide; an exec must pick
 *   { status: 'short', people, named }    — names are clear, money does not
 *                                           add up (missing late fee, partial
 *                                           payment, someone not signed up)
 *   { status: 'none', named: [] }         — nobody on this list was named
 */
export function resolvePayment(payment, unpaid) {
  const sender = payment.sender || '';
  const message = payment.message || '';
  const all = dropSubsumed(nameHits(sender + ' ' + message, unpaid));
  if (!all.length) return { status: 'none', named: [] };
  if (ambiguous(all)) return { status: 'ambiguous', named: all.map(h => h.person) };

  const amount = cents(payment.amount);
  const fromSender = dropSubsumed(nameHits(sender, unpaid));

  // The whole group first — that is the "I'm paying for my friends" case the
  // message is there to describe. Falling back to the sender alone covers a
  // message that happens to mention someone who is not being paid for.
  for (const set of [all, fromSender]) {
    if (!set.length) continue;
    const people = set.map(h => h.person);
    const owed = people.reduce((a, p) => a + cents(p.total), 0);
    if (owed === amount && amount > 0) {
      return { status: 'matched', people, named: all.map(h => h.person) };
    }
  }
  return { status: 'short', people: all.map(h => h.person), named: all.map(h => h.person) };
}
