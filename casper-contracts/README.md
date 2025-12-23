# 🚀 SCREENER.FUN - Casper Smart Contracts

Smart contracts for the SCREENER.FUN token launchpad on Casper Network.

## 📋 Features

### ✅ **FREE Token Creation** (Pump.fun style)
- No creation fees - only gas (~0.5 CSPR)
- Optional initial buy for instant launch

### 📈 **Bonding Curve**
- Constant product formula: `x × y = k`
- Virtual reserves: 30 CSPR + 1.073B tokens
- Automatic price discovery
- Graduation at 100,000 CSPR → DEX migration

### 💰 **1% Trading Fees Distribution**
```
Buy/Sell both charge 1% fee split:
├─ 20% → Token Creator (claimable)
├─ 10% → Stories Pool (claimable by top performers)
├─ 10% → Burn CSPR (instant to dead address)
├─ 10% → Burn $SCREENER token (batch daily)
└─ 50% → Platform Team (instant)
```

### 🎯 **Stories Rewards**
- 10% of fees go to stories pool
- Top 10% stories share pool daily
- Minimum 10 CSPR to claim (gas optimization)
- Scoring: `(Views × 1) + (Likes × 3) + (Comments × 5) + (Shares × 10)`

### 🏆 **CTO System** (Future)
- Community takeover for abandoned tokens
- 1,000 CSPR to become new dev
- Inherits 20% fees + dev rights

## 🏗️ Architecture

### Main Contract: `TokenFactory`

**Storage:**
- `launches: Mapping<Address, TokenLaunch>` - All token launches
- `platform_wallet: Address` - Team wallet (50% fees)
- `stories_pool: Address` - Stories rewards pool
- `screener_token: Address` - $SCREENER token for burns

**Key Functions:**

#### `create_token(name, symbol, uri, initial_buy_cspr?)`
Create new token on bonding curve (FREE - only gas)
- Optional initial buy for instant launch
- Minimum 0.01 CSPR if buying

#### `buy(mint, min_tokens_out)` [PAYABLE]
Buy tokens via bonding curve
- Attach CSPR as payment
- Slippage protection with `min_tokens_out`
- 1% fee auto-distributed

#### `sell(mint, tokens_in, min_cspr_out)`
Sell tokens back to curve
- Returns CSPR minus 1% fee
- Slippage protection with `min_cspr_out`

#### `claim_creator_fees(mint)`
Creator claims accumulated 20% trading fees
- Only creator can call
- Instant CSPR transfer

#### `claim_stories_fees(mint, claimer, amount)`
Platform backend distributes stories rewards
- Minimum 10 CSPR per claim
- Called by stories scoring system

#### Getters:
- `get_token_launch(mint)` → Full token data
- `get_price(mint)` → Current CSPR per token
- `calculate_buy(mint, cspr_in)` → Tokens out preview
- `calculate_sell(mint, tokens_in)` → CSPR out preview

## 🛠️ Building

### Prerequisites
```bash
# Install Rust nightly
rustup install nightly-2024-08-01

# Install cargo-odra
cargo install cargo-odra --locked
```

### Build Contracts
```bash
cd casper-contracts
cargo odra build
```

Wasm files will be in `wasm/` folder:
- `token_factory.wasm` - Main launchpad contract

### Run Tests
```bash
# Fast tests (OdraVM)
cargo odra test

# Full Casper VM tests
cargo odra test -b casper
```

## 📊 Bonding Curve Math

### Price Calculation
```rust
price = virtual_cspr_reserves / virtual_token_reserves

Initial: 30 CSPR / 1.073B tokens = 0.000000028 CSPR/token
```

### Buy Formula
```rust
fee = cspr_in * 1%
net_cspr = cspr_in - fee
k = virtual_cspr * virtual_tokens
new_cspr = virtual_cspr + net_cspr
new_tokens = k / new_cspr
tokens_out = virtual_tokens - new_tokens
```

### Sell Formula
```rust
k = virtual_cspr * virtual_tokens
new_tokens = virtual_tokens + tokens_in
new_cspr = k / new_tokens
cspr_out_gross = virtual_cspr - new_cspr
fee = cspr_out_gross * 1%
cspr_out_net = cspr_out_gross - fee
```

### Graduation
When `real_cspr_reserves >= 100,000 CSPR`:
1. Token graduates to DEX (CasperSwap/FriendlyMarket)
2. Liquidity migrated automatically
3. Bonding curve disabled
4. Trading continues on DEX

## 🎮 Usage Example

### Create Token (FREE)
```rust
// No initial buy - totally free (just gas)
factory.create_token(
    "DogeCoin".to_string(),
    "DOGE".to_string(), 
    "https://example.com/doge.json".to_string(),
    None
);

// With initial buy (1 CSPR)
factory
    .with_tokens(U512::from(1_000_000_000u64))
    .create_token(
        "PepeCoin".to_string(),
        "PEPE".to_string(),
        "https://example.com/pepe.json".to_string(),
        Some(U256::from(1_000_000_000u64))
    );
```

### Buy Tokens
```rust
let mint = Address::from_str("hash-abc123...").unwrap();
let cspr_amount = U512::from(5_000_000_000u64); // 5 CSPR
let min_tokens = U256::from(1_000_000_000u64); // Slippage protection

factory
    .with_tokens(cspr_amount)
    .buy(mint, min_tokens);
```

### Sell Tokens
```rust
let tokens_to_sell = U256::from(1_000_000_000u64);
let min_cspr = U256::from(4_500_000_000u64); // Slippage protection

factory.sell(mint, tokens_to_sell, min_cspr);
```

### Claim Creator Fees
```rust
// Creator accumulated 20% of all trading fees
factory.claim_creator_fees(mint);
```

## 🔥 Why This Beats cspr.fun

| Feature | cspr.fun | SCREENER.FUN |
|---------|----------|--------------|
| Creation cost | ~2% (~50 CSPR) | **FREE** 🆓 |
| Creator rewards | 0% | **20% of fees** 💰 |
| Social features | None | **Stories + Chat** 🎨 |
| Stories rewards | None | **10% fee pool** 📱 |
| Burn mechanism | No | **Yes (CSPR + token)** 🔥 |
| CTO system | No | **Yes (1,000 CSPR)** 🏆 |

## 📝 Events

### `TokenCreated`
```rust
{
    mint: Address,
    creator: Address,
    name: String,
    symbol: String,
    initial_buy_cspr: U256
}
```

### `TokenBought`
```rust
{
    mint: Address,
    buyer: Address,
    cspr_amount: U256,
    tokens_out: U256,
    new_price: U256
}
```

### `TokenSold`
```rust
{
    mint: Address,
    seller: Address,
    tokens_in: U256,
    cspr_out: U256,
    new_price: U256
}
```

### `TokenGraduated`
```rust
{
    mint: Address,
    final_mcap_cspr: U256,
    dex_address: Option<Address>
}
```

## 🚧 TODO / Future Improvements

- [ ] Integrate with CasperSwap/FriendlyMarket for DEX graduation
- [ ] Implement $SCREENER token burn (cross-contract call)
- [ ] Add CTO (Community Takeover) mechanism
- [ ] Implement dev token info update (website, telegram, twitter links)
- [ ] Add emergency pause functionality
- [ ] Batch burn optimization for $SCREENER
- [ ] Stories scoring integration (off-chain backend)
- [ ] Multi-DEX support (choose best liquidity)

## 📜 License

MIT

---

Built with ❤️ for Casper Hackathon 2025 🚀
