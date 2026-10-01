// Tests de calculs.js — sans bibliothèque :  node tests/calculs.test.mjs
// Les tests de dates tournent dans plusieurs fuseaux, dont Europe/Paris
// (passage à l'heure d'hiver le dimanche 25 octobre 2026).

import assert from 'node:assert/strict';
import * as C from '../calculs.js';
import { SEMAINES, DEBUT, DATE_COURSE, SEANCES_SEUIL } from '../programme.js';

let ok = 0;
const echecs = [];
function test(nom, fn) {
  try { fn(); ok++; console.log(`  ✓ ${nom}`); }
  catch (e) { echecs.push(nom); console.log(`  ✗ ${nom}\n      ${e.message.split('\n').join('\n      ')}`); }
}

const JOURS = new Map(SEMAINES.flatMap((s) => s.jours).map((j) => [j.id, j]));
const jourDe = (iso) => {
  const s = C.situer(iso, DEBUT, DATE_COURSE);
  return { s, j: s.id ? JOURS.get(s.id) : null };
};

for (const tz of ['Europe/Paris', 'UTC', 'America/New_York', 'Pacific/Auckland']) {
  process.env.TZ = tz;
  console.log(`\nDates (TZ=${tz})`);
  test('2026-10-01 → avant le programme, J-78 avant la course', () => {
    const { s } = jourDe('2026-10-01');
    assert.equal(s.periode, 'avant');
    assert.equal(s.jMoins, 78);
    assert.equal(s.joursAvantDebut, 4);
  });
  test('2026-10-05 → semaine 1, lundi, Cardio/run 1', () => {
    const { s, j } = jourDe('2026-10-05');
    assert.deepEqual([s.semaine, s.jour, j.type], [1, 'lun', 'run1']);
  });
  test('2026-10-09 → semaine 1, vendredi, Repos', () => {
    const { s, j } = jourDe('2026-10-09');
    assert.deepEqual([s.semaine, s.jour, j.type], [1, 'ven', 'repos']);
  });
  test('2026-10-25 (changement d\'heure) → semaine 3, dimanche, Repos', () => {
    const { s, j } = jourDe('2026-10-25');
    assert.deepEqual([s.semaine, s.jour, j.type], [3, 'dim', 'repos']);
    assert.equal(C.jourSemaine('2026-10-25'), 'dim');
    assert.equal(C.ajouterJours('2026-10-25', 1), '2026-10-26');
    assert.equal(C.ecartJours('2026-10-24', '2026-10-26'), 2);
  });
  test('2026-10-26 → semaine 4, lundi, Cardio/run 1', () => {
    const { s, j } = jourDe('2026-10-26');
    assert.deepEqual([s.semaine, s.jour, j.type], [4, 'lun', 'run1']);
  });
  test('2026-12-16 → semaine 11, mercredi, Pull', () => {
    const { s, j } = jourDe('2026-12-16');
    assert.deepEqual([s.semaine, s.jour, j.type], [11, 'mer', 'pull']);
  });
  test('2026-12-17 → semaine 11, jeudi, Cardio/run 2 (déblocage)', () => {
    const { s, j } = jourDe('2026-12-17');
    assert.deepEqual([s.semaine, s.jour, j.type], [11, 'jeu', 'run2']);
    assert.match(j.titre, /^Déblocage/);
  });
  test('2026-12-18 → semaine 11, vendredi, Course', () => {
    const { s, j } = jourDe('2026-12-18');
    assert.deepEqual([s.semaine, s.jour, j.type, s.jMoins], [11, 'ven', 'course', 0]);
  });
  test('2026-12-19 → après la course', () => {
    assert.equal(jourDe('2026-12-19').s.periode, 'apres');
  });
  test('dates du programme cohérentes avec le calendrier', () => {
    for (const sem of SEMAINES) {
      assert.equal(sem.debut, C.ajouterJours(DEBUT, 7 * (sem.numero - 1)));
      for (const j of sem.jours) {
        assert.equal(C.jourSemaine(j.date), j.jour, j.id);
        assert.equal(C.situer(j.date, DEBUT, DATE_COURSE).id, j.id, j.id);
      }
    }
  });
}

console.log('\nProgramme');
test('nombre de séances hors repos : 55', () => {
  const n = SEMAINES.flatMap((s) => s.jours).filter((j) => j.type !== 'repos').length;
  assert.equal(n, 55);
});
test('identifiants s{semaine}-{jour} uniques', () => {
  const ids = SEMAINES.flatMap((s) => s.jours.map((j) => j.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^s(\d|1[01])-(lun|mar|mer|jeu|ven|sam|dim)$/);
});
test('semaine 11 : lun run1, mar push, mer pull, jeu run2, ven course', () => {
  assert.deepEqual(SEMAINES[10].jours.map((j) => j.type), ['run1', 'push', 'pull', 'run2', 'course']);
});

console.log('\nAllures');
const allure = (id, seuil) => C.formatMinSec(C.allureEnVigueur(JOURS.get(id), seuil));
test('seuil 4:57 → s3-lun 4:57, s6-lun 4:54, s8-lun 4:52, 400 m de s5-lun 1:45', () => {
  assert.deepEqual([allure('s3-lun', 297), allure('s6-lun', 297), allure('s8-lun', 297), C.formatMinSec(C.temps400(297))], ['4:57', '4:54', '4:52', '1:45']);
});
test('seuil 5:05 → s3-lun 5:05, s6-lun 5:02, s8-lun 5:00, 400 m de s5-lun 1:48', () => {
  assert.deepEqual([allure('s3-lun', 305), allure('s6-lun', 305), allure('s8-lun', 305), C.formatMinSec(C.temps400(305))], ['5:05', '5:02', '5:00', '1:48']);
});
test('texte affiché : jetons remplacés par les valeurs du repère', () => {
  const ctx = { seuil: 305, S: 15, fcSeuil: null };
  assert.equal(C.texteAvecValeurs(JOURS.get('s8-lun').corps, ctx), '6 × 1000 m à 5:00, récup 1:15.');
  assert.equal(C.texteAvecValeurs(JOURS.get('s5-lun').corps, ctx), '10 × 400 m en 1:48, récup 1:15 en trottinant.');
  assert.match(C.texteAvecValeurs(JOURS.get('s3-mer').corps, ctx), /puis 5 × 15 WB \(S\), récup 40 s\./);
  assert.match(C.texteAvecValeurs(JOURS.get('s3-sam').corps, ctx), /60 WB en séries de 15 \(S\)\./);
});
test('EF : texte du programme puis « FC < X bpm » une fois la FC seuil saisie', () => {
  assert.equal(C.resoudreJeton('ef', { seuil: 297, fcSeuil: null }), 'FC sous 85 % de ta FC seuil');
  assert.equal(C.resoudreJeton('ef', { seuil: 297, fcSeuil: 176 }), 'FC < 150 bpm');
  assert.equal(C.plafondEF(176), 150);
});
test('ajustement validé : ne concerne que la séance ajustée', () => {
  const aj = { 's6-lun': { allure: 289 } };
  assert.equal(C.formatMinSec(C.allureEnVigueur(JOURS.get('s6-lun'), 297, aj)), '4:49');
  assert.equal(C.formatMinSec(C.allureEnVigueur(JOURS.get('s7-lun'), 297, aj)), '4:54');
});
test('séance seuil suivante : s4-lun → s6-lun (la VMA de S5 n\'en est pas une), s10-lun → aucune', () => {
  assert.equal(C.seanceSeuilSuivante('s4-lun', SEANCES_SEUIL), 's6-lun');
  assert.equal(C.seanceSeuilSuivante('s3-lun', SEANCES_SEUIL), 's4-lun');
  assert.equal(C.seanceSeuilSuivante('s10-lun', SEANCES_SEUIL), null);
  assert.deepEqual(SEANCES_SEUIL, ['s3-lun', 's4-lun', 's6-lun', 's7-lun', 's8-lun', 's9-lun', 's10-lun']);
});
test('règle de progression : +2 rép. → −5 s/km ; lâchée → la plus lente ; tenue → rien', () => {
  assert.equal(C.propositionSeuil('plus2', 297, 294), 289);
  assert.equal(C.propositionSeuil('lachee', 297, 294), 297);
  assert.equal(C.propositionSeuil('lachee', 292, 295), 295);
  assert.equal(C.propositionSeuil('tenue', 297, 294), null);
});

console.log('\nWall balls');
test('max WB 25 → S = 12 ; max WB 30 → S = 15', () => {
  assert.equal(C.tailleSerie(25), 12);
  assert.equal(C.tailleSerie(30), 15);
});

console.log('\nRévision de l\'objectif');
test('40:30 → 1h25 ; 40:31 → 1h27 ; 43:00 → 1h27 ; 43:01 → 1h29-1h30', () => {
  assert.equal(C.reviserObjectif(C.lireChrono('40:30')), '1h25');
  assert.equal(C.reviserObjectif(C.lireChrono('40:31')), '1h27');
  assert.equal(C.reviserObjectif(C.lireChrono('43:00')), '1h27');
  assert.equal(C.reviserObjectif(C.lireChrono('43:01')), '1h29-1h30');
});
test('objectif lu en secondes et écart à la fourchette', () => {
  assert.deepEqual(C.lireObjectif('1h27'), { min: 5220, max: 5220 });
  assert.deepEqual(C.lireObjectif('1h29-1h30'), { min: 5340, max: 5400 });
  assert.equal(C.lireObjectif('87'), null);
  assert.equal(C.ecartObjectif(5370, C.lireObjectif('1h29-1h30')), 0);
  assert.equal(C.ecartObjectif(5232, C.lireObjectif('1h27')), 12);
});

console.log('\nChronos');
test('« 445 » → 285 s ; « 4:45 » → 285 s ; « 1205 » → 725 s ; « 12:05 » → 725 s', () => {
  assert.equal(C.lireChrono('445'), 285);
  assert.equal(C.lireChrono('4:45'), 285);
  assert.equal(C.lireChrono('1205'), 725);
  assert.equal(C.lireChrono('12:05'), 725);
});
test('« 4.45 » et « 4,45 » → 285 s ; h:mm:ss ; saisies invalides → null', () => {
  assert.equal(C.lireChrono('4.45'), 285);
  assert.equal(C.lireChrono('4,45'), 285);
  assert.equal(C.lireChrono(' 4:45 '), 285);
  assert.equal(C.lireChrono('1:27:30'), 5250);
  assert.equal(C.lireChrono('12730'), 5250);
  for (const t of ['', '4:75', '475', '4:5', 'abc', '1:2:3', null]) assert.equal(C.lireChrono(t), null, String(t));
});
test('affichage m:ss sans zéro initial, écart signé', () => {
  assert.equal(C.formatMinSec(297), '4:57');
  assert.equal(C.formatMinSec(105), '1:45');
  assert.equal(C.formatMinSec(725), '12:05');
  assert.equal(C.formatChrono(5757), '1:35:57');
  assert.equal(C.formatEcart(12), '+0:12');
  assert.equal(C.formatEcart(-8), '−0:08');
  assert.equal(C.formatEcart(0), '±0:00');
});
test('simulation : moyenne des runs, dérive R5-R8, WB à 7:15 maximum', () => {
  const runs = [340, 345, 350, 346, 344, 349, 352, 358];
  const a = C.analyseSimulation(runs, 430);
  assert.equal(a.plusLentR5R8, 358);
  assert.equal(a.derive, 13);
  assert.equal(a.wbOk, true);
  assert.equal(C.analyseSimulation(runs, 436).wbOk, false);
});

console.log(`\n${ok}/${ok + echecs.length} tests réussis`);
if (echecs.length) { console.log(`Échecs : ${echecs.join(' ; ')}`); process.exit(1); }
