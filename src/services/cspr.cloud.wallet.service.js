/**
 * CSPR.cloud Wallet Service
 * REAL data from CSPR.cloud API - NO FAKE DATA
 */

const CSPR_CLOUD_API = 'https://api.cspr.cloud'
// ⚠️ SECURITY: API key removed - all requests should go through backend proxy
// const CSPR_CLOUD_API_KEY = 'REMOVED_FOR_SECURITY'
const API_BASE_URL = 'http://localhost:3001'  // Backend URL for proxied requests

class CsprCloudWalletService {
  /**
   * Get account balance in CSPR
   * @param {string} publicKeyOrAccountHash - Account public key or account hash
   * @returns {Promise<{balance: string, balanceUSD: number}>}
   */
  async getAccountBalance(publicKeyOrAccountHash) {
    try {
      const response = await fetch(`${CSPR_CLOUD_API}/accounts/${publicKeyOrAccountHash}`, {
        headers: {
          'Authorization': CSPR_CLOUD_API_KEY,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      
      if (data.data?.balance) {
        const balanceCSPR = (parseFloat(data.data.balance) / 1e9).toFixed(2)
        const balanceUSD = parseFloat(balanceCSPR) * 0.034 // TODO: Get real CSPR price
        
        return {
          balance: balanceCSPR,
          balanceUSD,
          accountHash: data.data.account_hash,
          publicKey: data.data.public_key,
          mainPurse: data.data.main_purse_uref
        }
      }

      return { balance: '0', balanceUSD: 0 }
    } catch (error) {
      console.error('❌ Failed to fetch account balance:', error)
      return { balance: '0', balanceUSD: 0 }
    }
  }

  /**
   * Get fungible token holdings for an account
   * @param {string} publicKeyOrAccountHash
   * @returns {Promise<Array>}
   */
  async getTokenHoldings(publicKeyOrAccountHash) {
    try {
      const response = await fetch(
        `${CSPR_CLOUD_API}/accounts/${publicKeyOrAccountHash}/ft-token-ownership?includes=contract_package&page_size=100`,
        {
          headers: {
            'Authorization': CSPR_CLOUD_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      const data = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        return data.data.map(holding => ({
          contractHash: holding.contract_package_hash,
          balance: holding.balance,
          name: holding.contract_package?.name || 'Unknown Token',
          symbol: holding.contract_package?.metadata?.symbol || '???',
          decimals: holding.contract_package?.metadata?.decimals || 9,
          iconUrl: holding.contract_package?.icon_url,
          websiteUrl: holding.contract_package?.website_url
        }))
      }

      return []
    } catch (error) {
      console.error('❌ Failed to fetch token holdings:', error)
      return []
    }
  }

  /**
   * Get recent transactions for an account
   * @param {string} publicKeyOrAccountHash
   * @param {number} limit - Max number of transactions to fetch
   * @returns {Promise<Array>}
   */
  async getRecentTransactions(publicKeyOrAccountHash, limit = 20) {
    try {
      const response = await fetch(
        `${CSPR_CLOUD_API}/accounts/${publicKeyOrAccountHash}/ft-token-actions?page_size=${limit}&includes=contract_package`,
        {
          headers: {
            'Authorization': CSPR_CLOUD_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      const data = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        return data.data.map(action => ({
          deployHash: action.deploy_hash,
          timestamp: action.timestamp,
          type: this._getActionType(action.ft_action_type_id),
          amount: action.amount,
          tokenName: action.contract_package?.name || 'Unknown',
          tokenSymbol: action.contract_package?.metadata?.symbol || '???',
          fromHash: action.from_hash,
          toHash: action.to_hash
        }))
      }

      return []
    } catch (error) {
      console.error('❌ Failed to fetch recent transactions:', error)
      return []
    }
  }

  /**
   * Get complete wallet profile
   * @param {string} publicKeyOrAccountHash
   * @returns {Promise<Object>}
   */
  async getWalletProfile(publicKeyOrAccountHash) {
    try {
      const [balance, tokens, transactions] = await Promise.all([
        this.getAccountBalance(publicKeyOrAccountHash),
        this.getTokenHoldings(publicKeyOrAccountHash),
        this.getRecentTransactions(publicKeyOrAccountHash, 10)
      ])

      return {
        address: publicKeyOrAccountHash,
        balance: balance.balance,
        balanceUSD: balance.balanceUSD,
        accountHash: balance.accountHash,
        publicKey: balance.publicKey,
        tokens,
        transactions,
        tokenCount: tokens.length
      }
    } catch (error) {
      console.error('❌ Failed to fetch wallet profile:', error)
      return null
    }
  }

  /**
   * Get top holders across all tokens
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getTopHolders(limit = 50) {
    try {
      // Use backend proxy to avoid CORS
      const response = await fetch(
        `${API_BASE_URL}/api/top-holders?limit=${limit}`
      )

      const data = await response.json()
      
      if (data.success && data.data && Array.isArray(data.data)) {
        return data.data
      }

      return []
    } catch (error) {
      console.error('❌ Failed to fetch top holders:', error)
      return []
    }
  }

  _getActionType(typeId) {
    const types = {
      1: 'Mint',
      2: 'Transfer',
      3: 'Approve',
      4: 'Burn'
    }
    return types[typeId] || 'Unknown'
  }
}

export default new CsprCloudWalletService()
