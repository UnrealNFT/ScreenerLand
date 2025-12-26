/**
 * Real Casper Wallet Service
 * Uses window.CasperWalletProvider for real wallet interactions
 */
class WalletService {
  constructor() {
    this.connected = false
    this.publicKey = null
    this.provider = null
    console.log('✅ Casper Wallet Service initialized')
  }

  isCasperWalletAvailable() {
    const available = typeof window !== 'undefined' && typeof window.CasperWalletProvider === 'function'
    console.log('🔍 Casper Wallet available:', available)
    return available
  }

  async connectWallet() {
    console.log('🔗 Connecting to Casper Wallet...')
    
    if (!this.isCasperWalletAvailable()) {
      throw new Error('Casper Wallet extension not installed')
    }

    try {
      // Get provider instance
      this.provider = window.CasperWalletProvider()
      console.log('✅ Provider created')

      // Request connection
      const isConnected = await this.provider.requestConnection()
      
      if (!isConnected) {
        throw new Error('Connection rejected by user')
      }

      // Get active public key
      this.publicKey = await this.provider.getActivePublicKey()
      this.connected = true
      
      // Try to detect network from provider
      let activeNetwork = 'unknown'
      try {
        // Some wallets expose the network
        if (this.provider.getActiveNetwork) {
          activeNetwork = await this.provider.getActiveNetwork()
        } else if (this.provider.selectedNode) {
          activeNetwork = this.provider.selectedNode.includes('testnet') ? 'testnet' : 'mainnet'
        }
      } catch (e) {
        console.log('⚠️ Could not detect network from wallet')
      }
      
      console.log('✅ Wallet connected:', this.publicKey)
      console.log('🌐 Network:', activeNetwork)
      
      return {
        publicKey: this.publicKey,
        address: this.publicKey,
        wallet: 'casper-wallet',
        network: activeNetwork
      }
    } catch (error) {
      console.error('❌ Wallet connection failed:', error)
      this.connected = false
      this.publicKey = null
      throw error
    }
  }

  async signDeploy(deployJson) {
    console.log('🖊️ Signing deploy...')
    
    if (!this.connected || !this.provider) {
      throw new Error('Wallet not connected')
    }

    try {
      // Sign the deploy using Casper Wallet
      const signedDeployJson = await this.provider.sign(deployJson, this.publicKey)
      console.log('✅ Deploy signed')
      return signedDeployJson
    } catch (error) {
      console.error('❌ Signing failed:', error)
      throw error
    }
  }

  async getBalance() {
    console.log('💰 Fetching balance from CSPR.cloud...')
    
    if (!this.publicKey) {
      return '0'
    }

    try {
      // ⚠️ SECURITY: Use backend proxy instead of direct API calls
      // Frontend should NEVER contain API keys
      const response = await fetch(`${API_URL}/api/balance/${this.publicKey}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      console.log('💰 Balance response:', data)

      if (data.data?.balance) {
        // Convert motes to CSPR (divide by 1e9)
        const cspr = (parseFloat(data.data.balance) / 1e9).toFixed(2)
        console.log('✅ Balance:', cspr, 'CSPR')
        return cspr
      }

      return '0'
    } catch (error) {
      console.error('❌ Balance fetch failed:', error)
      return '0'
    }
  }

  async hasSufficientBalance(requiredAmount) {
    try {
      const balance = await this.getBalance()
      const balanceFloat = parseFloat(balance)
      const required = parseFloat(requiredAmount)
      return balanceFloat >= required
    } catch (error) {
      console.error('❌ Balance check failed:', error)
      return false
    }
  }

  async getTokenHoldings() {
    console.log('🪙 Fetching token holdings from CSPR.cloud...')
    
    if (!this.publicKey) {
      return []
    }

    try {
      // ⚠️ SECURITY: Use backend proxy instead of direct API calls
      // Frontend should NEVER contain API keys
      const response = await fetch(
        `${API_URL}/api/tokens/${this.publicKey}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      const data = await response.json()
      console.log('🪙 Token holdings response:', data)

      if (data.data && Array.isArray(data.data)) {
        return data.data.map(holding => ({
          contractHash: holding.contract_package_hash,
          balance: holding.balance,
          name: holding.contract_package?.name || 'Unknown Token',
          symbol: holding.contract_package?.metadata?.symbol || '???',
          decimals: holding.contract_package?.metadata?.decimals || 9
        }))
      }

      return []
    } catch (error) {
      console.error('❌ Token holdings fetch failed:', error)
      return []
    }
  }

  disconnectWallet() {
    console.log('👋 Disconnecting wallet')
    this.connected = false
    this.publicKey = null
    this.provider = null
  }

  getPublicKey() {
    return this.publicKey
  }

  isConnected() {
    return this.connected
  }
}

export default new WalletService()
