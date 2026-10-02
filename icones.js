// icones.js — pictogrammes SVG au trait (24 × 24, trait 2), dessinés dans l'esprit de Lucide.
// Remplacent les emoji : rendu identique sur iPhone et Android, couleurs pilotées par le CSS.

const P = {
  // Types de séance
  eclair: '<path d="M13 2 4 13.5h7.5L10.5 22 20 10.5h-7.5z"/>',
  pas: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4M4 13h4"/>',
  haltere: '<rect x="5" y="6" width="3.5" height="12" rx="1.2"/><rect x="15.5" y="6" width="3.5" height="12" rx="1.2"/><path d="M2.5 9.5v5M21.5 9.5v5M8.5 12h7"/>',
  traction: '<path d="M2 8h20"/><circle cx="12" cy="4.5" r="2.2"/><path d="m6.5 8 3.5 4.5M17.5 8 14 12.5"/><path d="M10 12.5h4l-.6 4.5h-2.8z"/><path d="m11 17-.5 4.5M13 17l.5 4.5"/>',
  chrono: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
  drapeau: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  lune: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  // Stations
  montagne: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/>',
  pousse: '<path d="M2.5 19h13a3 3 0 0 0 3-3"/><path d="M4.5 19v-5h9v5"/><path d="M12 7h9M18 4l3 3-3 3"/>',
  tire: '<path d="M8.5 19h13M8.5 19a3 3 0 0 1-3-3"/><path d="M10.5 19v-5h9v5"/><path d="M12 7H3M6 4 3 7l3 3"/>',
  saut: '<path d="M3 20.5h18"/><path d="M4.5 17C6 9.5 14.5 7.5 18 15"/><path d="m14.6 14.2 3.4 1 1-3.4"/>',
  vagues: '<path d="M2 7c.6.5 1.2 1 2.5 1C7 8 7 6 9.5 6c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12.5c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  kettlebells: '<circle cx="6" cy="17" r="4"/><path d="M3.6 13.8V10a2.4 2.4 0 0 1 4.8 0v3.8"/><circle cx="18" cy="17" r="4"/><path d="M15.6 13.8V10a2.4 2.4 0 0 1 4.8 0v3.8"/>',
  fente: '<circle cx="12.5" cy="4" r="2"/><path d="m12.2 6.5-.7 5.5 5 3v5.5"/><path d="m11.5 12-4 4.5-4.5 1.5"/><path d="M8.5 9.5h7"/>',
  ballon: '<circle cx="12" cy="16" r="5.5"/><path d="M6.8 14.2c3.2 1.2 7.2 1.2 10.4 0M12 2v6M9 5l3-3 3 3"/>',
  kettlebell: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10.2V7a3.5 3.5 0 0 1 7 0v3.2"/>',
  // Sections et repères
  flamme: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  liste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  vent: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
  horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  cible: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  goutte: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  point: '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
  baisse: '<path d="M22 17 13.5 8.5l-5 5L2 7"/><path d="M16 17h6v-6"/>',
  hausse: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>',
  lieu: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  coeur: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  punaise: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  calendrier: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  regle: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
  boucle: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  disquette: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  carte: '<path d="M14.1 5.55a2 2 0 0 0 1.8 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.56 2.27a2 2 0 0 1-1.78 0l-4.22-2.1a2 2 0 0 0-1.78 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.56-2.27a2 2 0 0 1 1.78 0z"/><path d="M15 5.76v15M9 3.24v15"/>',
  fiole: '<path d="M10 2v7.53a2 2 0 0 1-.21.9L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.07-10.13A2 2 0 0 1 14 9.53V2"/><path d="M8.5 2h7M7 16h10"/>',
  loupe: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  lien: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  reglages: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  interdit: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  coche: '<path d="M20 6 9 17l-5-5"/>',
  croix: '<path d="M18 6 6 18M6 6l12 12"/>',
  telephone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
};

/** Couleur d'accompagnement de chaque pictogramme (voir .tuile[data-teinte] dans styles.css). */
const TEINTE = {
  eclair: 'orange', pas: 'vert', haltere: 'bleu', traction: 'violet', chrono: 'orange', drapeau: 'orange', lune: 'nuit',
  montagne: 'ambre', pousse: 'ambre', tire: 'ambre', saut: 'ambre', vagues: 'ambre', kettlebells: 'ambre', fente: 'ambre', ballon: 'ambre', kettlebell: 'ambre',
  flamme: 'orange', liste: 'bleu', vent: 'vert', horloge: 'neutre', cible: 'rose', goutte: 'bleu', coeur: 'rose', interdit: 'rose',
  fiole: 'violet', reglages: 'violet', calendrier: 'bleu', hausse: 'vert', baisse: 'orange', telephone: 'orange', coche: 'vert',
};

export function svg(nom, taille = 24) {
  const corps = P[nom] ?? P.point;
  return `<svg viewBox="0 0 24 24" width="${taille}" height="${taille}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${corps}</svg>`;
}

export const teinte = (nom) => TEINTE[nom] ?? 'neutre';
export const NOMS = Object.keys(P);
