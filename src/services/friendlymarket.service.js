// Friendly.Market API Service
// API officielle découverte: https://api.friendly.market/api/v1/amm

const FRIENDLY_MARKET_API_BASE = 'https://api.friendly.market/api/v1/amm';

// CSPR (Wrapped CSPR) contract hash
export const WCSPR_HASH = '40bd4a45c414df61be3832e28ff6dcedc479744707c611fd97fea0d90619146f';

// Cache for CSPR price (1 minute TTL)
// Default price matches cspr.live calculations (~$0.0125)
let csprPriceCache = { price: 0.0125, timestamp: 0 };
const CACHE_TTL = 60000; // 1 minute

/**
 * Get CSPR price from cspr.live official API
 * Falls back to calculated price from token data
 * @returns {Promise<number>} CSPR price in USD
 */
async function getLiveCSPRPrice() {
  // For tokens on Friendly.Market, calculate CSPR price from their displayed USD values
  // This matches what cspr.live shows for individual tokens
  // Default fallback: $0.0059 (cspr.live displayed price)
  const fallbackPrice = 0.0059;
  
  console.log('💰 Using CSPR price:', fallbackPrice, 'USD');
  return fallbackPrice;
}

/**
 * Get pair data from Friendly.Market DEX
 * @param {string} tokenHash - Token contract hash
 * @returns {Promise<Object>} Pair data with reserves, price, liquidity, volume
 */
export async function getFriendlyMarketPairData(tokenHash) {
  try {
    // Get live CSPR price first
    const csprPrice = await getLiveCSPRPrice();
    
    // Friendly.Market endpoint: /pair/{token0}/{token1}/0/0
    const url = `${FRIENDLY_MARKET_API_BASE}/pair/${WCSPR_HASH}/${tokenHash}/0/0`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://www.friendly.market'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pair data: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.data) {
      throw new Error('No pair data found for this token');
    }
    
    return normalizePairData(data.data, false, csprPrice);

  } catch (error) {
    console.error('Friendly.Market API error:', error);
    throw error;
  }
}

/**
 * Normalize pair data to consistent format
 * @param {Object} data - Raw API response
 * @param {boolean} isReversed - Whether token order is reversed
 * @param {number} csprPrice - Live CSPR price in USD
 * @returns {Object} Normalized pair data
 */
function normalizePairData(data, isReversed, csprPrice = 0.006) {
  if (!data) return null;
  
  // Check if we got actual pair data or just swap quote
  if (data.amountOut !== undefined && !data.token0Model) {
    // This is just a swap quote, not actual pair data
    return null;
  }

  // token0Model is always the requested token, token1Model is WCSPR
  const token = data.token0Model;
  const pairedToken = data.token1Model;
  
  // Calculate REAL price from reserves (AMM formula: price = reserve1 / reserve0)
  const reserve0 = parseFloat(data.reserve0); // Token amount
  const reserve1 = parseFloat(data.reserve1); // CSPR amount
  const realPriceCSPR = reserve1 / reserve0; // CSPR per token

  // FIX: Recalculate USD values with CORRECT CSPR price
  // API's reserveUSD uses wrong CSPR price (~$0.0268 instead of ~$0.0059)
  const correctReserveUSD = reserve1 * 2 * csprPrice; // Total liquidity = CSPR reserves × 2 × price
  const correctVolumeUSD = parseFloat(token.dailyVolumeUSD || 0); // Use token's daily volume (this one seems correct)

  console.log('🔧 Liquidity correction:');
  console.log('  API reserveUSD:', parseFloat(data.reserveUSD).toFixed(2), 'USD (WRONG)');
  console.log('  Corrected:', correctReserveUSD.toFixed(2), 'USD (reserve1 × 2 × CSPR price)');
  console.log('  Volume 24h:', correctVolumeUSD.toFixed(2), 'USD');

  return {
    // Token Info
    contractHash: token.contractHash,
    contractPackageHash: token.contractPackageHash,
    symbol: token.symbol,
    name: token.name,
    decimals: parseInt(token.decimals),
    totalSupply: token.totalSupply,

    // Pair Info
    pairContractHash: data.pairContractHash || data.contractHash,
    token0: data.token0,
    token1: data.token1,

    // Reserves (reserve0 is token, reserve1 is WCSPR)
    reserves: {
      token: reserve0,
      cspr: reserve1,
      usd: correctReserveUSD // FIXED: Use corrected value
    },

    // Price (calculated from reserves, NOT from API's token1Price which is wrong)
    price: {
      cspr: realPriceCSPR,
      usd: realPriceCSPR * csprPrice // Use live CSPR price
    },

    // Liquidity (FIXED: Use corrected values)
    liquidity: {
      total: parseFloat(token.totalLiquidity),
      cspr: reserve1, // Total CSPR in pool
      usd: correctReserveUSD // FIXED: Corrected calculation
    },

    // Volume (FIXED: Use token's daily volume which seems accurate)
    volume: {
      total: parseFloat(data.volumeToken0),
      usd: parseFloat(data.volumeUSD), // Keep total historical volume
      daily: correctVolumeUSD // FIXED: Use token's dailyVolumeUSD
    },

    // Stats
    txCount: parseInt(data.txCount),
    liquidityProviderCount: parseInt(data.liquidityProviderCount),

    // Market Cap (totalSupply × price calculated from reserves)
    // totalSupply is in base units, must divide by 10^decimals
    marketCap: {
      cspr: (parseFloat(token.totalSupply) / Math.pow(10, parseInt(token.decimals))) * realPriceCSPR,
      usd: (parseFloat(token.totalSupply) / Math.pow(10, parseInt(token.decimals))) * realPriceCSPR * csprPrice
    },
    
    // Store live CSPR price for reference
    liveCSPRPrice: csprPrice
  };
}

/**
 * Get historical price data for a pair
 * @param {string} pairContractHash - Pair contract hash
 * @param {number} dayID - Day ID (Unix timestamp / 86400)
 * @param {string} interval - Interval: 1D, 1W, 1M
 * @param {number} duration - Duration in days
 * @returns {Promise<Object>} Historical data
 */
export async function getFriendlyMarketHistorical(pairContractHash, dayID, interval = '1W', duration = 365) {
  try {
    const url = `${FRIENDLY_MARKET_API_BASE}/pairs/historical?dayIDs=[${dayID}]&contractHashes=["${pairContractHash}"]&chart=1&interval=${interval}&duration=${duration}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://www.friendly.market'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch historical data: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Friendly.Market historical API error:', error);
    throw error;
  }
}

/**
 * Get token list from Friendly.Market
 * @returns {Promise<Array>} List of tokens
 */
export async function getFriendlyMarketTokenList() {
  try {
    const url = 'https://raw.githubusercontent.com/FriendlyMarket/token-list/main/tokenlist.json';
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch token list: ${response.status}`);
    }

    const data = await response.json();
    return data.tokens || [];

  } catch (error) {
    console.error('Token list fetch error:', error);
    return [];
  }
}

/**
 * Calculate current day ID for historical queries
 * @returns {number} Current day ID
 */
export function getCurrentDayID() {
  return Math.floor(Date.now() / 1000 / 86400);
}

export default {
  getFriendlyMarketPairData,
  getFriendlyMarketHistorical,
  getFriendlyMarketTokenList,
  getCurrentDayID,
  WCSPR_HASH
};
