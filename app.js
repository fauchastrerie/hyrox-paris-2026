// app.js — navigation, rendu et état de l'appli.

import {
  SEMAINES, SECTIONS, GLOSSAIRE, TYPES, STATIONS, CHARGES, CHARGES_NOTE_SLED, DEUXIEME_MOITIE,
  DEBUT, DATE_COURSE, OBJECTIF_DEFAUT, SEUIL_DEFAUT, S_DEFAUT, SEANCES_SEUIL, ALLURE_AC, ALLURE_SIMULATION, R1_MAX,
} from './programme.js';
import * as C from './calculs.js';
import * as Stock from './stockage.js';
import * as I from './icones.js';

// ---------- Index du programme ----------
const PAR_ID = new Map();
for (const semaine of SEMAINES) for (const jour of semaine.jours) PAR_ID.set(jour.id, { jour, semaine });
const SEANCES = [...PAR_ID.values()].filter(({ jour }) => jour.type !== 'repos');
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const TEMPS_CIBLES = SECTION.objectif.blocs.find((b) => b.id === 'temps-cibles');
const LIGNE_TEMPS = Object.fromEntries(TEMPS_CIBLES.lignes.map((l) => [l.id, l]));
const DEBUT_ZERO_ALCOOL = '2026-12-08';
const SEMAINE_COURSE = SECTION['semaine-course'].blocs[0].items;
const FAIT = ['faite', 'modifiee'];

// ---------- État ----------
const lu = Stock.charger();
let etat = lu.etat;
let alerteStockage = lu.erreur === 'illisible'
  ? "Les données enregistrées étaient illisibles : elles ont été mises de côté et l'appli repart de zéro. Importe ta dernière sauvegarde."
  : lu.erreur === 'lecture' ? 'Ce navigateur bloque le stockage local : tes saisies ne seront pas conservées.' : null;
const DATE_FORCEE = (() => {
  const d = new URLSearchParams(location.search).get('date');
  return d && C.estIsoValide(d) ? d : null;
})();
const aujourdhui = () => DATE_FORCEE ?? C.versIso(new Date());

let jourVu = null;
let semainesOuvertes = null;
let derniereRoute = null;
let routePrecedente = null;
let origineSeance = null;
let confirmation = null;
let importEnAttente = null;
let messageSauvegarde = null;
let majWorker = null;
let rechargementDemande = false;
let invitationInstall = null;
let persistanceDemandee = false;
let dateRendue = aujourdhui();

const main = document.getElementById('contenu');
const zoneBandeaux = document.getElementById('bandeaux');

function sauver() {
  const ok = Stock.enregistrer(etat);
  if (!ok && !alerteStockage) {
    alerteStockage = 'Enregistrement impossible : le stockage du navigateur est plein ou bloqué. Exporte tes données.';
    rendreBandeaux();
  }
  const ind = document.getElementById('enregistre');
  if (ind) ind.textContent = ok ? `Enregistré à ${heure(new Date())}` : 'Non enregistré';
  if (ok && !persistanceDemandee && Object.keys(etat.saisies).length) {
    persistanceDemandee = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  return ok;
}

// ---------- Outils ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const maj1 = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const heure = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const nombreFr = (n, dec = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: dec });
const ch = (s) => C.formatChrono(s);
const val = (texte, perso = false) => `<strong class="val${perso ? ' val--perso' : ''}">${esc(texte)}</strong>`;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function objectifCourse() {
  return etat.reperes.objectif || OBJECTIF_DEFAUT;
}

function semaineCourante() {
  const s = C.situer(aujourdhui(), DEBUT, DATE_COURSE);
  if (s.periode === 'avant') return 1;
  if (s.periode === 'apres') return 11;
  return s.semaine;
}

function titreCourt(jour, semaine) {
  switch (jour.type) {
    case 'run1': return semaine.resumes.run1;
    case 'run2': return semaine.resumes.run2;
    case 'hyrox': case 'course': return semaine.resumes.hyrox;
    case 'push': case 'pull': return jour.consigneVolume ? `${jour.titre} (${jour.consigneVolume})` : jour.titre;
    default: return '';
  }
}

function statutJour(jour) {
  if (jour.type === 'repos') return null;
  const s = etat.saisies[jour.id];
  if (s) return s.statut;
  return jour.date <= aujourdhui() ? 'a-faire' : 'a-venir';
}

const PASTILLES = {
  faite: ['✓', 'faite'],
  modifiee: ['◐', 'modifiée'],
  sautee: ['✕', 'sautée'],
  'a-faire': ['●', 'à faire'],
  'a-venir': ['○', 'à venir'],
};
function pastille(statut) {
  if (!statut) return '';
  const [signe, libelle] = PASTILLES[statut];
  return `<span class="pastille pastille--${statut}"><span aria-hidden="true">${signe}</span> ${libelle}</span>`;
}

function phaseBadge(semaine) {
  return `<span class="phase" data-phase="${semaine.phase}">${esc(semaine.phaseLibelle)}</span>`;
}

function prochaineSeance(apres) {
  return SEANCES.find(({ jour }) => jour.date > apres) ?? null;
}

// ---------- Texte enrichi : jetons, allures en gras, abréviations dépliables ----------
const RE_RICHE = /\{([A-Za-z0-9+-]+)\}( WB)?|(\d{1,2}:\d{2}(?::\d{2})?(?:\/km|\/500)?)|(https?:\/\/[^\s)]+)|(prévention tibias|Prévention tibias|J-court|J-dév|J-spé|BBJ|VMA|EC|EH|RC|EF|AC|SL|WB|S)/gu;
const LETTRE = /[\p{L}\p{N}_]/u;

function valeurs(jour) {
  const r = etat.reperes;
  const aj = jour?.seuil ? etat.ajustements[jour.id] : null;
  return { seuil: r.seuil, S: r.S, fcSeuil: r.fcSeuil, allureSeance: aj ? aj.allure : undefined };
}

function boutonAbr(terme) {
  return `<button type="button" class="abbr" data-terme="${esc(terme)}" aria-expanded="false">${esc(terme)}</button>`;
}

/** Texte du programme → HTML : jetons calculés, temps en gras tabulaires, abréviations en boutons. */
function enrichir(source, { jour = null, abbr = true, exclure = null } = {}) {
  const texte = String(source ?? '');
  const v = valeurs(jour);
  const ajuste = !!(jour?.seuil && etat.ajustements[jour.id]);
  const terme = (t) => (abbr && t !== exclure ? boutonAbr(t) : esc(t));
  let out = '';
  let pos = 0;
  for (const m of texte.matchAll(RE_RICHE)) {
    const [tout, jeton, wb, temps, url, abr] = m;
    out += esc(texte.slice(pos, m.index));
    pos = m.index + tout.length;
    if (jeton) {
      const r = C.resoudreJeton(jeton, v);
      if (r == null) { out += esc(tout); continue; }
      if (jeton === 'S') out += `<span class="insecable">${val(r, true)}${wb ? ' ' + terme('WB') : ''} (${terme('S')})</span>`;
      else if (jeton === 'ef') out += v.fcSeuil ? val(r, true) : esc(r);
      else out += `<strong class="val val--perso${jeton.startsWith('seuil') && ajuste ? ' val--ajuste' : ''}">${esc(r)}</strong>${wb ? ' ' + terme('WB') : ''}`;
    } else if (temps) {
      const allure = /\/(km|500)$/.test(temps) || /(à|en) $/.test(texte.slice(Math.max(0, m.index - 3), m.index));
      out += `<strong class="val${allure ? ' val--allure' : ''}">${esc(temps)}</strong>`;
    } else if (url) {
      out += `<a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(url)}</a>`;
    } else if (abr) {
      const avant = texte[m.index - 1] ?? '';
      const apres = texte[m.index + tout.length] ?? '';
      if (LETTRE.test(avant) || LETTRE.test(apres)) { out += esc(tout); continue; }
      // Garde la ponctuation collée au bouton : pas de retour à la ligne entre « ( » et « SL ».
      let ouvrante = '';
      if (avant === '(' && out.endsWith('(')) { out = out.slice(0, -1); ouvrante = '('; }
      const fermante = /[).,;:]/.test(apres) ? apres : '';
      pos += fermante.length;
      out += ouvrante || fermante ? `<span class="insecable">${ouvrante}${terme(abr)}${esc(fermante)}</span>` : terme(abr);
    }
  }
  return out + esc(texte.slice(pos));
}

const texteSimple = (texte, jour = null) => enrichir(texte, { jour, abbr: false });

function texteReference(ref) {
  const [sec, id] = ref.split(':');
  if (sec === 'charge') return `Charge Open men : ${CHARGES[id]}.`;
  if (sec === 'temps-cibles') {
    const l = LIGNE_TEMPS[id];
    return `${l.cellules[0]} : ${l.cellules[1]} à Bordeaux, cible Paris ${l.cellules[2]}.`;
  }
  for (const b of SECTION[sec]?.blocs ?? []) {
    if (b.type === 'ul') { const it = b.items.find((x) => x.id === id); if (it) return it.texte; }
    if (b.type === 'table') {
      const l = b.lignes.find((x) => x.id === id);
      if (l) return `${l.cellules[0]} : ${l.cellules[1]}. ${b.entetes[2]} : ${l.cellules[2]}.`;
    }
  }
  return null;
}

function complementDefinition(terme) {
  const r = etat.reperes;
  if (terme === 'SL') {
    return `Ton repère : ${val(C.formatMinSec(r.seuil) + '/km', true)}${r.seuil !== SEUIL_DEFAUT ? ` (${C.formatEcart(r.seuil - SEUIL_DEFAUT)}/km par rapport à 4:57).` : ' (valeur par défaut).'}`;
  }
  if (terme === 'EF') {
    return r.fcSeuil
      ? `Ton plafond : ${val(`FC < ${C.plafondEF(r.fcSeuil)} bpm`, true)} (85 % de ${r.fcSeuil} bpm).`
      : 'Le plafond en bpm s\'affiche dès que ta FC seuil est saisie (test 30 min, S2).';
  }
  if (terme === 'S') return `Ta valeur : ${val(`S = ${r.S}`, true)}${r.maxWB ? ` (max ${r.maxWB}).` : ' (valeur par défaut).'}`;
  return null;
}

let compteurDef = 0;
function basculerDefinition(bouton) {
  const ouvert = bouton.getAttribute('aria-controls');
  if (ouvert) {
    document.getElementById(ouvert)?.remove();
    bouton.removeAttribute('aria-controls');
    bouton.setAttribute('aria-expanded', 'false');
    return;
  }
  const cle = bouton.dataset.terme === 'Prévention tibias' ? 'prévention tibias' : bouton.dataset.terme;
  const g = GLOSSAIRE[cle];
  if (!g) return;
  const def = document.createElement('span');
  def.className = 'definition';
  def.id = `def-${++compteurDef}`;
  def.setAttribute('role', 'note');
  const lignes = g.refs.map(texteReference).filter(Boolean).map((t) => `<span class="definition__ligne">${enrichir(t, { exclure: cle })}</span>`);
  const plus = complementDefinition(cle);
  def.innerHTML = `<span class="definition__titre">${esc(cle === 'prévention tibias' ? 'Prévention tibias' : cle)} · ${esc(g.nom)}</span>${lignes.join('')}${plus ? `<span class="definition__ligne definition__perso">${plus}</span>` : ''}`;
  const hote = bouton.parentElement.closest('.definition, .etape__texte, .circuit__intro, p, li, td, th, dd, .texte') ?? bouton.parentElement;
  hote.append(def);
  bouton.setAttribute('aria-controls', def.id);
  bouton.setAttribute('aria-expanded', 'true');
}

// ---------- Blocs de référence ----------
function tableau(entetes, lignes, { premiereColonneEnTete = true, fiches = false } = {}) {
  const etiquette = (i) => esc(String(entetes[i]).replace(/<[^>]+>/g, ''));
  return `<div class="defile${entetes.length >= 6 ? ' defile--large' : ''}${fiches ? ' defile--fiches' : ''}" tabindex="0" role="region" aria-label="Tableau"><table${fiches ? ' class="fiches"' : ''}>
    <thead><tr>${entetes.map((e) => `<th scope="col">${e}</th>`).join('')}</tr></thead>
    <tbody>${lignes.map((l) => `<tr>${l.map((c, i) => (i === 0 && premiereColonneEnTete ? `<th scope="row">${c}</th>` : `<td data-etiquette="${etiquette(i)}">${c}</td>`)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function paragraphe(texte) {
  const r = texte.match(/^(Point (?:faible|fort) \d — [^.:]+?)( :|\.)(.*)$/);
  if (r) return `<p><strong>${enrichir(r[1])}</strong>${esc(r[2])}${enrichir(r[3])}</p>`;
  return `<p>${enrichir(texte)}</p>`;
}

function rendreBlocs(blocs) {
  return blocs.map((b) => {
    if (b.type === 'p') return paragraphe(b.texte);
    if (b.type === 'ul') return `<ul class="liste">${b.items.map((it) => `<li>${enrichir(it.texte)}</li>`).join('')}</ul>`;
    if (b.type === 'table') return tableau(b.entetes.map(esc), b.lignes.map((l) => l.cellules.map((c) => enrichir(c))), { premiereColonneEnTete: b.id !== 'semaine-type', fiches: b.id === 'allures' });
    if (b.type === 'semaines') {
      return tableau(b.entetes.map(esc), SEMAINES.map((s) => [
        `S${s.numero}`, esc(s.dates), phaseBadge(s), esc(s.objectif), enrichir(s.resumes.run1), enrichir(s.resumes.run2), enrichir(s.resumes.hyrox),
      ]));
    }
    return '';
  }).join('');
}

function repliable(titre, contenu, { ouvert = false, id = '', icone = '' } = {}) {
  return `<details class="repliable carte"${id ? ` id="${id}"` : ''}${ouvert ? ' open' : ''}><summary>${icone ? tuile(icone, 'petite') : ''}<span>${esc(titre)}</span></summary><div class="repliable__corps">${contenu}</div></details>`;
}

// ---------- Icônes : pictogrammes SVG (icones.js), même rendu sur tous les téléphones ----------
const ICONE_TYPE = { run1: 'eclair', run2: 'pas', push: 'haltere', pull: 'traction', hyrox: 'kettlebell', course: 'drapeau', repos: 'lune' };
const ICONE_STATION = { ski: 'montagne', sledPush: 'pousse', sledPull: 'tire', bbj: 'saut', row: 'vagues', farmers: 'kettlebells', fentes: 'fente', wb: 'ballon' };
const JOUR_COURT = { lun: 'lun', mar: 'mar', mer: 'mer', jeu: 'jeu', ven: 'ven', sam: 'sam', dim: 'dim' };

function tuile(nom, taille = '') {
  return `<span class="tuile${taille ? ` tuile--${taille}` : ''}" data-teinte="${I.teinte(nom)}" aria-hidden="true">${I.svg(nom)}</span>`;
}

const pictogramme = (nom, classe = 'picto') => `<span class="${classe}" data-teinte="${I.teinte(nom)}" aria-hidden="true">${I.svg(nom)}</span>`;

function iconeEtape(texte) {
  const t = texte.toLowerCase();
  if (/sled push|\bpush\b/.test(t)) return ICONE_STATION.sledPush;
  if (/sled pull|\bpull\b/.test(t)) return ICONE_STATION.sledPull;
  if (/\bwb\b|wall ball/.test(t)) return ICONE_STATION.wb;
  if (/bbj|burpee/.test(t)) return ICONE_STATION.bbj;
  if (/fentes/.test(t)) return ICONE_STATION.fentes;
  if (/rameur/.test(t)) return ICONE_STATION.row;
  if (/skierg/.test(t)) return ICONE_STATION.ski;
  if (/farmers/.test(t)) return ICONE_STATION.farmers;
  if (/bloc j-|jambes légères|squat/.test(t)) return 'kettlebell';
  if (/gorgées|point d'eau|boisson/.test(t)) return 'goutte';
  if (/transitions/.test(t)) return 'chrono';
  if (/stations/.test(t)) return 'cible';
  if (/\bkm\b|\d m\b|\bef\b|\br1\b|allure|lignes droites/.test(t)) return 'pas';
  if (/marche|récup/.test(t)) return 'pause';
  return 'point';
}

function puce(icone, contenu, classe = '') {
  return `<span class="puce${classe ? ` ${classe}` : ''}">${icone ? pictogramme(icone, 'puce__icone') : ''}${contenu}</span>`;
}

function signeStatut(statut, decoratif = false) {
  if (!statut) return '';
  const [signe, libelle] = PASTILLES[statut];
  return `<span class="signe signe--${statut}"${decoratif ? ' aria-hidden="true"' : ` role="img" aria-label="${libelle}" title="${libelle}"`}>${signe}</span>`;
}

function anneau(fraction, centre, etiquette) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  return `<div class="anneau" role="img" aria-label="${esc(etiquette)}">
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true" focusable="false">
      <circle class="anneau__fond" cx="40" cy="40" r="${r}"/>
      ${f > 0 ? `<circle class="anneau__plein" cx="40" cy="40" r="${r}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/>` : ''}
    </svg>
    <span class="anneau__centre" aria-hidden="true">${centre}</span>
  </div>`;
}

function stationsPuce(jour) {
  const st = STATIONS.filter((x) => jour.stations?.includes(x.cle));
  if (!st.length) return '';
  return puce('', `<span class="puce__icones" aria-hidden="true">${st.map((x) => I.svg(ICONE_STATION[x.cle])).join('')}</span>${st.length > 1 ? `${st.length} stations` : esc(st[0].nom)}`);
}

// ---------- Écran Aujourd'hui ----------
function vueAujourdhui() {
  const auj = aujourdhui();
  const vu = jourVu ?? auj;
  const sit = C.situer(vu, DEBUT, DATE_COURSE);
  let carte;
  if (sit.periode === 'avant') carte = carteSeance(PAR_ID.get('s1-lun'), { apercu: true });
  else if (sit.periode === 'apres') carte = ecranFin();
  else {
    const x = PAR_ID.get(sit.id);
    carte = x.jour.type === 'repos' ? carteRepos(vu) : carteSeance(x);
  }
  return `<h1 class="visuellement-cache">Aujourd'hui</h1>
    ${enteteJour(sit, vu)}
    ${navigationJour(vu, auj)}
    ${sit.periode === 'programme' ? bandeSemaine(sit.semaine, vu) : ''}
    ${rappelsHtml(vu)}
    ${carte}
    ${guideDemarrage()}
    ${lignesDiscretes(auj)}`;
}

function enteteJour(sit, vu) {
  const obj = objectifCourse();
  const revise = obj !== OBJECTIF_DEFAUT;
  const total = C.ecartJours(DEBUT, DATE_COURSE);
  const ecoule = Math.max(0, Math.min(total, C.ecartJours(DEBUT, vu)));
  const s = sit.periode === 'programme' ? SEMAINES[sit.semaine - 1] : null;
  const compte = sit.periode === 'apres' ? 'Terminé' : sit.jMoins === 0 ? 'Jour J' : `J-${sit.jMoins}`;
  const libelle = sit.periode === 'apres' ? 'Programme terminé' : sit.jMoins === 0 ? 'Jour de course' : `${sit.jMoins} jours avant la course`;
  const sous = sit.periode === 'avant' ? `Début lundi 5 octobre, dans ${pluriel(sit.joursAvantDebut, 'jour')}`
    : sit.periode === 'apres' ? 'Hyrox Paris · vendredi 18 décembre'
      : sit.jMoins === 0 ? 'Départ à 9h · Open men' : 'avant Paris · ven. 18 déc., 9h';
  const centre = s ? `<b>S${s.numero}</b><small>sur 11</small>` : sit.periode === 'avant' ? '<b>S1</b><small>sur 11</small>' : '<b>✓</b>';
  return `<header class="entete"${s ? ` data-phase="${s.phase}"` : ''}>
    <div class="entete__haut">
      <div class="entete__texte">
        <p class="entete__compte" aria-label="${libelle}">${compte}</p>
        <p class="entete__sous">${esc(sous)}</p>
      </div>
      ${anneau(ecoule / total, centre, s ? `Semaine ${s.numero} sur 11, ${Math.round((ecoule / total) * 100)} % du programme` : 'Progression du programme')}
    </div>
    ${s ? `<p class="entete__semaine">Semaine ${s.numero}/11 · ${phaseBadge(s)}</p>
      <p class="entete__objectif">${esc(s.objectif)}</p>` : ''}
    <p class="entete__course">${pictogramme('cible')} Objectif course ${val(obj, revise)}${revise ? ' <span class="etiquette">révisé</span>' : ''}</p>
  </header>`;
}

function bandeSemaine(numero, vu) {
  const s = SEMAINES[numero - 1];
  const auj = aujourdhui();
  return `<div class="bande" role="group" aria-label="Séances de la semaine ${s.numero}">
    ${s.jours.filter((j) => j.type !== 'repos').map((j) => {
      const st = statutJour(j);
      const actif = j.date === vu;
      return `<button type="button" class="bande__jour${actif ? ' bande__jour--actif' : ''}${j.date === auj ? ' bande__jour--auj' : ''}" data-statut="${st}" data-action="voir-jour" data-date="${j.date}" aria-pressed="${actif}" aria-label="${esc(maj1(C.formatDateLongue(j.date)))}, ${esc(TYPES[j.type].libelle)}, ${PASTILLES[st][1]}">
        <span class="bande__nom">${JOUR_COURT[j.jour]}</span>
        <span class="bande__num num">${C.versDate(j.date).getDate()}</span>
        ${['faite', 'modifiee', 'sautee'].includes(st) ? signeStatut(st, true) : pictogramme(ICONE_TYPE[j.type], 'bande__icone')}
      </button>`;
    }).join('')}
  </div>`;
}

function guideDemarrage() {
  if (Object.keys(etat.saisies).length || etat.meta.guideMasque) return '';
  const etapes = [
    ['Fais ta séance', 'Tout le détail est dans « Voir la séance ».'],
    ['Saisis-la juste après', "Bouton « Saisir ma séance » : statut, effort, chronos. Tout s'enregistre seul."],
    ['Tes tests règlent le plan', 'Test 30 min (lun. 12 oct.) et test wall balls (sam. 17 oct.) : allures et séries recalculées.'],
    ['Suis ta progression', 'Onglet Suivi : séances faites, effort, tests de S5 et S9.'],
  ];
  return `<section class="carte guide" aria-labelledby="t-guide">
    <h2 id="t-guide">Comment ça marche</h2>
    <ol class="frise">${etapes.map(([t, d], i) => `<li><span class="frise__num" aria-hidden="true">${i + 1}</span><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div></li>`).join('')}</ol>
    <button type="button" class="bouton bouton--discret" data-action="masquer-guide">J'ai compris</button>
  </section>`;
}

function navigationJour(vu, auj) {
  const relatif = vu === auj ? "Aujourd'hui" : vu === C.ajouterJours(auj, -1) ? 'Hier' : vu === C.ajouterJours(auj, 1) ? 'Demain' : '';
  return `<nav class="navjour" aria-label="Changer de jour">
    <button type="button" class="bouton-icone" data-action="veille" aria-label="Veille">${ICONES.gauche}</button>
    <div class="navjour__date">
      <span>${esc(maj1(C.formatDateLongue(vu)))}</span>
      ${vu === auj ? `<small>${relatif}</small>` : `<button type="button" class="lien" data-action="retour-aujourdhui">${relatif ? `${relatif} · ` : ''}revenir à aujourd'hui</button>`}
    </div>
    <button type="button" class="bouton-icone" data-action="lendemain" aria-label="Lendemain">${ICONES.droite}</button>
  </nav>`;
}

function allureCle(jour) {
  if (jour.corps?.includes('{vma400}')) return `400 m en ${C.resoudreJeton('vma400', valeurs(jour))}`;
  const a = C.allureEnVigueur(jour, etat.reperes.seuil, etat.ajustements);
  if (a == null) return null;
  return `${C.formatMinSec(a)}/km${jour.seuil && etat.ajustements[jour.id] ? ' · ajustée' : ''}`;
}

function carteSeance({ jour, semaine }, { apercu = false } = {}) {
  const muscu = jour.type === 'push' || jour.type === 'pull';
  const allure = allureCle(jour);
  const puces = [
    jour.dureeTexte ? puce('chrono', `<span class="num">${esc(jour.dureeTexte)}</span>`) : '',
    allure ? puce('eclair', `<span class="num">${esc(allure)}</span>`, 'puce--accent') : '',
    jour.consigneVolume ? puce('baisse', esc(jour.consigneVolume), 'puce--accent') : '',
    stationsPuce(jour),
    apercu ? '' : pastille(statutJour(jour)),
  ].join('');
  return `<article class="carte carte-seance" data-phase="${semaine.phase}"${apercu ? '' : ` data-statut="${statutJour(jour)}"`}>
    ${apercu ? '<p class="carte__apercu">Première séance · lundi 5 octobre</p>' : ''}
    <div class="carte-seance__tete">
      ${tuile(ICONE_TYPE[jour.type], 'grande')}
      <div class="carte-seance__titres">
        <p class="carte__sur">${esc(TYPES[jour.type].libelle)}</p>
        <h2 class="carte__titre">${texteSimple(jour.titre, jour)}</h2>
      </div>
    </div>
    <div class="puces">${puces}</div>
    ${muscu ? '<p class="carte__objectif">Tu choisis tes exercices.</p>' : ''}
    ${jour.objectif ? `<p class="carte__objectif"><span class="visuellement-cache">Objectif : </span>${pictogramme('cible')}<span>${texteSimple(maj1(jour.objectif), jour)}</span></p>` : ''}
    ${lignesSemaineCourse(jour)}
    <div class="carte__actions">
      ${apercu ? '' : `<a class="bouton bouton--principal" href="#/seance/${jour.id}/saisie" data-action="marquer" data-id="${jour.id}">${etat.saisies[jour.id] ? 'Modifier ma saisie' : 'Saisir ma séance'}</a>`}
      <a class="bouton${apercu ? ' bouton--principal' : ''}" href="#/seance/${jour.id}">Voir la séance</a>
    </div>
  </article>`;
}

function carteRepos(vu) {
  const suivante = prochaineSeance(vu);
  return `<article class="carte carte-repos">
    <div class="carte-seance__tete">
      ${tuile('lune', 'grande')}
      <div class="carte-seance__titres"><p class="carte__sur">Récupération</p><h2 class="carte__titre">Repos</h2></div>
    </div>
    ${suivante ? `<div class="suivante">
      <p class="carte__apercu">Prochaine séance · ${esc(maj1(C.formatDateLongue(suivante.jour.date)))}</p>
      <div class="suivante__ligne">${tuile(ICONE_TYPE[suivante.jour.type])}<div><p class="carte__sur">${esc(TYPES[suivante.jour.type].libelle)}</p><p class="suivante__titre">${texteSimple(suivante.jour.titre, suivante.jour)}</p></div></div>
      <div class="carte__actions"><a class="bouton" href="#/seance/${suivante.jour.id}">Voir la séance</a></div>
    </div>` : ''}
  </article>`;
}

function rappels(iso) {
  const demain = C.situer(C.ajouterJours(iso, 1), DEBUT, DATE_COURSE);
  const veilleCle = demain.periode === 'programme' && ['lun', 'sam'].includes(demain.jour) && PAR_ID.get(demain.id).jour.type !== 'repos';
  const js = C.jourSemaine(iso);
  if ((js === 'ven' || js === 'dim') && veilleCle) return ['Zéro alcool ce soir, vise 8 h de sommeil : séance clé demain'];
  if (iso >= DEBUT_ZERO_ALCOOL && iso <= DATE_COURSE) return ["Zéro alcool jusqu'à la course (depuis le 8 décembre)"];
  return [];
}

function rappelsHtml(iso) {
  return rappels(iso).map((t) => `<p class="rappel" role="note">${pictogramme(t.startsWith('Zéro alcool ce soir') ? 'lune' : 'interdit', 'rappel__signe')}<span>${esc(t)}</span></p>`).join('');
}

function lignesDiscretes(auj) {
  const out = [];
  const sit = C.situer(auj, DEBUT, DATE_COURSE);
  if (sit.periode === 'programme') {
    const manquantes = SEMAINES[sit.semaine - 1].jours.filter((j) => j.type !== 'repos' && j.date < auj && !etat.saisies[j.id]);
    if (manquantes.length) {
      out.push(`<details class="discret"><summary>${pluriel(manquantes.length, 'séance')} non renseignée${manquantes.length > 1 ? 's' : ''} cette semaine</summary>
        <ul>${manquantes.map((j) => `<li><a href="#/seance/${j.id}">${esc(maj1(C.formatDateCourte(j.date)))} · ${esc(TYPES[j.type].libelle)} · ${texteSimple(j.titre, j)}</a></li>`).join('')}</ul>
      </details>`);
    }
  }
  const rappel = rappelExport();
  if (rappel) out.push(`<p class="discret">${rappel} <button type="button" class="lien" data-action="exporter">Exporter</button></p>`);
  return out.join('');
}

function rappelExport() {
  const n = Object.keys(etat.saisies).length;
  if (!n) return null;
  const d = etat.meta.dernierExport;
  if (!d) return 'Aucune sauvegarde exportée.';
  const jours = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return jours > 7 ? `Dernière sauvegarde il y a ${jours} jours.` : null;
}

function totalCourse(s) {
  const d = s?.details ?? {};
  if (typeof d.total === 'number') return d.total;
  const vals = [...Array.from({ length: 8 }, (_, i) => d.runs?.[i] ?? null), ...STATIONS.map((st) => d.stations?.[st.cle] ?? null), d.roxzone ?? null];
  const somme = C.sommeSegments(vals);
  return somme.complet ? somme.total : null;
}

function ecranFin() {
  const s = etat.saisies['s11-ven'];
  const total = totalCourse(s);
  const obj = C.lireObjectif(objectifCourse());
  const tete = `<div class="carte-seance__tete">${tuile('drapeau', 'grande')}<div class="carte-seance__titres"><p class="carte__sur">Hyrox Paris · 18 décembre</p><h2 class="carte__titre">Programme terminé</h2></div></div>`;
  if (total == null) {
    return `<article class="carte carte-fin">${tete}
      <p>Saisis ton résultat de course pour le comparer à Bordeaux (1:35:57) et à ton objectif (${esc(objectifCourse())}).</p>
      <div class="carte__actions"><a class="bouton bouton--principal" href="#/seance/s11-ven/saisie">Saisir mon résultat</a></div>
    </article>`;
  }
  const eB = total - LIGNE_TEMPS.total.bordeaux;
  const eO = obj ? C.ecartObjectif(total, obj) : null;
  return `<article class="carte carte-fin">${tete}
    <p class="grand-chiffre num">${ch(total)}</p>
    <dl class="stats">
      <div><dt>${tuile('lieu', 'petite')}Bordeaux 1:35:57</dt><dd>${val(C.formatEcart(eB))}</dd></div>
      ${eO != null ? `<div><dt>${tuile('cible', 'petite')}Objectif ${esc(objectifCourse())}</dt><dd>${eO === 0 ? 'atteint ✓' : `${val(C.formatEcart(eO))}${eO < 0 ? ' ✓' : ''}`}</dd></div>` : ''}
    </dl>
    <div class="carte__actions"><a class="bouton" href="#/seance/s11-ven">Détail de la course</a></div>
  </article>`;
}

function lignesSemaineCourse(jour, { titre = false } = {}) {
  const items = SEMAINE_COURSE.filter((it) => it.jour === jour.id);
  if (!items.length) return '';
  return `<div class="encadre encadre--course">${titre ? `<h2>${tuile('drapeau', 'petite')}Semaine de course</h2>` : ''}<ul class="liste-icones">${items.map((it) => `<li>${tuile(it.texte.startsWith('Jeu soir') ? 'lune' : 'drapeau', 'petite')}<span>${enrichir(it.texte, { jour })}</span></li>`).join('')}</ul></div>`;
}

// ---------- Détail d'une séance ----------
function contexte(jour, semaine) {
  return `<p class="seance__contexte">S${semaine.numero} · ${esc(C.formatDateLongue(jour.date))}</p>`;
}

function lienRetourSeance() {
  const o = origineSeance && !/^#\/seance\//.test(origineSeance) ? origineSeance : '#/programme';
  const nom = lireRoute(o).nom;
  return lienRetour(o, nom === 'programme' ? 'Programme' : TITRES[nom] ?? 'Programme');
}

function lienRetour(defaut, libelle) {
  return `<a class="retour" href="${defaut}" data-action="retour">${ICONES.gauche}<span>${libelle}</span></a>`;
}

function sectionSeance(icone, titre, html, classe = '') {
  return `<section class="seance__bloc${classe ? ` ${classe}` : ''}"><h2>${tuile(icone, 'petite')}${titre}</h2>${html}</section>`;
}

function corpsHtml(jour) {
  return C.decouperCorps(jour.corps).map((p) => {
    if (p.texte != null) return `<p class="texte">${enrichir(p.texte, { jour })}</p>`;
    const plusieurs = p.groupes.filter((g) => g.etapes).length > 1;
    const g0 = p.groupes[0];
    const introCommune = plusieurs && g0.intro ? `<p class="circuit__intro">${enrichir(g0.intro, { jour })}</p>` : '';
    const groupes = p.groupes.map((g, ig) => {
      const sep = ig > 0 ? '<span class="visuellement-cache"> ; </span>' : '';
      if (g.texte != null) {
        return `${sep}<div class="consigne-ligne">${tuile(iconeEtape(g.texte), 'petite')}<span class="etape__texte">${enrichir(g.texte, { jour })}</span></div>`;
      }
      const intro = g.intro && !(plusieurs && ig === 0) ? `<p class="circuit__intro">${enrichir(g.intro, { jour })}</p>` : '';
      return `${sep}<div class="circuit__groupe${plusieurs ? ' circuit__groupe--bloc' : ''}">
        ${plusieurs ? `<span class="circuit__num" aria-hidden="true">${ig + 1}</span>` : ''}
        ${intro}
        <ol class="etapes">${g.etapes.map((e, ie) => `<li class="etape">${ie > 0 ? `<span class="visuellement-cache">${g.sep ?? ' → '}</span>` : ''}${tuile(iconeEtape(e))}<span class="etape__texte">${enrichir(e, { jour })}</span></li>`).join('')}</ol>
      </div>`;
    }).join('');
    return `<div class="circuit">${introCommune}${groupes}</div>`;
  }).join('');
}

function detailSeance(id, { pourListe = false } = {}) {
  const { jour, semaine } = PAR_ID.get(id);
  const s = etat.saisies[jour.id];
  const r = etat.reperes;
  const hT = pourListe ? 'h2' : 'h1';
  const entete = (titreHtml, puces) => `
    ${pourListe ? '' : lienRetourSeance()}
    <div class="seance__entete">
      ${tuile(ICONE_TYPE[jour.type], 'grande')}
      <div><p class="seance__type">${esc(TYPES[jour.type].libelle)}</p>${contexte(jour, semaine)}</div>
    </div>
    <${hT} class="seance__titre">${titreHtml}</${hT}>
    <div class="puces">${puces}</div>`;

  if (jour.type === 'repos') {
    const suivante = prochaineSeance(jour.date);
    return `<article class="seance" data-phase="${semaine.phase}">
      ${entete('Repos', phaseBadge(semaine))}
      ${rappelsHtml(jour.date)}
      ${suivante ? `<a class="lien-carte" href="#/seance/${suivante.jour.id}">${tuile(ICONE_TYPE[suivante.jour.type])}<span><span class="carte__sur">Prochaine séance · ${esc(C.formatDateCourte(suivante.jour.date))}</span><span class="suivante__titre">${texteSimple(suivante.jour.titre, suivante.jour)}</span></span></a>` : ''}
    </article>`;
  }

  const blocs = [];
  if (jour.type === 'push' || jour.type === 'pull') {
    if (jour.consigneVolume) blocs.push(`<p class="ligne-info">${tuile('baisse', 'petite')}<span>Consigne de volume : <strong>${esc(jour.consigneVolume)}</strong></span></p>`);
    blocs.push('<p class="aide">Tu choisis tes exercices. Note ce que tu as fait dans la saisie.</p>');
    const prec = SEANCES.filter((x) => x.jour.type === jour.type && x.jour.date < jour.date && etat.saisies[x.jour.id]?.notes?.trim()).pop();
    if (prec) {
      blocs.push(`<div class="encadre"><h2>${tuile('crayon', 'petite')}Ta dernière séance ${esc(TYPES[jour.type].libelle)} · ${esc(C.formatDateCourte(etat.saisies[prec.jour.id].date ?? prec.jour.date))}</h2><p class="notes">${esc(etat.saisies[prec.jour.id].notes)}</p></div>`);
    }
  } else {
    const aj = jour.seuil ? etat.ajustements[jour.id] : null;
    if (aj) {
      blocs.push(`<div class="encadre encadre--accent"><p>Allure ajustée pour cette séance : ${val(C.formatMinSec(aj.allure) + '/km', true)} au lieu de ${val(C.formatMinSec(C.allurePrevue(jour, r.seuil)) + '/km')} (règle de progression, validée après la séance du ${esc(C.formatDateCourte(PAR_ID.get(aj.depuis)?.jour.date ?? jour.date))}). Les séances suivantes reprennent le plan.</p>
        <button type="button" class="bouton bouton--discret" data-action="annuler-ajustement" data-id="${jour.id}">Revenir à l'allure prévue</button></div>`);
    }
    const efBpm = r.fcSeuil && jour.type === 'run2' && jour.id !== 's1-mer' && !jour.corps.includes('{ef}')
      ? `<p class="repere-ef">${puce('coeur', `EF : FC &lt; ${C.plafondEF(r.fcSeuil)} bpm`, 'puce--accent')} <span class="aide">85 % de ta FC seuil</span></p>` : '';
    const obj = objectifCourse();
    const noteObjectif = jour.type === 'course' && obj !== OBJECTIF_DEFAUT
      ? `<p class="encadre encadre--accent">Objectif en vigueur : ${val(obj, true)} (révisé après le retest de la semaine 9).</p>` : '';
    blocs.push(sectionSeance('flamme', 'Échauffement', `<p class="texte">${enrichir(jour.echauffement, { jour })}</p>`));
    blocs.push(sectionSeance('liste', 'Corps', `${efBpm}${corpsHtml(jour)}`));
    blocs.push(sectionSeance('vent', 'Retour au calme', `<p class="texte">${enrichir(jour.retourCalme, { jour })}</p>`));
    blocs.push(sectionSeance('chrono', 'Durée', `<p class="texte num">${esc(jour.dureeTexte)}.</p>`, 'seance__bloc--compact'));
    blocs.push(sectionSeance('cible', 'Objectif', `<p class="texte">${enrichir(jour.objectif, { jour })}</p>${noteObjectif}`));
    const charges = STATIONS.filter((st) => jour.stations.includes(st.cle) && CHARGES[st.cle]);
    if (charges.length) {
      blocs.push(`<div class="encadre"><h2>${tuile('kettlebell', 'petite')}Charges Open men</h2><div class="puces">${charges.map((st) => puce(ICONE_STATION[st.cle], `${esc(maj1(CHARGES[st.cle]))}${st.cle.startsWith('sled') ? ` ${esc(CHARGES_NOTE_SLED)}` : ''}`)).join('')}</div></div>`);
    }
    if (jour.duree > 60) {
      blocs.push(`<p class="ligne-info">${tuile('goutte', 'petite')}<span>Dans toute séance de plus de 60 min, bois 500 à 750 ml par heure avec électrolytes, en petites gorgées dès le début.</span></p>`);
    }
  }
  blocs.push(lignesSemaineCourse(jour, { titre: true }));
  if (jour.type === 'hyrox') {
    const icones = { transitions: 'chrono', 'series-WB': ICONE_STATION.wb, 'charges-seance': 'kettlebell' };
    blocs.push(`<div class="encadre"><h2>${tuile('punaise', 'petite')}Consignes permanentes</h2><ul class="liste-icones">${SECTION.consignes.blocs[0].items.map((it) => `<li>${tuile(icones[it.id] ?? 'point', 'petite')}<span>${enrichir(it.texte)}</span></li>`).join('')}</ul></div>`);
  }
  if (s) blocs.push(resumeSaisie(jour, s));

  const puces = [jour.dureeTexte ? puce('chrono', `<span class="num">${esc(jour.dureeTexte)}</span>`) : '', phaseBadge(semaine), pastille(statutJour(jour))].join('');
  return `<article class="seance" data-phase="${semaine.phase}">
    ${entete(enrichir(jour.titre, { jour }), puces)}
    ${blocs.join('')}
  </article>
  <div class="barre-action barre-fixe">
    <a class="bouton bouton--principal bouton--large" href="#/seance/${jour.id}/saisie" data-action="marquer" data-id="${jour.id}">${s ? 'Modifier la saisie' : 'Marquer comme faite'}</a>
  </div>`;
}

const VERDICTS = {
  plus2: "J'aurais pu faire 2 répétitions de plus",
  tenue: 'Allure tenue',
  lachee: 'Allure lâchée sur les 2 dernières',
};
const STATUTS = { faite: 'Faite', modifiee: 'Faite avec modifications', sautee: 'Sautée' };

function resumeSaisie(jour, s) {
  const d = s.details ?? {};
  const lignes = [];
  const ligne = (icone, libelle, valeur) => lignes.push(`<div><dt>${tuile(icone, 'petite')}${libelle}</dt><dd>${valeur}</dd></div>`);
  ligne('punaise', 'Statut', pastille(s.statut));
  if (s.date && s.date !== jour.date) ligne('calendrier', 'Faite le', esc(C.formatDateCourte(s.date)));
  if (s.statut !== 'sautee') {
    if (s.rpe) ligne('flamme', 'Effort (RPE)', `<span class="num">${s.rpe}/10</span>`);
    if (s.duree) ligne('chrono', 'Durée', `<span class="num">${s.duree} min</span>`);
    if (s.fc) ligne('coeur', 'FC moyenne', `<span class="num">${s.fc} bpm</span>`);
  }
  switch (jour.formulaire) {
    case 'test30':
      if (d.distance) ligne('regle', 'Distance', `<span class="num">${d.distance} m</span>`);
      if (d.allure20 != null) ligne('eclair', 'Allure, 20 dernières min', `<span class="num">${ch(d.allure20)}/km</span>`);
      if (d.fc20) ligne('coeur', 'FC, 20 dernières min', `<span class="num">${d.fc20} bpm</span>`);
      break;
    case 'testWB':
      if (d.maxWB) ligne(ICONE_STATION.wb, "Max d'affilée", `<span class="num">${d.maxWB} → S = ${d.S ?? C.tailleSerie(d.maxWB)}</span>`);
      break;
    case 'seuil': {
      const reps = (d.reps ?? []).filter((x) => x != null);
      if (reps.length) ligne('eclair', 'Répétitions', `<span class="num">${reps.map(ch).join(' · ')}</span>`);
      if (d.verdict) ligne('hausse', 'Fin de séance', esc(VERDICTS[d.verdict]));
      break;
    }
    case 'moitie': case 'retest': {
      const t = C.sommeSegments(DEUXIEME_MOITIE.segments.map((x) => d.segments?.[x.cle] ?? null));
      if (t.renseignes) ligne('chrono', 'Total hors transitions', `<span class="num">${ch(t.total)}${t.complet ? '' : ` (${t.renseignes}/8)`}</span>`);
      break;
    }
    case 'simulation': case 'course': {
      const t = jour.formulaire === 'course' ? totalCourse(s) : (d.total ?? sommeSimulation(d).total);
      if (t) ligne('drapeau', 'Total', `<span class="num">${ch(t)}</span>`);
      break;
    }
    case 'hyrox': {
      const tours = (d.tours ?? []).filter((x) => x != null);
      if (tours.length) ligne('boucle', 'Tours', `<span class="num">${tours.map(ch).join(' · ')}</span>`);
      break;
    }
    default:
  }
  return `<section class="encadre encadre--saisie"><h2>${tuile('crayon', 'petite')}Ta saisie</h2><dl class="stats">${lignes.join('')}</dl>${s.notes?.trim() ? `<p class="notes">${esc(s.notes)}</p>` : ''}</section>`;
}

function sommeSimulation(d) {
  return C.sommeSegments([...Array.from({ length: 8 }, (_, i) => d.runs?.[i] ?? null), ...STATIONS.map((st) => d.stations?.[st.cle] ?? null)]);
}

// ---------- Saisie ----------
function assurerSaisie(id) {
  if (!etat.saisies[id]) {
    etat.saisies[id] = { statut: 'faite', date: PAR_ID.get(id).jour.date, rpe: null, duree: null, fc: null, notes: '', details: {}, creeLe: new Date().toISOString() };
  }
  const s = etat.saisies[id];
  if (!s.details) s.details = {};
  return s;
}

function lire(obj, chemin) {
  return chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function ecrire(obj, chemin, valeur) {
  const k = chemin.split('.');
  let o = obj;
  for (let i = 0; i < k.length - 1; i++) {
    if (o[k[i]] == null || typeof o[k[i]] !== 'object') o[k[i]] = /^\d+$/.test(k[i + 1]) ? [] : {};
    o = o[k[i]];
  }
  o[k[k.length - 1]] = valeur;
}

const idChamp = (prefixe, chemin) => `${prefixe}-${chemin.replace(/[^\w]+/g, '-')}`;

function champ({ label, chemin, valeur, format = 'texte', aide = '', placeholder = '', attr = 'champ', classe = '' }) {
  const id = idChamp(attr === 'champ' ? 'c' : 'r', chemin);
  const clavier = format === 'chrono'
    ? 'inputmode="decimal" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off"'
    : format === 'entier' ? 'inputmode="numeric" pattern="[0-9]*" autocomplete="off"' : '';
  const v = valeur == null ? '' : format === 'chrono' ? ch(valeur) : String(valeur);
  return `<div class="champ ${classe}">
    <label for="${id}">${label}</label>
    <input id="${id}" type="text" ${clavier} data-${attr}="${chemin}" data-format="${format}" value="${esc(v)}" placeholder="${esc(placeholder)}" enterkeyhint="next"${aide ? ` aria-describedby="${id}-aide"` : ''}>
    ${aide ? `<p class="champ__aide" id="${id}-aide">${aide}</p>` : ''}
    <span class="champ__lu" data-lu-pour="${id}" aria-live="polite"></span>
  </div>`;
}

function radios({ legend, nom, chemin, options, valeur, classe = '', format = 'texte', attr = 'champ', classeOption = null }) {
  return `<fieldset class="groupe ${classe}">
    <legend>${legend}</legend>
    <div class="choix">${options.map(([v, libelle]) => `<label class="choix__option${classeOption ? ` ${classeOption(v)}` : ''}"><input type="radio" id="${nom}-${esc(v)}" name="${nom}" value="${esc(v)}" data-${attr}="${chemin}" data-format="${format}"${String(valeur) === String(v) ? ' checked' : ''}><span>${libelle}</span></label>`).join('')}</div>
  </fieldset>`;
}

function zone(nom, id, deps) {
  return `<div data-zone="${nom}" data-id="${id}" data-deps="${deps}">${ZONES[nom](id)}</div>`;
}

function vueSaisie(id) {
  const { jour, semaine } = PAR_ID.get(id);
  const nouvelle = !etat.saisies[id];
  const s = assurerSaisie(id);
  if (nouvelle) sauver();
  const cache = s.statut === 'sautee' ? ' hidden' : '';
  const muscu = jour.type === 'push' || jour.type === 'pull';
  const specifique = formulaireSpecifique(jour, s);
  const niveauRpe = (v) => `choix__option--rpe${v <= 3 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4}`;
  return `<form class="saisie" data-id="${id}" novalidate>
    ${lienRetour(`#/seance/${id}`, 'Séance')}
    <div class="seance__entete">
      ${tuile(ICONE_TYPE[jour.type], 'grande')}
      <div><p class="seance__type">Saisie · ${esc(TYPES[jour.type].libelle)}</p>${contexte(jour, semaine)}</div>
    </div>
    <h1 class="seance__titre">${texteSimple(jour.titre, jour)}</h1>
    <p class="enregistre">${pictogramme('disquette')}<span id="enregistre" role="status">Enregistrement automatique à chaque modification</span></p>
    <div class="carte">
      ${radios({ legend: 'Statut', nom: 'statut', chemin: 'statut', options: Object.entries(STATUTS), valeur: s.statut, classe: 'groupe--statut' })}
      <div class="saisie__realisee"${cache}>
        <fieldset class="groupe groupe--dernier"><legend>Date réelle</legend>${zone('date', id, 'date')}</fieldset>
      </div>
    </div>
    <div class="saisie__realisee"${cache}>
      <div class="carte">
        ${radios({ legend: 'Effort ressenti (RPE)', nom: 'rpe', chemin: 'rpe', options: Array.from({ length: 10 }, (_, i) => [i + 1, String(i + 1)]), valeur: s.rpe, classe: 'groupe--rpe', format: 'nombre', classeOption: niveauRpe })}
        <p class="echelle-rpe" aria-hidden="true"><span>1 · très facile</span><span>10 · maximal</span></p>
        <div class="ligne-champs">
          ${champ({ label: 'Durée réelle (min)', chemin: 'duree', valeur: s.duree, format: 'entier', placeholder: jour.duree ? `≈ ${jour.duree}` : '' })}
          ${champ({ label: 'FC moyenne (bpm)', chemin: 'fc', valeur: s.fc, format: 'entier', placeholder: 'facultatif' })}
        </div>
        ${jour.duree ? `<button type="button" class="lien" data-action="duree-prevue">Durée prévue : ${jour.duree} min</button>` : ''}
      </div>
      ${specifique ? `<div class="carte carte--specifique">${specifique}</div>` : ''}
    </div>
    <div class="carte">
      <div class="champ champ--dernier">
        <label for="c-notes">Notes</label>
        <textarea id="c-notes" data-champ="notes" data-format="texte" rows="${muscu ? 6 : 4}" placeholder="${muscu ? 'Exercices, séries, charges…' : 'Sensations, conditions, ce qui a changé…'}">${esc(s.notes)}</textarea>
      </div>
    </div>
    ${zone('effacer', id, '')}
  </form>
  <div class="barre-action barre-fixe">
    <button type="button" class="bouton bouton--principal bouton--large" data-action="termine" data-id="${id}">Terminé</button>
  </div>`;
}

function formulaireSpecifique(jour, s) {
  const d = s.details;
  const id = jour.id;
  switch (jour.formulaire) {
    case 'test30':
      return `<fieldset class="groupe"><legend>Test 30 min</legend>
        <div class="pile">
          ${champ({ label: 'Distance (m)', chemin: 'details.distance', valeur: d.distance, format: 'entier' })}
          ${champ({ label: 'Allure moyenne des 20 dernières min (m:ss/km)', chemin: 'details.allure20', valeur: d.allure20, format: 'chrono', placeholder: 'ex. 505' })}
          ${champ({ label: 'FC moyenne des 20 dernières min (bpm)', chemin: 'details.fc20', valeur: d.fc20, format: 'entier' })}
        </div>
        ${zone('test30', id, 'details.allure20 details.fc20')}
      </fieldset>`;
    case 'testWB':
      return `<fieldset class="groupe"><legend>Test wall balls</legend>
        ${champ({ label: "Maximum d'affilée", chemin: 'details.maxWB', valeur: d.maxWB, format: 'entier', aide: '6 kg, cible à 3 m, no-reps non comptés.' })}
        ${zone('testWB', id, 'details.maxWB')}
      </fieldset>`;
    case 'seuil': {
      const prevue = C.allureEnVigueur(jour, etat.reperes.seuil, etat.ajustements);
      return `<fieldset class="groupe"><legend>Allure réalisée par répétition (facultatif)</legend>
        <p class="aide">Allure prévue : ${val(C.formatMinSec(prevue) + '/km', true)}</p>
        <div class="grille-champs grille-champs--serree">
          ${Array.from({ length: jour.seuil.repetitions }, (_, i) => champ({ label: `Rép. ${i + 1}`, chemin: `details.reps.${i}`, valeur: d.reps?.[i], format: 'chrono', placeholder: C.formatMinSec(prevue) })).join('')}
        </div>
      </fieldset>
      ${radios({ legend: 'Comment as-tu fini la séance ?', nom: 'verdict', chemin: 'details.verdict', options: Object.entries(VERDICTS), valeur: d.verdict, classe: 'groupe--verdict' })}
      ${zone('progression', id, 'details.verdict')}`;
    }
    case 'moitie': case 'retest':
      return `<fieldset class="groupe"><legend>Chronos des segments (m:ss)</legend>
        ${id === 's9-sam' ? '<p class="aide">Après la pré-fatigue (1 km → 40 m de BBJ, puis 2:00 de récup).</p>' : ''}
        <div class="grille-champs">
          ${DEUXIEME_MOITIE.segments.map((sg) => champ({ label: sg.nom, chemin: `details.segments.${sg.cle}`, valeur: d.segments?.[sg.cle], format: 'chrono' })).join('')}
        </div>
      </fieldset>
      ${zone('moitie', id, 'details.segments')}`;
    case 'simulation': case 'course': {
      const course = jour.formulaire === 'course';
      const lignes = STATIONS.map((st, i) => `<div class="ligne-champs">
        ${champ({ label: `R${i + 1}`, chemin: `details.runs.${i}`, valeur: d.runs?.[i], format: 'chrono', placeholder: i === 0 && course ? '≤ 5:45' : '' })}
        ${champ({ label: course ? st.nom : `${st.nom} <span class="aide">(${st.reduit})</span>`, chemin: `details.stations.${st.cle}`, valeur: d.stations?.[st.cle], format: 'chrono' })}
      </div>`).join('');
      return `<fieldset class="groupe"><legend>${course ? 'Chronos de course' : 'Chronos de la simulation'} (m:ss)</legend>
        ${lignes}
        <div class="ligne-champs">
          ${course ? champ({ label: 'Roxzone', chemin: 'details.roxzone', valeur: d.roxzone, format: 'chrono' }) : ''}
          ${champ({ label: 'Total officiel', chemin: 'details.total', valeur: d.total, format: 'chrono', placeholder: 'facultatif' })}
        </div>
        ${course ? '' : `<label class="case"><input type="checkbox" data-champ="details.distanceComplete" data-format="booleen"${d.distanceComplete ? ' checked' : ''}><span>Stations en distance complète</span></label>`}
      </fieldset>
      ${zone(course ? 'course' : 'simulation', id, 'details')}`;
    }
    case 'hyrox': {
      const tours = d.tours ?? [];
      return `<fieldset class="groupe"><legend>Temps par tour (facultatif)</legend>
        <div class="grille-champs grille-champs--serree">
          ${tours.map((t, i) => champ({ label: `Tour ${i + 1}`, chemin: `details.tours.${i}`, valeur: t, format: 'chrono' })).join('')}
        </div>
        <div class="actions">
          <button type="button" class="bouton" data-action="ajouter-tour">+ tour</button>
          ${tours.length ? '<button type="button" class="bouton bouton--discret" data-action="retirer-tour">Retirer le dernier tour</button>' : ''}
        </div>
      </fieldset>`;
    }
    default:
      return '';
  }
}

const ZONES = {
  date(id) {
    const s = etat.saisies[id];
    const prevue = PAR_ID.get(id).jour.date;
    return `<div class="pas-date">
      <button type="button" class="bouton-icone" data-action="date-pas" data-pas="-1" aria-label="Jour précédent">${ICONES.gauche}</button>
      <output class="pas-date__valeur">${esc(maj1(C.formatDateLongue(s.date ?? prevue)))}${s.date === prevue ? ' <small>(prévue)</small>' : ''}</output>
      <button type="button" class="bouton-icone" data-action="date-pas" data-pas="1" aria-label="Jour suivant">${ICONES.droite}</button>
    </div>
    ${s.date !== prevue ? '<button type="button" class="lien" data-action="date-pas" data-pas="0">Revenir à la date prévue</button>' : ''}`;
  },

  test30(id) {
    const d = etat.saisies[id]?.details ?? {};
    const r = etat.reperes;
    if (d.allure20 == null) return '<p class="aide">Renseigne l\'allure moyenne des 20 dernières minutes : l\'appli te proposera de mettre à jour tes repères.</p>';
    if (d.allure20 < 180 || d.allure20 > 480) return '<p class="erreur">Allure hors des valeurs plausibles (3:00 à 8:00/km).</p>';
    const nouveau = d.allure20;
    const ecart = nouveau - SEUIL_DEFAUT;
    const fcOk = d.fc20 != null && d.fc20 >= 100 && d.fc20 <= 230;
    const aJour = r.seuil === nouveau && (!fcOk || r.fcSeuil === d.fc20);
    const ctx = { seuil: nouveau, S: r.S, fcSeuil: fcOk ? d.fc20 : r.fcSeuil };
    const ex = (sid) => C.formatMinSec(C.allurePrevue(PAR_ID.get(sid).jour, nouveau));
    return `<div class="proposition">
      <h3>Mise à jour des repères</h3>
      <p>Allure seuil ${val(C.formatMinSec(nouveau) + '/km', true)} : écart de ${val(C.formatEcart(ecart) + '/km')} avec 4:57.</p>
      <p>${ecart === 0 ? 'Identique à la valeur par défaut : les allures du plan ne bougent pas.' : `Seuil et VMA décalés de ${esc(C.formatEcart(ecart))}/km dans tout le plan : 5 × 1000 m à ${val(ex('s3-lun'), true)} (S3), 400 m en ${val(C.resoudreJeton('vma400', ctx), true)} (S5), 6 × 1000 m à ${val(ex('s8-lun'), true)} (S8).`} AC inchangée : ${val(C.formatMinSec(ALLURE_AC) + '/km')}.</p>
      ${fcOk ? `<p>FC seuil ${val(d.fc20 + ' bpm', true)} → plafond EF ${val(`FC < ${C.plafondEF(d.fc20)} bpm`, true)}.</p>` : d.fc20 != null ? '<p class="erreur">FC hors des valeurs plausibles (100 à 230 bpm).</p>' : '<p class="aide">Ajoute la FC moyenne pour fixer aussi ta FC seuil.</p>'}
      ${aJour ? '<p class="succes">✓ Tes repères sont à jour.</p>' : '<button type="button" class="bouton bouton--principal" data-action="appliquer-test30">Mettre à jour mes repères</button>'}
    </div>`;
  },

  testWB(id) {
    const d = etat.saisies[id]?.details ?? {};
    const r = etat.reperes;
    if (!d.maxWB) return '<p class="aide">Renseigne ton maximum : l\'appli te proposera ta taille de série S.</p>';
    const propose = C.tailleSerie(d.maxWB);
    const choisi = d.S ?? propose;
    const enregistre = r.maxWB === d.maxWB && r.S === choisi;
    return `<div class="proposition">
      <h3>Taille de série S</h3>
      <p>Moitié de ${d.maxWB}, arrondie à l'entier inférieur : ${val(`S = ${propose}`, true)}.</p>
      <div class="champ champ--court">
        <label for="S-propose">S à enregistrer</label>
        <input id="S-propose" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${choisi}">
      </div>
      ${enregistre ? `<p class="succes">✓ S = ${r.S} enregistré dans tes repères.</p>` : ''}
      <button type="button" class="bouton bouton--principal" data-action="valider-S">Valider cette taille de série</button>
    </div>`;
  },

  progression(id) {
    const { jour } = PAR_ID.get(id);
    const d = etat.saisies[id]?.details ?? {};
    if (!d.verdict) return '';
    const suivId = C.seanceSeuilSuivante(id, SEANCES_SEUIL);
    if (!suivId) return '<p class="aide">Pas d\'autre séance seuil après celle-ci : rien à ajuster.</p>';
    const suiv = PAR_ID.get(suivId).jour;
    const seuil = etat.reperes.seuil;
    const faite = C.allureEnVigueur(jour, seuil, etat.ajustements);
    const prevueSuiv = C.allurePrevue(suiv, seuil);
    const existant = etat.ajustements[suivId];
    const nomSuiv = `S${suivId.match(/^s(\d+)/)[1]} · ${C.formatDateCourte(suiv.date)} · ${suiv.titre}`;
    const etatExistant = existant
      ? `<p class="succes">✓ Ajustement en vigueur pour cette séance : ${val(C.formatMinSec(existant.allure) + '/km', true)}.</p>
         <button type="button" class="bouton bouton--discret" data-action="annuler-ajustement" data-id="${suivId}">Revenir à l'allure prévue (${C.formatMinSec(prevueSuiv)})</button>` : '';
    const prop = C.propositionSeuil(d.verdict, faite, prevueSuiv);
    if (prop == null || prop === prevueSuiv) {
      const pourquoi = prop == null ? 'Allure tenue : rien ne change.' : `L'allure prévue (${C.formatMinSec(prevueSuiv)}) est déjà la plus lente : rien ne change.`;
      return `<div class="proposition"><h3>Séance seuil suivante</h3><p>${esc(nomSuiv)}</p><p>${pourquoi} Allure prévue : ${val(C.formatMinSec(prevueSuiv) + '/km', true)}.</p>${etatExistant}</div>`;
    }
    const raison = d.verdict === 'plus2' ? 'allure prévue − 5 s/km' : 'tu gardes l\'allure de cette séance';
    return `<div class="proposition">
      <h3>Proposition pour la séance seuil suivante</h3>
      <p>${esc(nomSuiv)}</p>
      <p>Allure prévue ${val(C.formatMinSec(prevueSuiv) + '/km')} → proposée ${val(C.formatMinSec(prop) + '/km', true)} (${raison}). Ne concerne que cette séance.</p>
      <div class="champ champ--court">
        <label for="allure-ajustee">Allure à retenir (m:ss/km)</label>
        <input id="allure-ajustee" type="text" inputmode="decimal" autocomplete="off" value="${C.formatMinSec(existant?.allure ?? prop)}">
      </div>
      <button type="button" class="bouton bouton--principal" data-action="valider-ajustement" data-id="${suivId}">Valider pour cette séance</button>
      ${etatExistant}
    </div>`;
  },

  moitie(id) {
    const d = etat.saisies[id]?.details ?? {};
    const segs = DEUXIEME_MOITIE.segments.map((x) => d.segments?.[x.cle] ?? null);
    const t = C.sommeSegments(segs);
    const cible = DEUXIEME_MOITIE.cibles[id];
    const out = [];
    out.push(`<p class="total">Total hors transitions ${t.renseignes ? `<span class="grand-chiffre num">${ch(t.total)}</span>` : '<span class="aide">à renseigner</span>'}${t.complet ? '' : ` <span class="aide">${t.renseignes}/8 segments</span>`}</p>`);
    if (t.complet) {
      const eC = t.total - cible;
      out.push(`<dl class="comparaison">
        <div><dt>Cible ${ch(cible)} maximum</dt><dd>${val(C.formatEcart(eC))} ${eC <= 0 ? '<span class="ok">✓ cible tenue</span>' : '<span class="ko">✕ au-dessus</span>'}</dd></div>
        <div><dt>Repère Bordeaux ${ch(DEUXIEME_MOITIE.bordeaux)}</dt><dd>${val(C.formatEcart(t.total - DEUXIEME_MOITIE.bordeaux))}</dd></div>
      </dl>`);
    }
    if (id === 's9-sam') {
      out.push(comparaisonMoities());
      if (t.complet) {
        const rev = C.reviserObjectif(t.total);
        const r = etat.reperes;
        const phrase = rev === '1h25' ? 'vise 1h25' : rev === '1h27' ? '1h27 conservé' : 'vise 1h29-1h30';
        out.push(`<div class="proposition"><h3>Règle de révision</h3>
          <p>${ch(t.total)} → ${val(phrase, true)} (40:30 ou moins → 1h25 ; au-delà de 43:00 → 1h29-1h30).</p>
          ${r.objectifSource === 'manuel' && r.objectif !== rev
            ? `<p>Objectif réglé à la main : ${val(r.objectif)}.</p><button type="button" class="bouton bouton--principal" data-action="appliquer-revision">Appliquer ${esc(rev)}</button>`
            : `<p class="succes">✓ Objectif en vigueur : ${esc(objectifCourse())}, affiché partout dans l'appli.</p>`}
        </div>`);
      } else {
        out.push('<p class="aide">Renseigne les 8 segments pour appliquer la règle de révision de l\'objectif.</p>');
      }
    }
    return out.join('');
  },

  simulation(id) {
    const d = etat.saisies[id]?.details ?? {};
    const runs = Array.from({ length: 8 }, (_, i) => d.runs?.[i] ?? null);
    const somme = sommeSimulation(d);
    const total = d.total ?? (somme.renseignes ? somme.total : null);
    const a = C.analyseSimulation(runs, d.stations?.wb ?? null, ALLURE_SIMULATION, LIGNE_TEMPS.wb.cible);
    const out = [`<p class="total">Total${d.total != null ? '' : ' (somme des segments)'} ${total != null ? `<span class="grand-chiffre num">${ch(total)}</span>` : '<span class="aide">à renseigner</span>'}${d.total == null && somme.renseignes && !somme.complet ? ` <span class="aide">${somme.renseignes}/16 segments</span>` : ''}</p>`];
    out.push(`<dl class="comparaison">
      <div><dt>Allure moyenne des runs (cible 5:45)</dt><dd>${a.moyenneRuns != null ? `${val(ch(a.moyenneRuns))} → ${val(C.formatEcart(a.ecartMoyenne))}` : '–'}</dd></div>
      <div><dt>Dérive R5 à R8 (plus lent − 5:45)</dt><dd>${a.derive != null ? `${val(ch(a.plusLentR5R8))} → ${val(C.formatEcart(a.derive))} ${a.derive <= 0 ? '<span class="ok">✓ sans dérive</span>' : '<span class="ko">dérive</span>'}` : '–'}</dd></div>
      <div><dt>Wall balls (7:15 maximum)</dt><dd>${a.wb != null ? `${val(ch(a.wb))} ${a.wbOk ? '<span class="ok">✓</span>' : `<span class="ko">✕ ${esc(C.formatEcart(a.wb - LIGNE_TEMPS.wb.cible))}</span>`}` : '–'}</dd></div>
    </dl>`);
    if (d.distanceComplete) {
      out.push(tableau(['Station', 'Cible', 'Réel', 'Écart'], STATIONS.filter((st) => st.cle !== 'wb').map((st) => {
        const reel = d.stations?.[st.cle];
        const cible = LIGNE_TEMPS[st.cle].cible;
        return [esc(st.nom), val(ch(cible)), reel != null ? val(ch(reel)) : '–', reel != null ? val(C.formatEcart(reel - cible)) : '–'];
      })));
    } else {
      out.push('<p class="aide">Distances réduites : les autres stations ne sont pas comparées aux temps cibles. Coche « Stations en distance complète » si tu as fait les distances officielles.</p>');
    }
    return out.join('');
  },

  course(id) {
    const s = etat.saisies[id];
    const d = s?.details ?? {};
    const runs = Array.from({ length: 8 }, (_, i) => d.runs?.[i] ?? null);
    const moyR2R8 = C.moyenne(runs.slice(1));
    const total = totalCourse(s);
    const lignes = [
      ['course', moyR2R8, runs.slice(1).filter((x) => x != null).length < 7 ? ' *' : ''],
      ...STATIONS.map((st) => [st.cle, d.stations?.[st.cle] ?? null, '']),
      ['roxzone', d.roxzone ?? null, ''],
      ['total', total, ''],
    ];
    const t = tableau(['Segment', 'Bordeaux', 'Cible', 'Réel', 'Écart'], lignes.map(([cle, reel, note]) => {
      const l = LIGNE_TEMPS[cle];
      return [esc(l.cellules[0]), val(ch(l.bordeaux)), val(ch(l.cible)), reel != null ? val(ch(reel)) + note : '–', reel != null ? val(C.formatEcart(Math.round(reel) - l.cible)) : '–'];
    }));
    const obj = C.lireObjectif(objectifCourse());
    const out = [`<p class="total">Total ${total != null ? `<span class="grand-chiffre num">${ch(total)}</span>` : '<span class="aide">à renseigner</span>'}</p>`, t];
    if (lignes[0][2]) out.push('<p class="aide">* moyenne des runs R2 à R8 déjà saisis.</p>');
    if (runs[0] != null) out.push(`<p>R1 : ${val(ch(runs[0]))} (5:45 maximum) ${runs[0] <= R1_MAX ? '<span class="ok">✓</span>' : `<span class="ko">✕ ${esc(C.formatEcart(runs[0] - R1_MAX))}</span>`}</p>`);
    if (total != null && obj) {
      const e = C.ecartObjectif(total, obj);
      out.push(`<p>Objectif en vigueur ${val(objectifCourse(), objectifCourse() !== OBJECTIF_DEFAUT)} : ${e === 0 ? 'atteint ✓' : `${val(C.formatEcart(e))} ${e < 0 ? '✓' : ''}`}</p>`);
    }
    return out.join('');
  },

  effacer(id) {
    if (confirmation?.type === 'effacer' && confirmation.id === id) {
      return `<div class="zone-danger"><p>Effacer toute la saisie de cette séance ?</p>
        <div class="actions"><button type="button" class="bouton bouton--danger" data-action="effacer-confirmer">Oui, effacer</button><button type="button" class="bouton" data-action="annuler-confirmation">Annuler</button></div></div>`;
    }
    return '<button type="button" class="bouton bouton--discret" data-action="effacer">Effacer cette saisie</button>';
  },

  // --- Repères ---
  plafond() {
    const r = etat.reperes;
    return r.fcSeuil ? `${val(`FC < ${C.plafondEF(r.fcSeuil)} bpm`, true)}` : '<span class="aide">Saisis ta FC seuil pour le calculer.</span>';
  },
  'aide-S'() {
    const r = etat.reperes;
    if (!r.maxWB) return '';
    const p = C.tailleSerie(r.maxWB);
    return p === r.S ? `<span class="aide">Moitié de ${r.maxWB} : ${p}.</span>` : `<button type="button" class="lien" data-action="S-depuis-max">Utiliser la moitié du max : ${p}</button>`;
  },
  'tableau-allures'() {
    const b = SECTION.allures.blocs.find((x) => x.id === 'allures');
    return rendreBlocs([b]);
  },
  'objectif-info'() {
    const r = etat.reperes;
    const src = { defaut: 'valeur du programme', retest: 'révisé par la règle après le retest de la semaine 9', manuel: 'réglé à la main' }[r.objectifSource] ?? '';
    return `<p class="aide">En vigueur : ${val(objectifCourse(), objectifCourse() !== OBJECTIF_DEFAUT)} · ${esc(src)}.</p>
      ${r.objectifSource === 'manuel' ? '<button type="button" class="lien" data-action="objectif-regle">Revenir à la règle du programme</button>' : ''}`;
  },
  sauvegarde() {
    return htmlSauvegarde();
  },
};

function comparaisonMoities() {
  const d5 = etat.saisies['s5-sam']?.details?.segments ?? {};
  const d9 = etat.saisies['s9-sam']?.details?.segments ?? {};
  if (!Object.values(d5).some((x) => x != null)) return '<p class="aide">Pas encore de chronos en semaine 5 pour comparer segment par segment.</p>';
  const lignes = DEUXIEME_MOITIE.segments.map((sg) => {
    const a = d5[sg.cle], b = d9[sg.cle];
    return [esc(sg.nom), a != null ? val(ch(a)) : '–', b != null ? val(ch(b)) : '–', a != null && b != null ? val(C.formatEcart(b - a)) : '–'];
  });
  const t5 = C.sommeSegments(DEUXIEME_MOITIE.segments.map((sg) => d5[sg.cle] ?? null));
  const t9 = C.sommeSegments(DEUXIEME_MOITIE.segments.map((sg) => d9[sg.cle] ?? null));
  lignes.push(['Total', t5.complet ? val(ch(t5.total)) : '–', t9.complet ? val(ch(t9.total)) : '–', t5.complet && t9.complet ? val(C.formatEcart(t9.total - t5.total)) : '–']);
  return `<h3 class="sous-titre">Semaine 5 / semaine 9</h3>${tableau(['Segment', 'S5', 'S9', 'Écart'], lignes)}`;
}

function marquerLecture(el, ok, texte) {
  el.setAttribute('aria-invalid', ok ? 'false' : 'true');
  const sortie = main.querySelector(`[data-lu-pour="${el.id}"]`);
  if (sortie) {
    sortie.textContent = ok ? texte : el.dataset.format === 'chrono' ? 'Format : 445 ou 4:45' : 'Nombre entier attendu';
    sortie.classList.toggle('erreur', !ok);
  }
}

function lireChampSaisi(el) {
  const fmt = el.dataset.format;
  if (el.type === 'checkbox') return el.checked;
  const brut = el.value;
  if (fmt === 'chrono') {
    const v = C.lireChrono(brut);
    const vide = brut.trim() === '';
    marquerLecture(el, vide || v != null, v != null && brut.trim() !== ch(v) ? `= ${ch(v)}` : '');
    return v;
  }
  if (fmt === 'entier') {
    const v = C.lireEntier(brut);
    marquerLecture(el, brut.trim() === '' || v != null, '');
    return v;
  }
  if (fmt === 'nombre') return Number(brut);
  return brut;
}

function surChampSaisie(el) {
  const form = el.closest('form.saisie');
  const id = form.dataset.id;
  const s = assurerSaisie(id);
  const chemin = el.dataset.champ;
  const v = lireChampSaisi(el);
  ecrire(s, chemin, v);
  s.majLe = new Date().toISOString();
  if (chemin === 'details.maxWB') delete s.details.S;
  if (id === 's9-sam' && chemin.startsWith('details.segments')) appliquerRevisionAuto();
  sauver();
  if (chemin === 'statut') { rendre(); return; }
  majZones(chemin);
}

function appliquerRevisionAuto() {
  const d = etat.saisies['s9-sam']?.details?.segments ?? {};
  const t = C.sommeSegments(DEUXIEME_MOITIE.segments.map((sg) => d[sg.cle] ?? null));
  if (!t.complet || etat.reperes.objectifSource === 'manuel') return;
  etat.reperes.objectif = C.reviserObjectif(t.total);
  etat.reperes.objectifSource = 'retest';
}

function majZones(chemin) {
  for (const el of main.querySelectorAll('[data-zone]')) {
    const deps = el.dataset.deps.split(' ').filter(Boolean);
    if (deps.some((dep) => dep === '*' || chemin.startsWith(dep))) el.innerHTML = ZONES[el.dataset.zone](el.dataset.id);
  }
}

// ---------- Programme ----------
function listeProgramme(selection, { titre = 'h1' } = {}) {
  const courante = semaineCourante();
  if (!semainesOuvertes) semainesOuvertes = new Set([courante]);
  if (selection) semainesOuvertes.add(PAR_ID.get(selection).semaine.numero);
  const auj = aujourdhui();
  const legende = `<p class="legende" aria-hidden="true">${Object.keys(PASTILLES).map((k) => `<span>${signeStatut(k, true)}${PASTILLES[k][1]}</span>`).join('')}</p>`;
  return `<${titre} class="titre-ecran">Programme</${titre}>
    ${repliable("Vue d'ensemble", rendreBlocs(SECTION['vue-ensemble'].blocs), { id: 'vue-ensemble', icone: 'carte' })}
    ${legende}
    <ol class="semaines">${SEMAINES.map((s) => {
      const seances = s.jours.filter((j) => j.type !== 'repos');
      const faites = seances.filter((j) => FAIT.includes(etat.saisies[j.id]?.statut)).length;
      return `<li><details class="semaine" data-phase="${s.phase}" data-semaine="${s.numero}"${semainesOuvertes.has(s.numero) ? ' open' : ''}>
        <summary>
          <span class="semaine__tete">
            <span class="semaine__num">S${s.numero}</span>
            <span class="semaine__dates">${esc(s.dates)}</span>
            ${phaseBadge(s)}
            ${s.numero === courante ? '<span class="etiquette">en cours</span>' : ''}
          </span>
          <span class="semaine__objectif">${esc(s.objectif)}</span>
          <span class="semaine__points" role="img" aria-label="${faites} séances faites sur ${seances.length}">${seances.map((j) => `<span class="point point--${statutJour(j)}"></span>`).join('')}<span class="semaine__compte num">${faites}/${seances.length}</span></span>
        </summary>
        ${s.note ? `<p class="semaine__note">${esc(s.note)}</p>` : ''}
        <ul class="jours">${s.jours.map((j) => `<li><a class="jour${j.type === 'repos' ? ' jour--repos' : ''}${j.id === selection ? ' jour--selection' : ''}${j.date === auj ? ' jour--aujourdhui' : ''}" href="#/seance/${j.id}"${j.id === selection ? ' aria-current="page"' : ''}>
          ${tuile(ICONE_TYPE[j.type], 'petite')}
          <span class="jour__corps">
            <span class="jour__date">${esc(C.formatDateCourte(j.date).replace(/ \S+$/, ''))} · ${esc(TYPES[j.type].libelle)}${j.date === auj ? ' <span class="etiquette">aujourd\'hui</span>' : ''}</span>
            ${j.type !== 'repos' ? `<span class="jour__titre">${esc(titreCourt(j, s))}</span>` : ''}
          </span>
          ${signeStatut(statutJour(j))}
        </a></li>`).join('')}</ul>
      </details></li>`;
    }).join('')}</ol>`;
}

function seanceEnAvant() {
  const auj = aujourdhui();
  const sit = C.situer(auj, DEBUT, DATE_COURSE);
  if (sit.periode === 'avant') return 's1-lun';
  if (sit.periode === 'apres') return 's11-ven';
  const j = PAR_ID.get(sit.id).jour;
  return j.type !== 'repos' ? j.id : prochaineSeance(auj)?.jour.id ?? 's11-ven';
}

function vueProgramme() {
  return `<div class="split split--liste">
    <div class="split__liste">${listeProgramme(null)}</div>
    <div class="split__detail" aria-label="Séance sélectionnée">${detailSeance(seanceEnAvant(), { pourListe: true })}</div>
  </div>`;
}

function vueSeance(id) {
  return `<div class="split split--detail">
    <div class="split__liste">${listeProgramme(id, { titre: 'h2' })}</div>
    <div class="split__detail">${detailSeance(id)}</div>
  </div>`;
}

function vueSaisieSplit(id) {
  return `<div class="split split--detail">
    <div class="split__liste">${listeProgramme(id, { titre: 'h2' })}</div>
    <div class="split__detail">${vueSaisie(id)}</div>
  </div>`;
}

// ---------- Repères ----------
function vueReperes() {
  const r = etat.reperes;
  const obj = objectifCourse();
  const optionsObj = [['1h25', '1h25'], ['1h27', '1h27'], ['1h29-1h30', '1h29-1h30']];
  const autre = !optionsObj.some(([v]) => v === obj);
  const sections = [
    ['Objectif et temps cibles', 'objectif', 'cible'],
    ['Tests', 'tests', 'fiole'],
    ['Standards', 'standards', 'regle'],
    ['Blocs jambes (dans les séances Hyrox)', 'jambes', 'fente'],
    ['Consignes permanentes en séance Hyrox', 'consignes', 'punaise'],
    ['Hydratation, sommeil, alcool', 'hydratation', 'goutte'],
    ['Partie 1 — Diagnostic', 'diagnostic', 'loupe'],
    ['Partie 4 — Semaine de course', 'semaine-course', 'drapeau'],
    ['Sources', 'sources', 'lien'],
  ];
  const allures = SECTION.allures;
  return `<h1 class="titre-ecran">Repères</h1>
    <section class="carte" aria-labelledby="t-mes-reperes">
      <h2 id="t-mes-reperes">${tuile('reglages', 'petite')}Mes repères</h2>
      <div class="grille-champs">
        ${champ({ label: 'Allure seuil (m:ss/km)', chemin: 'seuil', valeur: r.seuil, format: 'chrono', attr: 'repere', placeholder: '4:57', aide: '4:57 par défaut · fixée par le test 30 min (S2)' })}
        ${champ({ label: 'FC seuil (bpm)', chemin: 'fcSeuil', valeur: r.fcSeuil, format: 'entier', attr: 'repere', aide: 'Vide par défaut · test 30 min (S2)' })}
      </div>
      <p class="repere-calcule">Plafond EF (85 % de la FC seuil) : <span data-zone="plafond" data-id="" data-deps="reperes.fcSeuil">${ZONES.plafond()}</span></p>
      <div class="grille-champs">
        ${champ({ label: 'Max wall balls', chemin: 'maxWB', valeur: r.maxWB, format: 'entier', attr: 'repere', aide: "Test d'affilée (S2, samedi)" })}
        ${champ({ label: 'Taille de série S', chemin: 'S', valeur: r.S, format: 'entier', attr: 'repere', placeholder: '12', aide: '12 par défaut' })}
      </div>
      <p data-zone="aide-S" data-id="" data-deps="reperes.maxWB reperes.S">${ZONES['aide-S']()}</p>
      ${radios({ legend: 'Objectif de course en vigueur', nom: 'objectif', chemin: 'objectif', options: optionsObj, valeur: autre ? '' : obj, attr: 'repere', classe: 'groupe--objectif' })}
      ${champ({ label: 'Autre objectif (ex. 1h26)', chemin: 'objectifAutre', valeur: autre ? obj : '', attr: 'repere', placeholder: '1h26' })}
      <div data-zone="objectif-info" data-id="" data-deps="reperes.objectif">${ZONES['objectif-info']()}</div>
    </section>
    <section class="carte" aria-labelledby="t-allures">
      <h2 id="t-allures">${tuile('eclair', 'petite')}Allures</h2>
      ${paragraphe(allures.blocs[0].texte)}
      <div data-zone="tableau-allures" data-id="" data-deps="reperes">${ZONES['tableau-allures']()}</div>
      ${rendreBlocs(allures.blocs.filter((b) => b.type === 'ul'))}
    </section>
    <section class="carte" aria-labelledby="t-apparence">
      <h2 id="t-apparence">${tuile('lune', 'petite')}Apparence</h2>
      ${radios({ legend: 'Thème', nom: 'theme', chemin: 'theme', options: Object.entries(THEMES), valeur: themeChoisi(), attr: 'apparence', classe: 'groupe--theme groupe--dernier' })}
    </section>
    <section class="carte" id="sauvegarde" aria-labelledby="t-sauvegarde">
      <h2 id="t-sauvegarde">${tuile('disquette', 'petite')}Sauvegarde</h2>
      <div data-zone="sauvegarde" data-id="" data-deps="sauvegarde">${htmlSauvegarde()}</div>
    </section>
    ${sections.map(([titre, id, icone]) => repliable(titre, rendreBlocs(SECTION[id].blocs), { id: `ref-${id}`, icone })).join('')}`;
}

function htmlSauvegarde() {
  const n = Object.keys(etat.saisies).length;
  const d = etat.meta.dernierExport;
  const parts = [`<p>${pluriel(n, 'séance')} renseignée${n > 1 ? 's' : ''} · dernier export : ${d ? esc(new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })) : 'jamais'}.</p>
    <p class="aide">Tes saisies restent dans ce navigateur. Safari peut effacer les données d'un site non ajouté à l'écran d'accueil, et un changement de téléphone efface tout : exporte chaque semaine.</p>`];
  if (messageSauvegarde) parts.push(`<p class="${messageSauvegarde.type}" role="status">${esc(messageSauvegarde.texte)}</p>`);
  if (importEnAttente) {
    const a = importEnAttente.apercu;
    parts.push(`<div class="proposition"><h3>Importer ce fichier ?</h3>
      <p>Fichier exporté ${a.exporteLe ? `le ${esc(new Date(a.exporteLe).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}` : 'à une date inconnue'} · ${pluriel(a.nbSaisies, 'séance')} renseignée${a.nbSaisies > 1 ? 's' : ''}.</p>
      <p>Il remplacera toutes tes données actuelles (${pluriel(n, 'séance')}).</p>
      <div class="actions"><button type="button" class="bouton bouton--principal" data-action="import-confirmer">Remplacer mes données</button><button type="button" class="bouton" data-action="import-annuler">Annuler</button></div></div>`);
  }
  parts.push(`<div class="actions">
    <button type="button" class="bouton bouton--principal" data-action="exporter">Exporter</button>
    <input type="file" id="fichier-import" class="visuellement-cache" accept=".json,application/json">
    <label for="fichier-import" class="bouton">Importer</label>
  </div>`);
  if (confirmation?.type === 'reinit1') {
    parts.push(`<div class="zone-danger"><p>Tout effacer ? Saisies, repères et ajustements seront supprimés.</p>
      <div class="actions"><button type="button" class="bouton bouton--danger" data-action="reinit-2">Oui, continuer</button><button type="button" class="bouton" data-action="annuler-confirmation">Annuler</button></div></div>`);
  } else if (confirmation?.type === 'reinit2') {
    parts.push(`<div class="zone-danger"><p><strong>Dernière confirmation.</strong> C'est définitif : exporte d'abord si tu veux garder une copie.</p>
      <div class="actions"><button type="button" class="bouton bouton--danger" data-action="reinit-3">Effacer définitivement</button><button type="button" class="bouton" data-action="annuler-confirmation">Annuler</button></div></div>`);
  } else {
    parts.push('<div class="actions actions--fin"><button type="button" class="bouton bouton--discret bouton--danger-texte" data-action="reinit-1">Réinitialiser…</button></div>');
  }
  return parts.join('');
}

function surRepere(el) {
  const cle = el.dataset.repere;
  const r = etat.reperes;
  const brut = el.value.trim();
  const erreur = (msg) => {
    el.setAttribute('aria-invalid', 'true');
    const s = main.querySelector(`[data-lu-pour="${el.id}"]`);
    if (s) { s.textContent = msg; s.classList.add('erreur'); }
  };
  const ok = (texte = '') => {
    el.setAttribute('aria-invalid', 'false');
    const s = main.querySelector(`[data-lu-pour="${el.id}"]`);
    if (s) { s.textContent = texte; s.classList.remove('erreur'); }
  };
  if (cle === 'seuil') {
    const v = C.lireChrono(brut);
    if (brut === '') { r.seuil = SEUIL_DEFAUT; ok('4:57 par défaut'); }
    else if (v != null && v >= 180 && v <= 480) { r.seuil = v; ok(brut !== C.formatMinSec(v) ? `= ${C.formatMinSec(v)}/km` : ''); }
    else return erreur('Entre 3:00 et 8:00 (ex. 505)');
  } else if (cle === 'fcSeuil') {
    const v = C.lireEntier(brut);
    if (brut === '') { r.fcSeuil = null; ok(); }
    else if (v != null && v >= 100 && v <= 230) { r.fcSeuil = v; ok(); }
    else return erreur('Entre 100 et 230 bpm');
  } else if (cle === 'maxWB') {
    const v = C.lireEntier(brut);
    if (brut === '') { r.maxWB = null; ok(); }
    else if (v != null && v >= 1 && v <= 300) { r.maxWB = v; ok(); }
    else return erreur('Nombre de répétitions attendu');
  } else if (cle === 'S') {
    const v = C.lireEntier(brut);
    if (brut === '') { r.S = S_DEFAUT; ok('12 par défaut'); }
    else if (v != null && v >= 1 && v <= 100) { r.S = v; ok(); }
    else return erreur('Entre 1 et 100');
  } else if (cle === 'objectif') {
    r.objectif = el.value;
    r.objectifSource = 'manuel';
    const autre = main.querySelector('[data-repere="objectifAutre"]');
    if (autre) autre.value = '';
  } else if (cle === 'objectifAutre') {
    if (brut === '') return ok();
    const o = C.lireObjectif(brut.replace(/\s+/g, ''));
    if (!o) return erreur('Format : 1h26 ou 1h29-1h30');
    r.objectif = brut.replace(/\s+/g, '');
    r.objectifSource = 'manuel';
    for (const radio of main.querySelectorAll('input[name="objectif"]')) radio.checked = false;
    ok();
  }
  sauver();
  majZones(`reperes.${cle === 'objectifAutre' ? 'objectif' : cle}`);
}

// ---------- Suivi ----------
function vueSuivi() {
  const auj = aujourdhui();
  const prevues = SEANCES.filter(({ jour }) => jour.date <= auj).length;
  const saisies = Object.entries(etat.saisies);
  const faites = saisies.filter(([, s]) => FAIT.includes(s.statut)).length;
  const modifiees = saisies.filter(([, s]) => s.statut === 'modifiee').length;
  const sautees = saisies.filter(([, s]) => s.statut === 'sautee').length;
  const nonRens = SEANCES.filter(({ jour }) => jour.date < auj && !etat.saisies[jour.id]).length;
  const parSemaine = SEMAINES.map((s) => {
    const seances = s.jours.filter((j) => j.type !== 'repos');
    const f = seances.filter((j) => FAIT.includes(etat.saisies[j.id]?.statut)).length;
    const rpe = C.moyenne(seances.map((j) => etat.saisies[j.id]).filter((x) => x && x.statut !== 'sautee' && x.rpe).map((x) => x.rpe));
    return { s, f, n: seances.length, rpe };
  });
  const aucunRpe = parSemaine.every((x) => x.rpe == null);
  const t30 = etat.saisies['s2-lun']?.details ?? {};
  const r = etat.reperes;
  const journal = saisies
    .map(([id, s]) => ({ id, s, ...PAR_ID.get(id) }))
    .filter((x) => x.jour)
    .sort((a, b) => (b.s.date ?? b.jour.date).localeCompare(a.s.date ?? a.jour.date) || b.jour.date.localeCompare(a.jour.date));
  const mini = (statut, n, mot) => `<span>${signeStatut(statut, true)}${n} ${mot}${n > 1 ? 's' : ''}</span>`;
  const t30Texte = [t30.distance ? `${t30.distance} m` : null, t30.allure20 != null ? `${ch(t30.allure20)}/km` : null, t30.fc20 ? `FC ${t30.fc20}` : null].filter(Boolean).join(' · ');

  return `<h1 class="titre-ecran">Suivi</h1>
    <section class="carte suivi-tete" aria-labelledby="t-faites">
      ${anneau(prevues ? faites / prevues : 0, `<b>${faites}</b><small>sur ${prevues}</small>`, `${faites} séances faites sur ${prevues} prévues depuis le début`)}
      <div class="suivi-tete__texte">
        <h2 id="t-faites">Séances faites</h2>
        <p class="aide">${faites} sur ${prevues} prévues depuis le début · 55 au total</p>
        <p class="mini-stats">${mini('modifiee', modifiees, 'modifiée')}${mini('sautee', sautees, 'sautée')}${mini('a-faire', nonRens, 'non renseignée')}</p>
      </div>
    </section>
    <section class="carte" aria-labelledby="t-semaines">
      <h2 id="t-semaines">${tuile('calendrier', 'petite')}Séances faites par semaine</h2>
      ${grapheColonnes(parSemaine.map(({ s, f, n }) => ({ etiquette: `S${s.numero}`, valeur: f, max: n, texte: `${f}/${n}`, phase: s.phase, titre: `Semaine ${s.numero} : ${f} séances faites sur ${n}` })), 'Séances faites par semaine')}
    </section>
    <section class="carte" aria-labelledby="t-rpe">
      <h2 id="t-rpe">${tuile('flamme', 'petite')}RPE moyen par semaine</h2>
      ${grapheColonnes(parSemaine.map(({ s, rpe }) => ({ etiquette: `S${s.numero}`, valeur: rpe, max: 10, texte: rpe != null ? nombreFr(rpe) : '', phase: s.phase, titre: `Semaine ${s.numero} : ${rpe != null ? `RPE moyen ${nombreFr(rpe)}` : 'pas de RPE noté'}` })), 'RPE moyen par semaine')}
      ${aucunRpe ? '<p class="aide">Le RPE moyen apparaît dès que tu notes ton effort dans une saisie.</p>' : ''}
    </section>
    <section class="carte" aria-labelledby="t-tests">
      <h2 id="t-tests">${tuile('fiole', 'petite')}Tests et repères</h2>
      <dl class="stats">
        <div><dt>${tuile('pas', 'petite')}Test 30 min (S2)</dt><dd>${t30Texte ? `<span class="num">${esc(t30Texte)}</span>` : '<span class="aide">non renseigné</span>'}</dd></div>
        <div><dt>${tuile('eclair', 'petite')}Allure seuil</dt><dd>${val(C.formatMinSec(r.seuil) + '/km', true)}</dd></div>
        <div><dt>${tuile('coeur', 'petite')}FC seuil</dt><dd>${r.fcSeuil ? val(`${r.fcSeuil} bpm`, true) : '<span class="aide">à fixer</span>'}</dd></div>
        <div><dt>${tuile(ICONE_STATION.wb, 'petite')}Taille de série</dt><dd>${val(`S = ${r.S}`, true)}${r.maxWB ? ` <span class="aide">max ${r.maxWB}</span>` : ''}</dd></div>
        <div><dt>${tuile('cible', 'petite')}Objectif de course</dt><dd>${val(objectifCourse(), objectifCourse() !== OBJECTIF_DEFAUT)}${r.objectifSource === 'retest' ? ' <span class="aide">révisé</span>' : r.objectifSource === 'manuel' ? ' <span class="aide">à la main</span>' : ''}</dd></div>
      </dl>
      ${comparaisonMoities()}
    </section>
    <section class="carte" aria-labelledby="t-journal">
      <h2 id="t-journal">${tuile('crayon', 'petite')}Journal</h2>
      ${journal.length ? `<ol class="journal">${journal.map(({ id, s, jour, semaine }) => `<li>
        <a href="#/seance/${id}">
          ${tuile(ICONE_TYPE[jour.type])}
          <span class="journal__corps">
            <span class="journal__tete"><span class="num">${esc(maj1(C.formatDateCourte(s.date ?? jour.date)))}</span> · S${semaine.numero} · ${esc(TYPES[jour.type].libelle)}</span>
            <span class="journal__titre">${texteSimple(jour.titre, jour)}</span>
            <span class="journal__meta">${pastille(s.statut)}${s.rpe && s.statut !== 'sautee' ? ` <span class="num">RPE ${s.rpe}</span>` : ''}${s.duree && s.statut !== 'sautee' ? ` <span class="num">· ${s.duree} min</span>` : ''}</span>
            ${s.notes?.trim() ? `<span class="notes">${esc(s.notes)}</span>` : ''}
          </span>
        </a></li>`).join('')}</ol>` : '<p class="aide">Aucune séance renseignée pour l\'instant.</p>'}
    </section>`;
}

function grapheColonnes(items, libelle) {
  const L = 330, H = 150, bas = 122, haut = 24;
  const pas = L / items.length;
  const w = Math.min(22, pas * 0.64);
  const colonnes = items.map((it, i) => {
    const x = i * pas + (pas - w) / 2;
    const h = it.valeur ? Math.max(w, ((bas - haut) * it.valeur) / it.max) : 0;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${haut}" width="${w.toFixed(1)}" height="${bas - haut}" rx="${(w / 2).toFixed(1)}" class="col-fond"/>
      ${h > 0 ? `<rect x="${x.toFixed(1)}" y="${(bas - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(w / 2).toFixed(1)}" class="col-barre" data-phase="${it.phase}"/>` : ''}
      ${it.texte && it.valeur ? `<text x="${(x + w / 2).toFixed(1)}" y="${(haut - 8).toFixed(1)}" text-anchor="middle" class="col-val">${esc(it.texte)}</text>` : ''}
      <text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="col-axe">${esc(it.etiquette)}</text>
    </g>`;
  }).join('');
  return `<svg class="graphe-colonnes" viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(libelle)}">${colonnes}</svg>
    <ul class="visuellement-cache">${items.map((it) => `<li>${esc(it.titre)}</li>`).join('')}</ul>`;
}

// ---------- Bandeaux ----------
// ---------- Thème : sombre par défaut (posé dès le chargement par index.html) ----------
const CLE_THEME = 'hyrox-paris-2026:theme';
const THEMES = { sombre: 'Sombre', clair: 'Clair', auto: 'Comme le téléphone' };
const systemeSombre = window.matchMedia('(prefers-color-scheme: dark)');
function themeChoisi() {
  try { return THEMES[localStorage.getItem(CLE_THEME)] ? localStorage.getItem(CLE_THEME) : 'sombre'; } catch { return 'sombre'; }
}
function appliquerTheme(choix = themeChoisi()) {
  const sombre = choix === 'sombre' || (choix === 'auto' && systemeSombre.matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sombre ? '#0e1013' : '#f5f5f2');
}
function choisirTheme(choix) {
  try { localStorage.setItem(CLE_THEME, choix); } catch { /* le choix vaut pour cette ouverture seulement */ }
  appliquerTheme(choix);
}
systemeSombre.addEventListener('change', () => appliquerTheme());

const estInstallee = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function rendreBandeaux() {
  const b = [];
  if (DATE_FORCEE) b.push(`<p class="bandeau bandeau--info">Date de test : ${esc(C.formatDateLongue(DATE_FORCEE))}</p>`);
  if (alerteStockage) b.push(`<p class="bandeau bandeau--alerte" role="alert">${esc(alerteStockage)}</p>`);
  if (majWorker) b.push('<div class="bandeau bandeau--maj" role="status"><span>Nouvelle version disponible</span><button type="button" class="bouton bouton--principal" data-action="recharger">Recharger</button></div>');
  if (!estInstallee() && !etat.meta.bandeauInstallMasque && lireRoute().nom === 'aujourdhui') {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const lignes = [];
    if (ios || !android) lignes.push('<li><strong>iPhone</strong> : Partager → Sur l\'écran d\'accueil</li>');
    if (android || !ios) lignes.push('<li><strong>Android</strong> : menu ⋮ → Installer l\'application</li>');
    b.push(`<div class="bandeau bandeau--install">
      ${pictogramme('telephone', 'bandeau__picto')}
      <details class="bandeau__texte"><summary><strong>Installe l'appli</strong> sur l'écran d'accueil</summary><ul>${lignes.join('')}</ul></details>
      ${invitationInstall ? '<button type="button" class="bouton bouton--principal bouton--petit" data-action="installer">Installer</button>' : ''}
      <button type="button" class="bouton-icone bouton-icone--discret" data-action="masquer-install" aria-label="Masquer ce conseil">${I.svg('croix', 20)}</button>
    </div>`);
  }
  zoneBandeaux.innerHTML = b.join('');
}

// ---------- Message flottant après une saisie ----------
let minuterieToast = null;
function toast(texte, { icone = 'coche', ton = 'ok' } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.dataset.ton = ton;
  el.innerHTML = `<span class="toast__picto">${I.svg(icone, 20)}</span><span>${esc(texte)}</span>`;
  el.classList.remove('toast--visible');
  void el.offsetWidth;
  el.classList.add('toast--visible');
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => el.classList.remove('toast--visible'), 2800);
}

function feliciter(id) {
  const s = etat.saisies[id];
  if (!s) return;
  const { semaine } = PAR_ID.get(id);
  const seances = semaine.jours.filter((j) => j.type !== 'repos');
  const faites = seances.filter((j) => FAIT.includes(etat.saisies[j.id]?.statut)).length;
  if (s.statut === 'sautee') { toast('Séance notée comme sautée', { icone: 'point', ton: 'neutre' }); return; }
  const bilan = faites === seances.length ? `semaine ${semaine.numero} complète !` : `${faites}/${seances.length} cette semaine`;
  toast(`Séance enregistrée · ${bilan}`);
  navigator.vibrate?.(faites === seances.length ? [20, 60, 20] : 15);
}

function changerJour(pas) {
  jourVu = C.ajouterJours(jourVu ?? aujourdhui(), pas);
  rendre();
  main.querySelector('.carte-seance, .carte-repos, .carte-fin')?.classList.add(pas < 0 ? 'glisse-precedent' : 'glisse-suivant');
}

// Aujourd'hui : un balayage horizontal passe au jour précédent ou suivant.
let departBalayage = null;
main.addEventListener('touchstart', (e) => {
  departBalayage = main.dataset.ecran === 'aujourdhui' && e.touches.length === 1 && !e.target.closest('input, textarea, .defile')
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
main.addEventListener('touchend', (e) => {
  if (!departBalayage) return;
  const dx = e.changedTouches[0].clientX - departBalayage.x;
  const dy = e.changedTouches[0].clientY - departBalayage.y;
  departBalayage = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  ACTIONS[dx < 0 ? 'lendemain' : 'veille']();
}, { passive: true });

// ---------- Navigation ----------
function lireRoute(hash = location.hash) {
  const p = decodeURIComponent(hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  if (p[0] === 'seance' && PAR_ID.has(p[1])) {
    const repos = PAR_ID.get(p[1]).jour.type === 'repos';
    return { nom: p[2] === 'saisie' && !repos ? 'saisie' : 'seance', id: p[1] };
  }
  if (p[0] === 'programme') return { nom: 'programme' };
  if (p[0] === 'reperes') return { nom: 'reperes', ancre: p[1] };
  if (p[0] === 'suivi') return { nom: 'suivi' };
  return { nom: 'aujourdhui' };
}

const ONGLET = { aujourdhui: 'aujourdhui', programme: 'programme', seance: 'programme', saisie: 'programme', reperes: 'reperes', suivi: 'suivi' };
const TITRES = { aujourdhui: "Aujourd'hui", programme: 'Programme', seance: 'Séance', saisie: 'Saisie', reperes: 'Repères', suivi: 'Suivi' };

function rendre() {
  const r = lireRoute();
  const cle = location.hash || '#/aujourdhui';
  const changement = cle !== derniereRoute;
  if (changement) {
    routePrecedente = derniereRoute;
    confirmation = null;
    importEnAttente = null;
    messageSauvegarde = null;
    const prec = routePrecedente ? lireRoute(routePrecedente).nom : null;
    if ((r.nom === 'seance' || r.nom === 'saisie') && prec !== 'seance' && prec !== 'saisie') origineSeance = routePrecedente;
  }
  const liste = main.querySelector('.split__liste');
  const defilListe = liste ? liste.scrollTop : 0;
  const focusId = document.activeElement?.id;
  let html;
  switch (r.nom) {
    case 'seance': html = vueSeance(r.id); break;
    case 'saisie': html = vueSaisieSplit(r.id); break;
    case 'programme': html = vueProgramme(); break;
    case 'reperes': html = vueReperes(); break;
    case 'suivi': html = vueSuivi(); break;
    default: html = vueAujourdhui();
  }
  main.innerHTML = html;
  main.dataset.ecran = r.nom;
  document.body.dataset.ecran = r.nom;
  if (changement) {
    rendreBandeaux();
    main.classList.remove('entree');
    void main.offsetWidth;
    main.classList.add('entree');
  }
  main.classList.toggle('a-barre', [...main.querySelectorAll('.barre-fixe')].some((el) => el.getClientRects().length > 0));
  document.title = `${TITRES[r.nom]} · Prépa Paris`;
  for (const a of document.querySelectorAll('.onglets a')) {
    if (a.dataset.onglet === ONGLET[r.nom]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const nouvelleListe = main.querySelector('.split__liste');
  if (changement) {
    if (r.nom === 'reperes' && r.ancre) document.getElementById(r.ancre)?.scrollIntoView();
    else window.scrollTo(0, 0);
    if (nouvelleListe) {
      if (liste) nouvelleListe.scrollTop = defilListe;
      else {
        // Fait défiler la liste seule (pas la page) jusqu'à la séance sélectionnée.
        const cible = nouvelleListe.querySelector('.jour--selection') ?? nouvelleListe.querySelector('.semaine[open]');
        if (cible && nouvelleListe.scrollHeight > nouvelleListe.clientHeight) {
          nouvelleListe.scrollTop += cible.getBoundingClientRect().top - nouvelleListe.getBoundingClientRect().top - 96;
        }
      }
    }
    const h1 = main.querySelector('h1');
    if (derniereRoute !== null && h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  } else {
    if (nouvelleListe) nouvelleListe.scrollTop = defilListe;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  derniereRoute = cle;
  dateRendue = aujourdhui();
}

function aller(hash, { remplacer = false } = {}) {
  if (remplacer) { location.replace(hash); return; }
  if (location.hash === hash) rendre(); else location.hash = hash;
}

// ---------- Actions ----------
const ACTIONS = {
  veille() { changerJour(-1); },
  lendemain() { changerJour(1); },
  'retour-aujourdhui'() { jourVu = null; rendre(); },
  retour(el, e) {
    const cible = el.getAttribute('href');
    if (routePrecedente && routePrecedente.split('?')[0] === cible) { e.preventDefault(); history.back(); }
  },
  marquer(el, e) {
    e.preventDefault();
    const id = el.dataset.id;
    if (!etat.saisies[id]) { assurerSaisie(id); sauver(); }
    aller(`#/seance/${id}/saisie`);
  },
  termine(el) {
    feliciter(el.dataset.id);
    // Retour à l'écran d'où vient la saisie (Aujourd'hui ou la séance), sinon au détail de la séance.
    if (routePrecedente && lireRoute(routePrecedente).nom !== 'saisie') history.back();
    else aller(`#/seance/${el.dataset.id}`);
  },
  'voir-jour'(el) {
    jourVu = el.dataset.date === aujourdhui() ? null : el.dataset.date;
    rendre();
  },
  'masquer-guide'() {
    etat.meta.guideMasque = true;
    sauver();
    rendre();
  },
  'date-pas'(el) {
    const id = el.closest('[data-id]').dataset.id;
    const s = assurerSaisie(id);
    const pas = Number(el.dataset.pas);
    s.date = pas === 0 ? PAR_ID.get(id).jour.date : C.ajouterJours(s.date ?? PAR_ID.get(id).jour.date, pas);
    sauver();
    majZones('date');
  },
  'duree-prevue'() {
    const id = main.querySelector('form.saisie').dataset.id;
    const input = main.querySelector('[data-champ="duree"]');
    input.value = String(PAR_ID.get(id).jour.duree);
    surChampSaisie(input);
  },
  'ajouter-tour'() {
    const id = main.querySelector('form.saisie').dataset.id;
    const s = assurerSaisie(id);
    s.details.tours = [...(s.details.tours ?? []), null];
    sauver();
    rendre();
    main.querySelector(`#${idChamp('c', `details.tours.${s.details.tours.length - 1}`)}`)?.focus();
  },
  'retirer-tour'() {
    const id = main.querySelector('form.saisie').dataset.id;
    const s = assurerSaisie(id);
    s.details.tours = (s.details.tours ?? []).slice(0, -1);
    sauver();
    rendre();
  },
  'appliquer-test30'() {
    const id = main.querySelector('form.saisie').dataset.id;
    const d = etat.saisies[id].details;
    etat.reperes.seuil = d.allure20;
    if (d.fc20 != null && d.fc20 >= 100 && d.fc20 <= 230) etat.reperes.fcSeuil = d.fc20;
    sauver();
    majZones('details.allure20');
  },
  'valider-S'() {
    const id = main.querySelector('form.saisie').dataset.id;
    const d = etat.saisies[id].details;
    const input = main.querySelector('#S-propose');
    const v = C.lireEntier(input.value);
    if (v == null || v < 1 || v > 100) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    etat.reperes.maxWB = d.maxWB;
    etat.reperes.S = v;
    d.S = v;
    sauver();
    majZones('details.maxWB');
  },
  'valider-ajustement'(el) {
    const id = main.querySelector('form.saisie').dataset.id;
    const input = main.querySelector('#allure-ajustee');
    const v = C.lireChrono(input.value);
    if (v == null || v < 180 || v > 480) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    const suiv = el.dataset.id;
    etat.ajustements[suiv] = {
      allure: v,
      depuis: id,
      verdict: etat.saisies[id].details.verdict,
      prevue: C.allurePrevue(PAR_ID.get(suiv).jour, etat.reperes.seuil),
      valideLe: new Date().toISOString(),
    };
    sauver();
    majZones('details.verdict');
  },
  'annuler-ajustement'(el) {
    delete etat.ajustements[el.dataset.id];
    sauver();
    if (main.querySelector('form.saisie')) majZones('details.verdict'); else rendre();
  },
  'appliquer-revision'() {
    etat.reperes.objectifSource = 'retest';
    appliquerRevisionAuto();
    sauver();
    majZones('details.segments');
  },
  effacer(el) {
    confirmation = { type: 'effacer', id: el.closest('[data-id]').dataset.id };
    main.querySelector('[data-zone="effacer"]').innerHTML = ZONES.effacer(confirmation.id);
    main.querySelector('[data-action="effacer-confirmer"]')?.focus();
  },
  'effacer-confirmer'() {
    const id = confirmation.id;
    delete etat.saisies[id];
    if (id === 's9-sam' && etat.reperes.objectifSource === 'retest') {
      etat.reperes.objectif = OBJECTIF_DEFAUT;
      etat.reperes.objectifSource = 'defaut';
    }
    confirmation = null;
    sauver();
    aller(`#/seance/${id}`, { remplacer: true });
  },
  'annuler-confirmation'() {
    const c = confirmation;
    confirmation = null;
    if (c?.type === 'effacer') main.querySelector('[data-zone="effacer"]').innerHTML = ZONES.effacer(c.id);
    else majZones('sauvegarde');
  },
  async exporter() {
    const maintenant = new Date();
    const resultat = await Stock.partagerOuTelecharger(Stock.nomFichierExport(maintenant), Stock.contenuExport(etat, maintenant));
    if (resultat === 'annule') { messageSauvegarde = { type: 'aide', texte: 'Export annulé.' }; }
    else {
      etat.meta.dernierExport = maintenant.toISOString();
      sauver();
      messageSauvegarde = { type: 'succes', texte: resultat === 'partage' ? '✓ Fichier envoyé.' : '✓ Fichier téléchargé.' };
    }
    if (lireRoute().nom === 'reperes') majZones('sauvegarde'); else rendre();
  },
  'import-confirmer'() {
    const garder = etat.meta.bandeauInstallMasque;
    etat = importEnAttente.etat;
    etat.meta.bandeauInstallMasque = garder;
    etat.meta.dernierExport = importEnAttente.apercu.exporteLe ?? etat.meta.dernierExport;
    importEnAttente = null;
    sauver();
    messageSauvegarde = { type: 'succes', texte: `✓ Données importées (${pluriel(Object.keys(etat.saisies).length, 'séance')}).` };
    rendre();
  },
  'import-annuler'() { importEnAttente = null; messageSauvegarde = null; majZones('sauvegarde'); },
  'reinit-1'() { confirmation = { type: 'reinit1' }; majZones('sauvegarde'); },
  'reinit-2'() { confirmation = { type: 'reinit2' }; majZones('sauvegarde'); },
  'reinit-3'() {
    const garder = etat.meta.bandeauInstallMasque;
    etat = Stock.etatInitial();
    etat.meta.bandeauInstallMasque = garder;
    confirmation = null;
    sauver();
    messageSauvegarde = { type: 'succes', texte: '✓ Toutes les données ont été effacées.' };
    rendre();
  },
  'S-depuis-max'() {
    etat.reperes.S = C.tailleSerie(etat.reperes.maxWB);
    sauver();
    const input = main.querySelector('[data-repere="S"]');
    if (input) input.value = String(etat.reperes.S);
    majZones('reperes.S');
  },
  'objectif-regle'() {
    const d = etat.saisies['s9-sam']?.details?.segments ?? {};
    const t = C.sommeSegments(DEUXIEME_MOITIE.segments.map((sg) => d[sg.cle] ?? null));
    etat.reperes.objectif = t.complet ? C.reviserObjectif(t.total) : OBJECTIF_DEFAUT;
    etat.reperes.objectifSource = t.complet ? 'retest' : 'defaut';
    sauver();
    rendre();
  },
  'masquer-install'() { etat.meta.bandeauInstallMasque = true; sauver(); rendreBandeaux(); },
  async installer() {
    if (!invitationInstall) return;
    invitationInstall.prompt();
    await invitationInstall.userChoice.catch(() => null);
    invitationInstall = null;
    rendreBandeaux();
  },
  recharger() {
    rechargementDemande = true;
    if (majWorker) majWorker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 1500);
  },
};

document.addEventListener('click', (e) => {
  const abbr = e.target.closest('.abbr');
  if (abbr) { e.preventDefault(); basculerDefinition(abbr); return; }
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
});

document.querySelector('.onglets').addEventListener('click', (e) => {
  if (e.target.closest('[data-onglet="aujourdhui"]')) { jourVu = null; if (lireRoute().nom === 'aujourdhui') rendre(); }
});

main.addEventListener('input', (e) => {
  const el = e.target;
  if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') return;
  if (el.dataset.champ) surChampSaisie(el);
  else if (el.dataset.repere) surRepere(el);
});

main.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'fichier-import') { lireFichierImport(el); return; }
  if (el.type === 'radio' || el.type === 'checkbox') {
    if (el.dataset.apparence) { choisirTheme(el.value); return; }
    if (el.dataset.champ) surChampSaisie(el);
    else if (el.dataset.repere) surRepere(el);
    return;
  }
  // Fin de saisie d'un chrono : affichage normalisé (445 → 4:45).
  if (el.dataset.format === 'chrono') {
    const v = C.lireChrono(el.value);
    if (v != null) {
      el.value = el.dataset.repere ? C.formatMinSec(v) : ch(v);
      const sortie = main.querySelector(`[data-lu-pour="${el.id}"]`);
      if (sortie && !sortie.classList.contains('erreur')) sortie.textContent = '';
    }
  }
});

main.addEventListener('submit', (e) => e.preventDefault());

main.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.classList?.contains('semaine') || !semainesOuvertes) return;
  const n = Number(d.dataset.semaine);
  if (d.open) semainesOuvertes.add(n); else semainesOuvertes.delete(n);
}, true);

async function lireFichierImport(input) {
  const fichier = input.files?.[0];
  input.value = '';
  if (!fichier) return;
  const texte = await fichier.text();
  const r = Stock.validerImport(texte, new Set(PAR_ID.keys()));
  if (!r.ok) { importEnAttente = null; messageSauvegarde = { type: 'erreur', texte: `Import impossible : ${r.erreur}` }; }
  else { importEnAttente = { etat: r.etat, apercu: r.apercu }; messageSauvegarde = null; }
  majZones('sauvegarde');
}

window.addEventListener('hashchange', rendre);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && aujourdhui() !== dateRendue && lireRoute().nom === 'aujourdhui') { jourVu = null; rendre(); }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  invitationInstall = e;
  rendreBandeaux();
});
window.addEventListener('appinstalled', () => { invitationInstall = null; rendreBandeaux(); });

// ---------- Service worker ----------
function montrerMaj(worker) {
  majWorker = worker;
  rendreBandeaux();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) montrerMaj(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nouveau = reg.installing;
      nouveau?.addEventListener('statechange', () => {
        if (nouveau.state === 'installed' && navigator.serviceWorker.controller) montrerMaj(nouveau);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (rechargementDemande) location.reload();
  });
}

// ---------- Icônes ----------
const ICONES = {
  gauche: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  droite: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- Démarrage ----------
rendreBandeaux();
rendre();
