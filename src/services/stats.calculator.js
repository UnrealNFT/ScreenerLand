/**
 * Calculate token statistics from available data
 * When external APIs fail, we estimate stats intelligently
 */

class StatsCalculator {
  /**
   * Estimate market cap based on available data
   * @param {object} tokenData - Token information
   * @param {number} csprPrice - Current CSPR price in USD
   * @returns {string} Formatted market cap
   */
  estimateMarketCap(tokenData, csprPrice = 0.006) {
    // If we have total supply and a price, calculate
    if (tokenData.total_supply || tokenData.totalSupply) {
      const supplyStr = String(tokenData.total_supply || tokenData.totalSupply)
      const supply = parseFloat(supplyStr)
      
      // Skip if supply is 0 or invalid
      if (!supply || supply === 0 || isNaN(supply)) {
        return 'N/A'
      }
      
      const decimals = tokenData.decimals || 9
      const actualSupply = supply / Math.pow(10, decimals)
      
      // For CSPR.fun tokens, use a more realistic starting price
      // Based on typical launch prices on pump.fun (Solana)
      const estimatedPriceInCSPR = 0.001 // 0.001 CSPR per token (~$0.000006)
      const marketCapInCSPR = actualSupply * estimatedPriceInCSPR
      const marketCapUSD = marketCapInCSPR * csprPrice
      
      // If market cap is too small, show it anyway
      if (marketCapUSD < 1) {
        return `$${marketCapUSD.toFixed(6)}`
      }
      
      return this.formatMarketCap(marketCapUSD)
    }
    
    return 'N/A'
  }

  /**
   * Format market cap with K, M, B suffixes
   */
  formatMarketCap(value) {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  /**
   * Estimate holder count based on deploy count and token age
   * More deploys = more likely to have holders
   */
  estimateHolders(deployCount, timestamp) {
    // If no deploys, we have NO DATA
    if (!deployCount || deployCount === 0) {
      return 0 // Unknown - show N/A
    }
    
    // Basic estimation: ~5-10% of deploys result in new holders
    const estimatedHolders = Math.floor(deployCount * 0.07)
    return Math.max(1, estimatedHolders) // At least 1 holder (creator)
  }

  /**
   * Estimate transfer count from deploy count
   * Transfers are a subset of all deploys
   */
  estimateTransfers(deployCount) {
    if (!deployCount || deployCount === 0) return 0
    
    // Roughly 40-60% of deploys are transfers
    const estimatedTransfers = Math.floor(deployCount * 0.5)
    return estimatedTransfers
  }

  /**
   * Calculate liquidity based on market cap and holders
   * More holders = better liquidity distribution
   */
  estimateLiquidity(marketCapUSD, holders) {
    if (marketCapUSD === 'N/A' || !holders || holders === 0) return 'N/A'
    
    // Parse market cap back to number
    const mcValue = this.parseMarketCap(marketCapUSD)
    
    // If market cap is tiny, no meaningful liquidity
    if (mcValue < 100) return 'Very Low'
    
    // For new tokens (1 holder = creator), assume 5% initial liquidity
    // For tokens with more holders, assume 10-20% in liquidity pool
    const liquidityPercentage = holders === 1 ? 0.05 : holders > 10 ? 0.15 : 0.10
    const liquidityUSD = mcValue * liquidityPercentage
    
    return this.formatMarketCap(liquidityUSD)
  }

  /**
   * Parse formatted market cap back to number
   */
  parseMarketCap(formatted) {
    const match = formatted.match(/\$?([\d.]+)([KMB]?)/)
    if (!match) return 0
    
    const value = parseFloat(match[1])
    const suffix = match[2]
    
    const multipliers = { K: 1e3, M: 1e6, B: 1e9 }
    return value * (multipliers[suffix] || 1)
  }

  /**
   * Calculate all stats for a token
   */
  calculateAllStats(tokenData, csprPrice = 0.006) {
    const deployCount = tokenData.deployCount || 0
    const timestamp = tokenData.timestamp
    
    const marketCap = this.estimateMarketCap(tokenData, csprPrice)
    const holders = this.estimateHolders(deployCount, timestamp)
    const transfers = this.estimateTransfers(deployCount)
    const liquidity = this.estimateLiquidity(marketCap, holders)
    
    return {
      marketCap,
      liquidity,
      holders,
      transfers,
      totalTransactions: deployCount,
      // Additional computed stats
      holderDistribution: holders > 0 ? 'Fair' : 'Unknown',
      liquidityRating: this.getLiquidityRating(liquidity),
      fromEstimation: true // Flag to show these are estimates
    }
  }

  /**
   * Get liquidity rating
   */
  getLiquidityRating(liquidity) {
    if (liquidity === 'N/A') return 'Unknown'
    
    const value = this.parseMarketCap(liquidity)
    if (value >= 100000) return 'High'
    if (value >= 10000) return 'Medium'
    if (value >= 1000) return 'Low'
    return 'Very Low'
  }

  /**
   * Format large numbers with commas
   */
  formatNumber(num) {
    return num.toLocaleString('en-US')
  }

  /**
   * Get token rank based on market cap
   */
  calculateRank(tokenData, allTokens) {
    // Sort by deploy count as proxy for activity
    const sorted = [...allTokens].sort((a, b) => (b.deployCount || 0) - (a.deployCount || 0))
    const index = sorted.findIndex(t => t.contractHash === tokenData.contract_package_hash)
    return index >= 0 ? index + 1 : null
  }
}

export default new StatsCalculator()
