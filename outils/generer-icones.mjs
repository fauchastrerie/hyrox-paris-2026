// Génère les icônes de l'appli dans icons/ — node outils/generer-icones.mjs
// Sans dépendance : rastérisation avec suréchantillonnage 4×4 et encodeur PNG (zlib de node).
// Motif original : un chronomètre stylisé (anneau, poussoir, aiguille).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOSSIER = fileURLToPath(new URL('../icons/', import.meta.url));
const FOND = [20, 23, 28];
const ACCENT = [255, 122, 69];
const CLAIR = [243, 244, 246];

// ---------- PNG ----------
const TABLE_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(taille, rgba) {
  const brut = Buffer.alloc((taille * 4 + 1) * taille);
  for (let y = 0; y < taille; y++) {
    brut[y * (taille * 4 + 1)] = 0;
    rgba.copy(brut, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(brut, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Formes (coordonnées normalisées 0..1) ----------
const dansCarreArrondi = (x, y, r) => {
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  return dx * dx + dy * dy <= r * r;
};
const distSegment = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
};

function motif(x, y, echelle) {
  // Ramène le point dans le repère du motif (centré, mis à l'échelle).
  const u = 0.5 + (x - 0.5) / echelle;
  const v = 0.5 + (y - 0.5) / echelle;
  const cx = 0.5, cy = 0.55, R = 0.31, ep = 0.075;
  const d = Math.hypot(u - cx, v - cy);
  if (d <= 0.048) return ACCENT; // moyeu
  const angle = (-50 * Math.PI) / 180; // aiguille vers 1 h 30
  const bx = cx + Math.sin(-angle) * 0.2, by = cy - Math.cos(angle) * 0.2;
  if (distSegment(u, v, cx, cy, bx, by) <= 0.03) return CLAIR;
  if (Math.abs(d - (R - ep / 2)) <= ep / 2) return ACCENT; // anneau
  const haut = cy - R;
  if (Math.abs(u - cx) <= 0.032 && v >= haut - 0.07 && v <= haut + 0.01) return ACCENT; // tige
  if (Math.abs(u - cx) <= 0.085 && v >= haut - 0.115 && v <= haut - 0.06) return ACCENT; // poussoir
  // repères à 3 h et 9 h
  if (Math.abs(v - cy) <= 0.018 && (Math.abs(u - (cx + R - ep - 0.045)) <= 0.03 || Math.abs(u - (cx - R + ep + 0.045)) <= 0.03)) return CLAIR;
  return null;
}

function icone(taille, { arrondi, echelle }) {
  const px = Buffer.alloc(taille * taille * 4);
  const N = 4;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (x + (sx + 0.5) / N) / taille;
          const v = (y + (sy + 0.5) / N) / taille;
          if (arrondi && !dansCarreArrondi(u, v, arrondi)) continue;
          const c = motif(u, v, echelle) ?? FOND;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * taille + x) * 4;
      if (a) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
      px[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return png(taille, px);
}

mkdirSync(DOSSIER, { recursive: true });
const sorties = {
  'icon-192.png': icone(192, { arrondi: 0.22, echelle: 1 }),
  'icon-512.png': icone(512, { arrondi: 0.22, echelle: 1 }),
  // Masquable : fond plein et motif dans la zone sûre (cercle central de 80 %).
  'icon-maskable-512.png': icone(512, { arrondi: 0, echelle: 0.74 }),
  // iOS arrondit lui-même les coins et remplit la transparence en noir : fond plein.
  'apple-touch-icon.png': icone(180, { arrondi: 0, echelle: 0.92 }),
};
for (const [nom, buf] of Object.entries(sorties)) {
  writeFileSync(DOSSIER + nom, buf);
  console.log(`icons/${nom} — ${buf.length} octets`);
}
