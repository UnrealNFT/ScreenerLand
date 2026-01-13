# Guide de déploiement - Fix montant CTO (10 → 1000 CSPR)

## Problème identifié
Le backend stockait le montant des paiements CTO comme **10 CSPR** au lieu de **1000 CSPR** dans la base de données, même si l'utilisateur payait réellement 1000 CSPR sur la blockchain.

### Cause
Dans `backend/server.js` ligne 4219, le montant était hardcodé à `10` au lieu de `1000`:
```javascript
// AVANT (BUG)
const result = await storiesDB.query(insertQuery, [
  cleanTokenHash,
  cleanWallet,
  10, // ❌ Bug: hardcodé à 10 au lieu de 1000
  cleanDeploy,
  networkName.toLowerCase()
])

// APRÈS (FIX)
const CTO_PRICE = 1000
const result = await storiesDB.query(insertQuery, [
  cleanTokenHash,
  cleanWallet,
  CTO_PRICE, // ✅ 1000 CSPR
  cleanDeploy,
  networkName.toLowerCase()
])
```

## Étapes de déploiement sur Hetzner

### 1. Se connecter au serveur VPS Hetzner
```bash
ssh root@<IP_HETZNER>
```

### 2. Naviguer vers le dossier backend
```bash
cd /root/screenerfun/backend
# ou le chemin où le backend est installé
```

### 3. Arrêter le serveur backend (PM2)
```bash
pm2 stop backend
# ou
pm2 stop screenerfun-backend
# ou
pm2 stop all
```

### 4. Sauvegarder la version actuelle (optionnel mais recommandé)
```bash
git branch backup-before-cto-fix
```

### 5. Récupérer la dernière version depuis GitHub
```bash
git pull origin main
```

Vous devriez voir:
```
remote: Resolving deltas: 100% (3/3), completed with 3 local objects.
From https://github.com/UnrealNFT/ScreenerLand
   c0b4a4e..4c40368  main -> main
Updating c0b4a4e..4c40368
Fast-forward
 backend/fix_cto_amount.js  | 95 +++++++++++++++++++++++++++++++++++
 backend/fix_cto_amount.sql | 28 +++++++++++
 backend/server.js          |  4 +-
 3 files changed, 125 insertions(+), 2 deletions(-)
 create mode 100644 backend/fix_cto_amount.js
 create mode 100644 backend/fix_cto_amount.sql
```

### 6. Corriger les enregistrements existants dans la base de données

**Option A: Via script Node.js (recommandé)**
```bash
cd backend
node fix_cto_amount.js
```

Cela va:
1. Se connecter à PostgreSQL
2. Afficher tous les enregistrements avec `paid_amount = 10`
3. Les mettre à jour à `1000 CSPR`
4. Afficher un rapport de confirmation

**Option B: Via SQL direct (si Node.js ne fonctionne pas)**
```bash
psql -U postgres -d screenerfun -f backend/fix_cto_amount.sql
# ou avec l'utilisateur/mot de passe de votre DB
psql -U <DB_USER> -d <DB_NAME> -f backend/fix_cto_amount.sql
```

### 7. Redémarrer le serveur backend
```bash
pm2 restart backend
# ou
pm2 restart screenerfun-backend
```

### 8. Vérifier que le serveur fonctionne
```bash
pm2 logs backend --lines 20
```

Vous devriez voir:
```
🚀 Backend server running on http://localhost:5000
✅ Database ready
📡 Proxying cspr.cloud API requests
```

### 9. Vérifier la correction dans la base de données
```bash
psql -U postgres -d screenerfun -c "SELECT token_hash, wallet_address, paid_amount, network, granted_at FROM cto_access ORDER BY granted_at DESC LIMIT 5;"
```

Tous les montants devraient maintenant afficher **1000** CSPR.

## Vérification côté frontend (ScreenerLand.com)

1. Aller sur [ScreenerLand.com](https://screenerland.com)
2. Se connecter avec le wallet qui a payé le CTO
3. Aller sur la page de profil (icône wallet en haut à droite)
4. Vérifier que l'historique CTO affiche maintenant **"1000 CSPR"** au lieu de **"10 CSPR"**

## Configuration des variables d'environnement

Si le script `fix_cto_amount.js` ne trouve pas la base de données, vérifiez les variables d'environnement:

```bash
# Vérifier les variables actuelles
pm2 env backend

# Ou créer un fichier .env dans backend/
cd /root/screenerfun/backend
nano .env
```

Contenu du fichier `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=screenerfun
DB_USER=postgres
DB_PASSWORD=<votre_mot_de_passe>
DB_SSL=false
```

## Rollback (en cas de problème)

Si quelque chose ne va pas, revenir à la version précédente:

```bash
# Arrêter le serveur
pm2 stop backend

# Revenir au commit précédent
git checkout c0b4a4e

# Redémarrer
pm2 restart backend
```

## Notes importantes

- ⚠️ Ce fix affecte UNIQUEMENT les **nouveaux paiements CTO** (après le déploiement)
- ✅ Le script `fix_cto_amount.js` corrige les **enregistrements existants** dans la DB
- 🔒 Les utilisateurs ayant déjà payé 1000 CSPR verront maintenant le montant correct (1000 au lieu de 10)
- 📊 La blockchain conserve la preuve du paiement réel de 1000 CSPR (vérifié via le transaction hash)

## Transaction de référence

L'utilisateur qui a signalé le bug a payé:
- **Montant réel sur blockchain**: 1000 CSPR
- **Montant stocké en DB (avant fix)**: 10 CSPR
- **TX Hash**: `122c0950922e446dc7c6040c03d2f2efb90fa49d99fa9d9c1dbee31b8ee9e928`
- **Lien**: https://cspr.live/deploy/122c0950922e446dc7c6040c03d2f2efb90fa49d99fa9d9c1dbee31b8ee9e928

## Questions / Support

En cas de problème, contactez le développeur ou vérifiez les logs:
```bash
pm2 logs backend --lines 100
```
