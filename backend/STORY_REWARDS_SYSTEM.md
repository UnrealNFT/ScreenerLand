# Story Rewards System - Automated Distribution

## Vue d'ensemble

Ce système distribue **automatiquement** les rewards (0.1% des fees de swap) aux meilleurs stories toutes les 24h.

## Comment ça marche

### 1. Score Calculation (Temps réel)

Chaque story a un score calculé automatiquement :
```
Score = Views×1 + Likes×3 + Comments×5
```

**Mise à jour automatique** à chaque :
- View (+1 point)
- Like (+3 points)
- Comment (+5 points)

### 2. Eligibility Window (24h)

- Story créée → **`is_eligible_reward = true`**
- Après 24h → **`is_eligible_reward = false`**
- Peut recevoir des rewards pendant ces 24h

### 3. Daily Distribution (00:00 UTC)

**Cron job** tourne automatiquement à minuit :

1. **Récupère** top 10 stories des dernières 24h (juste expirées)
2. **Calcule** la distribution des rewards :
   - #1 → 30%
   - #2 → 20%
   - #3 → 15%
   - #4 → 10%
   - #5 → 8%
   - #6 → 6%
   - #7 → 4%
   - #8 → 3%
   - #9 → 2%
   - #10 → 2%

3. **Envoie** les CSPR aux wallets des créateurs
4. **Marque** les stories comme récompensées (évite double paiement)

## Installation

```bash
cd backend
npm install node-cron
```

## Configuration (.env)

```env
# Story Rewards
STORY_REWARDS_POOL_CSPR=100           # Budget journalier (CSPR)
REWARDS_CRON_SCHEDULE=0 0 * * *       # Minuit tous les jours
RUN_REWARDS_ON_STARTUP=false          # Test mode

# Smart Contract
SCREENER_CONTRACT_HASH=hash-xxxxx
PLATFORM_WALLET=account-hash-xxxxx
```

## Test Manuel

```bash
# Run distribution manually (for testing)
node story-rewards-distributor.js
```

## Logs

Le système log automatiquement :
```
🎁 DAILY STORY REWARDS DISTRIBUTION - 2024-12-03T00:00:00.000Z
📊 Found 10 eligible stories
  1. Story #42 by 01a2b3c4d5... - Score: 150
  2. Story #38 by 01f6e7d8c9... - Score: 120
  ...
💸 Reward distribution:
  #1: 30.00 CSPR → 01a2b3c4d5... (Story #42)
  #2: 20.00 CSPR → 01f6e7d8c9... (Story #38)
  ...
✅ Distributed 10 rewards (100.00 CSPR total)
```

## Flow Complet

```
User uploads story
      ↓
Score = 0 (is_eligible_reward = true)
      ↓
Users view/like/comment
      ↓
Score increases automatically
      ↓
24h elapsed
      ↓
is_eligible_reward = false
      ↓
Cron job runs at 00:00 UTC
      ↓
Top 10 stories selected by score
      ↓
Rewards calculated (30%, 20%, 15%...)
      ↓
CSPR sent from stories_pool to creators
      ↓
Stories marked as rewarded
      ↓
DONE! 🎉
```

## Smart Contract Integration

### Current (MVP) :

Stories pool fees → `stories_pool` wallet (platform controlled)  
Backend → Calcule winners  
Platform → Envoie manuellement les CSPR

### Future (V2) :

Backend → Appelle `contract.distribute_story_rewards(winners[])`  
Contract → Envoie automatiquement depuis `stories_pool` interne

## Security

- ✅ Only platform wallet can trigger distribution
- ✅ Stories can only be rewarded once
- ✅ 24h window prevents gaming
- ✅ Score calculated on-chain (database)
- ✅ Cron job logs all distributions

## Monitoring

Check logs pour :
- Nombre de stories éligibles
- Montants distribués
- Erreurs de distribution
- Solde du pool restant

## FAQ

**Q: Que se passe-t-il si pas assez de CSPR dans le pool ?**  
A: Le cron job log une erreur et attend le prochain cycle.

**Q: Un user peut-il recevoir plusieurs rewards ?**  
A: Oui ! Une reward par story. Si 3 stories dans le top 10 = 3 rewards.

**Q: Que se passe-t-il si égalité de score ?**  
A: Le plus ancien (created_at) gagne.

**Q: Peut-on changer la distribution ?**  
A: Oui, modifier `REWARD_DISTRIBUTION` dans `story-rewards-distributor.js`.

---

## Next Steps pour Smart Contract Integration

Pour connecter au vrai smart contract :

1. **Ajouter dans token_factory.rs :**
```rust
/// Backend distribue les rewards stories
pub fn distribute_story_rewards(
    &mut self,
    winners: Vec<(Address, U256)>,  // (wallet, amount)
) {
    // Only platform can call
    require!(
        self.env().caller() == self.platform_wallet.get_or_revert_with(Error::NotInitialized),
        Error::Unauthorized
    );
    
    for (winner, amount) in winners {
        self.env().transfer_tokens(&winner, &U512::from(amount.as_u128()));
    }
}
```

2. **Modifier story-rewards-distributor.js :**
```javascript
// Call smart contract
const deploy = await contract.distribute_story_rewards(
    rewards.map(r => ({
        wallet: r.wallet,
        amount: r.amountMotes
    }))
)
```

Pour l'instant, c'est **automatique côté backend** mais **manuel pour le transfer CSPR**. Après le hackathon, tu ajoutes l'intégration smart contract !
