// Script de fidélité : reconstruit le texte du programme à partir de programme.js
// (jetons remplacés par leurs valeurs par défaut) et le compare ligne à ligne
// à tests/programme-source.md, copie exacte de la section « programme » du cahier des charges.
//
//   node tests/fidelite.mjs        → liste les écarts, code de sortie 1 s'il y en a

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../programme.js';
import { formatMinSec, allureVMA, temps400, lireChrono } from '../calculs.js';

const source = readFileSync(fileURLToPath(new URL('./programme-source.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const problemes = [];

// ---------- Jetons → valeurs par défaut ----------
function parDefaut(texte, ou) {
  return texte.replace(/\{([^}]*)\}/g, (m, jeton) => {
    let r;
    if ((r = jeton.match(/^seuil([+-]\d+)?$/))) return formatMinSec(P.SEUIL_DEFAUT + Number(r[1] ?? 0));
    if (jeton === 'vma') return formatMinSec(allureVMA(P.SEUIL_DEFAUT));
    if (jeton === 'vma400') return formatMinSec(temps400(P.SEUIL_DEFAUT));
    if (jeton === 'S') return 'S';
    if (jeton === 'ef') return 'FC sous 85 % de ta FC seuil';
    problemes.push(`Jeton inconnu ${m} (${ou})`);
    return m;
  });
}

// ---------- Reconstruction du markdown ----------
const tableau = (entetes, lignes) => [
  `| ${entetes.join(' | ')} |`,
  `| ${entetes.map(() => '---').join(' | ')} |`,
  ...lignes.map((c) => `| ${c.join(' | ')} |`),
].join('\n');

const JOUR_LABEL = { lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim' };

function ligneJour(j) {
  if (j.type === 'push' || j.type === 'pull') {
    return `- ${JOUR_LABEL[j.jour]} · ${j.titre}${j.consigneVolume ? ` (${j.consigneVolume})` : ''}`;
  }
  const d = (champ) => parDefaut(j[champ], `${j.id}.${champ}`);
  return [
    `- ${JOUR_LABEL[j.jour]} · ${P.TYPES[j.type].programme} — ${j.titre}`,
    `  - Échauffement : ${d('echauffement')}`,
    `  - Corps : ${d('corps')}`,
    `  - Retour au calme : ${d('retourCalme')}`,
    `  - Durée : ${j.dureeTexte}.`,
    `  - Objectif : ${d('objectif')}`,
  ].join('\n');
}

function bloc(b, sectionId) {
  switch (b.type) {
    case 'p': return parDefaut(b.texte, sectionId);
    case 'ul': return b.items.map((it) => `- ${parDefaut(it.texte, `${sectionId}:${it.id}`)}`).join('\n');
    case 'table': return tableau(b.entetes, b.lignes.map((l) => l.cellules.map((c) => parDefaut(c, `${sectionId}:${l.id}`))));
    case 'semaines':
      return tableau(b.entetes, P.SEMAINES.map((s) => [String(s.numero), s.dates, s.phaseLibelle, s.objectif, s.resumes.run1, s.resumes.run2, s.resumes.hyrox]));
    case 'detail':
      return P.SEMAINES.map((s) => [
        `### Semaine ${s.numero} - ${s.phaseLibelle}`,
        ...(s.note ? [s.note] : []),
        s.jours.filter((j) => j.type !== 'repos').map(ligneJour).join('\n'),
      ].join('\n\n')).join('\n\n');
    default:
      problemes.push(`Bloc inconnu ${b.type} (${sectionId})`);
      return '';
  }
}

const morceaux = [`# ${P.TITRE}`];
for (const s of P.SECTIONS) {
  morceaux.push(`${'#'.repeat(s.niveau)} ${s.titre}`);
  for (const b of s.blocs) morceaux.push(bloc(b, s.id));
}
const reconstruit = morceaux.join('\n\n') + '\n';

// ---------- Comparaison ligne à ligne (plus longue sous-séquence commune) ----------
function diff(a, b) {
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (j < m && (i === n || t[i][j + 1] >= t[i + 1][j])) { out.push(`  + programme.js (absent de la source) : ${b[j]}`); j++; }
    else { out.push(`  − source ligne ${i + 1} (absente de programme.js) : ${a[i]}`); i++; }
  }
  return out;
}
const ecartsTexte = diff(source.split('\n'), reconstruit.split('\n'));

// ---------- Contrôles de cohérence ----------
const jours = P.SEMAINES.flatMap((s) => s.jours);
const seances = jours.filter((j) => j.type !== 'repos');
if (seances.length !== 55) problemes.push(`${seances.length} séances hors repos au lieu de 55`);

for (const j of jours) {
  const r = j.corps?.match(/\{seuil([+-]\d+)\}/);
  if (j.seuil && (!r || Number(r[1]) !== j.seuil.decalage)) problemes.push(`${j.id} : décalage seuil incohérent avec le jeton`);
  if (j.duree != null) {
    const r2 = j.dureeTexte.match(/^≈ (?:(\d+) min|(\d)h(\d\d))$/);
    const min = r2 && (r2[1] ? Number(r2[1]) : Number(r2[2]) * 60 + Number(r2[3]));
    if (min !== j.duree) problemes.push(`${j.id} : durée ${j.duree} ≠ « ${j.dureeTexte} »`);
  }
}
const listeSeuil = seances.filter((j) => j.seuil).map((j) => j.id);
if (listeSeuil.join() !== P.SEANCES_SEUIL.join()) problemes.push('SEANCES_SEUIL ne correspond pas aux séances seuil');

const sect = Object.fromEntries(P.SECTIONS.map((s) => [s.id, s]));
const charges = sect.objectif.blocs.find((b) => b.id === 'charges').texte;
for (const [cle, texte] of Object.entries(P.CHARGES)) if (!charges.includes(texte)) problemes.push(`Charge ${cle} absente du programme : ${texte}`);
if (!charges.includes(P.CHARGES_NOTE_SLED)) problemes.push('Mention « traîneau compris » absente');

const tc = sect.objectif.blocs.find((b) => b.id === 'temps-cibles');
for (const l of tc.lignes) {
  const lit = (texte) => {
    if (l.id === 'total') return texte.startsWith('≈') ? (([h, m]) => h * 3600 + m * 60)(texte.slice(2).split(':').map(Number)) : lireChrono(texte);
    return lireChrono(texte.match(/^\d+:\d\d(?::\d\d)?/)[0]);
  };
  if (lit(l.cellules[1]) !== l.bordeaux) problemes.push(`Temps Bordeaux ${l.id} : ${l.bordeaux} ≠ « ${l.cellules[1]} »`);
  if (lit(l.cellules[2]) !== l.cible) problemes.push(`Temps cible ${l.id} : ${l.cible} ≠ « ${l.cellules[2]} »`);
}

const refsConnues = new Map();
for (const s of P.SECTIONS) for (const b of s.blocs) {
  if (b.type === 'ul') for (const it of b.items) refsConnues.set(`${s.id}:${it.id}`, it.texte);
  if (b.type === 'table' && b.id) for (const l of b.lignes) if (l.id) refsConnues.set(`${b.id === 'allures' ? 'allures' : b.id}:${l.id}`, l.cellules.join(' | '));
}
for (const [terme, g] of Object.entries(P.GLOSSAIRE)) {
  for (const ref of g.refs) {
    if (ref.startsWith('charge:')) { if (!P.CHARGES[ref.slice(7)]) problemes.push(`Glossaire ${terme} : charge inconnue ${ref}`); continue; }
    if (!refsConnues.has(ref)) problemes.push(`Glossaire ${terme} : référence introuvable ${ref}`);
  }
}
for (const it of sect['semaine-course'].blocs[0].items) {
  const j = jours.find((x) => x.id === it.jour);
  if (!j || j.id.split('-')[0] !== 's11') problemes.push(`Partie 4 : jour invalide ${it.jour}`);
}

// ---------- Rapport ----------
const total = ecartsTexte.length + problemes.length;
console.log(`Fidélité du programme : ${source.split('\n').length} lignes comparées, ${seances.length} séances hors repos.`);
if (ecartsTexte.length) console.log(`Écarts de texte (${ecartsTexte.length}) :\n${ecartsTexte.join('\n')}`);
if (problemes.length) console.log(`Incohérences (${problemes.length}) :\n${problemes.map((p) => '  • ' + p).join('\n')}`);
console.log(total === 0 ? 'Zéro écart.' : `${total} écart(s).`);
process.exit(total === 0 ? 0 : 1);
