// sw.js — service worker : fichiers de l'appli servis depuis le cache d'abord, pour marcher hors ligne.
// deployer.sh incrémente VERSION à chaque publication : le nouveau cache s'installe en attente
// et l'appli affiche « Nouvelle version disponible — Recharger ».

const VERSION = 'v2';
const PREFIXE = 'prepa-paris-';
const CACHE = `${PREFIXE}${VERSION}`;
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './programme.js',
  './calculs.js',
  './stockage.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' contourne le cache HTTP de GitHub Pages (10 min) pour prendre la nouvelle version.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const cle of await caches.keys()) {
      if (cle.startsWith(PREFIXE) && cle !== CACHE) await caches.delete(cle);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (requete.mode === 'navigate') {
    // Toute navigation (avec ou sans ?date=) ouvre la page de l'appli en cache.
    event.respondWith((async () => (await caches.match('./index.html', { cacheName: CACHE })) ?? fetch(requete))());
    return;
  }

  event.respondWith((async () => {
    const enCache = await caches.match(requete, { cacheName: CACHE, ignoreSearch: true });
    if (enCache) return enCache;
    const reponse = await fetch(requete);
    if (reponse.ok && reponse.type === 'basic') {
      const copie = reponse.clone();
      caches.open(CACHE).then((cache) => cache.put(requete, copie));
    }
    return reponse;
  })());
});
