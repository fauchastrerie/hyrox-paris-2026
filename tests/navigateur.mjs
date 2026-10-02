// Vérifications dans un navigateur headless (Playwright, Chromium).
//
//   1. python -m http.server 8765        (à la racine du dépôt)
//   2. npm install --no-save playwright   (une fois)
//   3. node tests/navigateur.mjs [dossier-captures]
//
// Variables : BASE (défaut http://127.0.0.1:8765/), PLAYWRIGHT (chemin du module si installé ailleurs).
// Contrôle : parcours de saisie et règles du programme, persistance, export / réinitialisation / import,
// hors ligne, puis rendu à 360, 390, 768 et 1280 px en thème clair et sombre (défilement horizontal,
// texte coupé, zones tactiles de 44 × 44 px espacées de 8 px, contraste AA, erreurs console).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEMAINES } from '../programme.js';
import { texteAvecValeurs } from '../calculs.js';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://127.0.0.1:8765/';
const SORTIE = process.argv[2] ?? 'captures';
mkdirSync(SORTIE, { recursive: true });
const CLE = 'hyrox-paris-2026:v1';

const bilan = { ok: 0, echecs: [] };
function verifier(nom, condition, detail = '') {
  if (condition) { bilan.ok++; console.log(`  ✓ ${nom}`); }
  else { bilan.echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`); }
}

const navigateur = await chromium.launch();
const erreursConsole = [];
async function nouveauContexte(options = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true, ...options });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') erreursConsole.push(`${m.text()} (${page.url()})`); });
  page.on('pageerror', (e) => erreursConsole.push(`${e.message} (${page.url()})`));
  return { ctx, page };
}
const etat = (page) => page.evaluate((cle) => JSON.parse(localStorage.getItem(cle) ?? 'null'), CLE);
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(120); };
// textContent (et non innerText) : le texte du programme, sans les majuscules ajoutées par le CSS.
const texte = async (page, sel) => (await page.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();

// ---------- A0. Fidélité de l'affichage ----------
console.log('\nA0. Texte du programme affiché à l\'identique (étapes comprises)');
{
  const { ctx, page: p } = await nouveauContexte();
  await p.goto(`${BASE}?date=2026-10-01#/aujourdhui`);
  await p.waitForSelector('.entete__compte');
  const ecarts = [];
  let n = 0;
  const champs = [['echauffement', 'Échauffement'], ['corps', 'Corps'], ['retourCalme', 'Retour au calme'], ['objectif', 'Objectif']];
  for (const j of SEMAINES.flatMap((s) => s.jours)) {
    if (!j.corps) continue;
    n++;
    await p.evaluate((h) => { location.hash = h; }, `#/seance/${j.id}`);
    await p.waitForTimeout(30);
    // Texte affiché, hors décor : tuiles d'icônes, numéros de blocs, repère EF ajouté par l'appli.
    const blocs = await p.$$eval('.split__detail .seance__bloc', (els) => els.map((e) => {
      const copie = e.cloneNode(true);
      copie.querySelectorAll('.tuile, .circuit__num, .repere-ef').forEach((x) => x.remove());
      return { titre: copie.querySelector('h2').textContent.trim(), texte: [...copie.children].slice(1).map((c) => c.textContent).join('') };
    }));
    for (const [champ, titre] of champs) {
      const b = blocs.find((x) => x.titre.endsWith(titre));
      const attendu = texteAvecValeurs(j[champ], { seuil: 297, S: 12, fcSeuil: null }).replace(/\s+/g, '');
      if (!b || b.texte.replace(/\s+/g, '') !== attendu) ecarts.push(`${j.id}.${champ}`);
    }
    const duree = blocs.find((x) => x.titre.endsWith('Durée'));
    if (!duree || duree.texte.trim() !== `${j.dureeTexte}.`) ecarts.push(`${j.id}.duree`);
  }
  verifier(`Affichage : ${n} séances détaillées, sections dans l'ordre et texte intact`, ecarts.length === 0 && n === 33, ecarts.join(', '));
  await ctx.close();
}

// ---------- A. Parcours fonctionnels ----------
console.log('\nA. Saisies et règles du programme');
const { ctx: ctxA, page } = await nouveauContexte();
await page.goto(`${BASE}?date=2026-12-05#/aujourdhui`);
await page.waitForSelector('.entete__compte');
verifier('Aujourd\'hui : J-13 le 5 décembre', (await texte(page, '.entete__compte')) === 'J-13');
verifier('Aujourd\'hui : « Semaine 9/11 · Spécifique (pic) »', /Semaine 9\/11 · Spécifique \(pic\)/.test(await texte(page, '.entete__semaine')));
verifier('Rappel zéro alcool tous les jours à partir du 8 décembre (absent le 5)', (await page.locator('.rappel').count()) === 0);

// Test 30 min
await aller(page, '#/seance/s2-lun');
await page.click('[data-action="marquer"]');
await page.waitForSelector('form.saisie');
await page.fill('[data-champ="details.distance"]', '6050');
await page.fill('[data-champ="details.allure20"]', '505');
await page.fill('[data-champ="details.fc20"]', '176');
await page.locator('label:has(input[name="rpe"][value="8"])').click();
const prop30 = await texte(page, '[data-zone="test30"]');
verifier('Test 30 min : écart +0:08/km avec 4:57 affiché', prop30.includes('+0:08/km'));
verifier('Test 30 min : AC inchangée annoncée', prop30.includes('AC inchangée'));
verifier('Test 30 min : plafond EF FC < 150 bpm', prop30.includes('FC < 150 bpm'));
verifier('Test 30 min : repères inchangés avant validation', (await etat(page)).reperes.seuil === 297);
await page.click('[data-action="appliquer-test30"]');
let e = await etat(page);
verifier('Test 30 min : repères mis à jour après validation (5:05, FC 176)', e.reperes.seuil === 305 && e.reperes.fcSeuil === 176);
await aller(page, '#/seance/s3-lun');
verifier('S3 lundi suit le nouveau seuil (5:05)', (await texte(page, '.seance')).includes('5 × 1000 m à 5:05'));
await aller(page, '#/seance/s5-lun');
verifier('S5 lundi : 400 m en 1:48', (await texte(page, '.seance')).includes('10 × 400 m en 1:48'));
await aller(page, '#/seance/s8-lun');
verifier('S8 lundi : 6 × 1000 m à 5:00', (await texte(page, '.seance')).includes('6 × 1000 m à 5:00'));
await aller(page, '#/seance/s3-mer');
verifier('Cardio/run 2 : plafond EF affiché (FC < 150 bpm)', (await texte(page, '.seance')).includes('FC < 150 bpm'));
await aller(page, '#/seance/s2-mer');
verifier('S2 mercredi : jeton EF remplacé dans le texte', (await texte(page, '.seance')).includes('50 min EF (FC < 150 bpm)'));

// Abréviation dépliable
await aller(page, '#/seance/s3-sam');
await page.locator('.seance .abbr[data-terme="EH"]').first().click();
const defEH = await texte(page, '.definition');
verifier('Abréviation EH dépliée sur place avec sa définition', defEH.includes('échauffement Hyrox (12 min)'));
verifier('Séance Hyrox : consignes permanentes et charges affichées', (await texte(page, '.seance')).includes('Consignes permanentes') && (await texte(page, '.seance')).includes('Sled push 152 kg traîneau compris'));
verifier('Séance de plus de 60 min : rappel hydratation', (await texte(page, '.seance')).includes('500 à 750 ml par heure avec électrolytes'));

// Test wall balls
await aller(page, '#/seance/s2-sam');
await page.click('[data-action="marquer"]');
await page.fill('[data-champ="details.maxWB"]', '25');
verifier('Test WB : S proposé = 12 pour un max de 25', (await page.inputValue('#S-propose')) === '12');
await page.fill('[data-champ="details.maxWB"]', '30');
verifier('Test WB : S proposé = 15 pour un max de 30', (await page.inputValue('#S-propose')) === '15');
verifier('Test WB : S non enregistré avant validation', (await etat(page)).reperes.S === 12);
await page.click('[data-action="valider-S"]');
e = await etat(page);
verifier('Test WB : S = 15 enregistré après validation', e.reperes.S === 15 && e.reperes.maxWB === 30);
await aller(page, '#/seance/s3-mer');
verifier('« 5 × S WB » affiché « 5 × 15 WB (S) »', (await texte(page, '.seance')).includes('5 × 15 WB (S)'));

// Règle de progression seuil : S4 → S6
await aller(page, '#/seance/s4-lun');
await page.click('[data-action="marquer"]');
await page.fill('[data-champ="details.reps.0"]', '503');
await page.locator('label:has(input[name="verdict"][value="plus2"])').click();
const propSeuil = await texte(page, '[data-zone="progression"]');
if (!propSeuil.includes('S6')) { await page.screenshot({ path: join(SORTIE, 'echec-progression.png'), fullPage: true }); console.log('    URL', page.url(), 'zone :', propSeuil); }
verifier('Progression : verdict S4 appliqué à S6 (la VMA de S5 n\'en est pas une)', propSeuil.includes('S6'));
verifier('Progression : 5:02 prévu → 4:57 proposé', propSeuil.includes('5:02') && (await page.inputValue('#allure-ajustee')) === '4:57');
verifier('Progression : rien d\'enregistré avant validation', !(await etat(page)).ajustements['s6-lun']);
await page.click('[data-action="valider-ajustement"]');
e = await etat(page);
verifier('Progression : ajustement de S6 enregistré après validation', e.ajustements['s6-lun']?.allure === 297);
await aller(page, '#/seance/s6-lun');
verifier('S6 lundi affiche l\'allure ajustée 4:57', (await texte(page, '.seance')).includes('4 × 1600 m à 4:57'));
await aller(page, '#/seance/s7-lun');
verifier('S7 lundi reprend le plan (5:02)', (await texte(page, '.seance')).includes('2 × 3000 m à 5:02'));
await aller(page, '#/seance/s8-lun');
await page.click('[data-action="marquer"]');
await page.locator('label:has(input[name="verdict"][value="lachee"])').click();
verifier('Progression « lâchée » : S8 (5:00) → S9 prévu 5:03 plus lent, rien ne change', (await texte(page, '[data-zone="progression"]')).includes('rien ne change'));

// Saisie des chronos
await aller(page, '#/seance/s5-sam');
await page.click('[data-action="marquer"]');
const segS5 = { r1: '548', rameur: '420', r2: '552', farmers: '205', r3: '602', fentes: '540', r4: '600', wb: '900' };
for (const [k, v] of Object.entries(segS5)) await page.fill(`[data-champ="details.segments.${k}"]`, v);
await page.locator('label:has(input[name="rpe"][value="9"])').click();
await page.locator('[data-champ="details.segments.r1"]').dispatchEvent('change');
verifier('Chrono « 548 » normalisé en 5:48', (await page.inputValue('[data-champ="details.segments.r1"]')) === '5:48');
const zS5 = await texte(page, '[data-zone="moitie"]');
verifier('Test 2e moitié : total 44:47, comparé à 44:00 et à 47:50', zS5.includes('44:47') && zS5.includes('+0:47') && zS5.includes('−3:03'));

// Retest S9 et règle de révision
await aller(page, '#/seance/s9-sam');
await page.click('[data-action="marquer"]');
const segS9 = { r1: '535', rameur: '415', r2: '540', farmers: '150', r3: '545', fentes: '500', r4: '540', wb: '615' };
for (const [k, v] of Object.entries(segS9)) await page.fill(`[data-champ="details.segments.${k}"]`, v);
await page.locator('label:has(input[name="rpe"][value="7"])').click();
const zS9 = await texte(page, '[data-zone="moitie"]');
verifier('Retest : total 40:00 et comparaison segment par segment avec S5', zS9.includes('40:00') && zS9.includes('Semaine 5 / semaine 9') && zS9.includes('−0:13'));
e = await etat(page);
verifier('Révision : 40:00 → objectif 1h25', e.reperes.objectif === '1h25' && e.reperes.objectifSource === 'retest');
await page.fill('[data-champ="details.segments.wb"]', '1005');
e = await etat(page);
verifier('Révision : 43:50 → objectif 1h29-1h30', e.reperes.objectif === '1h29-1h30');
await page.fill('[data-champ="details.segments.wb"]', '755');
await aller(page, '#/aujourdhui');
verifier('Objectif révisé affiché sur Aujourd\'hui (1h27 pour 41:40)', (await texte(page, '.entete__course')).includes('1h27'));
await aller(page, '#/seance/s9-sam/saisie');
await page.fill('[data-champ="details.segments.wb"]', '625');
await aller(page, '#/aujourdhui');
verifier('Objectif révisé 1h25 affiché sur Aujourd\'hui (40:10)', (await texte(page, '.entete__course')).includes('1h25'));

// Hyrox : temps par tour
await aller(page, '#/seance/s6-sam');
await page.click('[data-action="marquer"]');
await page.click('[data-action="ajouter-tour"]');
await page.fill('[data-champ="details.tours.0"]', '1015');
e = await etat(page);
verifier('Séance Hyrox : tour ajouté et enregistré (10:15)', e.saisies['s6-sam'].details.tours[0] === 615);

// Séances non renseignées et navigation jour par jour
await page.goto(`${BASE}?date=2026-12-03#/aujourdhui`);
await page.waitForSelector('.entete__compte');
verifier('Ligne « séances non renseignées cette semaine » (3 déc.)', /3 séances non renseignées cette semaine/.test(await texte(page, 'main')));
await page.click('[data-action="lendemain"]');
verifier('Flèche → : vendredi 4 décembre, Repos', (await texte(page, '.navjour__date')).includes('Vendredi 4 décembre') && (await texte(page, '.carte__titre')) === 'Repos');
verifier('Vendredi : « Zéro alcool ce soir, vise 8 h de sommeil : séance clé demain »', (await texte(page, '.rappel')).includes('Zéro alcool ce soir, vise 8 h de sommeil : séance clé demain'));
await page.goto(`${BASE}?date=2026-12-09#/aujourdhui`);
await page.waitForSelector('.entete__compte');
verifier('Rappel zéro alcool affiché le 9 décembre', (await texte(page, '.rappel')).includes('Zéro alcool'));
await page.goto(`${BASE}?date=2026-10-01#/aujourdhui`);
await page.waitForSelector('.entete__compte');
verifier('Avant le programme : J-78 et « dans 4 jours »', (await texte(page, '.entete__compte')) === 'J-78' && (await texte(page, '.entete')).includes('dans 4 jours'));
await page.goto(`${BASE}?date=2026-12-20#/aujourdhui`);
await page.waitForSelector('.carte-fin');
verifier('Après la course : écran de fin', (await texte(page, '.carte-fin')).includes('Programme terminé'));

// ---------- Persistance, export, réinitialisation, import ----------
console.log('\nPersistance et sauvegarde');
const avant = await etat(page);
await page.reload();
await page.waitForSelector('.carte-fin');
const apres = await etat(page);
verifier('Rechargement : saisies conservées', JSON.stringify(apres.saisies) === JSON.stringify(avant.saisies) && Object.keys(apres.saisies).length === 7);
await page.goto(`${BASE}?date=2026-12-05#/seance/s9-sam/saisie`);
await page.waitForSelector('form.saisie');
verifier('Rechargement : chronos du retest réaffichés', (await page.inputValue('[data-champ="details.segments.r1"]')) === '5:35');

await aller(page, '#/reperes');
const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('#sauvegarde [data-action="exporter"]')]);
const nomExport = telechargement.suggestedFilename();
const cheminExport = join(SORTIE, nomExport);
await telechargement.saveAs(cheminExport);
const exporte = JSON.parse(readFileSync(cheminExport, 'utf8'));
verifier('Export : fichier hyrox-paris-sauvegarde-AAAA-MM-JJ.json', /^hyrox-paris-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/.test(nomExport), nomExport);
verifier('Export : contenu complet', exporte.application === 'hyrox-paris-2026' && Object.keys(exporte.donnees.saisies).length === 7);
verifier('Export : date du dernier export mémorisée', !!(await etat(page)).meta.dernierExport);

await page.click('[data-action="reinit-1"]');
verifier('Réinitialisation : première confirmation demandée', (await page.locator('[data-action="reinit-2"]').count()) === 1);
await page.click('[data-action="reinit-2"]');
verifier('Réinitialisation : seconde confirmation demandée', (await page.locator('[data-action="reinit-3"]').count()) === 1 && Object.keys((await etat(page)).saisies).length === 7);
await page.click('[data-action="reinit-3"]');
e = await etat(page);
verifier('Réinitialisation : données effacées', Object.keys(e.saisies).length === 0 && e.reperes.seuil === 297);

const faux = join(SORTIE, 'faux.json');
writeFileSync(faux, JSON.stringify({ application: 'autre', format: 1, donnees: {} }));
await page.setInputFiles('#fichier-import', faux);
await page.waitForTimeout(150);
verifier('Import : fichier étranger refusé', (await texte(page, '#sauvegarde')).includes('Import impossible'));
await page.setInputFiles('#fichier-import', cheminExport);
await page.waitForSelector('[data-action="import-confirmer"]');
const apercu = await texte(page, '#sauvegarde .proposition');
verifier('Import : aperçu (7 séances, date d\'export)', apercu.includes('7 séances') && apercu.includes('exporté le'));
await page.click('[data-action="import-confirmer"]');
e = await etat(page);
verifier('Import : tout est revenu (saisies, repères, ajustements)', JSON.stringify(e.saisies) === JSON.stringify(exporte.donnees.saisies) && e.reperes.seuil === 305 && e.reperes.S === 15 && e.ajustements['s6-lun']?.allure === 297);
await ctxA.close();

// ---------- B. Hors ligne ----------
console.log('\nB. Hors ligne');
const { ctx: ctxB, page: pB } = await nouveauContexte();
await pB.goto(`${BASE}?date=2026-10-05#/aujourdhui`);
await pB.waitForSelector('.entete__compte');
await pB.evaluate(async () => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
});
await ctxB.setOffline(true);
await pB.reload();
await pB.waitForSelector('.entete__compte', { timeout: 5000 }).catch(() => {});
verifier('Hors ligne : l\'appli s\'ouvre après rechargement', (await pB.locator('.entete__compte').count()) === 1 && (await texte(pB, '.carte__titre')).includes('30 min EF'));
await aller(pB, '#/seance/s1-lun');
await pB.click('[data-action="marquer"]');
await pB.locator('label:has(input[name="rpe"][value="6"])').click();
await pB.fill('[data-champ="notes"]', 'Hors ligne sur la piste');
const eB = await etat(pB);
verifier('Hors ligne : une saisie s\'enregistre', eB?.saisies['s1-lun']?.rpe === 6 && eB.saisies['s1-lun'].notes === 'Hors ligne sur la piste');
await pB.goto(`${BASE}?date=2026-10-05#/programme`).catch(() => {});
await pB.waitForSelector('.semaines', { timeout: 5000 }).catch(() => {});
verifier('Hors ligne : navigation vers une autre URL de l\'appli', (await pB.locator('.semaines').count()) === 1);
await ctxB.close();

// ---------- C. Rendu ----------
console.log('\nC. Rendu (360, 390, 768, 1280 px · clair et sombre · ?date=2026-11-28)');
const donnees = exporte.donnees;
const PAGES = [
  ['aujourdhui', '#/aujourdhui'],
  ['seance-hyrox', '#/seance/s8-sam'],
  ['saisie-retest', '#/seance/s9-sam/saisie'],
  ['programme', '#/programme'],
  ['reperes', '#/reperes'],
  ['suivi', '#/suivi'],
];

function auditPage() {
  const probl = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) probl.push(`défilement horizontal (${document.documentElement.scrollWidth} > ${vw})`);
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return false;
    const ferme = el.closest('details:not([open])');
    if (ferme && !el.closest('summary') && ferme.querySelector(':scope > summary') !== el) return false;
    return true;
  };
  const dansDefilement = (el) => el.closest('.defile, .split__liste');
  const decrire = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} « ${(el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)} »`;
  // Rectangle réellement visible : rogné par les conteneurs qui défilent (liste du programme, tableaux).
  const rectVisible = (el) => {
    let r = el.getBoundingClientRect();
    for (let c = el.parentElement?.closest('.defile, .split__liste'); c; c = c.parentElement?.closest('.defile, .split__liste')) {
      const k = c.getBoundingClientRect();
      const top = Math.max(r.top, k.top), bottom = Math.min(r.bottom, k.bottom), left = Math.max(r.left, k.left), right = Math.min(r.right, k.right);
      if (bottom <= top || right <= left) return null;
      if (top > r.top || bottom < r.bottom || left > r.left || right < r.right) return { top, bottom, left, right, width: right - left, height: bottom - top, rogne: true };
    }
    return r;
  };

  // Texte coupé : débordement d'un conteneur qui masque, ou sortie de l'écran.
  for (const el of document.querySelectorAll('main *, .onglets *, #bandeaux *')) {
    if (!visible(el) || dansDefilement(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.position !== 'fixed' && r.width > 0 && r.right > vw + 1 && !el.closest('.barre-fixe')) probl.push(`sort de l'écran : ${decrire(el)}`);
    if (['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !el.matches('.barre, .visuellement-cache, svg *')) probl.push(`texte coupé : ${decrire(el)}`);
  }

  // Zones tactiles.
  const cibles = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, summary, label.bouton')) {
    if (!visible(el) || el.closest('.visuellement-cache') || el.matches('.visuellement-cache')) continue;
    let cible = el;
    if (el.matches('input[type=checkbox]') && el.closest('label')) cible = el.closest('label');
    if (el.matches('input[type=radio]')) cible = el.closest('label') ?? el;
    if (el.matches('.abbr')) {
      const pseudo = getComputedStyle(el, '::after');
      if (parseFloat(pseudo.height) < 44 || parseFloat(pseudo.width) < 44) probl.push(`abréviation sous 44 px : ${decrire(el)}`);
      continue;
    }
    const enLigne = el.matches('a') && getComputedStyle(el).display === 'inline' && el.closest('p, li, td, dd') && !el.closest('.discret, .journal');
    if (enLigne) continue;
    const r = rectVisible(cible);
    if (!r) continue;
    if (!r.rogne && (r.width < 43.5 || r.height < 43.5)) probl.push(`zone tactile ${Math.round(r.width)}×${Math.round(r.height)} : ${decrire(el)}`);
    cibles.push({ el: cible, r });
  }
  // Espacement de 8 px entre zones tactiles voisines (hors chevauchement : élément contenu dans un autre).
  for (let i = 0; i < cibles.length; i++) {
    for (let j = i + 1; j < cibles.length; j++) {
      const a = cibles[i], b = cibles[j];
      if (a.el.contains(b.el) || b.el.contains(a.el) || a.el === b.el) continue;
      const fixeA = !!a.el.closest('.barre-fixe, .onglets'), fixeB = !!b.el.closest('.barre-fixe, .onglets');
      if (fixeA !== fixeB) continue; // les barres fixes passent au-dessus du contenu qui défile
      const dx = Math.max(0, b.r.left - a.r.right, a.r.left - b.r.right);
      const dy = Math.max(0, b.r.top - a.r.bottom, a.r.top - b.r.bottom);
      const ecart = Math.max(dx, dy);
      if (ecart < 7.5) probl.push(`espacement ${ecart.toFixed(0)} px : ${decrire(a.el)} / ${decrire(b.el)}`);
    }
  }

  // Contraste du texte (AA) : couleur du texte contre le premier fond opaque.
  const rgb = (c) => {
    const m = c.match(/[\d.]+/g)?.map(Number);
    if (!m) return [0, 0, 0, 0];
    return c.startsWith('color(srgb') ? [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1] : m;
  };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fond = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if ((c[3] ?? 1) > 0.9 && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') return c;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  };
  let mini = 99, pire = '';
  for (const el of document.querySelectorAll('main *, .onglets *, #bandeaux *')) {
    if (!visible(el) || el.closest('svg')) continue;
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() && !/^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(n.textContent));
    if (!direct) continue;
    if (el.closest('.barre-action') && getComputedStyle(el.closest('.barre-action')).position === 'fixed' && !el.closest('.bouton')) continue;
    const cs = getComputedStyle(el);
    const ratio = (() => { const a = lum(rgb(cs.color)), b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })();
    const taille = parseFloat(cs.fontSize), gras = Number(cs.fontWeight) >= 700;
    const seuil = taille >= 24 || (taille >= 18.66 && gras) ? 3 : 4.5;
    if (ratio < seuil) probl.push(`contraste ${ratio.toFixed(2)} < ${seuil} : ${decrire(el)}`);
    if (ratio < mini) { mini = ratio; pire = decrire(el); }
  }
  return { probl: [...new Set(probl)], contrasteMini: `${mini.toFixed(2)} (${pire})` };
}

const synthese = [];
for (const largeur of [360, 390, 768, 1280]) {
  for (const theme of ['light', 'dark']) {
    const mobile = largeur < 768;
    const { ctx, page: p } = await nouveauContexte({ viewport: { width: largeur, height: largeur >= 1024 ? 900 : 800 }, colorScheme: theme, isMobile: mobile, hasTouch: largeur < 1024 });
    await ctx.addInitScript(([cle, d]) => { if (!localStorage.getItem(cle)) localStorage.setItem(cle, JSON.stringify(d)); }, [CLE, donnees]);
    await ctx.addInitScript(() => localStorage.setItem('hyrox-paris-2026:theme', 'auto')); // clair et sombre suivent le navigateur
    await p.goto(`${BASE}?date=2026-11-28#/aujourdhui`);
    await p.waitForSelector('.entete__compte');
    for (const [nom, hash] of PAGES) {
      await aller(p, hash);
      await p.waitForTimeout(150);
      if (nom === 'seance-hyrox') await p.locator('.seance .abbr[data-terme="J-court"], .seance .abbr').first().click().catch(() => {});
      if (nom === 'reperes') for (const d of await p.locator('details.repliable').all()) await d.evaluate((x) => { x.open = true; });
      const audit = await p.evaluate(auditPage);
      await p.screenshot({ path: join(SORTIE, `${nom}-${largeur}-${theme === 'light' ? 'clair' : 'sombre'}.png`), fullPage: true });
      synthese.push({ largeur, theme, nom, ...audit });
      verifier(`${largeur} px ${theme === 'light' ? 'clair' : 'sombre'} · ${nom}`, audit.probl.length === 0, audit.probl.slice(0, 6).join(' | '));
    }
    await ctx.close();
  }
}
writeFileSync(join(SORTIE, 'audit-rendu.json'), JSON.stringify(synthese, null, 2));
const pireContraste = synthese.map((s) => s.contrasteMini).sort((a, b) => parseFloat(a) - parseFloat(b))[0];
console.log(`\nContraste minimal mesuré : ${pireContraste}`);

verifier('Aucune erreur dans la console', erreursConsole.length === 0, erreursConsole.slice(0, 5).join(' | '));
await navigateur.close();
console.log(`\n${bilan.ok}/${bilan.ok + bilan.echecs.length} vérifications réussies`);
if (bilan.echecs.length) { console.log(`Échecs :\n- ${bilan.echecs.join('\n- ')}`); process.exit(1); }
