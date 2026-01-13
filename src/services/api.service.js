// ScreenerLand - Real CSPR.cloud API Service
// Connects to Casper blockchain via CSPR.cloud
import { API_URL } from '../config'
import { getFriendlyMarketPairData } from './friendlymarket.service'

const API_CONFIG = {
  // PRODUCTION: Must use backend proxy to avoid CORS
  // DEV: Use Vite proxy configured in vite.config.js
  baseUrl: import.meta.env.PROD ? `${API_URL}/api/cspr-cloud` : '/api',
  apiKey: '0198d342-112b-743b-aaf7-61745bdd3ecd',
  headers: {
    'Content-Type': 'application/json'
  }
}

console.log('🔧 API Service Config:', { 
  mode: import.meta.env.MODE, 
  isProd: import.meta.env.PROD,
  baseUrl: API_CONFIG.baseUrl 
})

/**
 * Make API request with error handling
 */
async function apiRequest(endpoint) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
      headers: API_CONFIG.headers
    })
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('API Request failed:', error)
    throw error
  }
}

/**
 * Get wallet/account details
 */
export async function getWalletData(accountHash) {
  try {
    // Format account identifier for API
    // API accepts: public key (hex) OR account hash (without prefix)
    let formattedHash = accountHash
    
    // Remove any prefixes (hash-, account-hash-)
    if (accountHash.startsWith('hash-')) {
      formattedHash = accountHash.replace('hash-', '')
    } else if (accountHash.startsWith('account-hash-')) {
      formattedHash = accountHash.replace('account-hash-', '')
    }
    
    console.log('Fetching wallet:', formattedHash)
    
    // Get account info
    const accountData = await apiRequest(`/accounts/${formattedHash}`)
    
    // Get FT token actions for this account (to find tokens owned)
    const tokenActions = await apiRequest(`/ft-token-actions?from_account_hash=${accountData.account_hash}&page=1&page_size=100`)
    
    // Calculate balance in CSPR (motes to CSPR)
    const balanceCSPR = accountData.balance / 1e9
    
    // Get unique tokens this wallet interacted with
    const tokensSet = new Set()
    tokenActions.data.forEach(action => {
      if (action.contract_package_hash) {
        tokensSet.add(action.contract_package_hash)
      }
    })
    
    // Fetch details for each token
    const tokens = []
    for (const contractHash of Array.from(tokensSet).slice(0, 10)) {
      try {
        const tokenData = await apiRequest(`/contract-packages/${contractHash}`)
        
        // Calculate holdings from actions
                const holdings = calculateTokenHoldings(accountData.account_hash, tokenActions.data, contractHash)
        
        if (holdings > 0) {
          tokens.push({
            name: tokenData.contract_name || 'Unknown',
            symbol: tokenData.contract_name?.substring(0, 4).toUpperCase() || 'TKN',
            contractHash: contractHash,
            amount: holdings,
            decimals: 9 // Default, should be fetched from contract
          })
        }
      } catch (err) {
        console.log('Token fetch failed:', contractHash)
      }
    }
    
    // Get recent transactions
    const deploysData = await apiRequest(`/deploys?account_hash=${accountData.account_hash}&page=1&page_size=10`)
    
    const transactions = deploysData.data.map(deploy => ({
      hash: deploy.deploy_hash,
      type: deploy.entry_point_name || 'Transfer',
      timestamp: new Date(deploy.timestamp).toLocaleString(),
      status: deploy.status
    }))
    
    return {
      address: accountData.account_hash,
      publicKey: accountData.public_key,
      balance: balanceCSPR,
      balanceUSD: balanceCSPR * 0.034, // Mock CSPR price, should fetch from coingecko
      tokens: tokens,
      transactions: transactions
    }
    
  } catch (error) {
    console.error('Error fetching wallet data:', error)
    throw error
  }
}

/**
 * Calculate token holdings from actions
 */
function calculateTokenHoldings(accountHash, actions, contractHash) {
  let balance = 0
  
  actions.forEach(action => {
    if (action.contract_package_hash === contractHash) {
      const amount = parseFloat(action.amount) || 0
      
      if (action.to_account_hash === accountHash) {
        balance += amount
      }
      if (action.from_account_hash === accountHash) {
        balance -= amount
      }
    }
  })
  
  return balance
}

/**
 * Enrich tokens with REAL market cap from Friendly.Market
 * Uses contract hash like TokenPage does (not package hash)
 */
async function enrichTokensWithMarketData(tokens) {
  console.log(`💰 Loading REAL market caps from Friendly.Market for ${tokens.length} tokens...`)
  
  let enriched = 0
  let noData = 0
  
  // Process in smaller batches to avoid overwhelming API
  const batchSize = 5
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize)
    
    await Promise.all(
      batch.map(async (token) => {
        try {
          // Use contract hash (same logic as TokenPage)
          const cleanHash = token.contractHash.replace(/^(contract-package-|hash-)/, '')
          
          const pairData = await getFriendlyMarketPairData(cleanHash)
          
          if (pairData && pairData.marketCap && pairData.marketCap.usd > 0) {
            token.marketCapUSD = pairData.marketCap.usd
            token.marketCapCSPR = pairData.marketCap.cspr
            token.liquidityUSD = pairData.liquidity.usd
            token.volume24hUSD = pairData.volume.daily
            token.priceCSPR = pairData.price.cspr
            enriched++
          } else {
            noData++
          }
        } catch (error) {
          noData++
        }
      })
    )
    
    // Progress log
    if ((i + batchSize) % 25 === 0) {
      console.log(`  Progress: ${Math.min(i + batchSize, tokens.length)}/${tokens.length} (${enriched} with data)`)
    }
    
    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log(`✅ Market data loaded: ${enriched} tokens have REAL market cap, ${noData} not on DEX`)
}

/**
 * Get all CEP-18 tokens
 */
/**
 * Get all CEP-18 tokens (excludes NFTs)
 * Since there are only ~237 tokens, we fetch them all at once
 */
export async function getAllTokens(page = 1, pageSize = 50) {
  try {
    // FORCE RELOAD: Changed cache key to force recalculation with market caps
    const CACHE_VERSION = 'v2_with_mcap'
    const cachedTokens = window[`_allTokensCache_${CACHE_VERSION}`]
    
    if (!cachedTokens) {
      console.log('🔄 Fetching ALL tokens from API (first load with market cap calculation)...')
      
      // Fetch all contracts (API returns ~911 total, mix of tokens and NFTs)
      const allContracts = []
      let apiPage = 1
      let hasMore = true
      
      while (hasMore && apiPage <= 10) {
        const data = await apiRequest(`/contract-packages?page=${apiPage}&page_size=100&contract_type_id=2`)
        allContracts.push(...(data.data || []))
        
        hasMore = data.data.length === 100
        apiPage++
        
        console.log(`  Fetched page ${apiPage - 1}: ${data.data.length} contracts (${allContracts.length} total)`)
      }
      
      console.log(`📦 Total contracts fetched: ${allContracts.length}`)
      
      // Filter out NFTs - keep only real CEP-18 tokens
      const allTokens = allContracts
        .filter(token => token.latest_version_contract_type_id === 2)
        .map(token => {
          const metadata = token.metadata || {}
          
          return {
            contractHash: token.contract_package_hash,
            name: token.name || metadata.name || 'Unknown Token',
            symbol: metadata.symbol || token.contract_name?.substring(0, 4).toUpperCase() || 'TKN',
            logo: token.icon_url || null,
            description: token.description || '',
            timestamp: token.timestamp,
            deployCount: token.deploy_count || 0,
            // Add ALL available metadata
            owner: token.owner_public_key || 'Unknown',
            decimals: metadata.decimals || 9,
            totalSupply: metadata.total_supply || '0',
            holders: metadata.holders || null,
            volume24h: null,
            marketCapUSD: 0, // Will be enriched from Friendly.Market
            marketCapCSPR: 0, // Will be enriched from Friendly.Market
            isCsprFun: token.icon_url?.includes('cspr.fun') || 
                       token.icon_url?.includes('assets.cspr.fun') ||
                       metadata.logo?.includes('cspr.fun') ||
                       metadata.logo?.includes('assets.cspr.fun') ||
                       false,
            isScreenerFun: false
          }
        })
      
      console.log(`✅ Filtered to ${allTokens.length} real CEP-18 tokens (excluded ${allContracts.length - allTokens.length} NFTs)`)
      
      // Enrich tokens with Friendly.Market data (market cap, liquidity, etc.)
      console.log('💰 Enriching tokens with Friendly.Market data...')
      console.log(`   Found ${allTokens.filter(t => t.isCsprFun).length} CSPR.fun tokens`)
      console.log(`   Found ${allTokens.filter(t => !t.isCsprFun).length} other tokens`)
      
      await enrichTokensWithMarketData(allTokens)
      
      // Verify enrichment worked
      const tokensWithMcap = allTokens.filter(t => t.marketCapUSD > 0).length
      console.log(`✅ After enrichment: ${tokensWithMcap}/${allTokens.length} tokens have market cap`)
      
      if (tokensWithMcap === 0) {
        console.error('❌ ENRICHMENT FAILED - No tokens have market cap data!')
      }
      
      // Cache the results
      window[`_allTokensCache_${CACHE_VERSION}`] = allTokens
    }
    
    // Get cached tokens
    const allTokens = window[`_allTokensCache_${CACHE_VERSION}`]
    
    // Calculate pagination
    const startIdx = (page - 1) * pageSize
    const endIdx = startIdx + pageSize
    const pageTokens = allTokens.slice(startIdx, endIdx)
    const totalPages = Math.ceil(allTokens.length / pageSize)
    
    console.log(`📄 Page ${page}/${totalPages}: Showing ${pageTokens.length} tokens (${startIdx + 1}-${Math.min(endIdx, allTokens.length)} of ${allTokens.length})`)
    
    return {
      tokens: pageTokens,
      pageCount: totalPages,
      totalCount: allTokens.length,
      currentPage: page
    }
  } catch (error) {
    console.error('Error fetching tokens:', error)
    return { tokens: [], pageCount: 0, totalCount: 0, currentPage: 1 }
  }
}

/**
 * Check if token was created on CSPR.fun
 */
export async function isTokenFromCsprFun(contractHash) {
  try {
    // Get contract details to find deploy hash
    const contractResponse = await apiRequest(`/contracts/${contractHash}`)
    const contract = contractResponse.data
    
    if (!contract || !contract.deploy_hash) {
      return false
    }
    
    // Get deploy details
    const deployResponse = await apiRequest(`/deploys/${contract.deploy_hash}`)
    const deploy = deployResponse.data
    
    // Check if deploy args contain csprfun references
    if (deploy && deploy.args) {
      const hasCsprFunHash = deploy.args.csprfun_contract_hash_key || 
                             deploy.args.csprfun_contract_package_hash_key
      return !!hasCsprFunHash
    }
    
    return false
  } catch (error) {
    console.log('Could not check CSPR.fun origin:', error)
    return false
  }
}

/**
 * Get token details and statistics
 */
export async function getTokenDetails(contractHash) {
  try {
    // Clean hash - API expects raw hash without prefix
    let cleanHash = contractHash
    if (contractHash.startsWith('contract-package-')) {
      cleanHash = contractHash.replace('contract-package-', '')
    }
    if (contractHash.startsWith('contract-')) {
      cleanHash = contractHash.replace('contract-', '')
    }
    if (contractHash.startsWith('hash-')) {
      cleanHash = contractHash.replace('hash-', '')
    }
    
    // Try to get contract info
    // If it's a contract hash (not package hash), API might return 404
    let response
    let tokenData
    let actualContractHash = null // Store the actual contract hash
    
    try {
      response = await apiRequest(`/contract-packages/${cleanHash}`)
      tokenData = response.data
      
      console.log('📦 Contract package data:', {
        name: tokenData.metadata?.name,
        owner: tokenData.owner_public_key,
        decimals: tokenData.metadata?.decimals
      })
      
      // Try to get the contract hash from the package
      try {
        const contractsResponse = await apiRequest(`/contracts?page=1&page_size=1`)
        // Search for latest contract version of this package
        const contractList = await apiRequest(`/contracts?contract_package_hash=${cleanHash}&page=1&page_size=1`)
        if (contractList.data && contractList.data.length > 0) {
          actualContractHash = contractList.data[0].contract_hash
        }
      } catch (e) {
        console.log('Could not fetch contract hash:', e)
      }
    } catch (error) {
      // If 404, it might be a contract hash instead of package hash
      console.log('Contract package not found, trying as contract hash:', cleanHash)
      
      // Try /contracts/{hash} endpoint
      try {
        const contractResponse = await apiRequest(`/contracts/${cleanHash}`)
        const contract = contractResponse.data
        
        if (contract && contract.contract_package_hash) {
          console.log('✅ Found package hash from contract:', contract.contract_package_hash)
          // Now fetch the package details
          response = await apiRequest(`/contract-packages/${contract.contract_package_hash}`)
          tokenData = response.data
          // Update cleanHash to the package hash for consistency
          cleanHash = contract.contract_package_hash
          // Store the actual contract hash
          actualContractHash = contract.contract_hash
        } else {
          throw new Error('Contract found but no package hash')
        }
      } catch (contractError) {
        console.error('❌ Failed to resolve contract hash:', contractError)
        throw error // Re-throw original error
      }
    }
    
    // Get token actions for volume calculation
    const actionsData = await apiRequest(`/ft-token-actions?contract_package_hash=${cleanHash}&page=1&page_size=100`)
    
    // Calculate 24h stats
    const now = Date.now()
    const oneDayAgo = now - (24 * 60 * 60 * 1000)
    
    let volume24h = 0
    let transfers24h = 0
    const holders = new Set()
    
    actionsData.data.forEach(action => {
      const timestamp = new Date(action.timestamp).getTime()
      
      // Add all participants as holders (API uses from_hash / to_hash)
      if (action.from_hash) holders.add(action.from_hash)
      if (action.to_hash) holders.add(action.to_hash)
      
      // 24h stats
      if (timestamp > oneDayAgo) {
        const amount = parseFloat(action.amount) || 0
        volume24h += amount
        transfers24h++
      }
    })
    
    // Extract metadata (API structure: data.data.metadata)
    const metadata = tokenData.metadata || {}
    
    return {
      contractHash: contractHash,
      contractHashActual: actualContractHash, // The actual contract hash for checking CSPR.fun origin
      name: tokenData.name || metadata.name || 'Unknown Token',
      symbol: metadata.symbol || tokenData.name?.substring(0, 4).toUpperCase() || 'TKN',
      decimals: metadata.decimals || 9,
      description: metadata.description || tokenData.description,
      logo: metadata.logo || tokenData.icon_url,
      timestamp: tokenData.timestamp,
      deployCount: tokenData.deploy_count || 0,
      volume24h: volume24h,
      transfers24h: transfers24h,
      holders: holders.size,
      totalTransactions: actionsData.item_count || 0,
      contractType: tokenData.latest_version_contract_type_id,
      ownerPublicKey: tokenData.owner_public_key,
      transactions: actionsData.data.slice(0, 20).map(action => ({
        hash: action.deploy_hash,
        from: action.from_hash,
        to: action.to_hash,
        amount: action.amount,
        timestamp: new Date(action.timestamp).toLocaleString(),
        type: action.ft_action_type_id === 1 ? 'Mint' : action.ft_action_type_id === 2 ? 'Transfer' : 'Approve'
      }))
    }
  } catch (error) {
    console.error('Error fetching token details:', error)
    throw error
  }
}

/**
 * Get global platform statistics
 */
export async function getGlobalStats() {
  try {
    // Get CSPR price from CoinGecko, fallback to CryptoCompare
    let csprPrice = 0
    
    // Try CoinGecko first
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd')
      const priceData = await priceResponse.json()
      csprPrice = priceData['casper-network']?.usd || 0
      console.log('✅ CSPR price from CoinGecko:', csprPrice)
    } catch (err) {
      console.warn('⚠️ CoinGecko failed, trying CryptoCompare...', err)
      
      // Fallback to CryptoCompare
      try {
        const ccResponse = await fetch('https://min-api.cryptocompare.com/data/price?fsym=CSPR&tsyms=USD')
        const ccData = await ccResponse.json()
        csprPrice = ccData.USD || 0
        console.log('✅ CSPR price from CryptoCompare:', csprPrice)
      } catch (ccErr) {
        console.error('❌ Both price APIs failed:', ccErr)
      }
    }
    
    // Use cached tokens count if available, otherwise estimate
    const CACHE_VERSION = 'v2_with_mcap'
    const totalRealTokens = window[`_allTokensCache_${CACHE_VERSION}`]?.length || 237
    
    // Count SCREENER.FUN tokens (tokens with isScreenerFun = true)
    const screenerTokens = window[`_allTokensCache_${CACHE_VERSION}`]?.filter(t => t.isScreenerFun).length || 0
    
    return {
      totalTokens: totalRealTokens,      // Real CEP-18 tokens tracked
      csprPrice: csprPrice,              // CSPR price in USD
      screenerTokens: screenerTokens     // Tokens created on SCREENER.FUN
    }
  } catch (error) {
    console.error('Error fetching global stats:', error)
    return {
      totalTokens: 237,
      csprPrice: 0,
      screenerTokens: 0
    }
  }
}

/**
 * Search for tokens, wallets, or transactions
 */
export async function universalSearch(query) {
  // Detect type
  const trimmed = query.trim()
  
  // Remove prefixes if present
  let cleanQuery = trimmed
  if (trimmed.startsWith('hash-')) {
    cleanQuery = trimmed.replace('hash-', '')
  } else if (trimmed.startsWith('account-hash-')) {
    cleanQuery = trimmed.replace('account-hash-', '')
  } else if (trimmed.startsWith('contract-package-')) {
    cleanQuery = trimmed.replace('contract-package-', '')
  }
  
  // Check if hex string
  const isHex = /^[0-9a-fA-F]+$/.test(cleanQuery)
  
  if (!isHex) {
    // Name search
    try {
      const tokens = await getAllTokens(1, 50)
      const results = tokens.tokens.filter(token => 
        token.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        token.symbol.toLowerCase().includes(trimmed.toLowerCase())
      )
      return { type: 'search', results }
    } catch (error) {
      return { type: 'search', results: [] }
    }
  }
  
  // 66 chars = Public Key (wallet)
  // Starts with 01, 02, or 03
  if (cleanQuery.length === 66 && /^0[123]/.test(cleanQuery)) {
    return { type: 'wallet', address: cleanQuery }
  }
  
  // 64 chars = Contract hash OR account hash
  if (cleanQuery.length === 64) {
    // Try to fetch as contract first (tokens are more common in search)
    try {
      const contractHash = `contract-package-${cleanQuery}`
      await apiRequest(`/contract-packages/${contractHash}`)
      return { type: 'token', contractHash: contractHash }
    } catch {
      // If contract fails, try as wallet account hash
      return { type: 'wallet', address: cleanQuery }
    }
  }
  
  // Deploy hash
  if (trimmed.startsWith('deploy-')) {
    return { type: 'transaction', hash: trimmed }
  }
  
  // Fallback to name search
  try {
    const tokens = await getAllTokens(1, 50)
    const results = tokens.tokens.filter(token => 
      token.name.toLowerCase().includes(trimmed.toLowerCase()) ||
      token.symbol.toLowerCase().includes(trimmed.toLowerCase())
    )
    return { type: 'search', results }
  } catch (error) {
    return { type: 'search', results: [] }
  }
}

/**
 * Check if account is a token creator
 */
export async function checkIfCreator(accountHash) {
  // TODO: Implement when we have launchpad tracking
  // For now, check if account deployed any CEP-18 contracts
  try {
    // Remove prefixes
    let formattedHash = accountHash
    if (accountHash.startsWith('hash-')) {
      formattedHash = accountHash.replace('hash-', '')
    } else if (accountHash.startsWith('account-hash-')) {
      formattedHash = accountHash.replace('account-hash-', '')
    }
    
    const deploysData = await apiRequest(`/deploys?account_hash=${formattedHash}&page=1&page_size=50`)
    
    // Check if any deploys created CEP-18 tokens
    const tokenDeployments = deploysData.data.filter(deploy => 
      deploy.entry_point_name === 'install' || 
      deploy.entry_point_name === 'init'
    )
    
    return tokenDeployments.length > 0
  } catch (error) {
    return false
  }
}

console.log('✅ Real API Service loaded')
