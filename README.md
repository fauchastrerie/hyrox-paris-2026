# Prépa Paris — 18 décembre 2026

Appli web de suivi du programme d'entraînement (11 semaines, du lundi 5 octobre au vendredi 18 décembre 2026), pensée pour le téléphone. HTML, CSS et JavaScript sans framework ni étape de build : elle marche hors ligne une fois ouverte, et se modifie avec un simple éditeur de texte.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html`, `styles.css` | Page et mise en forme (mobile d'abord ; thème sombre par défaut, clair ou « comme le téléphone » dans Repères) |
| `app.js` | Navigation, rendu des écrans, saisies |
| `programme.js` | Le programme, transcrit tel quel (source unique du contenu des séances) |
| `calculs.js` | Dates, allures, chronos, règles du programme (fonctions pures) |
| `stockage.js` | Enregistrement local, export, import |
| `icones.js` | Pictogrammes SVG au trait (types de séance, stations, sections), teintés par le CSS |
| `polices/` | Barlow Condensed 700 et 800 (titres et grands chiffres), hébergée ici pour marcher hors ligne · licence OFL |
| `sw.js`, `manifest.webmanifest`, `icons/` | Fonctionnement hors ligne et installation sur l'écran d'accueil |
| `tests/` | Tests des calculs, contrôle de fidélité au programme, vérifications dans le navigateur |
| `outils/generer-icones.mjs` | Régénère les icônes (`node outils/generer-icones.mjs`) |

## Lancer en local

```sh
python -m http.server 8765
```

Puis ouvrir <http://127.0.0.1:8765/>. Pour tester un autre jour sans toucher aux données : <http://127.0.0.1:8765/?date=2026-11-28>.

## Tests

```sh
node tests/calculs.test.mjs   # dates, allures, chronos, règles
node tests/fidelite.mjs       # programme.js comparé au texte du programme : zéro écart attendu
```

Vérifications dans un navigateur headless (parcours de saisie, hors ligne, persistance, rendu à 360, 390, 768 et 1280 px) :

```sh
python -m http.server 8765 &
npm install --no-save playwright@1.63.0
npx playwright install chromium
node tests/navigateur.mjs captures
```

## Modifier le programme

Le texte des séances est dans `programme.js`. Les allures seuil et VMA n'y sont jamais écrites en dur : ce sont des jetons (`{seuil-3}`, `{vma400}`…) calculés à partir de tes repères. Après une modification, `node tests/fidelite.mjs` liste les écarts avec `tests/programme-source.md` (copie du programme d'origine) : si le changement est voulu, reporte-le aussi dans ce fichier.

## Déployer

L'appli est servie par GitHub Pages depuis la branche `main`, à la racine. Pour republier après une modification :

```sh
./deployer.sh "ce qui a changé"
```

Le script incrémente la version du cache du service worker, lance les tests, commit et pousse. À la prochaine ouverture, le téléphone affiche « Nouvelle version disponible — Recharger ».

## Sauvegarder ses données

Les saisies ne quittent jamais le téléphone : elles sont dans le stockage local du navigateur (clé `hyrox-paris-2026:v1`), enregistrées à chaque modification. Le dépôt public ne contient que le code et le programme.

- **Exporter** (écran Repères → Sauvegarde) : crée `hyrox-paris-sauvegarde-AAAA-MM-JJ.json`, envoyé par la feuille de partage du téléphone (Fichiers, e-mail…) ou téléchargé.
- **Importer** : choisir un fichier exporté, vérifier l'aperçu, confirmer. Les données actuelles sont remplacées.
- Exporte au moins une fois par semaine : Safari peut effacer les données d'un site non ajouté à l'écran d'accueil, et un changement de téléphone efface tout. L'appli le rappelle quand le dernier export date de plus de 7 jours.

## Installer sur le téléphone

- **iPhone** (Safari) : Partager → Sur l'écran d'accueil.
- **Android** (Chrome) : menu ⋮ → Installer l'application.
