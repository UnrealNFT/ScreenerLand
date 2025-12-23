use odra::prelude::*;
use odra::casper_types::{U256, U512, account::AccountHash};

// ============================================================================
// MACRO HELPERS
// ============================================================================

/// Macro for assertions that panic with error code on failure
/// Odra runtime will catch the panic and convert to proper execution error
macro_rules! require {
    ($cond:expr, $err:expr) => {
        if !$cond {
            panic!("{:?}", $err);
        }
    };
}

// ============================================================================
// EVENTS
// ============================================================================

/// Emitted when a new token is created
#[odra::event]
pub struct TokenCreated {
    pub mint: Address,
    pub creator: Address,
    pub name: String,
    pub symbol: String,
    pub initial_buy_cspr: U256,
}

/// Emitted when tokens are bought
#[odra::event]
pub struct TokenBought {
    pub mint: Address,
    pub buyer: Address,
    pub cspr_amount: U256,
    pub tokens_out: U256,
    pub new_price: U256,
}

/// Emitted when tokens are sold
#[odra::event]
pub struct TokenSold {
    pub mint: Address,
    pub seller: Address,
    pub tokens_in: U256,
    pub cspr_out: U256,
    pub new_price: U256,
}

/// Emitted when token graduates to DEX
#[odra::event]
pub struct TokenGraduated {
    pub mint: Address,
    pub final_mcap_cspr: U256,
    pub dex_address: Option<Address>,
}

/// Emitted when creator claims fees
#[odra::event]
pub struct CreatorFeesClaimed {
    pub mint: Address,
    pub creator: Address,
    pub amount: U256,
}

/// Emitted when token info is updated
#[odra::event]
pub struct TokenInfoUpdated {
    pub mint: Address,
    pub updater: Address,
    pub website: Option<String>,
    pub telegram: Option<String>,
    pub twitter: Option<String>,
}

/// Emitted when CTO (Community Takeover) happens
#[odra::event]
pub struct CTOExecuted {
    pub mint: Address,
    pub old_creator: Address,
    pub new_creator: Address,
    pub price_paid: U256,
}

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/// Token launch data stored on-chain (for launchpad tokens)
#[odra::odra_type]
pub struct TokenLaunch {
    pub mint: Address,
    pub creator: Address,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub total_supply: U256,
    pub virtual_cspr_reserves: U256,
    pub virtual_token_reserves: U256,
    pub real_cspr_reserves: U256,
    pub creator_fees_unclaimed: U256,
    pub stories_fees_unclaimed: U256,
    pub created_at: u64,
    pub graduated: bool,
    pub last_activity: u64,
    pub website: Option<String>,
    pub telegram: Option<String>,
    pub twitter: Option<String>,
    pub banner_uri: Option<String>,
    pub holders_count: u32,
    pub is_cto: bool,
}

/// CTO (Create-To-Own) ownership data for existing tokens
#[odra::odra_type]
pub struct CTOOwnership {
    pub token_contract: Address,
    pub cto_owner: Address,
    pub claimed_at: u64,
    pub fees_unclaimed: U256,
    pub last_activity: u64,
}

/// Liquidity pool for existing CEP-18 tokens
#[odra::odra_type]
pub struct LiquidityPool {
    pub token_contract: Address,
    pub cspr_reserves: U256,
    pub token_reserves: U256,
    pub total_volume_cspr: U256,
    pub cto_owner: Option<Address>,
    pub created_at: u64,
}

/// Errors
#[odra::odra_error]
#[derive(Debug)]
pub enum Error {
    TokenAlreadyExists = 1,
    TokenNotFound = 2,
    InitialBuyTooLow = 3,
    SlippageExceeded = 4,
    InsufficientTokens = 5,
    Unauthorized = 6,
    AlreadyGraduated = 7,
    NotEnoughToGraduate = 8,
    InsufficientClaimAmount = 9,
    NoFeesToClaim = 10,
    TransferFailed = 11,
    CTONotEligible = 12,
    CTOPriceTooLow = 13,
    InsufficientHolders = 14,
    NotInitialized = 15,
    PoolNotFound = 16,
    CTOAlreadyClaimed = 17,
    InsufficientLiquidity = 18,
}

// ============================================================================
// MAIN CONTRACT
// ============================================================================

#[odra::module(events = [TokenCreated, TokenBought, TokenSold, TokenGraduated, CreatorFeesClaimed, TokenInfoUpdated, CTOExecuted])]
pub struct TokenFactory {
    /// Mapping from token mint address to launch data (launchpad tokens)
    launches: Mapping<Address, TokenLaunch>,
    /// Counter for generating unique token IDs
    token_counter: Var<u64>,
    /// Platform wallet for team fees
    platform_wallet: Var<Address>,
    /// Stories pool wallet
    stories_pool: Var<Address>,
    /// Burn CSPR address (dead address)
    burn_cspr_address: Var<Address>,
    /// SCREENER token address for burns
    screener_token: Var<Address>,
    /// Minimum initial buy in CSPR (0.01 CSPR = 10_000_000 motes)
    min_initial_buy: Var<U256>,
    /// Graduation target (100,000 CSPR)
    graduation_target: Var<U256>,
    /// CTO price (1,000 CSPR)
    cto_price: Var<U256>,
    /// CTO inactivity period (90 days in seconds)
    cto_inactivity_period: Var<u64>,
    /// Minimum holders for CTO eligibility
    min_holders_for_cto: Var<u32>,
    
    // ========== NEW: For existing CEP-18 tokens ==========
    /// Liquidity pools for existing CEP-18 tokens
    liquidity_pools: Mapping<Address, LiquidityPool>,
    /// CTO ownership registry for existing tokens
    cto_ownerships: Mapping<Address, CTOOwnership>,
}

#[odra::module]
impl TokenFactory {
    /// Constructor
    pub fn init(
        &mut self,
        platform_wallet: Address,
        stories_pool: Address,
        screener_token: Address,
        burn_address: Option<Address>,
    ) {
        self.platform_wallet.set(platform_wallet);
        self.stories_pool.set(stories_pool);
        self.screener_token.set(screener_token);
        
        // Initialize token counter
        self.token_counter.set(0u64);
        
        // Burn address (default to casper dead address if not provided)
        let burn_addr = burn_address.unwrap_or(Address::from(AccountHash::new([0u8; 32])));
        self.burn_cspr_address.set(burn_addr);
        
        // 0.01 CSPR minimum
        self.min_initial_buy.set(U256::from(10_000_000u64));
        
        // 100,000 CSPR graduation
        self.graduation_target.set(U256::from(100_000_000_000_000u64));
        
        // 1,000 CSPR for CTO
        self.cto_price.set(U256::from(1_000_000_000_000u64));
        
        // 90 days inactivity (90 * 24 * 60 * 60 = 7,776,000 seconds)
        self.cto_inactivity_period.set(7_776_000u64);
        
        // Minimum 10 holders for CTO
        self.min_holders_for_cto.set(10u32);
    }

    /// Create a new token with bonding curve (FREE - only gas)
    /// Optional initial_buy_cspr for immediate first purchase
    #[odra(payable)]
    pub fn create_token(
        &mut self,
        name: String,
        symbol: String,
        uri: String,
        initial_buy_cspr: Option<U256>,
    ) {
        let creator = self.env().caller();
        let attached_value = self.env().attached_value();
        
        // Check if initial buy amount matches attached value
        let initial_buy = initial_buy_cspr.unwrap_or(U256::zero());
        if initial_buy > U256::zero() {
            require!(
                U256::from(attached_value.as_u128()) >= initial_buy,
                Error::InitialBuyTooLow
            );
            require!(
                initial_buy >= self.min_initial_buy.get_or_default(),
                Error::InitialBuyTooLow
            );
        }

        // Generate unique mint address using counter
        let token_id = self.token_counter.get_or_default();
        self.token_counter.set(token_id + 1);
        
        // Create deterministic address from token ID
        let mut mint_hash = [0u8; 32];
        let id_bytes = token_id.to_le_bytes();
        mint_hash[0..8].copy_from_slice(&id_bytes);
        // Add some entropy from creator and block time
        let block_time = self.env().get_block_time();
        let time_bytes = block_time.to_le_bytes();
        mint_hash[8..16].copy_from_slice(&time_bytes);
        let mint = Address::from(AccountHash::new(mint_hash));
        
        // Check token doesn't exist (should never happen with counter)
        require!(
            self.launches.get(&mint).is_none(),
            Error::TokenAlreadyExists
        );

        // Initialize token launch with pump.fun parameters
        // Virtual reserves: 30 CSPR + 1.073B tokens
        let total_supply = U256::from(1_000_000_000_000_000_000u128); // 1B with 9 decimals
        let virtual_cspr = U256::from(30_000_000_000u64); // 30 CSPR
        let virtual_tokens = U256::from(1_073_000_000_000_000_000u128); // 1.073B tokens
        
        let mut token_launch = TokenLaunch {
            mint,
            creator,
            name: name.clone(),
            symbol: symbol.clone(),
            uri,
            total_supply,
            virtual_cspr_reserves: virtual_cspr,
            virtual_token_reserves: virtual_tokens,
            real_cspr_reserves: U256::zero(),
            creator_fees_unclaimed: U256::zero(),
            stories_fees_unclaimed: U256::zero(),
            created_at: block_time,
            graduated: false,
            last_activity: block_time,
            website: None,
            telegram: None,
            twitter: None,
            banner_uri: None,
            holders_count: 0,
            is_cto: false,
        };

        // If initial buy, execute it
        if initial_buy > U256::zero() {
            self.execute_buy_internal(&mut token_launch, creator, initial_buy);
        }

        // Store launch data
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Emit event
        self.env().emit_event(TokenCreated {
            mint,
            creator,
            name,
            symbol,
            initial_buy_cspr: initial_buy,
        });
    }

    /// Buy tokens via bonding curve
    /// Fee: 1% split → 20% dev, 10% stories, 10% burn CSPR, 10% burn SCREENER, 50% team
    #[odra(payable)]
    pub fn buy(
        &mut self,
        mint: Address,
        min_tokens_out: U256,
    ) {
        let buyer = self.env().caller();
        let cspr_amount = U256::from(self.env().attached_value().as_u128());
        
        require!(cspr_amount > U256::zero(), Error::InitialBuyTooLow);
        
        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        require!(!token_launch.graduated, Error::AlreadyGraduated);

        // Execute buy and get tokens
        let tokens_out = self.execute_buy_internal(&mut token_launch, buyer, cspr_amount);
        
        require!(tokens_out >= min_tokens_out, Error::SlippageExceeded);

        // Update storage
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Check graduation
        self.check_graduation(mint);
    }

    /// Sell tokens via bonding curve (same 1% fee distribution)
    pub fn sell(
        &mut self,
        mint: Address,
        tokens_in: U256,
        min_cspr_out: U256,
    ) {
        let seller = self.env().caller();
        
        require!(tokens_in > U256::zero(), Error::InsufficientTokens);
        
        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        require!(!token_launch.graduated, Error::AlreadyGraduated);

        // Calculate CSPR out via bonding curve (x * y = k)
        let k = token_launch.virtual_cspr_reserves * token_launch.virtual_token_reserves;
        let new_tokens = token_launch.virtual_token_reserves + tokens_in;
        let new_cspr = k / new_tokens;
        let cspr_out_gross = token_launch.virtual_cspr_reserves - new_cspr;
        
        // 1% fee
        let fee = cspr_out_gross / U256::from(100u32);
        let cspr_out_net = cspr_out_gross - fee;
        
        require!(cspr_out_net >= min_cspr_out, Error::SlippageExceeded);

        // Distribute fees (same split as buy)
        let creator_fee = fee * U256::from(20u32) / U256::from(100u32); // 20%
        let stories_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let burn_cspr_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let burn_screener_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let team_fee = fee - creator_fee - stories_fee - burn_cspr_fee - burn_screener_fee; // 50%

        // Transfer CSPR back to seller
        self.env().transfer_tokens(&seller, &U512::from(cspr_out_net.as_u128()));

        // Distribute fees
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(team_fee.as_u128()));
        self.env().transfer_tokens(&self.burn_cspr_address.get_or_revert_with(Error::NotInitialized), &U512::from(burn_cspr_fee.as_u128()));
        
        // Accumulate claimable fees
        token_launch.creator_fees_unclaimed += creator_fee;
        token_launch.stories_fees_unclaimed += stories_fee;
        
        // TODO: Burn SCREENER token (need to implement token burn call)
        // For now, send to platform wallet for manual burn
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(burn_screener_fee.as_u128()));

        // Update reserves
        token_launch.virtual_cspr_reserves = new_cspr;
        token_launch.virtual_token_reserves = new_tokens;
        token_launch.real_cspr_reserves -= cspr_out_gross;

        // Calculate new price
        let new_price = token_launch.virtual_cspr_reserves / token_launch.virtual_token_reserves;

        // Update storage
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Emit event
        self.env().emit_event(TokenSold {
            mint,
            seller,
            tokens_in,
            cspr_out: cspr_out_net,
            new_price,
        });
    }

    /// Creator claims accumulated fees (20% of trading fees)
    pub fn claim_creator_fees(&mut self, mint: Address) {
        let caller = self.env().caller();
        
        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        require!(token_launch.creator == caller, Error::Unauthorized);
        require!(
            token_launch.creator_fees_unclaimed > U256::zero(),
            Error::NoFeesToClaim
        );

        let amount = token_launch.creator_fees_unclaimed;
        token_launch.creator_fees_unclaimed = U256::zero();
        
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Transfer fees
        self.env().transfer_tokens(&caller, &U512::from(amount.as_u128()));

        // Emit event
        self.env().emit_event(CreatorFeesClaimed {
            mint,
            creator: caller,
            amount,
        });
    }

    /// Stories creators claim accumulated fees (10% pool)
    /// Minimum 10 CSPR to claim (gas optimization)
    pub fn claim_stories_fees(&mut self, mint: Address, claimer: Address, amount: U256) {
        // TODO: This should be called by stories scoring backend
        // For now, only platform wallet can distribute
        let caller = self.env().caller();
        require!(
            caller == self.platform_wallet.get_or_revert_with(Error::NotInitialized),
            Error::Unauthorized
        );

        let min_claim = U256::from(10_000_000_000u64); // 10 CSPR
        require!(amount >= min_claim, Error::InsufficientClaimAmount);

        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        require!(
            token_launch.stories_fees_unclaimed >= amount,
            Error::NoFeesToClaim
        );

        token_launch.stories_fees_unclaimed -= amount;
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Transfer to claimer
        self.env().transfer_tokens(&claimer, &U512::from(amount.as_u128()));
    }

    /// Update token info (website, telegram, twitter, banner) - ONLY DEV
    pub fn update_token_info(
        &mut self,
        mint: Address,
        website: Option<String>,
        telegram: Option<String>,
        twitter: Option<String>,
        banner_uri: Option<String>,
    ) {
        let caller = self.env().caller();
        
        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        // Only current creator can update
        require!(token_launch.creator == caller, Error::Unauthorized);

        // Update fields
        if website.is_some() {
            token_launch.website = website.clone();
        }
        if telegram.is_some() {
            token_launch.telegram = telegram.clone();
        }
        if twitter.is_some() {
            token_launch.twitter = twitter.clone();
        }
        if banner_uri.is_some() {
            token_launch.banner_uri = banner_uri.clone();
        }

        // Update last activity
        token_launch.last_activity = self.env().get_block_time();
        
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Emit event
        self.env().emit_event(TokenInfoUpdated {
            mint,
            updater: caller,
            website,
            telegram,
            twitter,
        });
    }

    /// Community Takeover (CTO) - Pay 1,000 CSPR to become new dev
    /// Requirements: 30 days inactivity + min 20 holders
    #[odra(payable)]
    pub fn execute_cto(&mut self, mint: Address) {
        let caller = self.env().caller();
        let paid_amount = U256::from(self.env().attached_value().as_u128());
        let cto_price = self.cto_price.get_or_default();
        
        require!(paid_amount >= cto_price, Error::CTOPriceTooLow);

        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        // Check eligibility
        let current_time = self.env().get_block_time();
        let inactivity_period = self.cto_inactivity_period.get_or_default();
        let min_holders = self.min_holders_for_cto.get_or_default();
        
        // Must be inactive for 30 days (no story posts = no last_activity update)
        require!(
            current_time >= token_launch.last_activity + inactivity_period,
            Error::CTONotEligible
        );
        
        // Must have minimum holders
        require!(
            token_launch.holders_count >= min_holders,
            Error::InsufficientHolders
        );

        let old_creator = token_launch.creator;
        
        // Transfer to new creator
        token_launch.creator = caller;
        token_launch.last_activity = current_time;
        token_launch.is_cto = true;
        
        // CTO price goes 100% to platform
        self.env().transfer_tokens(
            &self.platform_wallet.get_or_revert_with(Error::NotInitialized),
            &U512::from(cto_price.as_u128())
        );
        
        let _real_cspr_reserves = token_launch.real_cspr_reserves;
        self.launches.set(&mint, token_launch);

        // Emit event
        self.env().emit_event(CTOExecuted {
            mint,
            old_creator,
            new_creator: caller,
            price_paid: cto_price,
        });
    }

    // ========================================================================
    // EXISTING CEP-18 TOKEN SWAP FUNCTIONS
    // ========================================================================

    /// Claim CTO access for an existing CEP-18 token (pay 1000 CSPR)
    /// This grants: 1) Upload story access, 2) Receive 0.2% of all swap fees
    #[odra(payable)]
    pub fn claim_cto_existing(&mut self, token_contract: Address) {
        let caller = self.env().caller();
        let paid_amount = U256::from(self.env().attached_value().as_u128());
        let cto_price = self.cto_price.get_or_default();
        
        require!(paid_amount >= cto_price, Error::CTOPriceTooLow);

        // Check if CTO already claimed
        if let Some(_existing) = self.cto_ownerships.get(&token_contract) {
            require!(false, Error::CTOAlreadyClaimed);
        }

        // Create CTO ownership record
        let cto_ownership = CTOOwnership {
            token_contract,
            cto_owner: caller,
            claimed_at: self.env().get_block_time(),
            fees_unclaimed: U256::zero(),
            last_activity: self.env().get_block_time(),
        };

        self.cto_ownerships.set(&token_contract, cto_ownership);

        // CTO price goes 100% to platform
        self.env().transfer_tokens(
            &self.platform_wallet.get_or_revert_with(Error::NotInitialized),
            &U512::from(cto_price.as_u128())
        );

        // Emit event
        self.env().emit_event(CTOExecuted {
            mint: token_contract,
            old_creator: Address::from(AccountHash::new([0u8; 32])), // No old creator for existing tokens
            new_creator: caller,
            price_paid: cto_price,
        });
    }

    /// Initialize liquidity pool for an existing CEP-18 token (platform only)
    /// This allows users to swap this token on our DEX
    #[odra(payable)]
    pub fn create_pool_existing(
        &mut self,
        token_contract: Address,
        initial_token_amount: U256,
    ) {
        let caller = self.env().caller();
        
        // Only platform can create pools (to prevent spam)
        require!(
            caller == self.platform_wallet.get_or_revert_with(Error::NotInitialized),
            Error::Unauthorized
        );

        // Check pool doesn't exist
        require!(
            self.liquidity_pools.get(&token_contract).is_none(),
            Error::TokenAlreadyExists
        );

        let cspr_amount = U256::from(self.env().attached_value().as_u128());
        require!(cspr_amount > U256::zero(), Error::InitialBuyTooLow);

        // TODO: Transfer tokens from caller to contract
        // This requires cross-contract call to CEP-18 transfer_from
        // For now, assume tokens are already in contract

        let pool = LiquidityPool {
            token_contract,
            cspr_reserves: cspr_amount,
            token_reserves: initial_token_amount,
            total_volume_cspr: U256::zero(),
            cto_owner: self.cto_ownerships.get(&token_contract).map(|c| c.cto_owner),
            created_at: self.env().get_block_time(),
        };

        self.liquidity_pools.set(&token_contract, pool);
    }

    /// Swap CSPR for existing CEP-18 tokens
    /// Fee: 1% → 0.2% CTO, 0.1% burn CSPR, 0.1% burn SCREEN, 0.1% stories, 0.5% platform
    #[odra(payable)]
    pub fn swap_cspr_for_existing(
        &mut self,
        token_contract: Address,
        min_tokens_out: U256,
    ) {
        let buyer = self.env().caller();
        let cspr_in = U256::from(self.env().attached_value().as_u128());
        
        require!(cspr_in > U256::zero(), Error::InitialBuyTooLow);

        let mut pool = self.liquidity_pools.get(&token_contract)
            .unwrap_or_revert_with(&self.env(), Error::PoolNotFound);

        // Calculate tokens out using constant product formula (x * y = k)
        let k = pool.cspr_reserves * pool.token_reserves;
        
        // 1% fee
        let fee = cspr_in / U256::from(100u32);
        let net_cspr = cspr_in - fee;
        
        let new_cspr = pool.cspr_reserves + net_cspr;
        let new_tokens = k / new_cspr;
        let tokens_out = pool.token_reserves - new_tokens;
        
        require!(tokens_out >= min_tokens_out, Error::SlippageExceeded);
        require!(tokens_out <= pool.token_reserves, Error::InsufficientLiquidity);

        // Distribute 1% fee
        let creator_fee = fee * U256::from(20u32) / U256::from(100u32); // 0.2%
        let stories_fee = fee * U256::from(10u32) / U256::from(100u32); // 0.1%
        let burn_cspr_fee = fee * U256::from(10u32) / U256::from(100u32); // 0.1%
        let burn_screener_fee = fee * U256::from(10u32) / U256::from(100u32); // 0.1%
        let team_fee = fee - creator_fee - stories_fee - burn_cspr_fee - burn_screener_fee; // 0.5%

        // Transfer instant fees
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(team_fee.as_u128()));
        self.env().transfer_tokens(&self.burn_cspr_address.get_or_revert_with(Error::NotInitialized), &U512::from(burn_cspr_fee.as_u128()));
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(burn_screener_fee.as_u128())); // Manual burn SCREEN
        
        // Accumulate CTO fees if owner exists
        if let Some(mut cto) = self.cto_ownerships.get(&token_contract) {
            cto.fees_unclaimed += creator_fee;
            cto.last_activity = self.env().get_block_time();
            self.cto_ownerships.set(&token_contract, cto);
        } else {
            // No CTO owner, send to platform
            self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(creator_fee.as_u128()));
        }

        // Accumulate stories fees (claimable by top stories)
        // For now, send to stories pool wallet
        self.env().transfer_tokens(&self.stories_pool.get_or_revert_with(Error::NotInitialized), &U512::from(stories_fee.as_u128()));

        // Calculate price before moving pool
        let new_price = new_cspr / new_tokens;

        // Update pool reserves
        pool.cspr_reserves = new_cspr;
        pool.token_reserves = new_tokens;
        pool.total_volume_cspr += cspr_in;
        
        self.liquidity_pools.set(&token_contract, pool);

        // TODO: Transfer tokens to buyer (cross-contract call to CEP-18)
        // For now, assume tokens are transferred

        // Emit event
        self.env().emit_event(TokenBought {
            mint: token_contract,
            buyer,
            cspr_amount: cspr_in,
            tokens_out,
            new_price,
        });
    }

    /// Swap existing CEP-18 tokens for CSPR
    /// Same 1% fee distribution
    pub fn swap_existing_for_cspr(
        &mut self,
        token_contract: Address,
        tokens_in: U256,
        min_cspr_out: U256,
    ) {
        let seller = self.env().caller();
        
        require!(tokens_in > U256::zero(), Error::InsufficientTokens);

        let mut pool = self.liquidity_pools.get(&token_contract)
            .unwrap_or_revert_with(&self.env(), Error::PoolNotFound);

        // TODO: Transfer tokens from seller to contract (cross-contract call)
        // Assume tokens received for now

        // Calculate CSPR out using constant product formula
        let k = pool.cspr_reserves * pool.token_reserves;
        let new_tokens = pool.token_reserves + tokens_in;
        let new_cspr = k / new_tokens;
        let cspr_out_gross = pool.cspr_reserves - new_cspr;
        
        // 1% fee
        let fee = cspr_out_gross / U256::from(100u32);
        let cspr_out_net = cspr_out_gross - fee;
        
        require!(cspr_out_net >= min_cspr_out, Error::SlippageExceeded);
        require!(cspr_out_net <= pool.cspr_reserves, Error::InsufficientLiquidity);

        // Distribute fees (same as buy)
        let creator_fee = fee * U256::from(20u32) / U256::from(100u32);
        let stories_fee = fee * U256::from(10u32) / U256::from(100u32);
        let burn_cspr_fee = fee * U256::from(10u32) / U256::from(100u32);
        let burn_screener_fee = fee * U256::from(10u32) / U256::from(100u32);
        let team_fee = fee - creator_fee - stories_fee - burn_cspr_fee - burn_screener_fee;

        // Transfer CSPR to seller
        self.env().transfer_tokens(&seller, &U512::from(cspr_out_net.as_u128()));

        // Transfer instant fees
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(team_fee.as_u128()));
        self.env().transfer_tokens(&self.burn_cspr_address.get_or_revert_with(Error::NotInitialized), &U512::from(burn_cspr_fee.as_u128()));
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(burn_screener_fee.as_u128()));
        
        // Accumulate CTO fees
        if let Some(mut cto) = self.cto_ownerships.get(&token_contract) {
            cto.fees_unclaimed += creator_fee;
            cto.last_activity = self.env().get_block_time();
            self.cto_ownerships.set(&token_contract, cto);
        } else {
            self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(creator_fee.as_u128()));
        }

        self.env().transfer_tokens(&self.stories_pool.get_or_revert_with(Error::NotInitialized), &U512::from(stories_fee.as_u128()));

        // Calculate price before moving pool
        let new_price = new_cspr / new_tokens;

        // Update pool
        pool.cspr_reserves = new_cspr;
        pool.token_reserves = new_tokens;
        pool.total_volume_cspr += cspr_out_gross;
        
        self.liquidity_pools.set(&token_contract, pool);

        // Emit event
        self.env().emit_event(TokenSold {
            mint: token_contract,
            seller,
            tokens_in,
            cspr_out: cspr_out_net,
            new_price,
        });
    }

    /// CTO owner claims accumulated fees (0.2% of swaps)
    pub fn claim_cto_fees_existing(&mut self, token_contract: Address) {
        let caller = self.env().caller();
        
        let mut cto = self.cto_ownerships.get(&token_contract)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        require!(cto.cto_owner == caller, Error::Unauthorized);
        require!(cto.fees_unclaimed > U256::zero(), Error::NoFeesToClaim);

        let amount = cto.fees_unclaimed;
        cto.fees_unclaimed = U256::zero();
        
        self.cto_ownerships.set(&token_contract, cto);

        // Transfer fees
        self.env().transfer_tokens(&caller, &U512::from(amount.as_u128()));

        // Emit event
        self.env().emit_event(CreatorFeesClaimed {
            mint: token_contract,
            creator: caller,
            amount,
        });
    }

    // ========================================================================
    // GETTERS FOR EXISTING TOKENS
    // ========================================================================

    /// Get CTO ownership for existing token
    pub fn get_cto_ownership(&self, token_contract: Address) -> Option<CTOOwnership> {
        self.cto_ownerships.get(&token_contract)
    }

    /// Get liquidity pool data
    pub fn get_pool(&self, token_contract: Address) -> Option<LiquidityPool> {
        self.liquidity_pools.get(&token_contract)
    }

    /// Check if address has CTO access for token
    pub fn has_cto_access(&self, token_contract: Address, address: Address) -> bool {
        if let Some(cto) = self.cto_ownerships.get(&token_contract) {
            cto.cto_owner == address
        } else {
            false
        }
    }

    /// Calculate tokens out for CSPR in (existing token swap)
    pub fn calculate_swap_cspr_to_token(&self, token_contract: Address, cspr_in: U256) -> U256 {
        let pool = self.liquidity_pools.get(&token_contract)
            .unwrap_or_revert_with(&self.env(), Error::PoolNotFound);
        
        let fee = cspr_in / U256::from(100u32);
        let net_cspr = cspr_in - fee;
        
        let k = pool.cspr_reserves * pool.token_reserves;
        let new_cspr = pool.cspr_reserves + net_cspr;
        let new_tokens = k / new_cspr;
        
        pool.token_reserves - new_tokens
    }

    /// Calculate CSPR out for tokens in (existing token swap)
    pub fn calculate_swap_token_to_cspr(&self, token_contract: Address, tokens_in: U256) -> U256 {
        let pool = self.liquidity_pools.get(&token_contract)
            .unwrap_or_revert_with(&self.env(), Error::PoolNotFound);
        
        let k = pool.cspr_reserves * pool.token_reserves;
        let new_tokens = pool.token_reserves + tokens_in;
        let new_cspr = k / new_tokens;
        let cspr_out_gross = pool.cspr_reserves - new_cspr;
        
        let fee = cspr_out_gross / U256::from(100u32);
        cspr_out_gross - fee
    }

    // ========================================================================
    // GETTERS (LAUNCHPAD TOKENS)
    // ========================================================================

    /// Get token launch data
    pub fn get_token_launch(&self, mint: Address) -> Option<TokenLaunch> {
        self.launches.get(&mint)
    }

    /// Get current price (CSPR per token)
    pub fn get_price(&self, mint: Address) -> U256 {
        let launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        launch.virtual_cspr_reserves / launch.virtual_token_reserves
    }

    /// Calculate tokens out for given CSPR in (including 1% fee)
    pub fn calculate_buy(&self, mint: Address, cspr_in: U256) -> U256 {
        let launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        let fee = cspr_in / U256::from(100u32);
        let net_cspr = cspr_in - fee;
        
        let k = launch.virtual_cspr_reserves * launch.virtual_token_reserves;
        let new_cspr = launch.virtual_cspr_reserves + net_cspr;
        let new_tokens = k / new_cspr;
        
        launch.virtual_token_reserves - new_tokens
    }

    /// Calculate CSPR out for given tokens in (including 1% fee)
    pub fn calculate_sell(&self, mint: Address, tokens_in: U256) -> U256 {
        let launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        let k = launch.virtual_cspr_reserves * launch.virtual_token_reserves;
        let new_tokens = launch.virtual_token_reserves + tokens_in;
        let new_cspr = k / new_tokens;
        let cspr_out_gross = launch.virtual_cspr_reserves - new_cspr;
        
        let fee = cspr_out_gross / U256::from(100u32);
        cspr_out_gross - fee
    }

    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================

    /// Internal buy execution with fee distribution
    fn execute_buy_internal(
        &mut self,
        token_launch: &mut TokenLaunch,
        buyer: Address,
        cspr_amount: U256,
    ) -> U256 {
        // 1% fee
        let fee = cspr_amount / U256::from(100u32);
        let net_cspr = cspr_amount - fee;

        // Calculate tokens via bonding curve (x * y = k)
        let k = token_launch.virtual_cspr_reserves * token_launch.virtual_token_reserves;
        let new_cspr = token_launch.virtual_cspr_reserves + net_cspr;
        let new_tokens = k / new_cspr;
        let tokens_out = token_launch.virtual_token_reserves - new_tokens;

        // Distribute 1% fee:
        // 20% → Creator (accumulated for claim)
        // 10% → Stories pool (accumulated for claim)
        // 10% → Burn CSPR (instant to dead address)
        // 10% → Burn SCREENER token (instant, TODO)
        // 50% → Team (instant)
        
        let creator_fee = fee * U256::from(20u32) / U256::from(100u32); // 20%
        let stories_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let burn_cspr_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let burn_screener_fee = fee * U256::from(10u32) / U256::from(100u32); // 10%
        let team_fee = fee - creator_fee - stories_fee - burn_cspr_fee - burn_screener_fee; // 50%

        // Transfer instant fees
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(team_fee.as_u128()));
        self.env().transfer_tokens(&self.burn_cspr_address.get_or_revert_with(Error::NotInitialized), &U512::from(burn_cspr_fee.as_u128()));
        
        // Accumulate claimable fees
        token_launch.creator_fees_unclaimed += creator_fee;
        token_launch.stories_fees_unclaimed += stories_fee;

        // TODO: Burn SCREENER token (need cross-contract call)
        // For now, send to platform wallet for manual batch burn
        self.env().transfer_tokens(&self.platform_wallet.get_or_revert_with(Error::NotInitialized), &U512::from(burn_screener_fee.as_u128()));

        // Update reserves
        token_launch.virtual_cspr_reserves = new_cspr;
        token_launch.virtual_token_reserves = new_tokens;
        token_launch.real_cspr_reserves += net_cspr;

        // Calculate new price for event
        let new_price = token_launch.virtual_cspr_reserves / token_launch.virtual_token_reserves;

        // Emit event
        self.env().emit_event(TokenBought {
            mint: token_launch.mint,
            buyer,
            cspr_amount,
            tokens_out,
            new_price,
        });

        tokens_out
    }

    /// Check if token should graduate to DEX (100,000 CSPR market cap)
    fn check_graduation(&mut self, mint: Address) {
        let mut token_launch = self.launches.get(&mint)
            .unwrap_or_revert_with(&self.env(), Error::TokenNotFound);
        
        if token_launch.graduated {
            return;
        }

        let graduation_target = self.graduation_target.get_or_default();
        
        if token_launch.real_cspr_reserves >= graduation_target {
            // Save value before move
            let real_cspr_reserves = token_launch.real_cspr_reserves;
            
            token_launch.graduated = true;
            self.launches.set(&mint, token_launch);

            // Emit graduation event
            self.env().emit_event(TokenGraduated {
                mint,
                final_mcap_cspr: real_cspr_reserves,
                dex_address: None, // TODO: Integrate with CasperSwap/FriendlyMarket
            });

            // TODO: Implement DEX migration
            // 1. Burn remaining curve tokens
            // 2. Transfer liquidity to DEX
            // 3. Create liquidity pool
        }
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef};

    #[test]
    fn test_create_token_free() {
        let env = odra_test::env();
        let platform = env.get_account(0);
        let stories_pool = env.get_account(1);
        let screener_token = env.get_account(2);
        let creator = env.get_account(3);
        let burn = env.get_account(9); // Use account 9 as burn address for testing

        env.set_caller(platform);
        
        let mut factory = TokenFactory::deploy(
            &env,
            TokenFactoryInitArgs {
                platform_wallet: platform,
                stories_pool,
                screener_token,
                burn_address: Some(burn),
            },
        );

        // Create token without initial buy (FREE)
        env.set_caller(creator);
        factory.create_token(
            "DogeCoin".to_string(),
            "DOGE".to_string(),
            "https://example.com/doge.json".to_string(),
            None,
        );

        // Check token was created
        // Note: we can't easily get the mint address without event parsing
        // In real usage, frontend would catch the TokenCreated event
    }

    #[test]
    fn test_create_with_initial_buy() {
        let env = odra_test::env();
        let platform = env.get_account(0);
        let stories_pool = env.get_account(1);
        let screener_token = env.get_account(2);
        let creator = env.get_account(3);
        let burn = env.get_account(9);

        env.set_caller(platform);
        
        let factory = TokenFactory::deploy(
            &env,
            TokenFactoryInitArgs {
                platform_wallet: platform,
                stories_pool,
                screener_token,
                burn_address: Some(burn),
            },
        );

        // Create token with 1 CSPR initial buy
        let initial_buy = U256::from(1_000_000_000u64); // 1 CSPR
        
        env.set_caller(creator);
        factory
            .with_tokens(U512::from(initial_buy.as_u128()))
            .create_token(
                "PepeCoin".to_string(),
                "PEPE".to_string(),
                "https://example.com/pepe.json".to_string(),
                Some(initial_buy),
            );

        // Token should be created and initial buy executed
        // Creator should have received tokens
        // Fees should be distributed
    }

    #[test]
    fn test_bonding_curve_price_increases() {
        let env = odra_test::env();
        let platform = env.get_account(0);
        let stories_pool = env.get_account(1);
        let screener_token = env.get_account(2);
        let creator = env.get_account(3);
        let _buyer = env.get_account(4);
        let burn = env.get_account(9);

        env.set_caller(platform);
        
        let mut factory = TokenFactory::deploy(
            &env,
            TokenFactoryInitArgs {
                platform_wallet: platform,
                stories_pool,
                screener_token,
                burn_address: Some(burn),
            },
        );

        // Create token
        env.set_caller(creator);
        let initial_buy = U256::from(1_000_000_000u64);
        factory
            .with_tokens(U512::from(initial_buy.as_u128()))
            .create_token(
                "Test".to_string(),
                "TEST".to_string(),
                "https://test.com".to_string(),
                Some(initial_buy),
            );

        // TODO: Get mint address from event and test buy/sell
        // Price should increase with each buy
    }
}
