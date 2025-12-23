// CTO Payment Configuration for different networks

// Runtime configuration loaded from backend
let runtimeConfig = null

// Fetch CTO configuration from backend
export async function fetchCTOConfig() {
  try {
    const response = await fetch('http://localhost:3001/api/cto/config')
    if (!response.ok) {
      throw new Error(`Failed to fetch CTO config: ${response.status}`)
    }
    const config = await response.json()
    runtimeConfig = config
    console.log('✅ CTO Config loaded from backend:', config)
    return config
  } catch (error) {
    console.warn('⚠️ Backend unavailable, using testnet fallback config')
    // Fallback config pour développement local
    runtimeConfig = {
      receiverWallet: '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8',
      receiverAccountHash: 'b0ffce605fec444f624757ec3548af878ce20bce704e92602b55ba7aaae27792',
      price: 1000,
      priceMotes: '1000000000000'
    }
    return runtimeConfig
  }
}

// Static config templates avec valeurs par défaut
export const CTO_CONFIG = {
  mainnet: {
    chainName: 'casper',
    receiverWallet: '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8',
    receiverAccountHash: 'b0ffce605fec444f624757ec3548af878ce20bce704e92602b55ba7aaae27792',
    price: 1000,
    priceMotes: '1000000000000',
    rpcNode: 'https://node.mainnet.casper.network/rpc',
    explorerBase: 'https://cspr.live',
    streamingApi: 'wss://streaming.casper.cloud/transfers'
  },
  testnet: {
    chainName: 'casper-test',
    receiverWallet: '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8',
    receiverAccountHash: 'b0ffce605fec444f624757ec3548af878ce20bce704e92602b55ba7aaae27792',
    price: 1000,
    priceMotes: '1000000000000',
    rpcNode: 'https://node.testnet.casper.network/rpc',
    explorerBase: 'https://testnet.cspr.live',
    streamingApi: 'wss://streaming.testnet.cspr.cloud/transfers'
  }
}

// Get config for current network with runtime values
export function getCTOConfig(network = 'testnet') {
  const config = { ...(CTO_CONFIG[network] || CTO_CONFIG.testnet) }
  
  // Inject runtime values from backend if available
  if (runtimeConfig) {
    config.receiverWallet = runtimeConfig.receiverWallet
    config.receiverAccountHash = runtimeConfig.receiverAccountHash
    config.price = runtimeConfig.price
    config.priceMotes = runtimeConfig.priceMotes
  }
  
  return config
}
