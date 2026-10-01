#!/usr/bin/env bash
# Republie l'appli en une commande :  ./deployer.sh "message facultatif"
# Incrémente la version du cache du service worker (sw.js), vérifie les tests, commit et pousse.
# Les téléphones afficheront « Nouvelle version disponible — Recharger ».
set -euo pipefail
cd "$(dirname "$0")"

message="${1:-Mise à jour}"
actuelle=$(sed -n "s/^const VERSION = 'v\([0-9][0-9]*\)';$/\1/p" sw.js)
if [ -z "$actuelle" ]; then
  echo "Ligne « const VERSION = 'vN'; » introuvable dans sw.js." >&2
  exit 1
fi
suivante=$((actuelle + 1))
sed -i.bak "s/^const VERSION = 'v$actuelle';$/const VERSION = 'v$suivante';/" sw.js
rm -f sw.js.bak

if command -v node > /dev/null; then
  if ! node tests/calculs.test.mjs > /dev/null || ! node tests/fidelite.mjs > /dev/null; then
    echo "Tests en échec : publication annulée (lance node tests/calculs.test.mjs et node tests/fidelite.mjs)." >&2
    git checkout -- sw.js
    exit 1
  fi
fi

git add -A
git commit -m "$message (cache v$suivante)"
git push
echo "Publié avec le cache v$suivante. GitHub Pages se met à jour en une minute environ."
