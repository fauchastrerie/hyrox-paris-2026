// calculs.js — fonctions pures : dates locales, allures, chronos, règles du programme.
// Aucune dépendance au DOM ni au stockage : testable avec node (tests/calculs.test.mjs).

export const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
export const JOURS_LONGS = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche' };
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const pad2 = (n) => String(n).padStart(2, '0');

// ---------- Dates locales « AAAA-MM-JJ » ----------
// Toujours à midi heure locale : un changement d'heure ne fait jamais glisser le jour.

export function versDate(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j, 12);
}

export function versIso(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function estIsoValide(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  return versIso(versDate(texte)) === texte;
}

export function ajouterJours(iso, n) {
  const d = versDate(iso);
  d.setDate(d.getDate() + n);
  return versIso(d);
}

export function ecartJours(de, a) {
  return Math.round((versDate(a) - versDate(de)) / 86400000);
}

export function jourSemaine(iso) {
  return JOURS[(versDate(iso).getDay() + 6) % 7];
}

/** Situe une date dans le programme : avant, pendant (semaine, jour, identifiant) ou après la course. */
export function situer(iso, debut, dateCourse) {
  const jMoins = ecartJours(iso, dateCourse);
  const n = ecartJours(debut, iso);
  if (n < 0) return { periode: 'avant', joursAvantDebut: -n, jMoins };
  if (iso > dateCourse) return { periode: 'apres', jMoins };
  const semaine = Math.floor(n / 7) + 1;
  const jour = JOURS[n % 7];
  return { periode: 'programme', semaine, jour, id: `s${semaine}-${jour}`, jMoins };
}

export function formatDateLongue(iso) {
  const d = versDate(iso);
  return `${JOURS_LONGS[jourSemaine(iso)]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function formatDateCourte(iso) {
  const d = versDate(iso);
  return `${jourSemaine(iso)}. ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

// ---------- Chronos et allures ----------

/** m:ss, minutes sans zéro initial (4:57, 1:45, 12:05). */
export function formatMinSec(secondes) {
  const s = Math.round(Math.abs(secondes));
  return `${secondes < 0 ? '−' : ''}${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** h:mm:ss au-delà d'une heure, m:ss sinon. */
export function formatChrono(secondes) {
  const s = Math.round(Math.abs(secondes));
  const signe = secondes < 0 ? '−' : '';
  if (s >= 3600) return `${signe}${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  return signe + formatMinSec(s);
}

/** Écart signé : +0:12, −0:08, ±0:00. */
export function formatEcart(secondes) {
  const s = Math.round(secondes);
  if (s === 0) return '±0:00';
  return (s > 0 ? '+' : '−') + formatChrono(Math.abs(s));
}

/**
 * Lit un chrono saisi au clavier numérique.
 * « 445 », « 4:45 », « 4.45 », « 4,45 » → 285 ; « 1205 », « 12:05 » → 725 ;
 * « 12730 », « 1:27:30 » → 5250. Renvoie null si la saisie est vide ou invalide.
 */
export function lireChrono(texte) {
  if (texte == null) return null;
  const t = String(texte).trim().replace(/\s+/g, '');
  if (!t) return null;
  let h = 0, m = 0, s = 0;
  let r;
  if (/^\d+$/.test(t)) {
    if (t.length <= 2) s = Number(t);
    else if (t.length <= 4) { m = Number(t.slice(0, -2)); s = Number(t.slice(-2)); }
    else if (t.length <= 6) { h = Number(t.slice(0, -4)); m = Number(t.slice(-4, -2)); s = Number(t.slice(-2)); if (m > 59) return null; }
    else return null;
  } else if ((r = t.match(/^(\d{1,3})[:.,'](\d{2})$/))) {
    m = Number(r[1]); s = Number(r[2]);
  } else if ((r = t.match(/^(\d{1,2})[:.,h](\d{2})[:.,'](\d{2})$/))) {
    h = Number(r[1]); m = Number(r[2]); s = Number(r[3]);
    if (m > 59) return null;
  } else return null;
  if (s > 59) return null;
  return h * 3600 + m * 60 + s;
}

/** Lit un entier positif (« 176 », « 6 450 »). */
export function lireEntier(texte) {
  if (texte == null) return null;
  const t = String(texte).replace(/\s+/g, '');
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

// ---------- Repères ----------

export const ECART_VMA = 35; // VMA courte = seuil − 35 s/km

export function allureSeuil(seuilRef, decalage = 0) {
  return seuilRef + decalage;
}

export function allureVMA(seuilRef) {
  return seuilRef - ECART_VMA;
}

/** Temps au 400 m à l'allure VMA, arrondi à la seconde. */
export function temps400(seuilRef) {
  return Math.round(0.4 * allureVMA(seuilRef));
}

/** Taille de série wall balls : moitié du max, arrondie à l'entier inférieur. */
export function tailleSerie(maxWB) {
  return Math.floor(maxWB / 2);
}

/** Plafond EF : 85 % de la FC seuil, arrondi à l'entier. */
export function plafondEF(fcSeuil) {
  return Math.round(0.85 * fcSeuil);
}

// ---------- Jetons du programme ----------

/** Décalage seuil d'une séance (jeton {seuil±n} de son corps), ou null. */
export function decalageSeance(jour) {
  if (jour?.seuil) return jour.seuil.decalage;
  const r = jour?.corps?.match(/\{seuil([+-]\d+)\}/);
  return r ? Number(r[1]) : null;
}

/** Allure prévue par le plan pour une séance seuil (s/km), ou null. */
export function allurePrevue(jour, seuilRef) {
  const d = decalageSeance(jour);
  return d == null ? null : seuilRef + d;
}

/** Allure en vigueur : ajustement validé pour cette séance, sinon allure prévue. */
export function allureEnVigueur(jour, seuilRef, ajustements = {}) {
  const a = ajustements[jour?.id];
  if (a && typeof a.allure === 'number') return a.allure;
  return allurePrevue(jour, seuilRef);
}

/** Séance seuil suivante dans la liste ordonnée, ou null. */
export function seanceSeuilSuivante(id, liste) {
  const i = liste.indexOf(id);
  return i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
}

/**
 * Valeur affichée d'un jeton ({seuil-3}, {vma400}, {S}, {ef}…).
 * ctx : { seuil, S, fcSeuil, allureSeance } — allureSeance remplace {seuil±n} si la séance est ajustée.
 */
export function resoudreJeton(jeton, ctx) {
  let r;
  if ((r = jeton.match(/^seuil([+-]\d+)$/))) return formatMinSec(ctx.allureSeance ?? ctx.seuil + Number(r[1]));
  if (jeton === 'seuil') return formatMinSec(ctx.seuil);
  if (jeton === 'vma') return formatMinSec(allureVMA(ctx.seuil));
  if (jeton === 'vma400') return formatMinSec(temps400(ctx.seuil));
  if (jeton === 'S') return String(ctx.S);
  if (jeton === 'ef') return ctx.fcSeuil ? `FC < ${plafondEF(ctx.fcSeuil)} bpm` : 'FC sous 85 % de ta FC seuil';
  return null;
}

/** Texte brut avec jetons remplacés (S suivi de « (S) » pour garder la lettre visible). */
export function texteAvecValeurs(texte, ctx) {
  return String(texte ?? '').replace(/\{([^}]+)\}( WB)?/g, (m, jeton, wb) => {
    const v = resoudreJeton(jeton, ctx);
    if (v == null) return m;
    if (jeton === 'S') return wb ? `${v} WB (S)` : `${v} (S)`;
    return v + (wb ?? '');
  });
}

// ---------- Règles du programme ----------

/** Règle de révision après le retest de la semaine 9. */
export function reviserObjectif(totalSecondes) {
  if (totalSecondes <= 40 * 60 + 30) return '1h25';
  if (totalSecondes > 43 * 60) return '1h29-1h30';
  return '1h27';
}

/**
 * Règle de progression des séances seuil, appliquée à la séance seuil suivante.
 * plus2  : « J'aurais pu faire 2 répétitions de plus » → allure prévue suivante − 5 s/km
 * lachee : « Allure lâchée sur les 2 dernières » → allure de la séance faite, ou allure prévue suivante si plus lente
 * tenue  : rien ne change (null)
 */
export function propositionSeuil(verdict, allureFaite, allurePrevueSuivante) {
  if (verdict === 'plus2') return allurePrevueSuivante - 5;
  if (verdict === 'lachee') return Math.max(allureFaite, allurePrevueSuivante);
  return null;
}

/** « 1h27 » → { min: 5220, max: 5220 } ; « 1h29-1h30 » → { min: 5340, max: 5400 }. */
export function lireObjectif(texte) {
  const r = String(texte ?? '').trim().match(/^(\d)h(\d{2})(?:\s*-\s*(\d)h(\d{2}))?$/);
  if (!r) return null;
  const a = Number(r[1]) * 3600 + Number(r[2]) * 60;
  const b = r[3] ? Number(r[3]) * 3600 + Number(r[4]) * 60 : a;
  if (Number(r[2]) > 59 || (r[4] && Number(r[4]) > 59) || b < a) return null;
  return { min: a, max: b };
}

/** Écart d'un temps à un objectif (0 si dans la fourchette). */
export function ecartObjectif(temps, objectif) {
  if (temps < objectif.min) return temps - objectif.min;
  if (temps > objectif.max) return temps - objectif.max;
  return 0;
}

/** Somme des segments renseignés. */
export function sommeSegments(valeurs) {
  const v = valeurs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return { total: v.reduce((a, b) => a + b, 0), renseignes: v.length, complet: v.length === valeurs.length };
}

export function moyenne(valeurs) {
  const v = valeurs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Simulation S8 : moyenne des runs comparée à 5:45, dérive de R5 à R8
 * (écart entre le plus lent et 5:45), wall balls à 7:15 maximum.
 */
export function analyseSimulation(runs, wb, allureCible = 345, wbMax = 435) {
  const moy = moyenne(runs);
  const fin = runs.slice(4, 8).filter((x) => typeof x === 'number');
  const plusLent = fin.length ? Math.max(...fin) : null;
  return {
    moyenneRuns: moy,
    ecartMoyenne: moy == null ? null : moy - allureCible,
    plusLentR5R8: plusLent,
    derive: plusLent == null ? null : plusLent - allureCible,
    wb: wb ?? null,
    wbOk: wb == null ? null : wb <= wbMax,
  };
}

/** Durée prévue au format du programme : 40 → « ≈ 40 min ». */
export function formatMinutes(min) {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad2(m)}` : `${h} h`;
}
