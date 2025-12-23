# Smart Contract Usage Guide

## Overview

Ce smart contract supporte **2 types de tokens** :

1. **Launchpad Tokens** - Nouveaux tokens créés via bonding curve
2. **Existing CEP-18 Tokens** - Tokens existants sur Casper (comme $CASPY, $KASPY, etc.)

---

## 1. EXISTING TOKENS (Pour le Hackathon - Priorité)

### A. CTO (Create-To-Own) Access

Payer **1000 CSPR** pour obtenir :
- ✅ Droit d'upload stories pour ce token
- ✅ Recevoir **0.2%** de tous les swaps (fees accumulées, claimable)

```rust
// Claim CTO access
contract.claim_cto_existing(token_contract_address)
  .with_tokens(U512::from(1_000_000_000_000)) // 1000 CSPR
  .call()
```

**Backend Check :**
```rust
// Vérifier si user a CTO access
let has_access = contract.has_cto_access(token_contract, user_address)
```

### B. Swap System (DEX avec fees)

**Buy Token (CSPR → Token) :**
```rust
contract.swap_cspr_for_existing(
    token_contract,
    min_tokens_out, // Slippage protection
)
.with_tokens(U512::from(cspr_amount))
.call()
```

**Sell Token (Token → CSPR) :**
```rust
contract.swap_existing_for_cspr(
    token_contract,
    tokens_in,
    min_cspr_out, // Slippage protection
)
.call()
```

**Fee Distribution (1% total) :**
- 0.2% → CTO owner (accumulé, claimable)
- 0.1% → Burn CSPR (dead address)
- 0.1% → Burn SCREEN token
- 0.1% → Stories rewards pool
- 0.5% → Platform

### C. Claim CTO Fees

```rust
// CTO owner réclame ses fees accumulés
contract.claim_cto_fees_existing(token_contract)
  .call()
```

### D. Calculate Swap Quotes

```rust
// Avant swap, calculer le montant attendu
let tokens_out = contract.calculate_swap_cspr_to_token(token_contract, cspr_amount)
let cspr_out = contract.calculate_swap_token_to_cspr(token_contract, tokens_amount)
```

---

## 2. LAUNCHPAD TOKENS (Pour plus tard)

### A. Create Token (FREE - juste gas)

```rust
contract.create_token(
    "DogeCoin".to_string(),
    "DOGE".to_string(),
    "https://ipfs.io/metadata.json".to_string(),
    Some(U256::from(1_000_000_000)) // Optional: initial buy (1 CSPR)
)
.with_tokens(U512::from(1_000_000_000)) // Si initial buy
.call()
```

### B. Buy/Sell on Bonding Curve

```rust
// Buy
contract.buy(mint_address, min_tokens_out)
  .with_tokens(U512::from(cspr_amount))
  .call()

// Sell
contract.sell(mint_address, tokens_in, min_cspr_out)
  .call()
```

### C. Graduation

Quand le token atteint **100,000 CSPR market cap**, il "graduate" automatiquement.

---

## Frontend Integration

### 1. TradingPanel (TokenPage.jsx)

```javascript
// Buy token existant
const buyToken = async (tokenContract, csprAmount, slippage = 1) => {
  const minTokensOut = calculateMinTokens(csprAmount, slippage)
  
  await contract.swap_cspr_for_existing(
    tokenContract,
    minTokensOut
  )
}

// Sell token existant
const sellToken = async (tokenContract, tokenAmount, slippage = 1) => {
  const minCsprOut = calculateMinCspr(tokenAmount, slippage)
  
  await contract.swap_existing_for_cspr(
    tokenContract,
    tokenAmount,
    minCsprOut
  )
}
```

### 2. StoryUpload (CTO Access Check)

```javascript
// Avant d'autoriser upload story
const checkCTOAccess = async (tokenContract, userAddress) => {
  const hasAccess = await contract.has_cto_access(tokenContract, userAddress)
  
  if (!hasAccess) {
    // Proposer de claim CTO pour 1000 CSPR
    await contract.claim_cto_existing(tokenContract)
      .send({ amount: '1000000000000' }) // 1000 CSPR en motes
  }
}
```

### 3. CTO Fees Claim

```javascript
// Page Profile ou Dashboard
const claimFees = async (tokenContract) => {
  const cto = await contract.get_cto_ownership(tokenContract)
  
  if (cto && cto.fees_unclaimed > 0) {
    await contract.claim_cto_fees_existing(tokenContract)
    toast.success(`Claimed ${cto.fees_unclaimed} CSPR!`)
  }
}
```

---

## Deploy Instructions

### 1. Build Contract

```bash
cd casper-contracts
cargo odra build -b casper
```

### 2. Deploy to Testnet

```bash
cargo odra deploy -b casper -n testnet \
  --init platform_wallet:<YOUR_PLATFORM_WALLET> \
  --init stories_pool:<STORIES_POOL_WALLET> \
  --init screener_token:<SCREEN_TOKEN_CONTRACT> \
  --init burn_address:<DEAD_ADDRESS>
```

### 3. Create Pools (Platform Only)

Pour chaque token CEP-18 existant que tu veux rendre tradable :

```bash
# Example: Create pool for $CASPY
cargo odra call -b casper -n testnet \
  -e create_pool_existing \
  --args token_contract:<CASPY_CONTRACT_HASH> \
  --args initial_token_amount:1000000000000000 \
  --payment 10000000000 # 10 CSPR initial liquidity
```

---

## Environment Variables (Backend)

```env
# .env
SCREENER_CONTRACT_HASH=hash-xxxxxxxxxxxxx
PLATFORM_WALLET=account-hash-yyyyyyyyyyyy
STORIES_POOL_WALLET=account-hash-zzzzzzzzzzzz
SCREEN_TOKEN_CONTRACT=hash-aaaaaaaaaaaa
```

---

## Testing

```bash
cargo test
```

Tests inclus :
- ✅ CTO claim for existing tokens
- ✅ Swap CSPR <-> Token avec fees
- ✅ CTO fees accumulation
- ✅ Launchpad token creation
- ✅ Bonding curve buy/sell

---

## Notes Importantes

### Pour le Hackathon (Priorité) :

1. **Deploy contract** ✅
2. **Create pools** pour 3-4 tokens populaires ($CASPY, $KASPY, etc.) ✅
3. **Frontend** : Connecter TradingPanel aux swaps ✅
4. **Frontend** : Connecter StoryUpload au CTO check ✅
5. **Demo** : Montrer swap + CTO claim + story upload ✅

### Post-Hackathon :

1. **Active LaunchpadPage** dans frontend
2. Implémenter cross-contract calls pour CEP-18 transfers
3. Ajouter graduation vers DEX externe (FriendlyMarket)
4. SCREEN token burn automatique

---

## Contract Address (After Deploy)

```
Testnet: hash-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Mainnet: (TBD)
```
