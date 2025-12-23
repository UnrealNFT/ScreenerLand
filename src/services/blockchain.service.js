// ScreenerLand - Blockchain Monitoring Service
// Real-time transaction detection inspired by csprbuybot

const RPC_URL = 'https://node.mainnet.casperlabs.io/rpc'  // Updated working RPC endpoint

/**
 * Get latest block from Casper RPC
 */
export async function getLatestBlock() {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'chain_get_block'
      })
    })
    
    const data = await response.json()
    return data.result?.block_with_signatures?.block?.Version2 || null
  } catch (error) {
    console.error('Error fetching block:', error)
    return null
  }
}

/**
 * Get deploy info by hash
 */
export async function getDeployInfo(deployHash) {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'info_get_deploy',
        params: { deploy_hash: deployHash }
      })
    })
    
    const data = await response.json()
    return data.result || null
  } catch (error) {
    console.error('Error fetching deploy:', error)
    return null
  }
}

/**
 * Extract deploys from block
 */
function extractDeploys(block) {
  try {
    const txs = block.body?.transactions || {}
    const deploys = []
    
    for (const txList of Object.values(txs)) {
      for (const tx of txList) {
        if (tx.Deploy) {
          deploys.push(tx.Deploy)
        }
      }
    }
    
    return deploys
  } catch (error) {
    console.error('Error extracting deploys:', error)
    return []
  }
}

/**
 * Parse deploy to check if it's a token buy
 */
export function parseBuyDeploy(deployInfo) {
  try {
    const deploy = deployInfo.deploy
    const session = deploy?.session || {}
    
    // Check if it's a ModuleBytes transaction (CEP-18 interaction)
    if (!session.ModuleBytes) {
      return null
    }
    
    const args = session.ModuleBytes.args || []
    
    let contractHash = null
    let isBuy = false
    let buyer = null
    let amount = null
    let tokenAmount = null
    
    // Parse arguments
    for (const arg of args) {
      const [key, value] = arg
      
      if (key === 'token_to_trade_contract_hash_key') {
        contractHash = value.parsed
      }
      if (key === 'is_buy') {
        isBuy = value.parsed
      }
      if (key === 'amount') {
        amount = value.parsed
      }
      if (key === 'token' || key === 'token_amount' || key === 'amount_out' || key === 'buy_amount') {
        tokenAmount = value.parsed
      }
    }
    
    // Get buyer address
    buyer = deploy.header?.account || null
    
    if (!isBuy || !contractHash) {
      return null
    }
    
    return {
      contractHash,
      buyer,
      amount: amount ? parseInt(amount) / 1e9 : 0, // Convert motes to CSPR
      tokenAmount,
      deployHash: deployInfo.deploy_hash
    }
    
  } catch (error) {
    console.error('Error parsing buy deploy:', error)
    return null
  }
}

/**
 * Start monitoring blockchain for token buys
 * Callback receives: { contractHash, buyer, amount, tokenAmount, deployHash }
 */
export async function startMonitoring(onBuyDetected) {
  console.log('🔍 Starting blockchain monitoring...')
  
  let lastBlockHash = null
  const processedTxs = new Set()
  
  const poll = async () => {
    try {
      const block = await getLatestBlock()
      
      if (!block || block.hash === lastBlockHash) {
        return
      }
      
      lastBlockHash = block.hash
      console.log(`📦 New block: ${block.hash.substring(0, 16)}...`)
      
      const deploys = extractDeploys(block)
      
      for (const deployHash of deploys) {
        // Skip if already processed
        if (processedTxs.has(deployHash)) continue
        
        processedTxs.add(deployHash)
        
        // Fetch deploy details
        const deployInfo = await getDeployInfo(deployHash)
        if (!deployInfo) continue
        
        // Check if it's a buy transaction
        const buyInfo = parseBuyDeploy(deployInfo)
        
        if (buyInfo && onBuyDetected) {
          console.log('🚀 Buy detected:', buyInfo)
          onBuyDetected(buyInfo)
        }
      }
      
      // Cleanup old processed txs (keep last 1000)
      if (processedTxs.size > 1000) {
        const toDelete = Array.from(processedTxs).slice(0, 500)
        toDelete.forEach(tx => processedTxs.delete(tx))
      }
      
    } catch (error) {
      console.error('Monitoring error:', error)
    }
  }
  
  // Poll every 2 seconds
  setInterval(poll, 2000)
  
  // Initial poll
  poll()
}

/**
 * Get CSPR price in USD from CoinGecko
 */
export async function getCsprPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd')
    const data = await response.json()
    return data['casper-network']?.usd || 0.034
  } catch (error) {
    console.error('Error fetching CSPR price:', error)
    return 0.034 // Fallback price
  }
}

/**
 * Format address for display
 */
export function formatAddress(address) {
  if (!address) return ''
  if (address.length < 16) return address
  return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
}

console.log('✅ Blockchain monitoring service loaded')
