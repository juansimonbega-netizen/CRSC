/*
 * Tiny i18n layer. English is the primary language, French the second.
 * t('key', {vars}) looks up the current language and interpolates {vars}.
 */

const LANG_KEY = 'crsc-lang';

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) === 'fr' ? 'fr' : 'en'; } catch (e) { return 'en'; }
}

export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang === 'fr' ? 'fr' : 'en'); } catch (e) { /* ignore */ }
  document.documentElement.lang = getLang();
}

export function locale() {
  return getLang() === 'fr' ? 'fr-CA' : 'en-CA';
}

const STRINGS = {
  /* general */
  tagline: ['Volleyball · Basketball · Football — every Saturday night', 'Volleyball · Basketball · Soccer — tous les samedis soirs'],
  heroTitle: ['Saturday night drop-in', 'Drop-in du samedi soir'],
  execBtn: ['Exec', 'Exec'],
  execOnBtn: ['Exec ✓', 'Exec ✓'],
  execModeOn: ['Exec mode on', 'Mode exec activé'],
  execModeOff: ['Exec mode off', 'Mode exec désactivé'],
  demoTitle: ['Running without Firebase — data stays on this device', 'Sans Firebase — les données restent sur cet appareil'],
  back: ['← Calendar', '← Calendrier'],
  cancel: ['Cancel', 'Annuler'],
  save: ['Save', 'Enregistrer'],
  close: ['Close', 'Fermer'],
  done: ['Done', 'Terminé'],
  gotIt: ['Got it', 'Compris'],
  confirm: ['Confirm', 'Confirmer'],
  edit: ['Edit', 'Modifier'],
  remove: ['Remove', 'Retirer'],
  notFound: ['Event not found.', 'Événement introuvable.'],
  backHome: ['Back to calendar', 'Retour au calendrier'],
  errGeneric: ['Something went wrong — try again', 'Une erreur est survenue — réessayez'],

  /* home / calendar */
  chooseSaturday: ['Pick your Saturday', 'Choisissez votre samedi'],
  calendarHint: ['Games run every Saturday until {end}. Tap a date to sign up.', 'Les parties ont lieu chaque samedi jusqu\'au {end}. Touchez une date pour vous inscrire.'],
  noEvents: ['No dates are open yet — check back soon, or follow {insta}.', 'Aucune date ouverte pour l\'instant — revenez bientôt ou suivez {insta}.'],
  legendOpen: ['open', 'ouvert'],
  legendFull: ['full', 'complet'],
  legendMine: ['your games', 'vos parties'],
  yourGames: ['Your upcoming games', 'Vos prochaines parties'],
  spotsLeft: ['{n} spots left', '{n} places restantes'],
  full: ['Full', 'Complet'],
  fullWaitlist: ['Full — waitlist open', 'Complet — liste d\'attente ouverte'],
  signedUpCount: ['{n} signed up', '{n} inscrits'],
  past: ['Past', 'Passé'],
  pastEvent: ['Past event', 'Événement passé'],
  closed: ['Closed', 'Fermé'],
  thisSaturday: ['This Saturday', 'Ce samedi'],

  /* registration gate */
  welcomeTitle: ['Welcome to CRSC', 'Bienvenue au CRSC'],
  welcomeText: ['Create your player profile to see the calendar and sign up for games. It takes 20 seconds and this device remembers you.', 'Créez votre profil de joueur pour voir le calendrier et vous inscrire aux parties. 20 secondes, et cet appareil se souvient de vous.'],
  welcomePrivacy: ['Your email is only used for game confirmations and payment reminders from the club.', 'Votre courriel sert uniquement aux confirmations et rappels de paiement du club.'],
  continueBtn: ['Create my profile', 'Créer mon profil'],

  /* received e-transfers (auto-matcher) */
  moneyReceived: ['Received e-transfers — match to a player', 'Virements reçus — associer à un joueur'],
  matchedToast: ['{name} marked paid ({amount})', '{name} marqué payé ({amount})'],
  dismiss: ['Dismiss', 'Ignorer'],
  dismissedToast: ['Payment dismissed', 'Virement ignoré'],
  noUnpaidHere: ['No unpaid players on this event', 'Aucun joueur impayé pour cet événement'],

  // Automatic e-transfer matching
  transferNote: ['Message: {note}', 'Message : {note}'],
  autoMatchedToast: ['{names} marked paid automatically ({amount})', '{names} marqué payé automatiquement ({amount})'],
  autoMatchedTitle: ['Matched automatically ({n})', 'Associés automatiquement ({n})'],
  autoFrom: ['e-transfer from {sender}', 'virement de {sender}'],
  autoMatchNote: ['These e-transfers matched a name on the list and the exact amount owed, so they were marked paid on their own. Anything the club could not be sure of is left above for you to confirm. Use \u21ba to undo.', 'Ces virements correspondaient à un nom de la liste et au montant exact dû : ils ont été marqués payés automatiquement. Tout ce qui restait incertain est laissé ci-dessus à confirmer. Utilisez \u21ba pour annuler.'],
  autoUndone: ['{names} back to unpaid', '{names} de nouveau impayé'],
  undo: ['Undo', 'Annuler'],

  // Recording an amount that is not the list price
  gotPaidLbl: ['Received a different amount?', 'Montant reçu différent?'],
  record: ['Record', 'Enregistrer'],
  clear: ['Clear', 'Effacer'],
  amountRecorded: ['{amount} recorded for {name}', '{amount} enregistré pour {name}'],
  amountCleared: ['Amount cleared', 'Montant effacé'],
  badAmount: ['That is not a number', 'Ce n\u2019est pas un nombre'],
  stillOwesNight: ['Still owes {amount} tonight (billed {billed})', 'Doit encore {amount} ce soir (facturé {billed})'],
  settledWith: ['Settled — {amount} received', 'Réglé — {amount} reçu'],
  nothingOwed: ['Nothing owed tonight', 'Rien à payer ce soir'],
  partOf: ['of it', 'de la somme'],
  shortBy: ['{amount} short', 'manque {amount}'],
  partPaidTitle: ['{amount} received, still short', '{amount} reçu, il manque le reste'],

  // The record of a Saturday that has been played
  recordBanner: ['This Saturday has been played. Below is the club\u2019s record of it — players only see upcoming weeks.', 'Ce samedi a eu lieu. Voici le registre du club — les joueurs ne voient que les semaines à venir.'],
  signedUp: ['signed up', 'inscrits'],
  showedUp: ['showed up', 'présents'],
  didNotShow: ['no-shows', 'absents'],
  didNotShowTitle: ['Had a spot, never checked in ({n})', 'Place réservée, jamais présents ({n})'],
  playedCount: ['{n} played', '{n} ont joué'],

  // Past weeks: the club's record
  loadingWeek: ['loading…', 'chargement…'],
  exportSeason: ['Export the whole season (CSV)', 'Exporter toute la saison (CSV)'],
  seasonExported: ['{n} week(s) exported', '{n} semaine(s) exportée(s)'],
  archiveNote: ['Every past Saturday is kept as the club\u2019s record — who played, who paid, who was checked in, who took their name off. Only execs can see them, and a Saturday that has been played cannot be deleted.', 'Chaque samedi passé est conservé comme registre du club — qui a joué, qui a payé, qui était présent, qui a retiré son nom. Visible seulement par les execs, et un samedi joué ne peut pas être supprimé.'],
  cannotDeletePast: ['{date} has already been played and {n} sign-up(s) are recorded on it. It is the club\u2019s record of that night and cannot be deleted.', 'Le {date} a déjà eu lieu et {n} inscription(s) y sont enregistrées. C\u2019est le registre du club pour cette soirée et il ne peut pas être supprimé.'],
  ok: ['OK', 'OK'],

  // Playing level (exec-assigned, exec-visible)
  levelLbl: ['Playing level', 'Niveau de jeu'],
  noLevel: ['Not graded', 'Non classé'],
  levelModalHint: ['Once graded, this player can only sign themselves up for this level and below. Execs can still place them anywhere by hand.', 'Une fois classé, ce joueur ne peut s\u2019inscrire qu\u2019à ce niveau et aux niveaux inférieurs. Les execs peuvent toujours le placer manuellement.'],
  levelSet: ['{name} graded {level}', '{name} classé {level}'],
  levelCleared: ['{name} is no longer graded', '{name} n\u2019est plus classé'],
  askExec: ['ask an exec', 'demander à un exec'],
  levelBlocked: ['That level is above your grade — talk to an exec and they can add you.', 'Ce niveau est au-dessus de votre classement — parlez-en à un exec, il peut vous ajouter.'],

  // Season pass: held spots, level, automatic tagging
  passModalHint: ['Set the season pass and the level this spot is held in. A held spot is added to every Saturday automatically.', 'Choisissez la passe de saison et le niveau où la place est réservée. Une place réservée est ajoutée à chaque samedi automatiquement.'],
  noPass: ['No pass', 'Aucune passe'],
  heldSpotLbl: ['Spot held in', 'Place réservée dans'],
  heldSpotNote: ['Pick one list for a 2H pass, or one per time slot for 4H. If they cannot come, remove their name for that week — it will not come back.', 'Choisissez une liste pour la passe 2H, ou une par plage horaire pour la 4H. En cas d\u2019absence, retirez leur nom pour cette semaine — il ne reviendra pas.'],
  setPass: ['Set season pass', 'Définir la passe'],
  passSetTo: ['Season pass · {type}', 'Passe de saison · {type}'],
  passSeated: ['{n} held spot(s) added for pass holders', '{n} place(s) réservée(s) ajoutée(s)'],
  passAutoToast: ['{name} got the {type} season pass automatically', '{name} a reçu la passe {type} automatiquement'],
  heldChip: ['HELD', 'RÉSERVÉ'],

  // Exec: find a player inside an event
  findPlayer: ['Find player', 'Trouver un joueur'],
  findTitle: ['Find a player', 'Trouver un joueur'],
  findPh: ['Type a name, @handle, email or phone', 'Nom, @pseudo, courriel ou téléphone'],
  findEmpty: ['Start typing to search every list in this event.', 'Commencez à taper pour chercher dans toutes les listes.'],
  confirmedSpot: ['confirmed', 'confirmé'],
  onWaitlist: ['waitlist #{n}', 'liste d\u2019attente #{n}'],
  paidChip: ['PAID', 'PAYÉ'],
  unpaidChip: ['UNPAID', 'IMPAYÉ'],
  inChip: ['IN', 'PRÉSENT'],
  outChip: ['NOT IN', 'ABSENT'],

  // Pipeline test transfers
  testTitle: ['Test transfer received \u2713', 'Virement test reçu \u2713'],
  testOk: ['The e-transfer pipeline works', 'La chaîne de virements fonctionne'],
  testFrom: ['from {sender} · {amount} · read from Gmail and filed here', 'de {sender} · {amount} · lu depuis Gmail et enregistré ici'],
  testNote: ['A transfer of exactly {amount} is treated as a test: it proves Gmail → database → this screen works, and never marks anyone paid. Dismiss with \u2715.', 'Un virement d\u2019exactement {amount} est un test : il prouve que Gmail → base de données → cet écran fonctionne, sans marquer personne payé. Rejeter avec \u2715.'],

  // Policies
  policiesLink: ['Read the full Policies & FAQ \u2192', 'Lire les politiques et la FAQ \u2192'],
  policiesUrlLbl: ['Policies & FAQ link', 'Lien des politiques et FAQ'],

  // Money owed across the season, and no-shows
  ledgerBtn: ['Money owed', 'Sommes dues'],
  ledgerTitle: ['Money owed & no-shows', 'Sommes dues et absences'],
  peopleOwing: ['people owing', 'personnes qui doivent'],
  repeatNoShows: ['repeat no-shows', 'absences répétées'],
  whoOwes: ['Who owes ({n})', 'Qui doit ({n})'],
  owesAmount: ['owes {amount}', 'doit {amount}'],
  nobodyOwes: ['Nobody owes anything. Everyone is square.', 'Personne ne doit rien. Tout est réglé.'],
  noShowChip: ['{n} no-show(s)', '{n} absence(s)'],
  noShowsTitle: ['Repeat no-shows ({n})', 'Absences répétées ({n})'],
  noShowNote: ['Had a confirmed spot on a past Saturday and never checked in — a spot somebody on the waitlist could have used. Waitlisted players are never counted here.', 'Avaient une place confirmée un samedi passé sans jamais se présenter — une place qu\u2019un joueur en liste d\u2019attente aurait pu prendre. Les joueurs en attente ne sont jamais comptés ici.'],
  chaseAll: ['Email all {n} of them', 'Envoyer un courriel aux {n}'],
  chaseNote: ['Each person gets their own email with their own total — nobody is told what anyone else owes.', 'Chacun reçoit son propre courriel avec son propre total — personne n\u2019apprend ce que les autres doivent.'],
  chaseConfirm: ['Email {n} people about the {total} they owe?', 'Envoyer un courriel à {n} personnes au sujet des {total} dus?'],
  sendThem: ['Send', 'Envoyer'],
  chaseSent: ['{n} reminder(s) sent', '{n} rappel(s) envoyé(s)'],
  noEmails: ['None of them have an email on file', 'Aucun n\u2019a de courriel enregistré'],
  mailerOff: ['Club email not connected', 'Courriel du club non connecté'],
  exportLedger: ['Export CSV', 'Exporter (CSV)'],
  emailOwedSubject: ['CRSC — Your outstanding balance', 'CRSC — Votre solde à payer'],
  emailOwedBody: [
    'Hey {name}!\n\nOur records show {total} still owing for CRSC:\n\n{nights}\n\nTo settle up, send an Interac e-transfer to {email} and put your name in the message.\n\nAlready paid? Let an exec know and we\u2019ll fix our records — no problem.\n\nThanks for playing with us!\n\n\u2014 {club}',
    'Salut {name}!\n\nNos registres indiquent {total} à payer au CRSC :\n\n{nights}\n\nPour régler, envoyez un virement Interac à {email} en indiquant votre nom dans le message.\n\nDéjà payé? Dites-le à un exec et nous corrigerons nos registres — aucun souci.\n\nMerci de jouer avec nous!\n\n\u2014 {club}',
  ],

  /* cancellation lock + late fee */
  cancelLocked: ['Cancellations are closed for this event — message an exec if you can\'t make it.', 'Les annulations sont fermées pour cet événement — écrivez à un exec si vous ne pouvez pas venir.'],
  lateFee: ['incl. late fee', 'incl. frais de retard'],
  lateFeeAmountLbl: ['Late fee amount ($)', 'Montant des frais de retard ($)'],

  pastHidden: ['That Saturday is over. Past games are kept as the club\'s record and only execs can open them.', 'Ce samedi est termin\u00e9. Les parties pass\u00e9es sont conserv\u00e9es comme archive du club et seuls les execs peuvent les ouvrir.'],

  /* connection state */
  offlineBanner: ['Not connected to the club\'s shared list. Anything you change here stays on this device \u2014 other execs will not see it.', 'Pas connect\u00e9 \u00e0 la liste partag\u00e9e du club. Vos changements restent sur cet appareil \u2014 les autres execs ne les verront pas.'],
  connecting: ['Connecting\u2026', 'Connexion\u2026'],

  /* rolling weekly opening */
  weeklyRule: ['Each Saturday opens for sign-ups on the Sunday before.', 'Chaque samedi ouvre aux inscriptions le dimanche pr\u00e9c\u00e9dent.'],
  legendScheduled: ['opens later', 'ouvre plus tard'],
  opensOn: ['Opens {date}', 'Ouvre le {date}'],
  notOpenYet: ['Sign-ups for this Saturday open on {date}.', 'Les inscriptions pour ce samedi ouvrent le {date}.'],
  openNow: ['Open sign-ups now', 'Ouvrir les inscriptions'],
  openedNow: ['Sign-ups opened', 'Inscriptions ouvertes'],
  signupOpenLbl: ['Sign-ups open this many days before the event', 'Ouverture des inscriptions (jours avant l\'\u00e9v\u00e9nement)'],

  /* profile portability */
  haveProfile: ['I already have a profile', 'J\'ai d\u00e9j\u00e0 un profil'],
  restoreTitle: ['Find my profile', 'Retrouver mon profil'],
  restoreHint: ['Enter the email you signed up with and this device picks up your profile, your spots and your payments.', 'Entrez le courriel utilis\u00e9 lors de votre inscription : cet appareil r\u00e9cup\u00e8re votre profil, vos places et vos paiements.'],
  restoreBtn: ['Find me', 'Me retrouver'],
  restoreNotFound: ['No profile found with that email.', 'Aucun profil trouv\u00e9 avec ce courriel.'],
  welcomeBack: ['Welcome back, {name}!', 'Content de vous revoir, {name}!'],
  useOtherDevice: ['Use on another device', 'Utiliser sur un autre appareil'],
  transferTitle: ['Your personal link', 'Votre lien personnel'],
  transferHint: ['Open this link on your other phone or browser and it becomes the same profile — same spots, same payments. Anyone with this link becomes you, so only send it to yourself.', 'Ouvrez ce lien sur votre autre t\u00e9l\u00e9phone ou navigateur pour garder le m\u00eame profil \u2014 m\u00eames places, m\u00eames paiements. Toute personne ayant ce lien devient vous : envoyez-le seulement \u00e0 vous-m\u00eame.'],
  copyLink: ['Copy link', 'Copier le lien'],
  copiedToast: ['Link copied', 'Lien copi\u00e9'],
  shareLink: ['Share', 'Partager'],
  adopting: ['Restoring your profile\u2026', 'Restauration de votre profil\u2026'],
  linkBad: ['That link is not valid.', 'Ce lien n\'est pas valide.'],
  photoNotCarried: ['Your photo stays on the device it was added on.', 'Votre photo reste sur l\'appareil o\u00f9 elle a \u00e9t\u00e9 ajout\u00e9e.'],

  /* removal log (proof trail) */
  removalsTitle: ['Removed their name ({n})', 'Se sont retirés ({n})'],
  removedBySelf: ['removed by player', 'retiré par le joueur'],
  removedByExec: ['removed by exec', 'retiré par un exec'],
  wasCheckedIn: ['WAS CHECKED IN', 'ÉTAIT PRÉSENT'],
  stillOwes: ['still owes {amount}', 'doit encore {amount}'],
  removedAfterStart: ['removed after the game started', 'retiré après le début de la partie'],
  removalNote: ['Removals are kept as a record. A player who was checked in — or who removed their name after the game started — still owes for that game.', 'Les retraits sont conservés. Un joueur marqué présent — ou retiré après le début de la partie — doit quand même payer.'],
  removalsCount: ['{n} removal(s)', '{n} retrait(s)'],
  flaggedRemovals: ['{n} played then removed', '{n} a joué puis retiré'],
  noRemovals: ['Nobody removed their name.', 'Personne ne s\'est retiré.'],

  /* self check-in */
  imHere: ['I\'m here — check in', 'Je suis là — j\'arrive'],
  selfCheckedIn: ['Checked in ✓', 'Présence confirmée ✓'],
  undo: ['Undo', 'Annuler'],

  // Recording an amount that is not the list price
  gotPaidLbl: ['Received a different amount?', 'Montant reçu différent?'],
  record: ['Record', 'Enregistrer'],
  clear: ['Clear', 'Effacer'],
  amountRecorded: ['{amount} recorded for {name}', '{amount} enregistré pour {name}'],
  amountCleared: ['Amount cleared', 'Montant effacé'],
  badAmount: ['That is not a number', 'Ce n\u2019est pas un nombre'],
  stillOwesNight: ['Still owes {amount} tonight (billed {billed})', 'Doit encore {amount} ce soir (facturé {billed})'],
  settledWith: ['Settled — {amount} received', 'Réglé — {amount} reçu'],
  nothingOwed: ['Nothing owed tonight', 'Rien à payer ce soir'],
  partOf: ['of it', 'de la somme'],
  shortBy: ['{amount} short', 'manque {amount}'],
  partPaidTitle: ['{amount} received, still short', '{amount} reçu, il manque le reste'],

  // The record of a Saturday that has been played
  recordBanner: ['This Saturday has been played. Below is the club\u2019s record of it — players only see upcoming weeks.', 'Ce samedi a eu lieu. Voici le registre du club — les joueurs ne voient que les semaines à venir.'],
  signedUp: ['signed up', 'inscrits'],
  showedUp: ['showed up', 'présents'],
  didNotShow: ['no-shows', 'absents'],
  didNotShowTitle: ['Had a spot, never checked in ({n})', 'Place réservée, jamais présents ({n})'],
  playedCount: ['{n} played', '{n} ont joué'],

  // Past weeks: the club's record
  loadingWeek: ['loading…', 'chargement…'],
  exportSeason: ['Export the whole season (CSV)', 'Exporter toute la saison (CSV)'],
  seasonExported: ['{n} week(s) exported', '{n} semaine(s) exportée(s)'],
  archiveNote: ['Every past Saturday is kept as the club\u2019s record — who played, who paid, who was checked in, who took their name off. Only execs can see them, and a Saturday that has been played cannot be deleted.', 'Chaque samedi passé est conservé comme registre du club — qui a joué, qui a payé, qui était présent, qui a retiré son nom. Visible seulement par les execs, et un samedi joué ne peut pas être supprimé.'],
  cannotDeletePast: ['{date} has already been played and {n} sign-up(s) are recorded on it. It is the club\u2019s record of that night and cannot be deleted.', 'Le {date} a déjà eu lieu et {n} inscription(s) y sont enregistrées. C\u2019est le registre du club pour cette soirée et il ne peut pas être supprimé.'],
  ok: ['OK', 'OK'],

  // Playing level (exec-assigned, exec-visible)
  levelLbl: ['Playing level', 'Niveau de jeu'],
  noLevel: ['Not graded', 'Non classé'],
  levelModalHint: ['Once graded, this player can only sign themselves up for this level and below. Execs can still place them anywhere by hand.', 'Une fois classé, ce joueur ne peut s\u2019inscrire qu\u2019à ce niveau et aux niveaux inférieurs. Les execs peuvent toujours le placer manuellement.'],
  levelSet: ['{name} graded {level}', '{name} classé {level}'],
  levelCleared: ['{name} is no longer graded', '{name} n\u2019est plus classé'],
  askExec: ['ask an exec', 'demander à un exec'],
  levelBlocked: ['That level is above your grade — talk to an exec and they can add you.', 'Ce niveau est au-dessus de votre classement — parlez-en à un exec, il peut vous ajouter.'],

  // Season pass: held spots, level, automatic tagging
  passModalHint: ['Set the season pass and the level this spot is held in. A held spot is added to every Saturday automatically.', 'Choisissez la passe de saison et le niveau où la place est réservée. Une place réservée est ajoutée à chaque samedi automatiquement.'],
  noPass: ['No pass', 'Aucune passe'],
  heldSpotLbl: ['Spot held in', 'Place réservée dans'],
  heldSpotNote: ['Pick one list for a 2H pass, or one per time slot for 4H. If they cannot come, remove their name for that week — it will not come back.', 'Choisissez une liste pour la passe 2H, ou une par plage horaire pour la 4H. En cas d\u2019absence, retirez leur nom pour cette semaine — il ne reviendra pas.'],
  setPass: ['Set season pass', 'Définir la passe'],
  passSetTo: ['Season pass · {type}', 'Passe de saison · {type}'],
  passSeated: ['{n} held spot(s) added for pass holders', '{n} place(s) réservée(s) ajoutée(s)'],
  passAutoToast: ['{name} got the {type} season pass automatically', '{name} a reçu la passe {type} automatiquement'],
  heldChip: ['HELD', 'RÉSERVÉ'],

  // Exec: find a player inside an event
  findPlayer: ['Find player', 'Trouver un joueur'],
  findTitle: ['Find a player', 'Trouver un joueur'],
  findPh: ['Type a name, @handle, email or phone', 'Nom, @pseudo, courriel ou téléphone'],
  findEmpty: ['Start typing to search every list in this event.', 'Commencez à taper pour chercher dans toutes les listes.'],
  confirmedSpot: ['confirmed', 'confirmé'],
  onWaitlist: ['waitlist #{n}', 'liste d\u2019attente #{n}'],
  paidChip: ['PAID', 'PAYÉ'],
  unpaidChip: ['UNPAID', 'IMPAYÉ'],
  inChip: ['IN', 'PRÉSENT'],
  outChip: ['NOT IN', 'ABSENT'],

  // Pipeline test transfers
  testTitle: ['Test transfer received \u2713', 'Virement test reçu \u2713'],
  testOk: ['The e-transfer pipeline works', 'La chaîne de virements fonctionne'],
  testFrom: ['from {sender} · {amount} · read from Gmail and filed here', 'de {sender} · {amount} · lu depuis Gmail et enregistré ici'],
  testNote: ['A transfer of exactly {amount} is treated as a test: it proves Gmail → database → this screen works, and never marks anyone paid. Dismiss with \u2715.', 'Un virement d\u2019exactement {amount} est un test : il prouve que Gmail → base de données → cet écran fonctionne, sans marquer personne payé. Rejeter avec \u2715.'],

  // Policies
  policiesLink: ['Read the full Policies & FAQ \u2192', 'Lire les politiques et la FAQ \u2192'],
  policiesUrlLbl: ['Policies & FAQ link', 'Lien des politiques et FAQ'],

  // Money owed across the season, and no-shows
  ledgerBtn: ['Money owed', 'Sommes dues'],
  ledgerTitle: ['Money owed & no-shows', 'Sommes dues et absences'],
  peopleOwing: ['people owing', 'personnes qui doivent'],
  repeatNoShows: ['repeat no-shows', 'absences répétées'],
  whoOwes: ['Who owes ({n})', 'Qui doit ({n})'],
  owesAmount: ['owes {amount}', 'doit {amount}'],
  nobodyOwes: ['Nobody owes anything. Everyone is square.', 'Personne ne doit rien. Tout est réglé.'],
  noShowChip: ['{n} no-show(s)', '{n} absence(s)'],
  noShowsTitle: ['Repeat no-shows ({n})', 'Absences répétées ({n})'],
  noShowNote: ['Had a confirmed spot on a past Saturday and never checked in — a spot somebody on the waitlist could have used. Waitlisted players are never counted here.', 'Avaient une place confirmée un samedi passé sans jamais se présenter — une place qu\u2019un joueur en liste d\u2019attente aurait pu prendre. Les joueurs en attente ne sont jamais comptés ici.'],
  chaseAll: ['Email all {n} of them', 'Envoyer un courriel aux {n}'],
  chaseNote: ['Each person gets their own email with their own total — nobody is told what anyone else owes.', 'Chacun reçoit son propre courriel avec son propre total — personne n\u2019apprend ce que les autres doivent.'],
  chaseConfirm: ['Email {n} people about the {total} they owe?', 'Envoyer un courriel à {n} personnes au sujet des {total} dus?'],
  sendThem: ['Send', 'Envoyer'],
  chaseSent: ['{n} reminder(s) sent', '{n} rappel(s) envoyé(s)'],
  noEmails: ['None of them have an email on file', 'Aucun n\u2019a de courriel enregistré'],
  mailerOff: ['Club email not connected', 'Courriel du club non connecté'],
  exportLedger: ['Export CSV', 'Exporter (CSV)'],
  emailOwedSubject: ['CRSC — Your outstanding balance', 'CRSC — Votre solde à payer'],
  emailOwedBody: [
    'Hey {name}!\n\nOur records show {total} still owing for CRSC:\n\n{nights}\n\nTo settle up, send an Interac e-transfer to {email} and put your name in the message.\n\nAlready paid? Let an exec know and we\u2019ll fix our records — no problem.\n\nThanks for playing with us!\n\n\u2014 {club}',
    'Salut {name}!\n\nNos registres indiquent {total} à payer au CRSC :\n\n{nights}\n\nPour régler, envoyez un virement Interac à {email} en indiquant votre nom dans le message.\n\nDéjà payé? Dites-le à un exec et nous corrigerons nos registres — aucun souci.\n\nMerci de jouer avec nous!\n\n\u2014 {club}',
  ],
  selfCheckedInToast: ['You\'re checked in — have a good game!', 'Présence confirmée — bonne partie!'],
  selfCheckOutToast: ['Check-in removed', 'Présence annulée'],

  /* battle pass */
  battlePass: ['Battle Pass', 'Battle Pass'],
  battlePassLbl: ['Battle Pass (volleyball season)', 'Battle Pass (saison de volleyball)'],
  battlePassCovered: ['Covered by your Battle Pass — nothing to pay.', 'Couvert par votre Battle Pass — rien à payer.'],
  battlePassSet: ['{name}: Battle Pass {type} activated', '{name} : Battle Pass {type} activé'],
  battlePassRemoved: ['{name}: Battle Pass removed', '{name} : Battle Pass retiré'],
  battlePassNoteLbl: ['Battle Pass offer text', 'Texte de l\'offre Battle Pass'],

  /* players directory (exec) */
  playersBtn: ['Players', 'Joueurs'],
  playersTitle: ['All players ({n})', 'Tous les joueurs ({n})'],
  searchPh: ['Search name, Instagram, email…', 'Rechercher nom, Instagram, courriel…'],
  gamesPlayed: ['{n} game(s)', '{n} partie(s)'],
  neverPlayed: ['registered, no games yet', 'inscrit, aucune partie'],
  unpaidCount: ['{n} unpaid', '{n} impayé(s)'],
  exportPlayers: ['Export players CSV', 'Exporter les joueurs (CSV)'],
  noMatches: ['No players match.', 'Aucun joueur trouvé.'],

  /* profile */
  yourProfile: ['Your profile', 'Votre profil'],
  profileHint: ['Saved on this device so next time is one tap.', 'Enregistré sur cet appareil — la prochaine fois, un seul clic.'],
  namePh: ['Your name *', 'Votre nom *'],
  emailPh: ['Email * (for waitlist updates)', 'Courriel * (pour la liste d\'attente)'],
  phonePh: ['Phone (optional)', 'Téléphone (facultatif)'],
  instaPh: ['Instagram (optional, no @)', 'Instagram (facultatif, sans @)'],
  addPhoto: ['Add a photo (optional)', 'Ajouter une photo (facultatif)'],
  nameRequired: ['Please enter your name', 'Veuillez entrer votre nom'],
  emailRequired: ['Please enter a valid email', 'Veuillez entrer un courriel valide'],
  profileSaved: ['Profile saved', 'Profil enregistré'],
  badImage: ['Could not read that image', 'Impossible de lire cette image'],

  /* event page */
  you: ['(you)', '(vous)'],
  yourSpots: ['Your spots:', 'Vos places :'],
  allPaid: ['All paid ✓', 'Tout payé ✓'],
  howToPay: ['How to pay', 'Comment payer'],
  join: ['Join', 'S\'inscrire'],
  joinWaitlist: ['Join waitlist', 'Liste d\'attente'],
  waitlist: ['Waitlist', 'Liste d\'attente'],
  wlShort: ['WL #{n}', 'LA #{n}'],
  beFirst: ['No one yet — be first!', 'Personne encore — soyez le premier!'],
  team: ['Team {n}', 'Équipe {n}'],
  noTeamYet: ['Teams not set yet', 'Équipes à venir'],
  unassigned: ['Not placed yet', 'Pas encore placés'],
  removeSelfConfirm: ['Remove {name} from this list?', 'Retirer {name} de cette liste ?'],
  removeMe: ['Remove me', 'Me retirer'],
  removedSelf: ['You were removed from the list', 'Vous avez été retiré de la liste'],
  cashUnpaid: ['Cash · unpaid', 'Comptant · non payé'],
  etransferUnpaid: ['E-transfer · unpaid', 'Virement · non payé'],
  paid: ['Paid ✓', 'Payé ✓'],
  here: ['Here', 'Présent'],

  /* join sheet */
  signupTitle: ['Sign up — {date}', 'Inscription — {date}'],
  pickLists: ['Pick your list(s)', 'Choisissez vos listes'],
  prices: ['Prices', 'Prix'],
  bothSlots: ['both slots', 'les deux plages'],
  cash: ['cash', 'comptant'],
  onEveryList: ['You are already on every list.', 'Vous êtes déjà sur toutes les listes.'],
  payMethod: ['Payment method', 'Mode de paiement'],
  etransfer: ['E-transfer', 'Virement Interac'],
  cashOnSite: ['Cash on site', 'Comptant sur place'],
  toPay: ['To pay', 'À payer'],
  newTotal: ['New total for this event', 'Nouveau total pour cet événement'],
  selectOne: ['Select at least one list.', 'Sélectionnez au moins une liste.'],
  pickOne: ['Pick at least one list', 'Choisissez au moins une liste'],
  levelNote: ['The host might move your name to the appropriate level. Your spot is confirmed once payment is received.', 'L\'organisateur peut déplacer votre nom au niveau approprié. Votre place est confirmée à la réception du paiement.'],
  confirmSignup: ['Confirm sign-up', 'Confirmer l\'inscription'],
  onTheList: ['You\'re on the list!', 'Vous êtes inscrit!'],
  etransferTo: ['Send your e-transfer to', 'Envoyez votre virement à'],
  mentionName: ['Mention your name (and anyone you\'re paying for) in the message.', 'Indiquez votre nom (et celui des personnes pour qui vous payez) dans le message.'],
  bringCash: ['You chose cash — pay an exec at the gym before you play.', 'Vous avez choisi comptant — payez un exec au gymnase avant de jouer.'],
  yourTotal: ['Your total for {date}', 'Votre total pour {date}'],
  waitlistNote: ['Full lists put you on the waitlist — if a spot opens you\'re moved up automatically and emailed.', 'Liste complète = liste d\'attente — si une place se libère, vous montez automatiquement et recevez un courriel.'],

  /* emails (rendered in the recipient's language) */
  emailConfSubject: ['CRSC — You\'re signed up for {date}', 'CRSC — Inscription confirmée : {date}'],
  emailConfBody: [
    'Hey {name}!\n\nYou\'re on the list for {date}:\n{lists}\n\n{payLine}\n{late}\n\nWhere: {location}\n\nCan\'t make it? Please remove your name on the sign-up page so someone on the waitlist can take your spot.\n\n— {club}',
    'Salut {name}!\n\nVous êtes inscrit pour le {date} :\n{lists}\n\n{payLine}\n{late}\n\nOù : {location}\n\nVous ne pouvez plus venir? Retirez votre nom sur la page d\'inscription pour libérer votre place.\n\n— {club}',
  ],
  emailRemSubject: ['CRSC — Payment reminder for {date}', 'CRSC — Rappel de paiement : {date}'],
  emailRemBody: [
    'Hey {name}!\n\nYour game is coming up ({date}) and our list shows {total} still unpaid.\n\n{payLine}\n{late}\n\nAlready paid? Then ignore this — an exec will confirm it shortly.\n\nWhen you arrive at the gym, open the sign-up page and tap "I\'m here" to check in.\n\n— {club}',
    'Salut {name}!\n\nVotre partie approche ({date}) et notre liste indique {total} non payé.\n\n{payLine}\n{late}\n\nDéjà payé? Ignorez ce message — un exec le confirmera sous peu.\n\nEn arrivant au gymnase, ouvrez la page d\'inscription et touchez « Je suis là » pour confirmer votre présence.\n\n— {club}',
  ],
  emailPromoSubject: ['CRSC — A spot opened up: you\'re in for {date}!', 'CRSC — Une place s\'est libérée : vous jouez le {date}!'],
  emailPromoBody: [
    'Hey {name}!\n\nGood news — a spot opened up and you moved off the waitlist. You\'re now confirmed for:\n{list} ({session}) on {date}\n\n{payLine}\n\nWhere: {location}\n\nCan\'t make it? Please remove your name on the sign-up page.\n\n— {club}',
    'Salut {name}!\n\nBonne nouvelle — une place s\'est libérée et vous quittez la liste d\'attente. Vous êtes confirmé pour :\n{list} ({session}) le {date}\n\n{payLine}\n\nOù : {location}\n\nVous ne pouvez plus venir? Retirez votre nom sur la page d\'inscription.\n\n— {club}',
  ],
  emailPaidSubject: ['CRSC — Payment received for {date} \u2713', 'CRSC — Paiement reçu pour le {date} \u2713'],
  // Three openings, because who paid changes what is true for the reader.
  paidOpenSelf: ['We received your payment of {total} for {date}. You\u2019re all set \u2014 nothing else to do.', 'Nous avons reçu votre paiement de {total} pour le {date}. Tout est réglé \u2014 rien d\u2019autre à faire.'],
  paidOpenGroup: ['We received your payment of {total} for {date} \u2014 it covered you and {names}. You\u2019re all set.', 'Nous avons reçu votre paiement de {total} pour le {date} \u2014 il couvrait vous et {names}. Tout est réglé.'],
  paidOpenCovered: ['Your spot for {date} is paid \u2014 {sender} covered it with their e-transfer. You\u2019re all set, nothing else to do.', 'Votre place pour le {date} est payée \u2014 {sender} l\u2019a couverte par virement. Tout est réglé, rien d\u2019autre à faire.'],
  emailPaidBody: [
    'Hey {name}!\n\n{openLine}\n\n{lists}\n\nWhere: {location}\n\nWhen you arrive at the gym, open the sign-up page and tap "I\u2019m here" to check in.\n\n\u2014 {club}',
    'Salut {name}!\n\n{openLine}\n\n{lists}\n\nOù : {location}\n\nEn arrivant au gymnase, ouvrez la page d\u2019inscription et touchez « Je suis là » pour confirmer votre présence.\n\n\u2014 {club}',
  ],
  emailPassSubject: ['CRSC — Your {type} season pass is active \u2713', 'CRSC — Votre passe de saison {type} est active \u2713'],
  emailPassBody: [
    'Hey {name}!\n\nWe received {total} and your {type} volleyball season pass is now active for the rest of the season.\n\nWhat that means:\n\u2022 Your volleyball spot is held for you every Saturday \u2014 you do not have to sign up each week.\n\u2022 Nothing more to pay for volleyball this season.\n\nIf you can\u2019t make it on a given Saturday, tell an exec in advance so we can free your spot for someone else that week.\n\n\u2014 {club}',
    'Salut {name}!\n\nNous avons reçu {total} et votre passe de saison {type} de volleyball est maintenant active pour le reste de la saison.\n\nCe que ça veut dire :\n\u2022 Votre place de volleyball est réservée chaque samedi \u2014 pas besoin de vous inscrire chaque semaine.\n\u2022 Plus rien à payer pour le volleyball cette saison.\n\nSi vous ne pouvez pas venir un samedi, prévenez un exec à l\u2019avance pour libérer votre place cette semaine-là.\n\n\u2014 {club}',
  ],
  payLineE: ['Payment ({total}): send an Interac e-transfer to {email} and put your name in the message.', 'Paiement ({total}) : envoyez un virement Interac à {email} en indiquant votre nom dans le message.'],
  payLineC: ['Payment ({total}): bring cash and pay an exec at the gym before you play.', 'Paiement ({total}) : apportez du comptant et payez un exec au gymnase avant de jouer.'],
  confEmailSent: ['Confirmation email sent to {email}', 'Courriel de confirmation envoyé à {email}'],
  confEmailSim: ['Confirmation email would be sent to {email} (demo)', 'Courriel de confirmation simulé pour {email} (démo)'],
  confEmailFail: ['Sign-up saved, but the confirmation email failed to send', 'Inscription enregistrée, mais l\'envoi du courriel a échoué'],
  remindersSent: ['{n} payment reminder(s) emailed', '{n} rappel(s) de paiement envoyé(s)'],
  remindersSim: ['{n} payment reminder(s) would be emailed (demo)', '{n} rappel(s) de paiement seraient envoyés (démo)'],

  /* promotion */
  promotedEmailSent: ['{name} moved off the waitlist — email sent', '{name} a quitté la liste d\'attente — courriel envoyé'],
  promotedEmailSim: ['{name} moved off the waitlist — email would be sent (demo)', '{name} a quitté la liste d\'attente — courriel simulé (démo)'],
  promotedNoEmail: ['{name} moved off the waitlist (no email on file)', '{name} a quitté la liste d\'attente (pas de courriel)'],
  promotedEmailFail: ['{name} moved up, but the email failed to send', '{name} a monté, mais l\'envoi du courriel a échoué'],

  /* exec */
  execAccess: ['Exec access', 'Accès exec'],
  clubPin: ['Club PIN', 'NIP du club'],
  unlock: ['Unlock', 'Déverrouiller'],
  wrongPin: ['Wrong PIN', 'Mauvais NIP'],
  execTools: ['Exec tools', 'Outils exec'],
  newEvent: ['＋ New event', '＋ Nouvel événement'],
  openSeason: ['Open the season', 'Ouvrir la saison'],
  openSeasonConfirm: ['Create an event for every remaining Saturday until {end}? ({n} new dates, copied from the latest event)', 'Créer un événement pour chaque samedi restant jusqu\'au {end} ? ({n} nouvelles dates, copiées du dernier événement)'],
  seasonOpened: ['{n} Saturdays opened', '{n} samedis ouverts'],
  seasonComplete: ['Every Saturday until {end} is already open', 'Tous les samedis jusqu\'au {end} sont déjà ouverts'],
  clubSettings: ['Club settings', 'Réglages du club'],
  resetDemo: ['Reset demo data', 'Réinitialiser la démo'],
  resetDemoConfirm: ['Reset all demo data back to the sample events?', 'Réinitialiser toutes les données de démo ?'],
  demoReset: ['Demo data reset', 'Démo réinitialisée'],
  weekRecord: ['Week by week', 'Semaine par semaine'],
  players: ['players', 'joueurs'],
  collected: ['collected', 'perçus'],
  unpaid: ['unpaid', 'impayés'],
  editEvent: ['Edit event', 'Modifier'],
  payments: ['Payments', 'Paiements'],
  exportCsv: ['Export CSV', 'Exporter CSV'],
  closeSignups: ['Close sign-ups', 'Fermer les inscriptions'],
  reopenSignups: ['Reopen sign-ups', 'Rouvrir les inscriptions'],
  signupsClosed: ['Sign-ups closed', 'Inscriptions fermées'],
  signupsReopened: ['Sign-ups reopened', 'Inscriptions rouvertes'],
  addPlayer: ['＋ Add player', '＋ Ajouter un joueur'],
  teams: ['Teams', 'Équipes'],
  noTeams: ['None', 'Aucune'],
  markPaid: ['Mark paid', 'Marquer payé'],
  checkIn: ['Check in', 'Présent ?'],
  checkedIn: ['Here ✓', 'Présent ✓'],
  noInsta: ['no instagram', 'pas d\'instagram'],
  noEmail: ['no email', 'pas de courriel'],
  addedByExec: ['added by exec', 'ajouté par un exec'],
  moveTo: ['Move to another list', 'Déplacer vers une autre liste'],
  putInTeam: ['Team', 'Équipe'],
  topOfList: ['⬆ Top of list', '⬆ Haut de la liste'],
  moved: ['{name} moved', '{name} déplacé'],
  movedTop: ['{name} moved to top', '{name} déplacé en haut'],
  removeConfirm: ['Remove {name} from the list?', 'Retirer {name} de la liste ?'],
  removed: ['{name} removed', '{name} retiré'],
  nameOnly: ['Name *', 'Nom *'],
  alreadyPaid: ['Already paid', 'Déjà payé'],
  add: ['Add', 'Ajouter'],
  added: ['{name} added', '{name} ajouté'],
  nameReq: ['Name required', 'Nom requis'],

  /* payments summary */
  paymentsTitle: ['Payments — {date}', 'Paiements — {date}'],
  outstanding: ['outstanding', 'à percevoir'],
  notPaidYet: ['Not paid yet ({n})', 'Pas encore payé ({n})'],
  everyonePaid: ['Everyone paid.', 'Tout le monde a payé.'],
  paidList: ['Paid ({n})', 'Payé ({n})'],

  /* event editor */
  newEventTitle: ['New event', 'Nouvel événement'],
  editEventTitle: ['Edit event', 'Modifier l\'événement'],
  title: ['Title', 'Titre'],
  date: ['Date', 'Date'],
  location: ['Location', 'Lieu'],
  slot1: ['Slot 1 label', 'Plage 1'],
  slot2: ['Slot 2 label', 'Plage 2'],
  lists: ['Lists', 'Listes'],
  addList: ['＋ Add list', '＋ Ajouter une liste'],
  bundleLabel: ['Bundle price (playing a sport in both slots)', 'Prix forfait (un sport dans les deux plages)'],
  noBundle: ['No bundle', 'Aucun forfait'],
  createEvent: ['Create event', 'Créer l\'événement'],
  saveChanges: ['Save changes', 'Enregistrer'],
  deleteBtn: ['Delete', 'Supprimer'],
  pickDate: ['Pick a date', 'Choisissez une date'],
  addOneList: ['Add at least one list', 'Ajoutez au moins une liste'],
  eventCreated: ['Event created', 'Événement créé'],
  eventSaved: ['Event saved', 'Événement enregistré'],
  deleteEventConfirm: ['Delete this event and ALL its sign-ups? This cannot be undone.', 'Supprimer cet événement et TOUTES ses inscriptions ? Irréversible.'],
  deleteEvent: ['Delete event', 'Supprimer l\'événement'],
  eventDeleted: ['Event deleted', 'Événement supprimé'],
  slotN: ['Slot {n}', 'Plage {n}'],
  listCols: ['slot / sport / teams', 'plage / sport / équipes'],
  listCols2: ['label · cap · e-transfer $ · cash $', 'nom · max · virement $ · comptant $'],
  levelPh: ['Level / label', 'Niveau / nom'],

  /* settings */
  etransferEmailLbl: ['E-transfer email', 'Courriel de virement'],
  defaultLocation: ['Default location', 'Lieu par défaut'],
  instaHandle: ['Instagram handle', 'Compte Instagram'],
  execPinLbl: ['Exec PIN', 'NIP exec'],
  seasonEndLbl: ['Season end (last Saturday)', 'Fin de saison (dernier samedi)'],
  lateFeeLbl: ['Late fee note', 'Note de frais de retard'],
  policiesLbl: ['Policies (one per line)', 'Politiques (une par ligne)'],
  settingsSaved: ['Settings saved', 'Réglages enregistrés'],

  /* info box */
  importantInfo: ['Important info', 'Infos importantes'],
  locationLbl: ['Location:', 'Lieu :'],
  paymentLbl: ['Payment:', 'Paiement :'],
  paymentLine: ['Cash on site, or e-transfer to {email}', 'Comptant sur place ou virement Interac à {email}'],
};

export function tLang(lang, key, vars = {}) {
  const entry = STRINGS[key];
  let s = entry ? entry[lang === 'fr' ? 1 : 0] : key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return s;
}

export function t(key, vars = {}) {
  return tLang(getLang(), key, vars);
}
