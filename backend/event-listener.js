import WebSocket from 'ws'
import fetch from 'node-fetch'

const CSPR_CLOUD_STREAMING_URL = 'wss://streaming.testnet.cspr.cloud'
const CSPR_CLOUD_API = 'https://api.cspr.cloud'
const API_KEY = '019ab0fc-1a64-7cae-afba-cd3c49010b17'

// Known contract hashes for swap detection
const KNOWN_CONTRACTS = {
  FRIENDLY_MARKET_PAIR_CASPY: 'hash-916836ea8540e030e5e5928665e90c9e3f0c68dd6b81dd52e49eebe7e87a875c',
  CSPR_FUN_ROUTER: 'hash-570b36b6daba0a646b0a430c87f8f7de97e00e41d49f53f959eaa8eda46e04e9',
  WCSPR_CONTRACT: 'hash-40bd4a45c414df61be3832e28ff6dcedc479744707c611fd97fea0d90619146f'
}

// Token to monitor (CASPY for now)
const MONITORED_TOKENS = [
  {
    name: 'CASPY',
    contractPackageHash: '9d28ddba00c7e010af63dd3ea50448c72b1b08ba4519f859d995c48d52c97f68',
    decimals: 9
  }
]

// Store recent transactions in memory (will be broadcast to connected clients)
export const recentTransactions = new Map() // tokenHash -> [transactions]

// WebSocket clients connected to our server for real-time updates
export const wsClients = new Set()

export function startEventListener() {
  MONITORED_TOKENS.forEach(token => {
    console.log(`🎧 Starting event listener for ${token.name}...`)
    listenToToken(token)
  })
}

function listenToToken(token) {
  const wsUrl = `${CSPR_CLOUD_STREAMING_URL}/contract-events?contract_package_hash=${token.contractPackageHash}`
  
  console.log(`🔌 Connecting to: ${wsUrl.substring(0, 80)}...`)
  
  const ws = new WebSocket(wsUrl, {
    headers: {
      'authorization': API_KEY
    }
  })

  let lastPingTimestamp = new Date()
  
  // Ping check every 30 seconds
  const pingInterval = setInterval(() => {
    const now = new Date()
    if (now.getTime() - lastPingTimestamp.getTime() > 60000) {
      console.log(`⚠️ No ping from ${token.name} for 60s, reconnecting...`)
      ws.close()
      clearInterval(pingInterval)
      // Reconnect after 5 seconds
      setTimeout(() => listenToToken(token), 5000)
    }
  }, 30000)

  ws.on('open', () => {
    console.log(`✅ Connected to streaming API for ${token.name}`)
  })

  ws.on('message', async (data) => {
    const rawData = data.toString()

    // Handle ping
    if (rawData === 'Ping') {
      lastPingTimestamp = new Date()
      return
    }

    try {
      const event = JSON.parse(rawData)
      console.log(`📨 Event received for ${token.name}:`, event.data?.name || 'unknown')
      
      // Process the event and extract transaction info
      await processEvent(event, token)
      
    } catch (err) {
      console.error(`❌ Error processing event for ${token.name}:`, err.message)
    }
  })

  ws.on('error', (err) => {
    console.error(`❌ WebSocket error for ${token.name}:`, err.message)
    ws.close()
    clearInterval(pingInterval)
    // Reconnect after 5 seconds
    setTimeout(() => listenToToken(token), 5000)
  })

  ws.on('close', () => {
    console.log(`🔌 Disconnected from streaming API for ${token.name}`)
    clearInterval(pingInterval)
    // Reconnect after 5 seconds
    setTimeout(() => listenToToken(token), 5000)
  })
}

async function processEvent(event, token) {
  try {
    // Events from contract can be transfers, mints, burns, etc.
    const eventName = event.data?.name
    const eventData = event.data?.data
    
    if (!eventData) return

    // Detect transaction type based on event
    let type = 'transfer'
    let trader = null
    let amount = '0'
    
    // Check if it's a transfer event
    if (eventName === 'Transfer' || eventName === 'transfer') {
      const from = eventData.from || eventData.sender
      const to = eventData.to || eventData.recipient
      amount = eventData.amount || eventData.value || '0'
      
      // Detect buy/sell based on known contract addresses
      if (from && from.includes(KNOWN_CONTRACTS.CSPR_FUN_ROUTER)) {
        type = 'mint' // Buy (tokens from router to user)
        trader = to
      } else if (to && to.includes(KNOWN_CONTRACTS.CSPR_FUN_ROUTER)) {
        type = 'burn' // Sell (tokens from user to router)
        trader = from
      } else if (from && from.includes(KNOWN_CONTRACTS.FRIENDLY_MARKET_PAIR_CASPY)) {
        type = 'mint' // Buy from FM
        trader = to
      } else if (to && to.includes(KNOWN_CONTRACTS.FRIENDLY_MARKET_PAIR_CASPY)) {
        type = 'burn' // Sell to FM
        trader = from
      } else {
        // Regular transfer between users
        trader = from
      }
    }
    
    // Create transaction object
    const transaction = {
      hash: event.extra?.deploy_hash || 'unknown',
      timestamp: event.timestamp || new Date().toISOString(),
      type: type,
      from: eventData.from || eventData.sender,
      to: eventData.to || eventData.recipient,
      trader: trader,
      amount: amount,
      amountFormatted: amount !== '0' ? (parseFloat(amount) / Math.pow(10, token.decimals)).toFixed(2) : '0',
      blockHeight: event.extra?.block_height || 0,
      tokenSymbol: token.name,
      valueUSD: null,
      isRealTime: true // Flag to indicate this came from event listener
    }
    
    console.log(`💫 New ${type.toUpperCase()}: ${transaction.amountFormatted} ${token.name} by ${trader?.substring(0, 10)}...`)
    
    // Store in memory
    if (!recentTransactions.has(token.contractPackageHash)) {
      recentTransactions.set(token.contractPackageHash, [])
    }
    
    const txList = recentTransactions.get(token.contractPackageHash)
    txList.unshift(transaction) // Add to beginning
    
    // Keep only last 100 transactions
    if (txList.length > 100) {
      txList.pop()
    }
    
    // Broadcast to all connected WebSocket clients
    broadcastTransaction(token.contractPackageHash, transaction)
    
  } catch (err) {
    console.error('Error processing event:', err)
  }
}

function broadcastTransaction(tokenHash, transaction) {
  const message = JSON.stringify({
    type: 'new_transaction',
    tokenHash: tokenHash,
    transaction: transaction
  })
  
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
  
  console.log(`📡 Broadcasted to ${wsClients.size} clients`)
}

// Export function to get cached transactions
export function getRecentTransactions(tokenHash, limit = 20) {
  const txList = recentTransactions.get(tokenHash) || []
  return txList.slice(0, limit)
}
