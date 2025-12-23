/**
 * CSPR.fun API Service
 * Official API for pre-curve tokens on cspr.fun
 */

const CSPRFUN_API_BASE = 'https://api.cspr.fun/api/v1'
const CACHE_KEY = 'csprfun_tokens_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch featured tokens from CSPR.fun
 * @param {string} sortBy - Sort field: 'vol', 'marketCap', 'creationTimestamp'
 * @param {number} limit - Number of tokens to fetch
 * @param {number} skip - Pagination offset
 * @returns {Promise<Object>} API response with tokens data
 */
export async function fetchCsprFunTokens(sortBy = 'vol', limit = 100, skip = 0) {
  try {
    // Check cache first
    const cached = getCachedData()
    if (cached && sortBy === 'vol' && skip === 0) {
      console.log('📦 Using cached CSPR.fun data')
      return cached
    }

    const url = `${CSPRFUN_API_BASE}/tokens/featured?sortBy=${sortBy}&sortDir=desc&limit=${limit}&skip=${skip}`
    console.log('🔍 Fetching CSPR.fun tokens:', url)
    
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Cache successful response
    if (data.success && sortBy === 'vol' && skip === 0) {
      setCachedData(data)
    }
    
    console.log(`✅ Fetched ${data.data?.length || 0} tokens from CSPR.fun`)
    return data
    
  } catch (error) {
    console.error('❌ CSPR.fun API error:', error)
    
    // Return cached data as fallback
    const cached = getCachedData()
    if (cached) {
      console.log('📦 Using cached data as fallback')
      return cached
    }
    
    throw error
  }
}

/**
 * Calculate token price from reserves
 * Price = CSPR Reserve / Token Reserve
 */
export function calculateTokenPrice(csprReserve, tokenReserve) {
  if (!csprReserve || !tokenReserve || tokenReserve === '0') {
    return 0
  }
  
  const cspr = parseFloat(csprReserve)
  const token = parseFloat(tokenReserve)
  
  if (token === 0) return 0
  
  return cspr / token
}

/**
 * Calculate token price in USD
 */
export function calculateTokenPriceUSD(csprReserve, tokenReserve, csprPriceUSD) {
  const priceInCSPR = calculateTokenPrice(csprReserve, tokenReserve)
  return priceInCSPR * (csprPriceUSD || 0)
}

/**
 * Format market cap for display
 */
export function formatMarketCap(marketCapCSPR) {
  const value = parseFloat(marketCapCSPR)
  if (isNaN(value)) return '$0'
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M CSPR`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K CSPR`
  }
  return `${value.toFixed(2)} CSPR`
}

/**
 * Format volume for display
 */
export function formatVolume(volumeCSPR) {
  return formatMarketCap(volumeCSPR) // Same formatting logic
}

/**
 * Format liquidity (CSPR reserve)
 */
export function formatLiquidity(csprReserve) {
  const value = parseFloat(csprReserve)
  if (isNaN(value)) return '0 CSPR'
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M CSPR`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K CSPR`
  }
  return `${value.toFixed(2)} CSPR`
}

/**
 * Get token by contract hash
 * Flexible matching: handles hash-, contract-package-, case differences
 */
export async function getTokenByHash(contractHash) {
  const data = await fetchCsprFunTokens('vol', 100, 0)
  
  if (!data.success || !data.data) {
    return null
  }
  
  // Clean input hash (remove prefixes, lowercase)
  const cleanInput = contractHash
    .replace('contract-package-', '')
    .replace('hash-', '')
    .toLowerCase()
  
  console.log('🔍 Searching CSPR.fun for hash:', cleanInput.substring(0, 16) + '...')
  
  const found = data.data.find(token => {
    // Clean token hashes
    const tokenContract = (token.contractHash || '')
      .replace('contract-package-', '')
      .replace('hash-', '')
      .toLowerCase()
    
    const tokenPackage = (token.contractPackageHash || '')
      .replace('contract-package-', '')
      .replace('hash-', '')
      .toLowerCase()
    
    // Match either contract or package hash
    return tokenContract === cleanInput || 
           tokenPackage === cleanInput ||
           tokenContract.includes(cleanInput.substring(0, 16)) ||
           tokenPackage.includes(cleanInput.substring(0, 16))
  })
  
  if (found) {
    console.log('✅ Found in CSPR.fun:', found.name)
  } else {
    console.log('❌ Not found in CSPR.fun (74 tokens checked)')
  }
  
  return found
}

/**
 * Check if token has social links
 */
export function hasSocialLinks(token) {
  return !!(token.twitter || token.telegram || token.discord || token.website)
}

/**
 * Get social links object
 */
export function getSocialLinks(token) {
  return {
    twitter: token.twitter || null,
    telegram: token.telegram || null,
    discord: token.discord || null,
    website: token.website || null
  }
}

// Cache helpers
function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    
    const { data, timestamp } = JSON.parse(cached)
    
    // Check if cache expired
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Cache read error:', error)
    return null
  }
}

function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error('Cache write error:', error)
  }
}

/**
 * Clear cache manually
 */
export function clearCache() {
  localStorage.removeItem(CACHE_KEY)
  console.log('🗑️ CSPR.fun cache cleared')
}
