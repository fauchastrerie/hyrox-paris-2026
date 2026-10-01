// stockage.js — lecture, écriture, export et import des données.
// Une seule clé versionnée dans localStorage, réécrite à chaque modification.

export const CLE = 'hyrox-paris-2026:v1';
export const APPLICATION = 'hyrox-paris-2026';
export const FORMAT = 1;
const STATUTS = ['faite', 'modifiee', 'sautee'];
const RE_ID = /^s([1-9]|1[01])-(lun|mar|mer|jeu|ven|sam|dim)$/;

export function etatInitial() {
  return {
    version: FORMAT,
    saisies: {},
    reperes: { seuil: 297, fcSeuil: null, maxWB: null, S: 12, objectif: '1h27', objectifSource: 'defaut' },
    ajustements: {},
    meta: { dernierExport: null, bandeauInstallMasque: false },
  };
}

/** Complète un état lu avec les valeurs par défaut (champs ajoutés après coup). */
function completer(brut) {
  const base = etatInitial();
  return {
    version: FORMAT,
    saisies: brut.saisies && typeof brut.saisies === 'object' ? brut.saisies : {},
    reperes: { ...base.reperes, ...(brut.reperes || {}) },
    ajustements: brut.ajustements && typeof brut.ajustements === 'object' ? brut.ajustements : {},
    meta: { ...base.meta, ...(brut.meta || {}) },
  };
}

/**
 * Lit l'état. En cas de contenu illisible, l'original est mis de côté
 * sous une clé de secours au lieu d'être écrasé.
 */
export function charger(stockage = globalThis.localStorage) {
  let texte = null;
  try { texte = stockage?.getItem(CLE) ?? null; } catch { return { etat: etatInitial(), erreur: 'lecture' }; }
  if (!texte) return { etat: etatInitial(), erreur: null };
  try {
    return { etat: completer(JSON.parse(texte)), erreur: null };
  } catch {
    try { stockage.setItem(`${CLE}:illisible-${Date.now()}`, texte); } catch { /* rien à faire */ }
    return { etat: etatInitial(), erreur: 'illisible' };
  }
}

/** Écrit l'état complet. Renvoie false si le navigateur refuse (stockage plein ou bloqué). */
export function enregistrer(etat, stockage = globalThis.localStorage) {
  try {
    stockage.setItem(CLE, JSON.stringify(etat));
    return true;
  } catch {
    return false;
  }
}

export function nomFichierExport(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `hyrox-paris-sauvegarde-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

export function contenuExport(etat, date = new Date()) {
  return JSON.stringify({ application: APPLICATION, format: FORMAT, exporteLe: date.toISOString(), donnees: etat }, null, 2);
}

/**
 * Envoie le fichier par la feuille de partage du téléphone quand elle accepte les fichiers,
 * sinon le télécharge. Renvoie 'partage', 'telechargement' ou 'annule'.
 */
export async function partagerOuTelecharger(nom, contenu) {
  const type = 'application/json';
  if (typeof File === 'function' && navigator.canShare) {
    const fichier = new File([contenu], nom, { type });
    if (navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nom });
        return 'partage';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'annule';
        // Partage refusé (permission, type de fichier) : on bascule sur le téléchargement.
      }
    }
  }
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'telechargement';
}

/** Valide un fichier de sauvegarde. Renvoie { ok, erreur } ou { ok, etat, apercu }. */
export function validerImport(texte, idsConnus) {
  let brut;
  try { brut = JSON.parse(texte); } catch { return { ok: false, erreur: 'Ce fichier n\'est pas un JSON lisible.' }; }
  if (!brut || typeof brut !== 'object') return { ok: false, erreur: 'Format inconnu.' };
  if (brut.application !== APPLICATION) return { ok: false, erreur: 'Ce fichier ne vient pas de cette appli.' };
  if (brut.format !== FORMAT) return { ok: false, erreur: `Format de sauvegarde ${brut.format} non pris en charge.` };
  const d = brut.donnees;
  if (!d || typeof d !== 'object' || typeof d.saisies !== 'object' || d.saisies === null) return { ok: false, erreur: 'Données de séances absentes.' };
  for (const [id, s] of Object.entries(d.saisies)) {
    if (!RE_ID.test(id) || (idsConnus && !idsConnus.has(id))) return { ok: false, erreur: `Séance inconnue : ${id}.` };
    if (!s || typeof s !== 'object' || !STATUTS.includes(s.statut)) return { ok: false, erreur: `Statut invalide pour ${id}.` };
    if (s.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return { ok: false, erreur: `Date invalide pour ${id}.` };
    if (s.rpe != null && !(Number.isInteger(s.rpe) && s.rpe >= 1 && s.rpe <= 10)) return { ok: false, erreur: `RPE invalide pour ${id}.` };
  }
  const r = d.reperes || {};
  if (r.seuil != null && !(Number.isFinite(r.seuil) && r.seuil >= 150 && r.seuil <= 480)) return { ok: false, erreur: 'Allure seuil invalide.' };
  if (r.S != null && !(Number.isInteger(r.S) && r.S >= 1 && r.S <= 100)) return { ok: false, erreur: 'Taille de série S invalide.' };
  if (d.ajustements != null && typeof d.ajustements !== 'object') return { ok: false, erreur: 'Ajustements invalides.' };
  for (const [id, a] of Object.entries(d.ajustements || {})) {
    if (!RE_ID.test(id) || !a || !Number.isFinite(a.allure)) return { ok: false, erreur: `Ajustement invalide : ${id}.` };
  }
  const etat = completer(d);
  return {
    ok: true,
    etat,
    apercu: { nbSaisies: Object.keys(etat.saisies).length, exporteLe: typeof brut.exporteLe === 'string' ? brut.exporteLe : null },
  };
}
