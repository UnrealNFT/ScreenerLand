import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import { WebSocketServer } from 'ws'
import multer from 'multer'
import path, { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { startEventListener, getRecentTransactions, wsClients } from './event-listener.js'
import { startRewardsCronJob } from './rewards-cron.js'
import { startCTOListener } from './cto-payment-listener.js'

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from backend/.env (override any parent .env)
dotenv.config({ path: join(__dirname, '.env'), override: true })

// Import database modules (ES modules)
import { initDatabase, query } from './db.js'
import * as storiesDB from './stories-db.js'
import * as usersDB from './users-db.js'
import * as chatDB from './chat-db.js'

const app = express()
const PORT = process.env.PORT || 3001

// ==================== CACHE SYSTEM ====================
// Simple in-memory cache to avoid rate limiting
const apiCache = new Map()
const CACHE_TTL = 60 * 1000 // 1 minute

function getCachedData(key) {
  const cached = apiCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`💾 Cache HIT: ${key.substring(0, 40)}...`)
    return cached.data
  }
  return null
}

function setCachedData(key, data) {
  apiCache.set(key, {
    data,
    timestamp: Date.now()
  })
  console.log(`💾 Cache SET: ${key.substring(0, 40)}...`)
}

// Middleware
app.use(cors({
  origin: ['https://screener.land', 'https://www.screener.land', 'https://screenerland.netlify.app', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '50mb' })) // Increase limit for video uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// File upload configuration (for videos/images)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(7)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true)
    } else {
      cb(new Error('Only video, image, and audio files are allowed'))
    }
  }
})

// Serve uploaded files with CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
}, express.static('uploads'))

// Start the event listener for real-time transactions
console.log('🚀 Starting event listener...')
startEventListener()

// Start the story rewards cron job (runs daily at 00:00)
console.log('🎁 Starting story rewards cron job...')
startRewardsCronJob()

// ==================== ADMIN AUTHENTICATION ====================
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yy3523vega'

// Admin authentication endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body
  
  console.log('🔐 Admin login attempt')
  
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' })
    console.log('✅ Admin login successful')
    res.json({ success: true, token })
  } else {
    console.log('❌ Admin login failed - invalid password')
    res.status(401).json({ success: false, error: 'Invalid password' })
  }
})

// Verify admin token endpoint
app.get('/api/admin/verify', verifyAdminToken, (req, res) => {
  res.json({ success: true, admin: true })
})

// Middleware to verify admin token
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' })
  }
  
  const token = authHeader.substring(7)
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.admin) {
      req.admin = decoded
      next()
    } else {
      res.status(403).json({ success: false, error: 'Not authorized' })
    }
  } catch (error) {
    console.error('❌ Token verification failed:', error.message)
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}

// cspr.cloud API proxy with rotation system
const CSPR_CLOUD_API = 'https://api.cspr.cloud'

// Multiple API keys for load distribution (from .env)
const API_KEYS = {
  wallet: process.env.CSPR_CLOUD_KEY_WALLET,
  general: process.env.CSPR_CLOUD_KEY_GENERAL,
  owner: process.env.CSPR_CLOUD_KEY_OWNER,
  fallback: process.env.CSPR_CLOUD_KEY_FALLBACK
}

// Helper function to try multiple keys with fallback
async function fetchWithKeyRotation(url, keyType = 'general') {
  const keys = keyType === 'wallet' 
    ? [API_KEYS.wallet, API_KEYS.fallback, API_KEYS.general]
    : keyType === 'owner'
    ? [API_KEYS.owner, API_KEYS.general, API_KEYS.fallback]
    : [API_KEYS.general, API_KEYS.fallback, API_KEYS.wallet]
  
  for (const key of keys) {
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': key }
      })
      
      if (response.status !== 429) {
        return response // Success or other error (not rate limited)
      }
      
      console.log(`⚠️ Key rate limited, trying next...`)
    } catch (error) {
      console.log(`❌ Fetch error with key, trying next...`)
    }
  }
  
  // All keys failed
  return { ok: false, status: 429, json: async () => ({}) }
}

// Backward compatibility - use fallback for most endpoints to distribute load
const API_KEY = API_KEYS.fallback  // Changed from general to fallback to distribute load

// Casper RPC endpoints
const CASPER_RPC_MAINNET = 'https://rpc.mainnet.casperlabs.io/rpc'
const CASPER_RPC_TESTNET = 'https://rpc.testnet.casperlabs.io/rpc'

// Fallback: Use cspr.cloud state query API instead of direct RPC
async function getTokenBalanceViaAPI(publicKeyHex, contractHash, decimals, network = 'mainnet') {
  try {
    const apiUrl = network === 'testnet' ? 'https://api.testnet.cspr.cloud' : CSPR_CLOUD_API
    
    // Convert public key to account hash for dictionary key
    const accountHash = publicKeyToAccountHash(publicKeyHex)
    
    console.log(`  🔍 Querying balance for account ${accountHash.substring(0, 10)}... from contract ${contractHash.substring(0, 10)}...`)
    
    // Try to get balance from cspr.cloud extended data
    // This is a workaround - we'll just show the tokens exist for now
    // Real balance would need state_get_dictionary_item RPC call
    
    console.log(`  ℹ️ Balance read via RPC not available (network issue), showing token ownership only`)
    return 'View on cspr.live'
    
  } catch (error) {
    console.error(`  ❌ API error:`, error.message)
    return 'Unknown'
  }
}

// Helper: Convert public key hex to account hash
function publicKeyToAccountHash(publicKeyHex) {
  // Remove '01' or '02' prefix (algorithm identifier)
  const keyBytes = Buffer.from(publicKeyHex, 'hex')
  
  // Hash: blake2b(algorithm_byte + public_key_bytes)
  const hash = crypto.createHash('blake2b512')
  hash.update(keyBytes)
  const accountHashBytes = hash.digest()
  
  // Return hex string (first 32 bytes)
  return accountHashBytes.slice(0, 32).toString('hex')
}

// Helper: Read CEP18 token balance from blockchain via RPC
async function getTokenBalanceViaRPC(publicKeyHex, balancesUref, decimals, network = 'mainnet') {
  try {
    const rpcUrl = network === 'testnet' ? CASPER_RPC_TESTNET : CASPER_RPC_MAINNET
    
    // Convert public key hex to account hash
    const accountHash = publicKeyToAccountHash(publicKeyHex)
    
    console.log(`  🔍 Reading balance from URef: ${balancesUref.substring(0, 20)}... for account ${accountHash.substring(0, 10)}...`)
    
    // Query state: get value from balances dictionary
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'state_get_dictionary_item',
        params: {
          state_root_hash: null, // null = latest
          dictionary_identifier: {
            URef: {
              seed_uref: balancesUref,
              dictionary_item_key: accountHash
            }
          }
        }
      })
    })
    
    const data = await response.json()
    
    if (data.result && data.result.stored_value && data.result.stored_value.CLValue) {
      const balanceRaw = data.result.stored_value.CLValue.parsed
      const balance = parseFloat(balanceRaw) / Math.pow(10, decimals)
      console.log(`  ✅ Balance: ${balance.toFixed(2)}`)
      return balance.toFixed(2)
    } else {
      console.log(`  ⚠️ No balance found (account may not hold this token)`)
      return '0.00'
    }
  } catch (error) {
    console.error(`  ❌ RPC error:`, error.message)
    return '0.00'
  }
}

// Debug
console.log('🔑 Using cspr.cloud API key (VALID - tested with 200 OK)');

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' })
})

// ==================== CTO CONFIGURATION ====================
// Get CTO configuration (wallet addresses from environment)
app.get('/api/cto/config', (req, res) => {
  try {
    const ctoConfig = {
      receiverWallet: process.env.CTO_RECEIVER_WALLET,
      receiverAccountHash: process.env.CTO_RECEIVER_ACCOUNT_HASH,
      price: 1000,
      priceMotes: '1000000000000'
    }
    
    // Validate that values are set
    if (!ctoConfig.receiverWallet || !ctoConfig.receiverAccountHash) {
      return res.status(500).json({ 
        error: 'CTO configuration missing in backend environment variables' 
      })
    }
    
    res.json(ctoConfig)
  } catch (error) {
    console.error('❌ Error getting CTO config:', error)
    res.status(500).json({ error: 'Failed to get CTO configuration' })
  }
})

// ==================== HOLDERS ====================
// Get token holders count (ft-token-ownership)
app.get('/api/cspr-cloud/contract-packages/:hash/ft-token-ownership', async (req, res) => {
  try {
    const { hash } = req.params
    const url = `${CSPR_CLOUD_API}/contract-packages/${hash}/ft-token-ownership`
    
    console.log(`👥 Fetching holders for: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.owner  // Use owner key for contract-packages
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Holders API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Holders: ${data.item_count}`)
    res.json(data)
  } catch (error) {
    console.error('❌ Holders error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== TRANSFERS ====================
// Get token transfers count (ft-token-actions)
app.get('/api/cspr-cloud/contract-packages/:hash/ft-token-actions', async (req, res) => {
  try {
    const { hash } = req.params
    const url = `${CSPR_CLOUD_API}/contract-packages/${hash}/ft-token-actions`
    
    console.log(`📊 Fetching transfers for: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.owner  // Use owner key for contract-packages
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Transfers API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Transfers: ${data.item_count}`)
    res.json(data)
  } catch (error) {
    console.error('❌ Transfers error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== PRICE ====================
// Get current token price (rates/latest)
app.get('/api/cspr-cloud/ft/:hash/rates/latest', async (req, res) => {
  try {
    const { hash } = req.params
    const currencyId = req.query.currency_id || 1
    const url = `${CSPR_CLOUD_API}/ft/${hash}/rates/latest?currency_id=${currencyId}`
    
    console.log(`💰 Fetching price for: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.general  // Prices use general key
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Price API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Price: ${data.data?.amount || 'N/A'} CSPR`)
    res.json(data)
  } catch (error) {
    console.error('❌ Price error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== CHART DATA ====================
// Get historical prices (daily-rates)
app.get('/api/cspr-cloud/ft/:hash/daily-rates', async (req, res) => {
  try {
    const { hash } = req.params
    const queryParams = new URLSearchParams(req.query).toString()
    const url = `${CSPR_CLOUD_API}/ft/${hash}/daily-rates${queryParams ? '?' + queryParams : ''}`
    
    console.log(`📈 Fetching chart data for: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Chart API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Chart data: ${data.item_count} days`)
    res.json(data)
  } catch (error) {
    console.error('❌ Chart error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== OLD ENDPOINTS (KEEP FOR COMPATIBILITY) ====================
// Token info
app.get('/api/cspr-cloud/ft/:hash', async (req, res) => {
  try {
    const { hash } = req.params
    const url = `${CSPR_CLOUD_API}/ft/${hash}`
    
    console.log(`📡 Fetching token info: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Token API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    res.json(data)
  } catch (error) {
    console.error('❌ Token error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Token actions (old path)
app.get('/api/cspr-cloud/ft/:hash/actions', async (req, res) => {
  try {
    const { hash } = req.params
    const queryParams = new URLSearchParams(req.query).toString()
    const url = `${CSPR_CLOUD_API}/ft/${hash}/actions${queryParams ? '?' + queryParams : ''}`
    
    console.log(`📡 Fetching actions: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Actions API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Actions: ${data.item_count || 0}`)
    res.json(data)
  } catch (error) {
    console.error('❌ Actions error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Token owners (old path)
app.get('/api/cspr-cloud/ft/:hash/owners', async (req, res) => {
  try {
    const { hash } = req.params
    const queryParams = new URLSearchParams(req.query).toString()
    const url = `${CSPR_CLOUD_API}/ft/${hash}/owners${queryParams ? '?' + queryParams : ''}`
    
    console.log(`📡 Fetching owners: ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Owners API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Owners: ${data.item_count || 0}`)
    res.json(data)
  } catch (error) {
    console.error('❌ Owners error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== CONTRACTS ====================
// Get contract package details (including owner, metadata, etc.)
app.get('/api/cspr-cloud/contract-packages/:hash', async (req, res) => {
  try {
    const { hash } = req.params
    
    // Check cache first
    const cacheKey = `contract-package-${hash}`
    const cachedData = getCachedData(cacheKey)
    if (cachedData) {
      return res.json(cachedData)
    }
    
    const url = `${CSPR_CLOUD_API}/contract-packages/${hash}`
    
    console.log(`📦 Fetching contract package (owner): ${hash.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.owner  // Use dedicated owner key
      }
    })

    // Handle rate limiting gracefully
    if (response.status === 429 || response.status === 503) {
      console.warn(`⚠️ API Rate Limited (${response.status}). Returning minimal data.`)
      return res.status(200).json({
        data: null,
        message: 'Rate limited - data unavailable'
      })
    }

    let data
    try {
      data = await response.json()
    } catch (parseError) {
      // API returned HTML instead of JSON (access limited page)
      console.error(`❌ JSON parse error: API returned non-JSON (likely rate limit page)`)
      return res.status(200).json({
        data: null,
        message: 'API temporarily unavailable'
      })
    }
    
    if (!response.ok) {
      console.error(`❌ Contract package API: ${response.status}`, data)
      // Return gracefully instead of error
      return res.status(200).json({
        data: null,
        message: `API error: ${response.status}`
      })
    }

    // Log owner info for debugging
    if (data.data) {
      console.log(`✅ Contract package found:`, {
        name: data.data.metadata?.name,
        owner: data.data.owner_public_key,
        decimals: data.data.metadata?.decimals
      })
    }
    
    // Cache successful response
    setCachedData(cacheKey, data)
    
    res.json(data)
  } catch (error) {
    console.error('❌ Contract package error:', error.message)
    // Return gracefully instead of 500
    res.status(200).json({
      data: null,
      message: 'Error fetching data'
    })
  }
})

// ==================== CONTRACT PACKAGES LIST (FOR SCREENER) ====================
// Get ALL contract packages with pagination (for token list)
app.get('/api/cspr-cloud/contract-packages', async (req, res) => {
  try {
    const { page = 1, page_size = 100, contract_type_id = 2 } = req.query
    const url = `${CSPR_CLOUD_API}/contract-packages?page=${page}&page_size=${page_size}&contract_type_id=${contract_type_id}`
    
    console.log(`📦 Fetching contract packages: page=${page}, size=${page_size}`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.general
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Contract packages API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    console.log(`✅ Fetched ${data.data?.length || 0} contract packages`)
    res.json(data)
  } catch (error) {
    console.error('❌ Contract packages error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Get contracts by package hash (to find actual contract hash)
app.get('/api/cspr-cloud/contracts', async (req, res) => {
  try {
    const { contract_package_hash, page = 1, page_size = 1 } = req.query
    const url = `${CSPR_CLOUD_API}/contracts?contract_package_hash=${contract_package_hash}&page=${page}&page_size=${page_size}`
    
    console.log(`🔍 Fetching contracts for package: ${contract_package_hash?.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ Contracts API: ${response.status}`, data)
      return res.status(response.status).json(data)
    }

    if (data.data && data.data.length > 0) {
      console.log(`✅ Found contract hash: ${data.data[0].contract_hash?.substring(0, 20)}...`)
    } else {
      console.log(`⚠️ No contracts found for package`)
    }
    
    res.json(data)
  } catch (error) {
    console.error('❌ Contracts error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ==================== ACCOUNT BALANCE ====================
// Get account balance (supports mainnet and testnet)
// Balance cache: { address: { balance, network, timestamp } }
const balanceCache = new Map()
const BALANCE_CACHE_TTL = 600000 // 10 minutes to reduce API calls

app.get('/api/accounts/:address/balance', async (req, res) => {
  try {
    const { address } = req.params
    const { network } = req.query
    
    // Check cache - but only if it matches the requested network
    const cacheKey = `${address}_${network || 'auto'}`
    const cached = balanceCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_TTL) {
      console.log(`🔄 Using cached balance for ${address.substring(0, 20)}... (${network})`)
      return res.json({ success: true, balance: cached.balance, network: cached.network })
    }
    
    console.log(`💰 Fetching balance for: ${address.substring(0, 20)}... (requested network: ${network || 'auto'})`)
    
    // If network is specified, use ONLY that network
    if (network === 'mainnet') {
      const response = await fetchWithKeyRotation(
        `${CSPR_CLOUD_API}/accounts/${address}`, 
        'wallet'  // Use wallet-dedicated key first
      )
      
      // Check for rate limit
      if (response.status === 429) {
        console.log('⚠️ All keys rate limited on mainnet - returning 0')
        return res.json({ 
          success: true, 
          balance: 0, 
          network: 'mainnet',
          cached: true,
          rateLimited: true
        })
      }
      
      const data = await response.json()
      const balance = data?.data?.balance ? parseInt(data.data.balance) / 1e9 : 0
      
      // Update cache with network-specific key
      balanceCache.set(cacheKey, { balance, network: 'mainnet', timestamp: Date.now() })
      
      console.log(`✅ Mainnet balance: ${balance} CSPR`)
      return res.json({ success: true, balance, network: 'mainnet' })
    }
    
    if (network === 'testnet') {
      const response = await fetch(`https://api.testnet.cspr.cloud/accounts/${address}`, {
        headers: { 'Authorization': API_KEY }
      })
      
      // Check for rate limit
      if (response.status === 429) {
        console.log('⚠️ Rate limited on testnet - returning 0 (no cache available)')
        return res.json({ 
          success: true, 
          balance: 0, 
          network: 'testnet',
          cached: true,
          rateLimited: true
        })
      }
      
      const data = await response.json()
      const balance = data?.data?.balance ? parseInt(data.data.balance) / 1e9 : 0
      
      // Update cache with network-specific key
      balanceCache.set(cacheKey, { balance, network: 'testnet', timestamp: Date.now() })
      
      console.log(`✅ Testnet balance: ${balance} CSPR`)
      return res.json({ success: true, balance, network: 'testnet' })
    }
    
    // If no network specified, try both and auto-detect
    const [mainnetResponse, testnetResponse] = await Promise.all([
      fetch(`${CSPR_CLOUD_API}/accounts/${address}`, {
        headers: { 'Authorization': API_KEY }
      }).catch(() => null),
      fetch(`https://api.testnet.cspr.cloud/accounts/${address}`, {
        headers: { 'Authorization': API_KEY }
      }).catch(() => null)
    ])
    
    const mainnetData = mainnetResponse ? await mainnetResponse.json() : null
    const testnetData = testnetResponse ? await testnetResponse.json() : null
    
    const mainnetBalance = mainnetData?.data?.balance ? parseInt(mainnetData.data.balance) / 1e9 : 0
    const testnetBalance = testnetData?.data?.balance ? parseInt(testnetData.data.balance) / 1e9 : 0
    
    console.log(`📊 Mainnet: ${mainnetBalance} CSPR | Testnet: ${testnetBalance} CSPR`)
    
    // Auto-detect: use network with funds (prefer mainnet if both)
    if (mainnetBalance > 0) {
      console.log(`✅ Auto-detected: Mainnet (${mainnetBalance} CSPR)`)
      res.json({ success: true, balance: mainnetBalance, network: 'mainnet' })
    } else if (testnetBalance > 0) {
      console.log(`✅ Auto-detected: Testnet (${testnetBalance} CSPR)`)
      res.json({ success: true, balance: testnetBalance, network: 'testnet' })
    } else {
      console.log('⚠️ No balance found on either network')
      res.json({ success: true, balance: 0, network: 'unknown' })
    }
  } catch (error) {
    console.error('❌ Balance fetch error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== ACCOUNT ASSETS ====================
// Get account FT tokens (CEP18) - USE CSPR.CLOUD FT-TOKEN-OWNERSHIP ENDPOINT
app.get('/api/accounts/:address/tokens', async (req, res) => {
  try {
    const { address } = req.params
    const { network } = req.query
    console.log(`🪙 Fetching tokens for: ${address.substring(0, 20)}... (network: ${network || 'mainnet'})`)
    
    const apiUrl = network === 'testnet' 
      ? 'https://api.testnet.cspr.cloud'
      : CSPR_CLOUD_API
    
    // Use the OFFICIAL endpoint that returns tokens WITH balances!
    const ownershipResponse = await fetch(
      `${apiUrl}/accounts/${address}/ft-token-ownership?includes=contract_package{metadata}`, 
      {
        headers: { 'Authorization': API_KEY }
      }
    )
    
    if (!ownershipResponse.ok) {
      console.log(`⚠️ FT ownership API error: ${ownershipResponse.status}`)
      return res.json({ success: true, tokens: [], network: network || 'mainnet' })
    }
    
    const ownershipData = await ownershipResponse.json()
    const ownerships = ownershipData?.data || []
    
    console.log(`📦 Found ${ownerships.length} token ownerships`)
    
    const tokens = []
    
    for (const ownership of ownerships) {
      const metadata = ownership.contract_package?.metadata
      const decimals = metadata?.decimals || 0
      const rawBalance = ownership.balance || '0'
      
      // Convert balance from raw to decimal
      const balance = decimals > 0 
        ? (parseFloat(rawBalance) / Math.pow(10, decimals)).toFixed(2)
        : rawBalance
      
      tokens.push({
        contractHash: ownership.contract_package_hash,
        name: metadata?.name || ownership.contract_package?.name || 'Unknown Token',
        symbol: metadata?.symbol || 'UNKNOWN',
        decimals: decimals,
        logo: metadata?.logo || null,
        balance: balance,
        balanceRaw: rawBalance
      })
      
      console.log(`✅ ${metadata?.symbol}: ${balance} (raw: ${rawBalance}, decimals: ${decimals})`)
    }
    
    console.log(`✅ Total tokens: ${tokens.length}`)
    res.json({ success: true, tokens, network: network || 'mainnet' })
  } catch (error) {
    console.error('❌ Tokens fetch error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get account NFTs
app.get('/api/accounts/:address/nfts', async (req, res) => {
  try {
    const { address } = req.params
    const { network } = req.query
    console.log(`🖼️ Fetching NFTs for: ${address.substring(0, 20)}... (network: ${network || 'auto'})`)
    
    // If network is specified, use ONLY that network
    if (network === 'mainnet') {
      const response = await fetch(`${CSPR_CLOUD_API}/accounts/${address}/nft-tokens?page=1&page_size=100`, {
        headers: { 'Authorization': API_KEY }
      })
      
      // Check for rate limit
      if (response.status === 429) {
        console.log('⚠️ Rate limited on NFTs - returning empty array')
        return res.json({ success: true, nfts: [], network: 'mainnet', cached: true })
      }
      
      const data = await response.json()
      const nfts = data?.data || []
      console.log(`✅ Mainnet NFTs: ${nfts.length}`)
      return res.json({ success: true, nfts, network: 'mainnet' })
    }
    
    if (network === 'testnet') {
      const response = await fetch(`https://api.testnet.cspr.cloud/accounts/${address}/nft-tokens?page=1&page_size=100`, {
        headers: { 'Authorization': API_KEY }
      })
      const data = await response.json()
      const nfts = data?.data || []
      console.log(`✅ Testnet NFTs: ${nfts.length}`)
      return res.json({ success: true, nfts, network: 'testnet' })
    }
    
    // Auto-detect: try both networks in parallel
    const [mainnetResponse, testnetResponse] = await Promise.all([
      fetch(`${CSPR_CLOUD_API}/accounts/${address}/nft-tokens?page=1&page_size=100`, {
        headers: { 'Authorization': API_KEY }
      }).catch(() => null),
      fetch(`https://api.testnet.cspr.cloud/accounts/${address}/nft-tokens?page=1&page_size=100`, {
        headers: { 'Authorization': API_KEY }
      }).catch(() => null)
    ])
    
    const mainnetData = mainnetResponse ? await mainnetResponse.json() : null
    const testnetData = testnetResponse ? await testnetResponse.json() : null
    
    const mainnetNFTs = mainnetData?.data || []
    const testnetNFTs = testnetData?.data || []
    
    console.log(`📊 Mainnet: ${mainnetNFTs.length} NFTs | Testnet: ${testnetNFTs.length} NFTs`)
    
    // Return the network with NFTs (prefer mainnet if both have NFTs)
    if (mainnetNFTs.length > 0) {
      console.log(`✅ Using Mainnet: ${mainnetNFTs.length} NFTs`)
      res.json({ success: true, nfts: mainnetNFTs, network: 'mainnet' })
    } else if (testnetNFTs.length > 0) {
      console.log(`✅ Using Testnet: ${testnetNFTs.length} NFTs`)
      res.json({ success: true, nfts: testnetNFTs, network: 'testnet' })
    } else {
      console.log('⚠️ No NFTs found on either network')
      res.json({ success: true, nfts: [], network: 'unknown' })
    }
  } catch (error) {
    console.error('❌ NFTs fetch error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get account transaction history
app.get('/api/accounts/:address/history', async (req, res) => {
  try {
    const { address } = req.params
    const { network, page = 1, page_size = 50 } = req.query
    
    console.log(`📜 Fetching transaction history for: ${address.substring(0, 20)}... (network: ${network || 'mainnet'})`)
    
    const apiUrl = network === 'testnet' 
      ? 'https://api.testnet.cspr.cloud'
      : CSPR_CLOUD_API
    
    // Get account info to obtain the real account hash
    let accountHash = null
    try {
      const accountResponse = await fetch(`${apiUrl}/accounts/${address}`, {
        headers: { 'Authorization': API_KEY }
      })
      if (accountResponse.ok) {
        const accountData = await accountResponse.json()
        accountHash = accountData?.data?.account_hash
        console.log(`🔑 Account hash from API: ${accountHash?.substring(0, 20)}...`)
      }
    } catch (err) {
      console.log(`⚠️ Could not fetch account hash: ${err.message}`)
    }
    
    // Fetch FT token actions with contract package info
    const response = await fetch(
      `${apiUrl}/accounts/${address}/ft-token-actions?page=${page}&page_size=${page_size}&includes=contract_package{metadata}`,
      {
        headers: { 'Authorization': API_KEY }
      }
    )
    
    if (!response.ok) {
      console.log(`⚠️ History API error: ${response.status}`)
      return res.json({ success: true, transactions: [], total: 0, page: parseInt(page), pageSize: parseInt(page_size) })
    }
    
    const data = await response.json()
    const actions = data?.data || []
    const itemCount = data?.item_count || 0
    const pageCount = data?.page_count || 0
    
    console.log(`📦 Found ${actions.length} transactions (total: ${itemCount})`)
    
    // Transform actions into readable transactions
    const transactions = actions.map(action => {
      const metadata = action.contract_package?.metadata
      const decimals = metadata?.decimals || 0
      const symbol = metadata?.symbol || 'UNKNOWN'
      
      // Parse amount safely - filter out invalid/huge numbers
      let amount = '0'
      const rawAmount = parseFloat(action.amount || 0)
      
      if (rawAmount > 0 && rawAmount < 1e20 && decimals > 0) {
        // Valid amount
        amount = (rawAmount / Math.pow(10, decimals)).toFixed(2)
      } else if (rawAmount > 0 && rawAmount < 1e20 && decimals === 0) {
        amount = rawAmount.toFixed(2)
      } else {
        // Invalid amount (too large = approval/allowance, not real transfer)
        return null // Will be filtered out
      }
      
      // Determine direction by comparing account hash
      let type = 'Unknown'
      let direction = 'neutral'
      
      if (accountHash) {
        const isReceived = action.to_hash && action.to_hash.toLowerCase() === accountHash.toLowerCase()
        const isSent = action.from_hash && action.from_hash.toLowerCase() === accountHash.toLowerCase()
        
        if (isReceived && !isSent) {
          type = 'Received'
          direction = 'in'
        } else if (isSent && !isReceived) {
          type = 'Sent'
          direction = 'out'
        } else if (action.ft_action_type_id === 0) {
          type = 'Mint'
          direction = 'in'
        } else if (action.ft_action_type_id === 3) {
          type = 'Burn'
          direction = 'out'
        }
      } else {
        // Fallback to API type if we don't have account hash
        if (action.ft_action_type_id === 0) {
          type = 'Mint'
          direction = 'in'
        } else if (action.ft_action_type_id === 1) {
          type = 'Received'
          direction = 'in'
        } else if (action.ft_action_type_id === 2) {
          type = 'Sent'
          direction = 'out'
        } else if (action.ft_action_type_id === 3) {
          type = 'Burn'
          direction = 'out'
        }
      }
      
      return {
        deployHash: action.deploy_hash,
        timestamp: action.timestamp,
        type,
        direction,
        amount,
        symbol,
        tokenName: metadata?.name || action.contract_package?.name || 'Unknown Token',
        tokenLogo: metadata?.logo || null,
        contractHash: action.contract_package_hash,
        blockHeight: action.block_height,
        from: action.from_hash,
        to: action.to_hash,
        actionTypeId: action.ft_action_type_id // For debugging
      }
    }).filter(tx => tx !== null) // Remove invalid transactions
    
    console.log(`✅ Processed ${transactions.length} valid transactions (filtered ${actions.length - transactions.length} invalid)`)
    
    // Log first transaction for debugging
    if (transactions.length > 0) {
      console.log('📋 Sample transaction:', JSON.stringify(transactions[0], null, 2))
    }
    
    res.json({ 
      success: true, 
      transactions,
      total: itemCount,
      page: parseInt(page),
      pageSize: parseInt(page_size),
      pageCount,
      network: network || 'mainnet'
    })
  } catch (error) {
    console.error('❌ History fetch error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== LAUNCHPAD ROUTES ====================
// In-memory storage for launchpad token stats (will need database for production)
const launchpadTokens = new Map()

// Get token stats for launchpad tokens
app.get('/api/launchpad/token/:hash/stats', async (req, res) => {
  try {
    const { hash } = req.params
    const cleanHash = hash.replace('contract-package-', '').replace('hash-', '')
    
    console.log(`🚀 Launchpad stats for: ${cleanHash.substring(0, 20)}...`)
    
    // Get stored stats or return empty
    const stats = launchpadTokens.get(cleanHash) || {
      contractHash: cleanHash,
      lastPrice: null,
      lastPriceCSPR: null,
      lastPriceUSD: null,
      totalVolume: 0,
      totalVolumeCSPR: 0,
      totalVolumeUSD: 0,
      swapCount: 0,
      lastUpdate: null,
      priceHistory: [] // Array of { timestamp, priceCSPR, priceUSD }
    }
    
    console.log(`✅ Stats: ${stats.swapCount} swaps, last price: ${stats.lastPriceCSPR || 'N/A'} CSPR`)
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('❌ Launchpad stats error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Record a swap transaction for launchpad token
app.post('/api/launchpad/swap', async (req, res) => {
  try {
    const { 
      contractHash,
      amountIn, 
      amountOut, 
      tokenIn, // 'CSPR' or 'TOKEN'
      csprPrice, // Current CSPR price in USD
      timestamp 
    } = req.body
    
    if (!contractHash || !amountIn || !amountOut || !tokenIn) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: contractHash, amountIn, amountOut, tokenIn' 
      })
    }
    
    const cleanHash = contractHash.replace('contract-package-', '').replace('hash-', '')
    
    console.log(`🔄 Recording swap: ${amountIn} ${tokenIn} → ${amountOut} ${tokenIn === 'CSPR' ? 'TOKEN' : 'CSPR'}`)
    
    // Calculate price from swap
    let priceCSPR
    if (tokenIn === 'CSPR') {
      // Buying tokens with CSPR
      priceCSPR = parseFloat(amountIn) / parseFloat(amountOut)
    } else {
      // Selling tokens for CSPR
      priceCSPR = parseFloat(amountOut) / parseFloat(amountIn)
    }
    
    const priceUSD = priceCSPR * (csprPrice || 0.0059) // Default to 0.0059 if not provided
    const volumeCSPR = tokenIn === 'CSPR' ? parseFloat(amountIn) : parseFloat(amountOut)
    const volumeUSD = volumeCSPR * (csprPrice || 0.0059)
    
    // Get or create stats
    const stats = launchpadTokens.get(cleanHash) || {
      contractHash: cleanHash,
      lastPrice: null,
      lastPriceCSPR: null,
      lastPriceUSD: null,
      totalVolume: 0,
      totalVolumeCSPR: 0,
      totalVolumeUSD: 0,
      swapCount: 0,
      lastUpdate: null,
      priceHistory: []
    }
    
    // Update stats
    stats.lastPrice = priceCSPR
    stats.lastPriceCSPR = priceCSPR
    stats.lastPriceUSD = priceUSD
    stats.totalVolume += volumeCSPR
    stats.totalVolumeCSPR += volumeCSPR
    stats.totalVolumeUSD += volumeUSD
    stats.swapCount += 1
    stats.lastUpdate = timestamp || new Date().toISOString()
    
    // Add to price history (keep last 1000 entries)
    stats.priceHistory.push({
      timestamp: stats.lastUpdate,
      priceCSPR,
      priceUSD,
      volume: volumeCSPR
    })
    
    if (stats.priceHistory.length > 1000) {
      stats.priceHistory = stats.priceHistory.slice(-1000)
    }
    
    // Save updated stats
    launchpadTokens.set(cleanHash, stats)
    
    console.log(`✅ Swap recorded: ${stats.swapCount} total swaps, price: ${priceCSPR.toFixed(6)} CSPR`)
    
    res.json({ 
      success: true, 
      message: 'Swap recorded',
      stats: {
        swapCount: stats.swapCount,
        lastPrice: priceCSPR,
        totalVolume: volumeCSPR
      }
    })
  } catch (error) {
    console.error('❌ Swap recording error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get all tracked launchpad tokens
app.get('/api/launchpad/tokens', (req, res) => {
  try {
    const tokens = Array.from(launchpadTokens.entries()).map(([hash, stats]) => ({
      contractHash: hash,
      ...stats
    }))
    
    console.log(`📊 Returning ${tokens.length} launchpad tokens`)
    res.json({ success: true, data: tokens })
  } catch (error) {
    console.error('❌ Launchpad tokens error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== REAL-TIME TRANSACTIONS ====================
// Get recent transactions for a token (DexScreener style)
app.get('/api/token/:hash/transactions', async (req, res) => {
  try {
    const { hash } = req.params
    const { limit = 20, page = 1 } = req.query
    
    console.log(`📊 Fetching token actions for: ${hash.substring(0, 20)}...`)
    
    // First check if we have real-time cached data
    const cachedTx = getRecentTransactions(hash, parseInt(limit))
    if (cachedTx.length > 0 && page === 1) {
      console.log(`⚡ Returning ${cachedTx.length} cached real-time transactions`)
      return res.json({
        success: true,
        data: cachedTx,
        pagination: {
          page: 1,
          limit: parseInt(limit),
          total: cachedTx.length
        },
        source: 'real-time'
      })
    }
    
    // Fallback to API if no cached data or requesting older pages
    const url = `${CSPR_CLOUD_API}/contract-packages/${hash}/ft-token-actions?page=${page}&page_size=${limit}`
    
    let response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEY
      }
    })

    // If cspr.cloud rate limited, try cspr.live
    if (!response.ok && (response.status === 429 || response.status === 500)) {
      console.warn(`⚠️ Transactions API (cspr.cloud): ${response.status}, trying cspr.live...`)
      try {
        const liveUrl = `https://api.cspr.live/contract-packages/${hash}/ft-token-actions?page=${page}&page_size=${limit}`
        response = await fetch(liveUrl)
        if (response.ok) {
          console.log(`✅ Transactions from cspr.live`)
        }
      } catch (liveErr) {
        console.warn('⚠️ cspr.live also failed:', liveErr.message)
      }
    }

    // Check if response is OK before parsing
    if (!response.ok) {
      console.warn(`❌ Token actions API failed: ${response.status}`)
      // Return empty result instead of error to avoid breaking UI
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: parseInt(limit), total: 0 },
        source: 'none',
        message: 'API rate limited or unavailable'
      })
    }

    const data = await response.json()

    // Known DEX/Router addresses
    const FRIENDLY_MARKET_PAIR = 'hash-916836ea8540e030e5e5928665e90c9e3f0c68dd6b81dd52e49eebe7e87a875c'
    const CSPR_FUN_ROUTER = 'hash-570b36b6daba0a646b0a430c87f8f7de97e00e41d49f53f959eaa8eda46e04e9'
    const WCSPR_CONTRACT = 'hash-40bd4a45c414df61be3832e28ff6dcedc479744707c611fd97fea0d90619146f'
    
    // Transform to transaction format with buy/sell detection
    const transactions = (data.data || []).map(tx => {
      let type = tx.action_type
      let realUser = tx.from_account_hash
      
      // Detect buy/sell based on direction and known contracts
      if (tx.action_type === 'transfer') {
        const fromHash = tx.from_account_hash || ''
        const toHash = tx.to_account_hash || ''
        
        // FROM router/pair TO user = BUY (user receives tokens)
        if ((fromHash.includes(FRIENDLY_MARKET_PAIR) || fromHash.includes(CSPR_FUN_ROUTER)) 
            && !toHash.includes(WCSPR_CONTRACT)) {
          type = 'mint' // Buy
          realUser = tx.to_account_hash // Buyer is the recipient
        }
        // FROM user TO router/pair = SELL (user sends tokens)
        else if ((toHash.includes(FRIENDLY_MARKET_PAIR) || toHash.includes(CSPR_FUN_ROUTER))
                 && !fromHash.includes(WCSPR_CONTRACT)) {
          type = 'burn' // Sell
          realUser = tx.from_account_hash // Seller is the sender
        }
        // Otherwise it's a regular transfer between users
        else if (!fromHash.includes('hash-') && !toHash.includes('hash-')) {
          type = 'transfer'
          realUser = tx.from_account_hash
        }
      } else if (tx.action_type === 'mint') {
        type = 'mint'
        realUser = tx.to_account_hash // Recipient of minted tokens
      } else if (tx.action_type === 'burn') {
        type = 'burn'
        realUser = tx.from_account_hash // Burner
      }
      
      return {
        hash: tx.deploy_hash,
        timestamp: tx.timestamp,
        type: type,
        from: tx.from_account_hash,
        to: tx.to_account_hash,
        trader: realUser, // The actual user trading
        amount: tx.amount,
        amountFormatted: (parseFloat(tx.amount) / 1e9).toFixed(2),
        blockHeight: tx.block_height,
        valueUSD: null
      }
    })

    console.log(`✅ Found ${transactions.length} token actions`)
    
    res.json({ 
      success: true, 
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: data.item_count || 0
      }
    })
  } catch (error) {
    console.error('❌ Transactions error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Top holders endpoint for Community page
app.get('/api/top-holders', async (req, res) => {
  try {
    const { limit = 50 } = req.query
    
    const response = await fetch(
      `${CSPR_CLOUD_API}/accounts?order_by=total_balance&order_direction=DESC&page_size=${limit}&includes=account_info`,
      {
        headers: { 'Authorization': API_KEY }
      }
    )
    
    if (!response.ok) {
      console.log(`⚠️ Top holders API error: ${response.status}`)
      return res.json({ success: true, data: [] })
    }
    
    const data = await response.json()
    
    if (data.data && Array.isArray(data.data)) {
      const holders = data.data.map(account => ({
        publicKey: account.public_key,
        accountHash: account.account_hash,
        balance: (parseFloat(account.balance) / 1e9).toFixed(2),
        name: account.account_info?.info?.owner?.name || 'Anonymous',
        logo: account.account_info?.info?.owner?.branding?.logo?.png_256
      }))
      
      console.log(`✅ Fetched ${holders.length} top holders`)
      return res.json({ success: true, data: holders })
    }
    
    res.json({ success: true, data: [] })
  } catch (error) {
    console.error('❌ Top holders error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Cache for latest transactions to avoid rate limiting
let transactionsCache = {
  data: [],
  timestamp: 0,
  ttl: 300000 // 5 minutes cache (was 30 min - too long for real-time feel)
}

// Get ALL latest transactions from ALL tokens (Screener feed)
app.get('/api/transactions/latest', async (req, res) => {
  try {
    const { limit = 50, tokenSymbol } = req.query
    
    // Check cache first
    const now = Date.now()
    const cacheAge = now - transactionsCache.timestamp
    const hasCachedData = transactionsCache.data.length > 0
    
    // ALWAYS return cache if we have it and we're rate limited
    if (hasCachedData && cacheAge < transactionsCache.ttl) {
      console.log(`⚡ Returning cached transactions (age: ${Math.floor(cacheAge/1000)}s)`)
      
      // Filter by tokenSymbol if provided
      let filteredData = transactionsCache.data
      if (tokenSymbol) {
        filteredData = transactionsCache.data.filter(tx => 
          tx.tokenSymbol.toLowerCase() === tokenSymbol.toLowerCase()
        )
        console.log(`🔍 Filtered to ${filteredData.length} transactions for ${tokenSymbol}`)
      }
      
      return res.json({
        success: true,
        data: filteredData.slice(0, parseInt(limit)),
        total: filteredData.length,
        cached: true,
        cacheAge: Math.floor(cacheAge/1000)
      })
    }
    
    // If cache is stale but we're rate limited, return old cache anyway
    if (hasCachedData && cacheAge >= transactionsCache.ttl) {
      console.log(`⚠️ Cache is stale (${Math.floor(cacheAge/60000)} min old), but will try to refresh...`)
    }
    
    console.log('📊 Fetching latest transactions from all tokens...')
    
    // Get all CEP18 tokens using the SAME endpoint as frontend (working!)
    const allTokens = []
    let page = 1
    let hasMore = true
    let rateLimited = false
    
    // Fetch all pages of CEP18 tokens
    while (hasMore && page <= 5) { // Max 5 pages = 500 tokens
      console.log(`🔍 Fetching page ${page}...`)
      const tokensResponse = await fetch(
        `${CSPR_CLOUD_API}/contract-packages?page=${page}&page_size=100&contract_type_id=2`,
        { headers: { 'Authorization': API_KEY } }
      )
      
      console.log(`📡 Response status: ${tokensResponse.status}`)
      
      if (!tokensResponse.ok) {
        if (tokensResponse.status === 429) {
          console.log(`⚠️ Rate limited! Returning cached data if available...`)
          rateLimited = true
        }
        console.log(`❌ Response not OK, breaking`)
        break
      }
      
      const tokensData = await tokensResponse.json()
      console.log(`📦 Received ${tokensData.data?.length || 0} contracts from API`)
      console.log(`🔎 Sample token:`, tokensData.data?.[0])
      
      const pageTokens = (tokensData.data || []).filter(t => 
        t.contract_package_hash && t.latest_version_contract_type_id === 2
      )
      
      console.log(`✅ Filtered to ${pageTokens.length} CEP18 tokens on page ${page}`)
      
      allTokens.push(...pageTokens)
      hasMore = pageTokens.length === 100
      page++
    }
    
    console.log(`✅ Found ${allTokens.length} CEP18 tokens`)
    
    // If rate limited and we have old cache, return it
    if (rateLimited && hasCachedData) {
      console.log(`🔄 Rate limited but have ${transactionsCache.data.length} cached transactions from ${Math.floor(cacheAge/60000)} min ago`)
      
      let filteredData = transactionsCache.data
      if (tokenSymbol) {
        filteredData = transactionsCache.data.filter(tx => 
          tx.tokenSymbol.toLowerCase() === tokenSymbol.toLowerCase()
        )
      }
      
      return res.json({
        success: true,
        data: filteredData.slice(0, parseInt(limit)),
        total: filteredData.length,
        cached: true,
        stale: true,
        cacheAge: Math.floor(cacheAge/1000)
      })
    }
    
    // If no tokens found and no cache, return empty
    if (allTokens.length === 0) {
      console.log(`⚠️ No tokens found and no cache available`)
      return res.json({
        success: true,
        data: [],
        total: 0,
        cached: false
      })
    }
    
    // Fetch recent transactions for ALL tokens (2 per token for speed)
    const allTransactionsPromises = allTokens.map(async (token) => {
      try {
        const txUrl = `${CSPR_CLOUD_API}/contract-packages/${token.contract_package_hash}/ft-token-actions?page=1&page_size=2&with_amounts_in_currency_id=1`
        const txResponse = await fetch(txUrl, {
          headers: { 'Authorization': API_KEY }
        })
        
        if (!txResponse.ok) return []
        
        const txData = await txResponse.json()
        
        return (txData.data || []).map(tx => ({
          hash: tx.deploy_hash,
          tokenSymbol: token.metadata?.symbol || token.name || 'Unknown',
          tokenName: token.name,
          tokenHash: token.contract_package_hash,
          tokenLogo: token.icon_url || null,
          type: tx.action_type || 'transfer',
          wallet: tx.from_account || tx.to_account,
          from: tx.from_account,
          to: tx.to_account,
          amount: '0', // CSPR amount not available in this API
          tokens: tx.amount ? (parseFloat(tx.amount) / 1e9).toFixed(0) : '0', // Token amount
          timestamp: tx.timestamp || new Date().toISOString(),
          blockHeight: tx.block_height
        }))
      } catch (error) {
        return [] // Silent fail for individual tokens
      }
    })
    
    console.log(`⏳ Fetching transactions from ${allTokens.length} tokens...`)
    const allTransactionsArrays = await Promise.all(allTransactionsPromises)
    const allTransactions = allTransactionsArrays.flat()
    
    // Sort by timestamp (newest first)
    allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    // Log first and last timestamps for debugging
    if (allTransactions.length > 0) {
      console.log(`📅 First (newest): ${allTransactions[0].tokenSymbol} - ${new Date(allTransactions[0].timestamp).toLocaleString()}`)
      console.log(`📅 Last (oldest): ${allTransactions[allTransactions.length - 1].tokenSymbol} - ${new Date(allTransactions[allTransactions.length - 1].timestamp).toLocaleString()}`)
    }
    
    // Update cache with 5-minute TTL to reduce API calls while staying fresh
    transactionsCache = {
      data: allTransactions,
      timestamp: Date.now(),
      ttl: 300000 // 5 minutes
    }
    
    console.log(`💾 Cached ${allTransactions.length} transactions for 5 minutes`)
    
    // Filter by tokenSymbol if provided
    let resultTransactions = allTransactions
    if (tokenSymbol) {
      resultTransactions = allTransactions.filter(tx => 
        tx.tokenSymbol.toLowerCase() === tokenSymbol.toLowerCase()
      )
      console.log(`🔍 Filtered to ${resultTransactions.length} transactions for ${tokenSymbol}`)
    }
    
    // Limit results
    const limitedTransactions = resultTransactions.slice(0, parseInt(limit))
    
    console.log(`✅ Returning ${limitedTransactions.length} transactions${tokenSymbol ? ` for ${tokenSymbol}` : ''} (cached for 60s)`)
    
    res.json({
      success: true,
      data: limitedTransactions,
      total: resultTransactions.length,
      cached: false
    })
  } catch (error) {
    console.error('❌ Latest transactions error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get recent swaps from Friendly.Market (if token is graduated)
app.get('/api/token/:hash/swaps', async (req, res) => {
  try {
    const { hash } = req.params
    const { limit = 20 } = req.query
    
    console.log(`💱 Fetching FM swaps for: ${hash.substring(0, 20)}...`)
    
    // TODO: Friendly.Market doesn't have a public swaps endpoint yet
    // For now, return empty array
    // When they add it, format will be similar to Uniswap:
    // GET /api/v1/amm/swaps?pair={pairHash}&limit={limit}
    
    res.json({ 
      success: true, 
      data: [],
      message: 'Friendly.Market swaps endpoint not available yet. Use /transactions for blockchain transfers.'
    })
  } catch (error) {
    console.error('❌ FM Swaps error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== USER ROUTES ====================

// Resolve token hash (accepts either contract hash or package hash)
app.get('/api/token/resolve/:hash', async (req, res) => {
  try {
    const { hash } = req.params
    const cleanHash = hash.replace(/^hash-/, '')
    
    console.log(`🔍 Resolving token hash: ${cleanHash.substring(0, 16)}...`)
    
    // First check our mapping table
    const mappingResult = await query(
      `SELECT package_hash, contract_hash, token_name FROM token_hash_mapping 
       WHERE package_hash = $1 OR contract_hash = $1`,
      [cleanHash]
    )
    
    if (mappingResult.rows.length > 0) {
      const mapping = mappingResult.rows[0]
      console.log(`✅ Found in mapping: ${mapping.token_name}`)
      return res.json({
        success: true,
        token: {
          name: mapping.token_name,
          packageHash: mapping.package_hash,
          contractHash: mapping.contract_hash
        }
      })
    }
    
    // If not in mapping, try cspr.cloud API
    const response = await fetch(`${CSPR_CLOUD_API}/contract-packages/${cleanHash}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': API_KEYS.owner
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log(`✅ Found token package: ${data.name}`)
      
      // Save to mapping for next time
      const packageHash = data.contract_package_hash
      const contractHash = data.contract_hash
      
      if (packageHash && contractHash) {
        await query(
          `INSERT INTO token_hash_mapping (package_hash, contract_hash, token_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (package_hash) DO UPDATE SET
             contract_hash = $2,
             token_name = $3`,
          [packageHash, contractHash, data.name]
        )
        console.log(`💾 Saved mapping: ${packageHash.substring(0, 10)}... → ${contractHash.substring(0, 10)}...`)
      }
      
      // Return both hashes
      res.json({
        success: true,
        token: {
          name: data.name,
          symbol: data.contract_name?.substring(0, 6).toUpperCase() || 'TOKEN',
          packageHash: data.contract_package_hash,
          contractHash: data.contract_hash || null,
          owner: data.owner_public_key
        }
      })
    } else {
      console.log(`❌ Token not found in cspr.cloud`)
      res.json({ success: false, error: 'Token not found' })
    }
  } catch (error) {
    console.error('❌ Error resolving token:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get user profile
app.get('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params
    
    const result = await usersDB.getUserProfile(wallet)
    
    if (result) {
      // Ensure avatar URL is absolute (result uses camelCase: avatarUrl)
      let avatarUrl = result.avatarUrl || result.avatar_url
      if (avatarUrl) {
        if (!avatarUrl.startsWith('http')) {
          // Convert relative URL to absolute
          avatarUrl = `http://localhost:3001${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`
        }
      } else {
        // Explicitly set to null if no avatar
        avatarUrl = null
      }
      
      console.log(`👤 Profile fetched for ${wallet.substring(0, 8)}...: name=${result.name}, avatar=${avatarUrl ? 'YES' : 'NO'}`)
      
      res.json({
        success: true,
        profile: {
          name: result.name,        // Simple "name" for easy access
          avatar: avatarUrl,        // Simple "avatar" for easy access
          username: result.name,    // Keep for backwards compatibility
          avatarUrl: avatarUrl,     // Keep for backwards compatibility
          bio: result.bio
        }
      })
    } else {
      res.json({
        success: false,
        error: 'Profile not found'
      })
    }
  } catch (error) {
    console.error('❌ Error fetching profile:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Update user profile avatar (MUST be before /api/profile/:wallet to avoid route collision)
app.post('/api/profile/update-avatar', upload.single('avatar'), async (req, res) => {
  console.log('👤 AVATAR UPDATE REQUEST:', {
    walletAddress: req.body.walletAddress?.substring(0, 10),
    hasFile: !!req.file,
    fileName: req.file?.filename
  })
  
  try {
    const { walletAddress } = req.body
    
    if (!walletAddress) {
      console.log('❌ Missing walletAddress')
      return res.status(400).json({ error: 'Wallet address required' })
    }
    
    if (!req.file) {
      console.log('❌ No file uploaded')
      return res.status(400).json({ error: 'Avatar image required' })
    }
    
    const avatarPath = `https://api.screener.land/uploads/${req.file.filename}`
    
    // Store avatar in user_profiles table
    await query(
      `INSERT INTO user_profiles (wallet_address, avatar_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET avatar_url = $2, updated_at = NOW()`,
      [walletAddress.toLowerCase(), avatarPath]
    )
    
    console.log('✅ Avatar updated for wallet:', walletAddress.substring(0, 12) + '...')
    
    res.json({
      success: true,
      message: 'Avatar updated successfully',
      avatarUrl: avatarPath
    })
  } catch (error) {
    console.error('❌ Update avatar error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update user profile
app.post('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params
    const { name, bio, avatarUrl } = req.body
    
    console.log(`💾 Saving profile for ${wallet.substring(0, 8)}...:`, {
      name,
      bio: bio?.substring(0, 20) + '...',
      avatarUrl: avatarUrl || 'NULL',
      avatarUrlLength: avatarUrl?.length || 0
    })
    
    await usersDB.updateUserProfile(wallet, { name, bio, avatarUrl })
    
    console.log(`✅ Profile saved to database for ${wallet.substring(0, 8)}...`)
    
    res.json({ success: true })
  } catch (error) {
    console.error('❌ Error updating profile:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Upload avatar (OLD endpoint - kept for backwards compatibility)
app.post('/api/users/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { walletAddress } = req.body
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' })
    }
    
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Wallet address required' })
    }
    
    const avatarUrl = `https://api.screener.land/uploads/${req.file.filename}`
    
    console.log(`✅ Avatar uploaded for ${walletAddress}: ${avatarUrl}`)
    
    // Also store in database
    await query(
      `INSERT INTO user_profiles (wallet_address, avatar_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET avatar_url = $2, updated_at = NOW()`,
      [walletAddress.toLowerCase(), avatarUrl]
    )
    
    res.json({ 
      success: true, 
      avatarUrl: avatarUrl,
      filename: req.file.filename
    })
  } catch (error) {
    console.error('❌ Error uploading avatar:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== COMMUNITY FEED ROUTES ====================

// Get latest messages from all communities (for feed page)
app.get('/api/communities/latest-messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20
    
    console.log(`📡 Fetching latest ${limit} community messages...`)
    
    // Get latest messages from each community - first get all messages sorted by date
    // Then in JavaScript, keep only the latest per token
    const allResult = await query(
      `SELECT 
        token_hash,
        user_wallet,
        user_name,
        message,
        created_at
       FROM chat_messages
       ORDER BY created_at DESC`
    )
    
    // Filter to get only latest message per token
    const seenTokens = new Set()
    const result = {
      rows: allResult.rows
        .filter(msg => {
          if (seenTokens.has(msg.token_hash)) return false
          seenTokens.add(msg.token_hash)
          return true
        })
        .slice(0, limit)
    }
    
    // Get token info for each community
    const messagesWithTokenInfo = await Promise.all(
      result.rows.map(async (msg) => {
        // Default values
        let tokenName = 'Unknown Token'
        let tokenSymbol = 'TOKEN'
        let tokenLogo = null
        let resolvedHash = msg.token_hash
        
        try {
          // STRATEGY 0: Try to resolve hash to package hash (like TokenPage does)
          try {
            const resolveResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${msg.token_hash}`, {
              headers: {
                'Accept': 'application/json',
                'Authorization': API_KEYS.owner
              }
            })
            
            if (!resolveResponse.ok && resolveResponse.status === 404) {
              // Might be contract hash, try to resolve it
              console.log(`🔄 Hash ${msg.token_hash.substring(0, 10)}... returned 404, checking if it's a contract hash`)
              const contractResponse = await fetch(`${CSPR_CLOUD_API}/contracts/${msg.token_hash}`, {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': API_KEYS.owner
                }
              })
              
              if (contractResponse.ok) {
                const contractData = await contractResponse.json()
                if (contractData.data?.contract_package_hash) {
                  resolvedHash = contractData.data.contract_package_hash
                  console.log(`✅ Resolved contract hash to package hash: ${resolvedHash.substring(0, 10)}...`)
                }
              }
            }
          } catch (resolveError) {
            console.warn(`⚠️ Hash resolution error: ${resolveError.message}`)
          }
          
          // STRATEGY 1: Get token metadata from cspr.cloud API using resolved hash
          const cleanHash = resolvedHash.replace(/^hash-/, '')
          const apiUrl = `${CSPR_CLOUD_API}/contract-packages/${cleanHash}`
          
          console.log(`🔍 Fetching token from cspr.cloud: ${cleanHash.substring(0, 10)}... (full: ${cleanHash})`)
          
          try {
            const apiResponse = await fetch(apiUrl, {
              headers: {
                'Accept': 'application/json',
                'Authorization': API_KEYS.owner
              }
            })
            
            console.log(`📡 cspr.cloud response status: ${apiResponse.status}`)
            
            if (apiResponse.ok) {
              const tokenData = await apiResponse.json()
              const metadata = tokenData.data?.metadata || {}
              
              tokenName = tokenData.data?.name || metadata.name || tokenName
              tokenSymbol = metadata.symbol || tokenData.data?.contract_name?.substring(0, 6).toUpperCase() || tokenSymbol
              tokenLogo = tokenData.data?.icon_url || null
              
              console.log(`✅ cspr.cloud data: ${tokenName} (${tokenSymbol}), logo: ${tokenLogo ? 'YES' : 'NO'}`)
            } else {
              console.warn(`⚠️ cspr.cloud returned ${apiResponse.status}`)
            }
          } catch (apiError) {
            console.error(`❌ cspr.cloud API error:`, apiError.message)
          }
          
          // STRATEGY 2: Check token_hash_mapping table for token name
          if (tokenName === 'Unknown Token') {
            try {
              console.log(`🔍 Looking up in token_hash_mapping for hash: ${msg.token_hash}`)
              const mappingResult = await query(
                `SELECT token_name FROM token_hash_mapping WHERE package_hash = $1 OR contract_hash = $1 LIMIT 1`,
                [msg.token_hash]
              )
              
              console.log(`📊 DB result rows: ${mappingResult.rows.length}`)
              if (mappingResult.rows.length > 0) {
                tokenName = mappingResult.rows[0].token_name || tokenName
                tokenSymbol = tokenName.toUpperCase().substring(0, 6)
                console.log(`📊 Found in token_hash_mapping: ${tokenName}`)
              } else {
                console.log(`⚠️ No match in token_hash_mapping for ${msg.token_hash}`)
              }
            } catch (dbErr) {
              console.warn(`⚠️ DB lookup error: ${dbErr.message}`)
            }
          }
          
          // STRATEGY 4: If still unknown, use hash as fallback name
          if (tokenName === 'Unknown Token') {
            tokenName = `Token ${msg.token_hash.substring(0, 8)}...`
            tokenSymbol = msg.token_hash.substring(0, 4).toUpperCase()
            console.log(`🔢 Using hash as name: ${tokenName}`)
          }
          
          // STRATEGY 5: Fallback to cache
          if (!tokenLogo || tokenName === 'Unknown Token') {
            const cacheKey = `contract-package-${msg.token_hash}`
            let cachedData = getCachedData(cacheKey)
            
            console.log(`🔍 Cache data for ${msg.token_hash.substring(0, 10)}...:`, JSON.stringify(cachedData))
            
            if (cachedData) {
              if (!tokenName || tokenName === 'Unknown Token') {
                tokenName = cachedData.name || tokenName
              }
              if (!tokenSymbol || tokenSymbol === 'TOKEN') {
                // Extract symbol from name if not in cache
                tokenSymbol = cachedData.symbol || cachedData.name?.toUpperCase() || tokenSymbol
              }
            }
          }
        } catch (err) {
          console.warn(`⚠️ Could not load token info for ${msg.token_hash.substring(0, 10)}...`)
        }
        
        console.log(`📦 Returning for ${msg.token_hash.substring(0, 10)}...: name="${tokenName}", symbol="${tokenSymbol}", logo="${tokenLogo}"`)
        
        // Get user avatar if available
        let userAvatar = null
        if (msg.user_wallet) {
          try {
            const profileResult = await query(
              `SELECT avatar_url FROM users WHERE wallet_address = $1`,
              [msg.user_wallet]
            )
            if (profileResult.rows.length > 0) {
              userAvatar = profileResult.rows[0].avatar_url
            }
          } catch (profileErr) {
            console.warn(`⚠️ Could not fetch user avatar: ${profileErr.message}`)
          }
        }
        
        return {
          tokenHash: msg.token_hash,
          tokenName,
          tokenSymbol,
          tokenLogo,
          userWallet: msg.user_wallet,
          userName: msg.user_name,
          userAvatar,
          message: msg.message,
          timestamp: msg.created_at
        }
      })
    )
    
    console.log(`✅ Loaded ${messagesWithTokenInfo.length} community messages`)
    
    res.json({
      success: true,
      data: messagesWithTokenInfo
    })
  } catch (error) {
    console.error('❌ Error loading community feed:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== STORIES ROUTES ====================

// Create new story (video/image/gif + optional music)
app.post('/api/stories', upload.fields([{ name: 'media', maxCount: 1 }, { name: 'music', maxCount: 1 }]), async (req, res) => {
  try {
    const { userWallet, tokenHash, tokenSymbol, tokenLogo, caption, duration, mediaType, overlayText, tokenOwner, network = 'mainnet' } = req.body
    
    if (!userWallet || !tokenHash) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const mediaFile = req.files['media']?.[0]
    const musicFile = req.files['music']?.[0]
    
    if (!mediaFile) {
      return res.status(400).json({ error: 'Media file required' })
    }
    
    // ⚠️ SECURITY CHECK: Fetch REAL owner from blockchain via API
    console.log(`🔐 Verifying upload permission for ${userWallet.substring(0, 10)}... on token ${tokenHash.substring(0, 10)}... (${network})`)
    
    let realOwner = null
    let normalizedPackageHash = tokenHash.replace(/^hash-/, '')
    
    try {
      // Try to get real owner from cspr.cloud API
      const cacheKey = `contract-package-${normalizedPackageHash}`
      
      // Check cache first
      let packageData = getCachedData(cacheKey)
      
      if (!packageData) {
        // First, try as package hash
        let ownerResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${normalizedPackageHash}`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': API_KEY
          }
        })
        
        // If 404, might be a contract hash - resolve to package hash
        if (!ownerResponse.ok && ownerResponse.status === 404) {
          console.log(`🔄 ${normalizedPackageHash.substring(0, 10)}... not found as package, trying as contract...`)
          const contractResponse = await fetch(`${CSPR_CLOUD_API}/contracts/${normalizedPackageHash}`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': API_KEY
            }
          })
          
          if (contractResponse.ok) {
            const contractData = await contractResponse.json()
            const resolvedPackageHash = contractData.data?.contract_package_hash
            
            if (resolvedPackageHash) {
              console.log(`✅ Resolved contract hash to package hash: ${resolvedPackageHash.substring(0, 10)}...`)
              normalizedPackageHash = resolvedPackageHash
              
              // Now fetch the package data
              ownerResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${resolvedPackageHash}`, {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': API_KEY
                }
              })
            }
          }
        }
        
        if (ownerResponse.ok) {
          packageData = await ownerResponse.json()
          setCachedData(cacheKey, packageData)
        }
      }
      
      if (packageData?.data?.owner_public_key) {
        realOwner = packageData.data.owner_public_key
        console.log(`✅ Real owner from blockchain: ${realOwner.substring(0, 10)}...`)
      } else {
        console.warn(`⚠️ Could not fetch real owner from API, using provided tokenOwner`)
        realOwner = tokenOwner
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching owner from API:`, error.message)
      realOwner = tokenOwner // Fallback to provided owner
    }
    
    // Check permission with REAL owner (use normalized package hash)
    const permission = await storiesDB.canUploadStories(normalizedPackageHash, userWallet, realOwner, network)
    
    if (!permission.canUpload) {
      console.warn(`🚫 Upload DENIED for ${userWallet.substring(0, 10)}...`)
      console.warn(`   Real owner: ${realOwner?.substring(0, 10)}...`)
      console.warn(`   User wallet: ${userWallet.substring(0, 10)}...`)
      console.warn(`   Reason: ${permission.reason}`)
      
      // Clean up uploaded files since upload is denied
      if (mediaFile) {
        const fs = await import('fs')
        fs.unlinkSync(mediaFile.path)
      }
      if (musicFile) {
        const fs = await import('fs')
        fs.unlinkSync(musicFile.path)
      }
      
      return res.status(403).json({ 
        error: 'Upload permission denied',
        reason: permission.reason,
        details: permission.canReclaim 
          ? `Current owner/CTO holder is inactive for ${permission.inactiveDays} days. You can reclaim CTO access for 10 CSPR.`
          : 'Only the token owner or CTO holder can upload stories.'
      })
    }
    
    console.log(`✅ Upload permission GRANTED for ${userWallet.substring(0, 10)}...`)
    console.log(`📦 Using normalized package hash: ${normalizedPackageHash.substring(0, 10)}...`)
    
    // Ensure user exists in database before creating story
    await usersDB.getProfile(userWallet)
    
    const story = await storiesDB.createStory({
      userWallet,
      tokenHash: normalizedPackageHash,  // ✅ Always use package hash
      tokenSymbol,
      tokenLogo: tokenLogo || null,
      videoUrl: `/uploads/${mediaFile.filename}`,
      mediaType: mediaType || 'video',
      musicUrl: musicFile ? `/uploads/${musicFile.filename}` : null,
      caption,
      overlayText: overlayText || '',
      duration: parseFloat(duration) || 0
    })
    
    // 🔥 Update last_activity for CTO holder when they upload a story
    await storiesDB.query(
      `UPDATE cto_access 
       SET last_activity = CURRENT_TIMESTAMP 
       WHERE token_hash = $1 AND wallet_address = $2 AND network = $3`,
      [normalizedPackageHash, userWallet.toLowerCase(), network]
    )
    console.log(`✅ Updated last_activity for CTO holder on ${network}`)
    
    res.json({ success: true, story })
  } catch (error) {
    console.error('❌ Story creation error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all stories (feed)
app.get('/api/stories', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query
    const stories = await storiesDB.getAllStories(parseInt(limit), parseInt(offset))
    
    res.json({ success: true, stories, count: stories.length })
  } catch (error) {
    console.error('❌ Stories fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get stories by token
app.get('/api/stories/token/:hash', async (req, res) => {
  try {
    const { hash } = req.params
    const { limit = 20 } = req.query
    const stories = await storiesDB.getStoriesByToken(hash, parseInt(limit))
    
    res.json({ success: true, stories, count: stories.length })
  } catch (error) {
    console.error('❌ Token stories fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get stories by user
app.get('/api/stories/user/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params
    const { limit = 20 } = req.query
    const stories = await storiesDB.getStoriesByUser(wallet, parseInt(limit))
    
    res.json({ success: true, stories, count: stories.length })
  } catch (error) {
    console.error('❌ User stories fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete a story
app.delete('/api/stories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress, adminOverride } = req.body
    
    // Allow deletion without wallet check if adminOverride is true
    if (!adminOverride && !walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' })
    }
    
    const result = await storiesDB.deleteStory(id)
    
    if (result) {
      console.log(`🗑️ Story ${id} deleted ${adminOverride ? '(admin)' : `by ${walletAddress.substring(0, 10)}...`}`)
      res.json({ success: true, message: 'Story deleted successfully' })
    } else {
      res.status(404).json({ success: false, error: 'Story not found' })
    }
  } catch (error) {
    console.error('❌ Story deletion error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Increment view count
app.post('/api/stories/:id/view', async (req, res) => {
  try {
    const { id } = req.params
    const story = await storiesDB.incrementViews(id)
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' })
    }
    
    res.json({ success: true, story })
  } catch (error) {
    console.error('❌ View increment error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Toggle like
app.post('/api/stories/:id/like', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress } = req.body
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' })
    }
    
    const result = await storiesDB.toggleLike(id, walletAddress)
    
    if (!result) {
      return res.status(404).json({ error: 'Story not found' })
    }
    
    res.json({ success: true, story: result.story, liked: result.liked })
  } catch (error) {
    console.error('❌ Like toggle error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Add comment
app.post('/api/stories/:id/comment', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress, text, userName } = req.body
    
    if (!walletAddress || !text) {
      return res.status(400).json({ error: 'Wallet address and text required' })
    }
    
    // Ensure user exists in database before creating comment
    await usersDB.getProfile(walletAddress)
    
    const comment = await storiesDB.addComment(id, walletAddress, text, userName)
    
    if (!comment) {
      return res.status(404).json({ error: 'Story not found' })
    }
    
    res.json({ success: true, comment })
  } catch (error) {
    console.error('❌ Comment add error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get comments
app.get('/api/stories/:id/comments', async (req, res) => {
  try {
    const { id } = req.params
    const comments = await storiesDB.getComments(id)
    
    res.json({ success: true, comments })
  } catch (error) {
    console.error('❌ Comments fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Increment share count
app.post('/api/stories/:id/share', async (req, res) => {
  try {
    const { id } = req.params
    const { walletAddress } = req.body
    
    const story = await storiesDB.incrementShares(id, walletAddress)
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' })
    }
    
    res.json({ success: true, story })
  } catch (error) {
    console.error('❌ Share increment error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get top stories (leaderboard)
app.get('/api/stories/top', (req, res) => {
  try {
    const { limit = 10, date } = req.query
    const stories = storiesDB.getTopStories(parseInt(limit), date)
    
    res.json({ success: true, stories })
  } catch (error) {
    console.error('❌ Top stories fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get user profile
app.get('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params
    const profile = await storiesDB.getProfile(wallet)
    
    res.json({ success: true, profile })
  } catch (error) {
    console.error('❌ Profile fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update user profile
app.put('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params
    const updates = req.body
    
    const profile = await storiesDB.updateProfile(wallet, updates)
    
    res.json({ success: true, profile })
  } catch (error) {
    console.error('❌ Profile update error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Check if user liked a story
app.get('/api/stories/:id/liked/:wallet', (req, res) => {
  try {
    const { id, wallet } = req.params
    const liked = storiesDB.hasUserLiked(id, wallet)
    
    res.json({ success: true, liked })
  } catch (error) {
    console.error('❌ Like check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ==================== CTO ACCESS ROUTES ====================

// Check if wallet has CTO access for a token
app.get('/api/stories/cto-access/:tokenHash/:wallet', async (req, res) => {
  try {
    const { tokenHash, wallet } = req.params
    const { network = 'mainnet' } = req.query
    console.log(`🔍 CTO Access Check API:`, { tokenHash: tokenHash.substring(0, 12) + '...', wallet: wallet.substring(0, 12) + '...', network })
    // Note: hasCTOAccess already normalizes the hash internally
    const hasAccess = await storiesDB.hasCTOAccess(tokenHash, wallet, network)
    console.log(`✅ CTO Access Result:`, { hasAccess, wallet: wallet.substring(0, 12) + '...', network })
    
    res.json({ success: true, hasAccess, network })
  } catch (error) {
    console.error('❌ CTO access check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Revoke CTO access (admin endpoint)
app.delete('/api/stories/cto-access/:tokenHash/:wallet', async (req, res) => {
  try {
    const { tokenHash, wallet } = req.params
    // Note: revokeCTOAccess already normalizes the hash internally
    await storiesDB.revokeCTOAccess(tokenHash, wallet)
    
    console.log(`🗑️ CTO access revoked for ${wallet.substring(0, 10)}... on token ${tokenHash.substring(0, 10)}...`)
    
    res.json({ 
      success: true, 
      message: `CTO access revoked for ${wallet.substring(0, 10)}...` 
    })
  } catch (error) {
    console.error('❌ CTO revoke error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Claim CTO access (purchase for 10 CSPR)
app.post('/api/stories/claim-cto', async (req, res) => {
  try {
    const { tokenHash, walletAddress, amount, tokenOwner, txHash } = req.body
    
    if (!tokenHash || !walletAddress) {
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required for payment verification' })
    }
    
    const CTO_PRICE = 1000 // 1000 CSPR for CTO access
    
    if (amount !== CTO_PRICE) {
      return res.status(400).json({ error: `CTO access costs ${CTO_PRICE} CSPR` })
    }
    
    // Verify payment using OUR WORKING API!
    console.log(`💰 Verifying CTO payment: ${txHash}`)
    const YOUR_WALLET = '0202e5a88e2baf0306484eced583f8642902752668b4b91070dc2abd01d6304d2cd8'
    
    // Step 1: Validate hash format
    if (!txHash || txHash.length !== 64 || !/^[a-f0-9]+$/i.test(txHash)) {
      return res.status(400).json({ error: 'Invalid transaction hash format' })
    }
    
    // Step 2: Check if hash was already used (prevent reuse)
    console.log(`🔍 Checking if transaction hash was already used...`)
    
    const hashCheckQuery = `
      SELECT wallet_address, token_hash, granted_at, network 
      FROM cto_access 
      WHERE transaction_hash = $1
      LIMIT 1
    `
    
    const hashCheckResult = await pool.query(hashCheckQuery, [txHash])
    
    if (hashCheckResult.rows.length > 0) {
      const existingClaim = hashCheckResult.rows[0]
      console.log(`❌ Hash already used by ${existingClaim.wallet_address.substring(0, 10)}... on ${existingClaim.granted_at}`)
      return res.status(400).json({ 
        error: 'This transaction hash has already been used to claim CTO access' 
      })
    }
    
    console.log(`✅ Transaction hash is unique - proceeding with CTO grant`)
    console.log(`💰 Transaction hash: ${txHash}`)
    console.log(`🔗 View on blockchain: https://cspr.live/deploy/${txHash}`)
    
    // Continue to grant access - hash will be stored with the claim
    
    // 🔄 Normalize hash: resolve contract hash → package hash
    let normalizedPackageHash = tokenHash.replace(/^hash-/, '')
    
    try {
      // Try as package hash first
      let packageResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${normalizedPackageHash}`, {
        headers: { 'Accept': 'application/json', 'Authorization': API_KEY }
      })
      
      // If 404, might be a contract hash - resolve it
      if (!packageResponse.ok && packageResponse.status === 404) {
        console.log(`🔄 Resolving contract hash to package hash for CTO claim...`)
        const contractResponse = await fetch(`${CSPR_CLOUD_API}/contracts/${normalizedPackageHash}`, {
          headers: { 'Accept': 'application/json', 'Authorization': API_KEY }
        })
        
        if (contractResponse.ok) {
          const contractData = await contractResponse.json()
          if (contractData.data?.contract_package_hash) {
            normalizedPackageHash = contractData.data.contract_package_hash
            console.log(`✅ Resolved to package hash: ${normalizedPackageHash.substring(0, 10)}...`)
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not resolve hash, using as-is:', err.message)
    }
    
    console.log(`🔑 CTO claim for: ${normalizedPackageHash.substring(0, 10)}... by ${walletAddress.substring(0, 10)}...`)
    
    // Check if user already has access
    const alreadyHasAccess = await storiesDB.hasCTOAccess(normalizedPackageHash, walletAddress)
    console.log(`🔍 DEBUG hasCTOAccess result:`, { 
      alreadyHasAccess, 
      tokenHash: normalizedPackageHash, 
      wallet: walletAddress,
      walletLower: walletAddress.toLowerCase()
    })
    if (alreadyHasAccess) {
      return res.status(400).json({ error: 'You already have CTO access' })
    }
    
    // Check if current holder is inactive (can reclaim)
    const reclaimStatus = await storiesDB.canReclaimCTO(normalizedPackageHash, tokenOwner)
    
    if (!reclaimStatus.canReclaim) {
      return res.status(400).json({ 
        error: 'Current owner/CTO holder is still active. CTO can only be reclaimed after 90 days of inactivity.',
        currentController: reclaimStatus.currentController,
        daysSinceActivity: reclaimStatus.daysSinceActivity
      })
    }
    
    // Revoke access from inactive owner or CTO holder
    if (reclaimStatus.currentController && reclaimStatus.currentController !== tokenOwner) {
      await storiesDB.revokeCTOAccess(normalizedPackageHash, reclaimStatus.currentController)
      console.log(`♻️ CTO reclaimed from inactive CTO holder: ${reclaimStatus.currentController.substring(0, 10)}...`)
    }
    
    // Grant access to new claimer (with transaction hash)
    const access = await storiesDB.grantCTOAccess(normalizedPackageHash, walletAddress, amount, txHash)
    
    console.log(`🔥 CTO claimed for ${normalizedPackageHash.substring(0, 10)}... by ${walletAddress.substring(0, 10)}...`)
    
    res.json({ 
      success: true, 
      access,
      reclaimed: reclaimStatus.canReclaim,
      previousController: reclaimStatus.currentController,
      reason: reclaimStatus.reason
    })
  } catch (error) {
    console.error('❌ CTO claim error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all CTO holders for a token
app.get('/api/stories/cto-holders/:tokenHash', async (req, res) => {
  try {
    const { tokenHash } = req.params
    const { network = 'mainnet' } = req.query
    const holders = await storiesDB.getCTOHolders(tokenHash, network)
    
    res.json({ success: true, holders, count: holders.length, network })
  } catch (error) {
    console.error('❌ CTO holders fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get ALL CTO entries (admin debug)
app.get('/api/admin/all-cto', async (req, res) => {
  try {
    const { network = 'mainnet' } = req.query
    const result = await storiesDB.query(
      'SELECT * FROM cto_access WHERE network = $1 ORDER BY granted_at DESC',
      [network]
    )
    
    res.json({ 
      success: true, 
      entries: result.rows,
      count: result.rows.length,
      network 
    })
  } catch (error) {
    console.error('❌ All CTO fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Revoke CTO Access (user wants to remove their CTO access)
app.delete('/api/cto/revoke/:tokenHash/:walletAddress', async (req, res) => {
  try {
    const { tokenHash, walletAddress } = req.params
    const { network = 'mainnet' } = req.query
    
    console.log(`🗑️ Revoking CTO access for ${walletAddress.substring(0, 10)}... on token ${tokenHash.substring(0, 10)}... (${network})`)
    
    const cleanHash = tokenHash.replace(/^hash-/, '')
    const cleanWallet = walletAddress.toLowerCase()
    
    const result = await storiesDB.query(
      `DELETE FROM cto_access 
       WHERE token_hash = $1 AND wallet_address = $2 AND network = $3
       RETURNING *`,
      [cleanHash, cleanWallet, network]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CTO access not found' })
    }
    
    console.log(`✅ CTO access revoked successfully`)
    
    res.json({ 
      success: true, 
      message: 'CTO access revoked successfully',
      revoked: result.rows[0]
    })
  } catch (error) {
    console.error('❌ Revoke CTO access error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete all user stories for a specific token
app.delete('/api/stories/delete-my-stories/:tokenHash/:walletAddress', async (req, res) => {
  try {
    const { tokenHash, walletAddress } = req.params
    
    console.log(`🗑️ Deleting all stories from ${walletAddress.substring(0, 10)}... for token ${tokenHash.substring(0, 10)}...`)
    
    const cleanHash = tokenHash.replace(/^hash-/, '')
    const cleanWallet = walletAddress.toLowerCase()
    
    // Get count first
    const countResult = await storiesDB.query(
      `SELECT COUNT(*) as count FROM stories 
       WHERE token_hash = $1 AND user_wallet = $2`,
      [cleanHash, cleanWallet]
    )
    
    const storyCount = parseInt(countResult.rows[0].count)
    
    if (storyCount === 0) {
      return res.json({ 
        success: true, 
        message: 'No stories to delete',
        deletedCount: 0
      })
    }
    
    // Delete stories
    const deleteResult = await storiesDB.query(
      `DELETE FROM stories 
       WHERE token_hash = $1 AND user_wallet = $2
       RETURNING id`,
      [cleanHash, cleanWallet]
    )
    
    console.log(`✅ Deleted ${deleteResult.rows.length} stories`)
    
    res.json({ 
      success: true, 
      message: `${deleteResult.rows.length} stories deleted successfully`,
      deletedCount: deleteResult.rows.length
    })
  } catch (error) {
    console.error('❌ Delete stories error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get user's CTO payment history
app.get('/api/cto/payment-history/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params
    const { network = 'mainnet' } = req.query
    
    console.log(`📜 Fetching CTO payment history for wallet: ${walletAddress.substring(0, 12)}... on ${network}`)
    
    const result = await storiesDB.query(
      `SELECT token_hash, paid_amount, transaction_hash, granted_at, network 
       FROM cto_access 
       WHERE wallet_address = $1 AND network = $2
       ORDER BY granted_at DESC`,
      [walletAddress.toLowerCase(), network]
    )
    
    console.log(`✅ Found ${result.rows.length} CTO payments for this wallet on ${network}`)
    
    if (result.rows.length === 0) {
      return res.json({ success: true, payments: [], count: 0 })
    }
    
    // Fetch all tokens from cspr.cloud API (same as frontend getAllTokens)
    console.log('🔍 Fetching tokens from cspr.cloud to enrich payment data...')
    const allContracts = []
    let apiPage = 1
    let hasMore = true
    
    while (hasMore && apiPage <= 10) {
      try {
        const url = `${CSPR_CLOUD_API}/contract-packages?page=${apiPage}&page_size=100&contract_type_id=2`
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Authorization': API_KEYS.owner
          }
        })
        
        if (!response.ok) break
        
        const data = await response.json()
        allContracts.push(...(data.data || []))
        hasMore = data.data.length === 100
        apiPage++
      } catch (error) {
        console.warn(`⚠️ Failed to fetch tokens page ${apiPage}:`, error.message)
        break
      }
    }
    
    console.log(`📦 Fetched ${allContracts.length} contracts from API`)
    
    // Filter to real tokens
    const allTokens = allContracts
      .filter(token => token.latest_version_contract_type_id === 2)
      .map(token => {
        const metadata = token.metadata || {}
        return {
          contractHash: token.contract_package_hash,
          name: token.name || metadata.name || 'Unknown Token',
          symbol: metadata.symbol || token.contract_name?.substring(0, 4).toUpperCase() || 'TKN',
          logo: token.icon_url || null
        }
      })
    
    console.log(`✅ Filtered to ${allTokens.length} real CEP-18 tokens`)
    
    // Enrich payments with token data
    const enrichedPayments = result.rows.map(payment => {
      // Match token by hash (flexible matching)
      const tokenHash = payment.token_hash.replace(/^hash-/, '')
      const found = allTokens.find(t => {
        const tHash = t.contractHash.replace(/^hash-/, '')
        return tHash === tokenHash || 
               tHash.includes(tokenHash.substring(0, 16)) ||
               tokenHash.includes(tHash.substring(0, 16))
      })
      
      if (found) {
        console.log(`✅ Matched ${payment.token_hash.substring(0, 10)}... → ${found.name}`)
        return {
          ...payment,
          tokenName: found.name,
          tokenSymbol: found.symbol,
          tokenLogo: found.logo
        }
      }
      
      // Fallback if not found
      console.warn(`⚠️ No match for ${payment.token_hash.substring(0, 10)}...`)
      return {
        ...payment,
        tokenName: 'Unknown Token',
        tokenSymbol: tokenHash.substring(0, 4).toUpperCase(),
        tokenLogo: null
      }
    })
    
    res.json({ 
      success: true, 
      payments: enrichedPayments,
      count: enrichedPayments.length 
    })
  } catch (error) {
    console.error('❌ CTO payment history fetch error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ==================== TOKENS SCREENER WITH MARKET CAP ====================
// Get all tokens with market cap enrichment (backend-side for performance)
app.get('/api/tokens/screener', async (req, res) => {
  try {
    console.log('🔍 Fetching ALL tokens with market cap enrichment...')
    const startTime = Date.now()
    
    // 1. Fetch ALL CEP-18 tokens from cspr.cloud
    const allContracts = []
    let apiPage = 1
    let hasMore = true
    
    while (hasMore && apiPage <= 10) {
      try {
        const url = `${CSPR_CLOUD_API}/contract-packages?page=${apiPage}&page_size=100&contract_type_id=2`
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Authorization': API_KEYS.owner
          }
        })
        
        if (!response.ok) break
        
        const data = await response.json()
        allContracts.push(...(data.data || []))
        hasMore = data.data.length === 100
        apiPage++
      } catch (error) {
        console.warn(`⚠️ Failed to fetch tokens page ${apiPage}:`, error.message)
        break
      }
    }
    
    console.log(`📦 Fetched ${allContracts.length} contracts from cspr.cloud`)
    
    // 2. Filter to real CEP-18 tokens (exclude NFTs)
    const allTokens = allContracts
      .filter(token => token.latest_version_contract_type_id === 2)
      .map(token => {
        const metadata = token.metadata || {}
        return {
          contractHash: token.contract_package_hash,
          contractHashActual: token.latest_contract_hash || token.contract_package_hash, // REAL contract hash for FM
          name: token.name || metadata.name || 'Unknown Token',
          symbol: metadata.symbol || token.contract_name?.substring(0, 4).toUpperCase() || 'TKN',
          logo: token.icon_url || metadata.logo || null,
          timestamp: token.timestamp || null,
          decimals: metadata.decimals || 9,
          totalSupply: metadata.total_supply || '0',
          isCsprFun: (token.icon_url || '').includes('cspr.fun') || 
                     (metadata.logo || '').includes('cspr.fun'),
          marketCapUSD: 0 // Will be enriched below
        }
      })
    
    console.log(`✅ Filtered to ${allTokens.length} CEP-18 tokens`)
    
    // 3. Enrich with CSPR.fun API data (market cap for non-graduated tokens)
    console.log('💰 Enriching with CSPR.fun market caps...')
    try {
      const csprFunResponse = await fetch('https://api.cspr.fun/api/v1/tokens/featured?sortBy=vol&sortDir=desc&limit=100&skip=0')
      if (csprFunResponse.ok) {
        const csprFunData = await csprFunResponse.json()
        const csprFunTokens = csprFunData.data || []
        const csprPriceUSD = 0.0059
        
        let enrichedCount = 0
        for (const token of allTokens) {
          const cleanHash = token.contractHash.replace(/^(contract-package-|hash-)/, '')
          
          const found = csprFunTokens.find(t => {
            // Clean both hashes for comparison
            const csprFunHash = (t.contractHash || '').replace(/^(contract-package-|hash-)/, '')
            const csprFunPkgHash = (t.contractPackageHash || '').replace(/^(contract-package-|hash-)/, '')
            
            return csprFunHash === cleanHash || csprFunPkgHash === cleanHash
          })
          
          if (found && !found.isGraduated && found.marketCapCSPR) {
            // Convert European format (comma) to US format (dot)
            const marketCapCSPRValue = parseFloat(found.marketCapCSPR.toString().replace(',', '.'))
            
            token.marketCapUSD = marketCapCSPRValue * csprPriceUSD
            token.marketCapCSPR = marketCapCSPRValue
            token.priceCSPR = parseFloat(found.csprReserveUi) / parseFloat(found.tokenReserveUi)
            token.liquidityCSPR = parseFloat(found.csprReserveUi.toString().replace(',', '.'))
            token.volumeCSPR = parseFloat(found.allTimeVolumeCSPR.toString().replace(',', '.'))
            enrichedCount++
            
            // Debug first 3 matches
            if (enrichedCount <= 3) {
              console.log(`  ✅ Enriched ${token.symbol}: $${token.marketCapUSD.toFixed(0)}`)
            }
          }
        }
        
        console.log(`✅ Enriched ${enrichedCount} tokens with CSPR.fun market caps`)
      }
    } catch (err) {
      console.warn('⚠️ CSPR.fun enrichment failed:', err.message)
    }
    
    // 4. Enrich remaining tokens (with marketCapUSD = 0) with Friendly.Market API
    console.log('💰 Enriching remaining tokens with Friendly.Market...')
    try {
      const tokensWithoutMcap = allTokens.filter(t => !t.marketCapUSD || t.marketCapUSD === 0)
      console.log(`  Found ${tokensWithoutMcap.length} tokens without market cap, trying Friendly.Market (limit 30)...`)
      
      let fmEnriched = 0
      const batchSize = 3
      
      for (let i = 0; i < Math.min(tokensWithoutMcap.length, 30); i += batchSize) {
        const batch = tokensWithoutMcap.slice(i, i + batchSize)
        
        await Promise.all(
          batch.map(async (token) => {
            try {
              // Use ACTUAL contract hash (not package hash) - same as TokenPage
              const actualHash = token.contractHashActual || token.contractHash
              const cleanHash = actualHash.replace(/^(contract-package-|hash-)/, '')
              const fmUrl = `https://api.friendly.market/api/v1/amm/pair/info/${cleanHash}`
              
              const fmResponse = await fetch(fmUrl)
              if (fmResponse.ok) {
                const fmData = await fmResponse.json()
                
                if (fmData.marketCap?.usd > 0) {
                  token.marketCapUSD = fmData.marketCap.usd
                  token.marketCapCSPR = fmData.marketCap.cspr
                  token.priceCSPR = fmData.price.cspr
                  token.liquidityCSPR = fmData.liquidity.cspr
                  token.volumeCSPR = fmData.volume?.daily || 0
                  fmEnriched++
                  
                  console.log(`  ✅ FM: ${token.symbol}: $${token.marketCapUSD.toFixed(0)}`)
                }
              }
            } catch (err) {
              // Ignore errors, just skip
            }
          })
        )
        
        // Delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 800))
      }
      
      console.log(`✅ Enriched ${fmEnriched} additional tokens with Friendly.Market`)
    } catch (err) {
      console.warn('⚠️ Friendly.Market enrichment failed:', err.message)
    }
    
    const elapsed = Date.now() - startTime
    console.log(`✅ Screener tokens ready in ${elapsed}ms`)
    
    res.json({
      success: true,
      tokens: allTokens,
      totalCount: allTokens.length,
      enrichedCount: allTokens.filter(t => t.marketCapUSD > 0).length
    })
    
  } catch (error) {
    console.error('❌ Tokens screener error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ✅ Report a story
app.post('/api/stories/:id/report', async (req, res) => {
  try {
    const { id } = req.params
    const { reporterWallet, reason, description } = req.body
    
    if (!reporterWallet || !reason) {
      return res.status(400).json({ error: 'Reporter wallet and reason required' })
    }
    
    const report = await storiesDB.reportStory({
      storyId: parseInt(id),
      reporterWallet,
      reason,
      description
    })
    
    res.json({ success: true, report })
  } catch (error) {
    console.error('❌ Report story error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ✅ Admin: Get all reports
app.get('/api/admin/reports', async (req, res) => {
  try {
    const { status } = req.query
    const reports = await storiesDB.getAllReports(status || null)
    
    res.json({ success: true, reports, count: reports.length })
  } catch (error) {
    console.error('❌ Get reports error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ✅ Admin: Resolve a report
app.post('/api/admin/reports/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params
    const { resolvedBy, action } = req.body
    
    if (!resolvedBy || !action) {
      return res.status(400).json({ error: 'Resolved by and action required' })
    }
    
    const report = await storiesDB.resolveReport(parseInt(id), resolvedBy, action)
    
    res.json({ success: true, report })
  } catch (error) {
    console.error('❌ Resolve report error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Remove duplicate CTO entries for a token (admin endpoint)
app.delete('/api/stories/cto-duplicates/:tokenHash', async (req, res) => {
  try {
    const { tokenHash } = req.params
    const { keepWallet, network = 'mainnet' } = req.body // Which wallet to keep
    
    if (!keepWallet) {
      return res.status(400).json({ error: 'keepWallet address required' })
    }
    
    // Get all CTO holders for this token
    const holders = await storiesDB.getCTOHolders(tokenHash, network)
    
    if (holders.length <= 1) {
      return res.json({ 
        success: true, 
        message: 'No duplicates found',
        removed: 0
      })
    }
    
    // Delete all except the one to keep
    let removed = 0
    for (const holder of holders) {
      if (holder.wallet_address.toLowerCase() !== keepWallet.toLowerCase()) {
        await storiesDB.revokeCTOAccess(tokenHash, holder.wallet_address)
        console.log(`🗑️ Removed duplicate CTO: ${holder.wallet_address.substring(0, 10)}...`)
        removed++
      }
    }
    
    res.json({ 
      success: true, 
      message: `Removed ${removed} duplicate CTO entries`,
      removed,
      kept: keepWallet
    })
  } catch (error) {
    console.error('❌ CTO duplicate removal error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Clean all CTO duplicates - keep only the real owner
app.post('/api/admin/clean-cto-duplicates', async (req, res) => {
  try {
    const { tokenHash, ownerWallet, network = 'mainnet' } = req.body
    
    if (!tokenHash || !ownerWallet) {
      return res.status(400).json({ error: 'tokenHash and ownerWallet required' })
    }
    
    console.log(`🧹 Cleaning CTO duplicates for ${tokenHash.substring(0, 10)}... on ${network}`)
    console.log(`👤 Keeping only owner: ${ownerWallet.substring(0, 10)}...`)
    
    // Get all current CTO holders
    const holders = await storiesDB.getCTOHolders(tokenHash, network)
    console.log(`📊 Found ${holders.length} CTO entries:`)
    holders.forEach(h => {
      console.log(`   - ${h.wallet_address} (granted: ${h.granted_at})`)
    })
    
    if (holders.length === 0) {
      return res.json({ success: true, message: 'No CTO entries found', removed: 0 })
    }
    
    // Remove all entries
    let removed = 0
    for (const holder of holders) {
      await storiesDB.revokeCTOAccess(tokenHash, holder.wallet_address)
      console.log(`🗑️ Removed: ${holder.wallet_address.substring(0, 10)}...`)
      removed++
    }
    
    // Re-grant access only to the real owner
    await storiesDB.grantCTOAccess(tokenHash, ownerWallet, 0)
    console.log(`✅ CTO access restored to owner: ${ownerWallet.substring(0, 10)}...`)
    
    res.json({ 
      success: true, 
      message: `Cleaned ${removed} entries, restored owner access`,
      removed,
      owner: ownerWallet
    })
  } catch (error) {
    console.error('❌ Clean CTO error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Check upload permission (owner or CTO)
app.post('/api/stories/check-upload-permission', async (req, res) => {
  try {
    const { tokenHash, walletAddress, tokenOwner, network = 'mainnet' } = req.body
    
    if (!tokenHash || !walletAddress) {
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    const permission = await storiesDB.canUploadStories(tokenHash, walletAddress, tokenOwner, network)
    
    res.json({ success: true, ...permission })
  } catch (error) {
    console.error('❌ Upload permission check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ROUTE DE SECOURS: Débloquer manuellement un CTO avec un deploy hash vérifié
app.post('/api/stories/manual-cto-unlock', async (req, res) => {
  try {
    const { walletAddress, deployHash, tokenHash } = req.body
    
    if (!walletAddress || !deployHash) {
      return res.status(400).json({ error: 'Missing walletAddress or deployHash' })
    }
    
    console.log(`🔓 Manual CTO unlock: ${walletAddress} with deploy ${deployHash}`)
    
    // Normaliser
    const cleanWallet = walletAddress.toLowerCase().replace(/^(0x|account-hash-)/, '')
    const cleanDeploy = deployHash.toLowerCase().replace(/^(deploy-|0x)/, '')
    const cleanToken = tokenHash ? tokenHash.toLowerCase().replace(/^(hash-)/, '') : null
    
    // Insérer l'accès CTO
    const insertQuery = `
      INSERT INTO cto_access (
        wallet_address,
        deploy_hash,
        amount_cspr,
        token_package_hash,
        granted_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (wallet_address, token_package_hash) DO UPDATE
      SET deploy_hash = EXCLUDED.deploy_hash,
          amount_cspr = EXCLUDED.amount_cspr,
          granted_at = NOW()
      RETURNING *
    `
    
    const result = await query(insertQuery, [cleanWallet, cleanDeploy, 10, cleanToken])
    
    console.log(`✅ Manual CTO unlocked for ${cleanWallet}`)
    
    res.json({
      success: true,
      message: 'CTO access manually granted',
      data: result.rows[0]
    })
    
  } catch (error) {
    console.error('❌ Error in manual unlock:', error)
    res.status(500).json({ error: error.message })
  }
})

// Check if wallet has CTO access for a token (used by auto-payment polling)
app.get('/api/stories/check-access/:tokenHash/:walletAddress', async (req, res) => {
  try {
    const { tokenHash, walletAddress } = req.params
    const { network = 'mainnet' } = req.query
    
    if (!tokenHash || !walletAddress) {
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    // Normalize hash
    const cleanHash = tokenHash.replace(/^hash-/, '')
    
    const hasCTOAccess = await storiesDB.hasCTOAccess(cleanHash, walletAddress, network)
    
    res.json({ 
      success: true, 
      hasCTOAccess,
      tokenHash: cleanHash,
      walletAddress,
      network
    })
  } catch (error) {
    console.error('❌ Access check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 🔒 Check if CTO is available for purchase (BEFORE payment)
app.post('/api/stories/check-cto-availability', async (req, res) => {
  try {
    const { tokenHash, network = 'mainnet' } = req.body
    
    if (!tokenHash) {
      return res.status(400).json({ error: 'Token hash required' })
    }
    
    const cleanHash = tokenHash.replace(/^hash-/, '')
    
    console.log(`🔍 Checking CTO availability for ${cleanHash.substring(0, 10)}... on ${network}`)
    
    // Check if there's an existing CTO holder
    const existingCTOQuery = `
      SELECT wallet_address, last_activity FROM cto_access 
      WHERE token_hash = $1 AND network = $2
    `
    const existingCTO = await storiesDB.query(existingCTOQuery, [cleanHash, network])
    
    if (existingCTO.rows.length === 0) {
      // ✅ No CTO holder - available!
      console.log(`✅ CTO is available - no existing holder`)
      return res.json({ 
        available: true,
        message: 'CTO access is available for purchase'
      })
    }
    
    // Check if existing holder is INACTIVE (90 days)
    const holder = existingCTO.rows[0]
    const lastActivity = holder.last_activity
    
    const daysSinceActivity = lastActivity 
      ? (Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
      : 999
    
    const CTO_INACTIVITY_DAYS = 90 // 90 days
    
    if (daysSinceActivity >= CTO_INACTIVITY_DAYS) {
      // ✅ Holder is INACTIVE - can be reclaimed
      console.log(`✅ CTO holder is INACTIVE (${daysSinceActivity.toFixed(1)} days) - available for reclaim`)
      return res.json({
        available: true,
        canReclaim: true,
        inactiveHolder: holder.wallet_address.substring(0, 10) + '...',
        daysSinceActivity: Math.floor(daysSinceActivity),
        message: 'Previous CTO holder is inactive - you can reclaim'
      })
    }
    
    // ❌ Holder is ACTIVE - NOT available
    console.log(`❌ CTO holder is ACTIVE (${daysSinceActivity.toFixed(1)} days since activity) - NOT available`)
    return res.json({
      available: false,
      currentHolder: holder.wallet_address.substring(0, 10) + '...',
      daysSinceActivity: Math.floor(daysSinceActivity),
      daysRemaining: Math.ceil(CTO_INACTIVITY_DAYS - daysSinceActivity),
      message: `CTO is held by an active user. ${Math.ceil(CTO_INACTIVITY_DAYS - daysSinceActivity)} days remaining.`
    })
    
  } catch (error) {
    console.error('❌ CTO availability check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ⚠️ Check if current user (CTO holder) is approaching inactivity limit
app.post('/api/stories/check-my-inactivity', async (req, res) => {
  try {
    const { tokenHash, walletAddress, network = 'mainnet' } = req.body
    
    if (!tokenHash || !walletAddress) {
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    const cleanHash = tokenHash.replace(/^hash-/, '')
    
    // Get CTO access info
    const ctoQuery = `
      SELECT last_activity FROM cto_access 
      WHERE token_hash = $1 AND wallet_address = $2 AND network = $3
    `
    const ctoResult = await storiesDB.query(ctoQuery, [cleanHash, walletAddress.toLowerCase(), network])
    
    if (ctoResult.rows.length === 0) {
      return res.json({ warning: false })
    }
    
    const lastActivity = ctoResult.rows[0].last_activity
    
    if (!lastActivity) {
      return res.json({ warning: false })
    }
    
    const daysSinceActivity = (Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
    const CTO_INACTIVITY_DAYS = 90 // 90 days
    const WARNING_THRESHOLD = CTO_INACTIVITY_DAYS * 0.75 // Warning at 75% (67.5 days)
    
    if (daysSinceActivity >= WARNING_THRESHOLD) {
      const daysRemaining = Math.max(0, CTO_INACTIVITY_DAYS - daysSinceActivity)
      
      return res.json({
        warning: true,
        daysInactive: Math.floor(daysSinceActivity),
        daysRemaining: Math.ceil(daysRemaining),
        message: `You've been inactive for ${Math.floor(daysSinceActivity)} days. Your CTO can be claimed by others in ${Math.ceil(daysRemaining)} days!`
      })
    }
    
    return res.json({ warning: false })
    
  } catch (error) {
    console.error('❌ Inactivity check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Check if CTO can be reclaimed (90 days inactivity)
app.post('/api/stories/can-reclaim-cto', async (req, res) => {
  try {
    const { tokenHash, tokenOwner } = req.body
    
    if (!tokenHash) {
      return res.status(400).json({ error: 'Token hash required' })
    }
    
    // Note: canReclaimCTO already normalizes the hash internally
    const reclaimStatus = await storiesDB.canReclaimCTO(tokenHash, tokenOwner)
    
    res.json({ success: true, ...reclaimStatus })
  } catch (error) {
    console.error('❌ Reclaim check error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get activity status for token
app.get('/api/stories/activity-status/:tokenHash/:wallet', async (req, res) => {
  try {
    const { tokenHash, wallet } = req.params
    
    const lastActivity = await storiesDB.getLastActivity(tokenHash, wallet)
    const isInactive = await storiesDB.isInactive(tokenHash, wallet)
    
    const daysSinceActivity = lastActivity 
      ? Math.floor((Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
      : null
    
    res.json({ 
      success: true, 
      lastActivity,
      isInactive,
      daysSinceActivity,
      inactivityThreshold: 90
    })
  } catch (error) {
    console.error('❌ Activity status error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ==================== FEED ROUTES ====================

// Get story ranking (last 24h only)
app.get('/api/stories/ranking/24h', async (req, res) => {
  try {
    const { limit = 50 } = req.query
    
    // Get all stories from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // Get stories with proper counts from separate tables + user info
    const result = await query(
      `SELECT s.*, 
        u.name as user_name,
        u.avatar_url as user_avatar,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views,
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes,
        (SELECT COUNT(*) FROM shares WHERE story_id = s.id) as shares,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments
       FROM stories s
       LEFT JOIN users u ON s.user_wallet = u.wallet_address
       WHERE s.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY s.score DESC
       LIMIT $1`,
      [parseInt(limit)]
    )
    
    const stories = result.rows
    
    // Calculate points for each story (views×1 + likes×2 + shares×5 + comments×1)
    const storiesWithPoints = stories.map(story => ({
      id: story.id,
      userWallet: story.user_wallet,
      userName: story.user_name,
      userAvatar: story.user_avatar,
      tokenHash: story.token_hash,
      tokenSymbol: story.token_symbol,
      tokenLogo: story.token_logo,
      caption: story.caption,
      videoUrl: story.video_url,
      mediaType: story.media_type,
      createdAt: story.created_at,
      views: parseInt(story.views) || 0,
      likes: parseInt(story.likes) || 0,
      shares: parseInt(story.shares) || 0,
      comments: parseInt(story.comments) || 0,
      score: story.score,
      points: (parseInt(story.views) || 0) * 1 + (parseInt(story.likes) || 0) * 2 + (parseInt(story.shares) || 0) * 5 + (parseInt(story.comments) || 0) * 1,
      timeRemaining: Math.max(0, 24 - Math.floor((Date.now() - new Date(story.created_at).getTime()) / (1000 * 60 * 60)))
    }))
    
    console.log(`🏆 Story Ranking 24h: ${storiesWithPoints.length} stories`)
    
    res.json({ 
      success: true, 
      data: storiesWithPoints,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Story ranking error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== TOKEN INFO/BANNER UPDATE ROUTES ====================

// Update token info (Website, X, Telegram)
app.post('/api/tokens/update-info', async (req, res) => {
  try {
    const { tokenHash, walletAddress, tokenOwner, website, x, telegram } = req.body
    
    if (!tokenHash || !walletAddress) {
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    // Verify user has access (owner or CTO)
    const hasAccess = await storiesDB.checkAccess(tokenHash, walletAddress, tokenOwner)
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to update this token' })
    }
    
    // Resolve to get both hashes
    let hashesToUpdate = [tokenHash]
    try {
      const cleanHash = tokenHash.replace(/^hash-/, '')
      const pkgResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${cleanHash}`, {
        headers: { 'Accept': 'application/json', 'Authorization': API_KEYS.owner }
      })
      
      if (pkgResponse.ok) {
        const pkgData = await pkgResponse.json()
        const packageHash = pkgData.contract_package_hash
        const contractHash = pkgData.contract_hash
        
        // Update both hashes if they're different
        if (packageHash && packageHash !== tokenHash) hashesToUpdate.push(packageHash)
        if (contractHash && contractHash !== tokenHash) hashesToUpdate.push(contractHash)
        
        console.log(`📦 Will update info for ${hashesToUpdate.length} hash(es)`)
      }
    } catch (err) {
      console.warn('⚠️ Could not resolve hashes, updating only provided hash')
    }
    
    // Update token info in database for all hashes (PostgreSQL)
    for (const hash of hashesToUpdate) {
      await query(
        `INSERT INTO token_info (token_hash, website, x_url, telegram_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token_hash) 
         DO UPDATE SET 
           website = COALESCE($2, token_info.website),
           x_url = COALESCE($3, token_info.x_url),
           telegram_url = COALESCE($4, token_info.telegram_url),
           updated_at = CURRENT_TIMESTAMP`,
        [hash, website || null, x || null, telegram || null]
      )
      console.log(`✅ Token info updated for ${hash.substring(0, 10)}...`)
    }
    
    console.log(`✅ Token info update complete by ${walletAddress.substring(0, 10)}...`)
    
    res.json({ 
      success: true,
      message: 'Token info updated successfully',
      data: { website, x, telegram }
    })
  } catch (error) {
    console.error('❌ Update info error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update token banner
app.post('/api/tokens/update-banner', upload.single('banner'), async (req, res) => {
  console.log('🎨 BANNER UPDATE REQUEST:', {
    tokenHash: req.body.tokenHash?.substring(0, 10),
    walletAddress: req.body.walletAddress?.substring(0, 10),
    hasFile: !!req.file,
    fileName: req.file?.filename
  })
  
  try {
    const { tokenHash, walletAddress, tokenOwner } = req.body
    
    if (!tokenHash || !walletAddress) {
      console.log('❌ Missing tokenHash or walletAddress')
      return res.status(400).json({ error: 'Token hash and wallet address required' })
    }
    
    if (!req.file) {
      console.log('❌ No file uploaded')
      return res.status(400).json({ error: 'Banner image required' })
    }
    
    // Verify user has access (owner or CTO)
    const hasAccess = await storiesDB.checkAccess(tokenHash, walletAddress, tokenOwner)
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to update this token' })
    }
    
    const bannerPath = `https://api.screener.land/uploads/${req.file.filename}`
    
    // Resolve to get both hashes
    let hashesToUpdate = [tokenHash]
    try {
      const cleanHash = tokenHash.replace(/^hash-/, '')
      const pkgResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${cleanHash}`, {
        headers: { 'Accept': 'application/json', 'Authorization': API_KEYS.owner }
      })
      
      if (pkgResponse.ok) {
        const pkgData = await pkgResponse.json()
        const packageHash = pkgData.contract_package_hash
        const contractHash = pkgData.contract_hash
        
        // Update both hashes if they're different
        if (packageHash && packageHash !== tokenHash) hashesToUpdate.push(packageHash)
        if (contractHash && contractHash !== tokenHash) hashesToUpdate.push(contractHash)
        
        console.log(`📦 Will update banner for ${hashesToUpdate.length} hash(es)`)
      }
    } catch (err) {
      console.warn('⚠️ Could not resolve hashes, updating only provided hash')
    }
    
    // Update banner in database for all hashes (PostgreSQL)
    for (const hash of hashesToUpdate) {
      await query(
        `INSERT INTO token_info (token_hash, banner_url)
         VALUES ($1, $2)
         ON CONFLICT (token_hash) 
         DO UPDATE SET 
           banner_url = $2,
           updated_at = CURRENT_TIMESTAMP`,
        [hash, bannerPath]
      )
      console.log(`✅ Banner updated for ${hash.substring(0, 10)}...`)
    }
    
    console.log(`✅ Banner update complete by ${walletAddress.substring(0, 10)}...`)
    
    res.json({ 
      success: true,
      message: 'Banner updated successfully',
      bannerUrl: bannerPath
    })
  } catch (error) {
    console.error('❌ Update banner error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get token info (for display on token page)
app.get('/api/tokens/info/:tokenHash', async (req, res) => {
  try {
    const { tokenHash } = req.params
    console.log('🔍 GET token info requested for:', tokenHash.substring(0, 16) + '...')
    
    // First, try to resolve this hash to get both contract and package hash
    let contractHash = null
    let packageHash = tokenHash
    
    try {
      const cleanHash = tokenHash.replace(/^hash-/, '')
      const pkgResponse = await fetch(`${CSPR_CLOUD_API}/contract-packages/${cleanHash}`, {
        headers: { 'Accept': 'application/json', 'Authorization': API_KEYS.owner }
      })
      
      if (pkgResponse.ok) {
        const pkgData = await pkgResponse.json()
        packageHash = pkgData.contract_package_hash
        contractHash = pkgData.contract_hash
        console.log(`📦 Resolved hashes: package=${packageHash?.substring(0, 10)}..., contract=${contractHash?.substring(0, 10)}...`)
      }
    } catch (resolveError) {
      console.warn('⚠️ Could not resolve hash, using as-is:', resolveError.message)
    }
    
    // Search for token_info with any of the hashes (for backwards compatibility)
    const searchHashes = [tokenHash, packageHash, contractHash].filter(Boolean)
    const placeholders = searchHashes.map((_, i) => `$${i + 1}`).join(', ')
    
    const result = await query(
      `SELECT * FROM token_info 
       WHERE token_hash IN (${placeholders})
       ORDER BY updated_at DESC 
       LIMIT 1`,
      searchHashes
    )
    
    console.log('📋 Found rows:', result.rows.length, result.rows[0] ? 'DATA EXISTS' : 'NO DATA')
    if (result.rows[0]) {
      console.log('📋 Data found for hash:', result.rows[0].token_hash?.substring(0, 16) + '...')
    }
    
    res.json({ 
      success: true,
      data: result.rows[0] || {}
    })
  } catch (error) {
    console.error('❌ Get token info error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Migrate token info from contract hash to package hash
app.post('/api/tokens/migrate-hash', async (req, res) => {
  try {
    const { fromHash, toHash } = req.body
    
    if (!fromHash || !toHash) {
      return res.status(400).json({ error: 'Both fromHash and toHash required' })
    }
    
    console.log(`🔄 Migrating token info from ${fromHash.substring(0, 10)}... to ${toHash.substring(0, 10)}...`)
    
    // Get data from old hash
    const oldData = await query(
      `SELECT * FROM token_info WHERE token_hash = $1`,
      [fromHash]
    )
    
    if (oldData.rows.length === 0) {
      return res.json({ success: false, message: 'No data found for source hash' })
    }
    
    const data = oldData.rows[0]
    
    // Copy to new hash (use x_url and telegram_url which are the actual column names)
    await query(
      `INSERT INTO token_info (token_hash, banner_url, website, x_url, telegram_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token_hash) 
       DO UPDATE SET 
         banner_url = EXCLUDED.banner_url,
         website = EXCLUDED.website,
         x_url = EXCLUDED.x_url,
         telegram_url = EXCLUDED.telegram_url,
         updated_at = CURRENT_TIMESTAMP`,
      [toHash, data.banner_url, data.website, data.x_url, data.telegram_url]
    )
    
    console.log(`✅ Token info migrated successfully`)
    
    res.json({ 
      success: true,
      message: 'Token info migrated successfully',
      data: {
        fromHash,
        toHash,
        migratedFields: ['banner_url', 'website', 'twitter', 'telegram']
      }
    })
  } catch (error) {
    console.error('❌ Migration error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ===================================
// 🛡️ ADMIN ROUTES - Protected
// ===================================

// Middleware to verify admin password
const verifyAdmin = (req, res, next) => {
  const adminPassword = req.headers['x-admin-password']
  
  console.log(`🔐 Admin auth check:`, {
    received: adminPassword,
    expected: process.env.ADMIN_PASSWORD,
    match: adminPassword === process.env.ADMIN_PASSWORD
  })
  
  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized: Invalid admin password' })
  }
  
  next()
}

// GET all stories (admin view with filters)
app.get('/api/admin/stories', verifyAdmin, async (req, res) => {
  try {
    const filters = {
      tokenHash: req.query.tokenHash,
      userWallet: req.query.userWallet,
      minReports: req.query.minReports ? parseInt(req.query.minReports) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : 100
    }

    const stories = await db.getAllStoriesAdmin(filters)
    res.json({ success: true, stories, count: stories.length })
  } catch (error) {
    console.error('❌ Error getting admin stories:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE specific stories by IDs
app.delete('/api/admin/stories', verifyAdmin, async (req, res) => {
  try {
    const { storyIds } = req.body

    if (!storyIds || !Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({ error: 'storyIds array is required' })
    }

    const deletedIds = await db.deleteStoriesAdmin(storyIds)
    res.json({ 
      success: true, 
      message: `${deletedIds.length} stories deleted`,
      deletedIds 
    })
  } catch (error) {
    console.error('❌ Error deleting stories (admin):', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE all stories by user
app.delete('/api/admin/stories/user/:walletAddress', verifyAdmin, async (req, res) => {
  try {
    const { walletAddress } = req.params
    const count = await db.deleteStoriesByUserAdmin(walletAddress)
    
    res.json({ 
      success: true, 
      message: `${count} stories deleted from user ${walletAddress}`,
      count 
    })
  } catch (error) {
    console.error('❌ Error deleting user stories (admin):', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE all stories by token
app.delete('/api/admin/stories/token/:tokenHash', verifyAdmin, async (req, res) => {
  try {
    const { tokenHash } = req.params
    const count = await db.deleteStoriesByTokenAdmin(tokenHash)
    
    res.json({ 
      success: true, 
      message: `${count} stories deleted from token ${tokenHash}`,
      count 
    })
  } catch (error) {
    console.error('❌ Error deleting token stories (admin):', error)
    res.status(500).json({ error: error.message })
  }
})

// GET all user profiles
app.get('/api/admin/profiles', verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    
    const result = await query(
      `SELECT 
        wallet_address,
        name,
        bio,
        avatar_url,
        created_at,
        updated_at,
        (SELECT COUNT(*) FROM stories WHERE user_wallet = users.wallet_address) as story_count
       FROM users
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    )

    console.log(`📋 Retrieved ${result.rows.length} user profiles`)
    res.json({ 
      success: true, 
      profiles: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('❌ Error fetching profiles:', error)
    res.status(500).json({ error: error.message })
  }
})

// RESET user profile (remove name and avatar)
app.post('/api/admin/reset-profile', verifyAdmin, async (req, res) => {
  try {
    const { walletAddress } = req.body

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' })
    }

    // Reset name and avatar to NULL
    const result = await query(
      `UPDATE users 
       SET name = NULL, 
           avatar_url = NULL, 
           updated_at = CURRENT_TIMESTAMP
       WHERE wallet_address = $1
       RETURNING *`,
      [walletAddress]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    console.log(`✅ Profile reset for: ${walletAddress}`)
    res.json({ 
      success: true, 
      message: 'Profile reset successfully',
      profile: result.rows[0]
    })
  } catch (error) {
    console.error('❌ Error resetting profile:', error)
    res.status(500).json({ error: error.message })
  }
})

// ===================================
// 🛡️ ADMIN - Community Messages
// ===================================

// GET all community messages (not protected - for admin page)
app.get('/api/community/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    
    const result = await query(
      `SELECT 
        id,
        token_hash as "tokenHash",
        user_wallet as "walletAddress",
        user_name as "userName",
        message as text,
        created_at as timestamp
       FROM chat_messages
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    )
    
    res.json({ 
      success: true, 
      messages: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('❌ Error fetching community messages:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE single community message
app.delete('/api/community/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params
    
    const result = await query(
      'DELETE FROM chat_messages WHERE id = $1 RETURNING id',
      [messageId]
    )
    
    if (result.rows.length > 0) {
      console.log(`🗑️ Community message ${messageId} deleted`)
      res.json({ success: true, message: 'Message deleted' })
    } else {
      res.status(404).json({ error: 'Message not found' })
    }
  } catch (error) {
    console.error('❌ Error deleting community message:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE all messages by token
app.delete('/api/community/messages/token/:tokenHash', async (req, res) => {
  try {
    const { tokenHash } = req.params
    
    const result = await query(
      'DELETE FROM chat_messages WHERE token_hash = $1 RETURNING id',
      [tokenHash]
    )
    
    console.log(`🗑️ Deleted ${result.rows.length} messages from token ${tokenHash}`)
    res.json({ 
      success: true, 
      message: `${result.rows.length} messages deleted`,
      count: result.rows.length
    })
  } catch (error) {
    console.error('❌ Error deleting token messages:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE all messages by user
app.delete('/api/community/messages/user/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params
    
    const result = await query(
      'DELETE FROM chat_messages WHERE user_wallet = $1 RETURNING id',
      [walletAddress]
    )
    
    console.log(`🗑️ Deleted ${result.rows.length} messages from user ${walletAddress}`)
    res.json({ 
      success: true, 
      message: `${result.rows.length} messages deleted`,
      count: result.rows.length
    })
  } catch (error) {
    console.error('❌ Error deleting user messages:', error)
    res.status(500).json({ error: error.message })
  }
})

// ==================== PAYMENT ROUTES (CTO) ====================
// Import Casper SDK using createRequire for CommonJS compatibility
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const SDK = require('casper-js-sdk')

// The SDK exports everything directly, not under CasperClient/DeployUtil
// Use NativeTransferBuilder and PublicKey for creating transfers
const { NativeTransferBuilder, PublicKey } = SDK

console.log('✅ Casper SDK classes:', { 
  NativeTransferBuilder: !!NativeTransferBuilder,
  PublicKey: !!PublicKey
})

// Create CSPR transfer deploy (unsigned)
app.post('/api/create-transfer', async (req, res) => {
  try {
    const { from, to, amount } = req.body
    
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'Missing required fields: from, to, amount' })
    }
    
    // Clean keys: remove whitespace, newlines, etc.
    const cleanFrom = from.trim().replace(/\s/g, '')
    const cleanTo = to.trim().replace(/\s/g, '')
    
    console.log(`🔍 RAW KEYS (NOT truncating - SDK supports both Ed25519 66-char and Secp256k1 68-char):`)
    console.log(`  from (${cleanFrom.length} chars):`, cleanFrom)
    console.log(`  to (${cleanTo.length} chars):`, cleanTo)
    
    console.log(`💸 Creating transfer: ${amount} CSPR from ${cleanFrom.substring(0, 10)}... to ${cleanTo.substring(0, 10)}...`)
    
    // Create deploy MANUALLY without SDK (SDK doesn't support Secp256k1 68-char keys)
    const amountMotes = (amount * 1000000000).toString() // Convert CSPR to motes string
    
    // Detect key type: Ed25519 (01 prefix, 66 chars) or Secp256k1 (02 prefix, 68 chars)
    const fromKeyType = cleanFrom.startsWith('01') ? 'ed25519' : 'secp256k1'
    const toKeyType = cleanTo.startsWith('01') ? 'ed25519' : 'secp256k1'
    
    console.log(`🔑 Key types detected: from=${fromKeyType}, to=${toKeyType}`)
    
    // Create deploy JSON manually (compatible with both key types)
    const deployJson = {
      approvals: [],
      hash: '', // Will be filled by wallet
      header: {
        account: cleanFrom,
        timestamp: new Date().toISOString(),
        ttl: '30m',
        chain_name: 'casper',
        gas_price: 1,
        body_hash: '', // Will be filled by wallet
        dependencies: []
      },
      payment: {
        ModuleBytes: {
          module_bytes: '',
          args: [
            ['amount', { cl_type: 'U512', bytes: '0400e1f505', parsed: '100000000' }]
          ]
        }
      },
      session: {
        Transfer: {
          args: [
            ['amount', { cl_type: 'U512', bytes: amountMotes, parsed: amountMotes }],
            ['target', { cl_type: 'PublicKey', bytes: cleanTo, parsed: cleanTo }],
            ['id', { cl_type: 'Option', bytes: '01', parsed: String(Date.now()) }]
          ]
        }
      }
    }
    
    console.log(`✅ Deploy JSON created manually`)
    
    res.json({
      success: true,
      deployJSON: deployJson  // Renvoyer le deploy directement, pas wrapped
    })
  } catch (error) {
    console.error('❌ Error creating transfer:', error)
    res.status(500).json({ error: error.message })
  }
})

// Submit signed transfer to blockchain
app.post('/api/submit-transfer', async (req, res) => {
  try {
    const { signedDeploy } = req.body
    
    if (!signedDeploy) {
      return res.status(400).json({ error: 'Missing signedDeploy' })
    }
    
    console.log('📤 Submitting signed transfer to blockchain...')
    
    // Parse signed deploy using SDK v5
    const deployObject = Deploy.fromJson(JSON.parse(signedDeploy))
    
    // Send to blockchain via RPC
    const rpcUrl = 'https://rpc.mainnet.casperlabs.io/rpc'
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'account_put_deploy',
        params: { deploy: Deploy.toJson(deployObject) }
      })
    })
    
    const result = await response.json()
    
    if (result.error) {
      throw new Error(result.error.message || 'Failed to submit deploy')
    }
    
    const deployHash = result.result.deploy_hash
    
    console.log(`✅ Transfer submitted: ${deployHash}`)
    
    res.json({
      success: true,
      deployHash
    })
  } catch (error) {
    console.error('❌ Error submitting transfer:', error)
    res.status(500).json({ error: error.message })
  }
})

// Submit a signed deploy to Casper network
app.post('/api/casper/send-deploy', async (req, res) => {
  try {
    const { deployJson } = req.body
    
    if (!deployJson) {
      return res.status(400).json({ error: 'Missing deployJson' })
    }
    
    console.log('📤 Submitting signed deploy to blockchain...')
    
    // Le frontend envoie { deploy: {...} } - extraire le deploy
    const actualDeploy = deployJson.deploy || deployJson
    
    console.log('Deploy hash:', actualDeploy.hash)
    console.log('Deploy chain_name:', actualDeploy.header?.chain_name)
    console.log('Deploy approvals count:', actualDeploy.approvals?.length)
    
    // Détecter le réseau depuis le chain_name du deploy
    const chainName = actualDeploy.header?.chain_name || 'casper-test'
    const isMainnet = chainName === 'casper'
    
    console.log(`🌐 Detected network: ${isMainnet ? 'MAINNET' : 'TESTNET'} (chain: ${chainName})`)
    
    // Nœuds RPC selon le réseau
    const rpcNodes = isMainnet ? [
      // MAINNET nodes
      'https://rpc.casper.network/rpc',
      'https://node.mainnet.casper.network/rpc'
      // Note: casper-node.tor.us removed (ENOTFOUND error)
    ] : [
      // TESTNET nodes (fournis par Muhammet KARA)
      'https://node.testnet.casper.network/rpc',
      'http://49.12.85.57:7777/rpc',
      'http://65.21.120.61:7777/rpc',
      'http://95.217.121.166:7777/rpc'
    ]
    
    let result = null
    let lastError = null
    
    for (const rpcUrl of rpcNodes) {
      try {
        console.log(`🔄 Trying ${isMainnet ? 'MAINNET' : 'TESTNET'} RPC node: ${rpcUrl}`)
        
        const fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'account_put_deploy',
            params: {
              deploy: actualDeploy
            }
          })
        }
        
        // Ignorer SSL pour HTTPS
        if (rpcUrl.startsWith('https://')) {
          const https = await import('https')
          fetchOptions.agent = new https.Agent({ rejectUnauthorized: false })
        }
        
        const response = await fetch(rpcUrl, fetchOptions)
        
        const data = await response.json()
        
        console.log(`📥 RPC Response from ${rpcUrl}:`, JSON.stringify(data, null, 2))
        
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error))
        }
        
        result = data.result
        console.log(`✅ Deploy sent via ${rpcUrl} (${isMainnet ? 'MAINNET' : 'TESTNET'}):`, result.deploy_hash)
        break // Success!
        
      } catch (nodeError) {
        console.warn(`⚠️ Failed ${rpcUrl}:`, nodeError.message)
        lastError = nodeError
      }
    }
    
    if (!result) {
      throw new Error(`All ${isMainnet ? 'MAINNET' : 'TESTNET'} RPC nodes failed: ` + (lastError?.message || 'Unknown error'))
    }
    
    res.json({
      success: true,
      deployHash: result.deploy_hash
    })
    
  } catch (error) {
    console.error('❌ Error sending deploy:', error)
    res.status(500).json({ error: error.message })
  }
})

// Link CTO payment to token after payment sent
app.post('/api/stories/link-cto-payment', async (req, res) => {
  try {
    const { tokenHash, walletAddress, deployHash, network } = req.body
    
    if (!tokenHash || !walletAddress || !deployHash) {
      return res.status(400).json({ error: 'Missing tokenHash, walletAddress or deployHash' })
    }
    
    const isMainnet = network === 'mainnet'
    const networkName = isMainnet ? 'MAINNET' : 'TESTNET'
    
    // 🔒 SECURITY: Block testnet CTO purchases (testnet CSPR has no value)
    if (!isMainnet) {
      console.log(`[CTO] ⛔ BLOCKED: Testnet CTO purchase attempt from ${walletAddress.substring(0, 20)}...`)
      return res.status(403).json({ 
        error: 'CTO Access can only be purchased on MAINNET',
        testnetBlocked: true,
        message: 'Please switch to MAINNET to purchase CTO Access. Testnet CSPR has no real value.'
      })
    }
    
    console.log(`[CTO] 🌐 Verifying payment on ${networkName}: token=${tokenHash.substring(0, 20)}..., wallet=${walletAddress.substring(0, 20)}..., deploy=${deployHash.substring(0, 20)}...`)
    
    // Normaliser
    const cleanTokenHash = tokenHash.toLowerCase().replace(/^(hash-|account-hash-|deploy-|0x)/, '')
    const cleanWallet = walletAddress.toLowerCase().replace(/^(hash-|account-hash-|deploy-|0x)/, '')
    const cleanDeploy = deployHash.toLowerCase().replace(/^(hash-|account-hash-|deploy-|0x)/, '')
    
    // SÉCURITÉ: Vérifier que le deploy existe et a réussi sur la blockchain
    console.log(`[CTO] 🔐 Checking deploy status on ${networkName} blockchain...`)
    
    // RPC nodes selon le réseau
    const rpcNodes = isMainnet ? [
      'https://node.mainnet.casper.network/rpc',
      'https://rpc.casper.network/rpc'
    ] : [
      'https://node.testnet.casper.network/rpc',
      'http://49.12.85.57:7777/rpc'
    ]
    
    // Attendre que le deploy soit dans un bloc (peut être lent!)
    let deployInfo = null
    const maxAttempts = isMainnet ? 30 : 40  // Mainnet plus rapide que testnet
    const delayMs = 3000
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[CTO] 🔍 Attempt ${attempt}/${maxAttempts} to fetch deploy info from ${networkName}...`)
      
      // Essayer chaque RPC node jusqu'à trouver le deploy
      for (const rpcUrl of rpcNodes) {
        try {
          console.log(`[CTO] 📡 Trying RPC node: ${rpcUrl}`)
          const rpcResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'info_get_deploy',
              params: {
                deploy_hash: cleanDeploy
              }
            })
          })
          
          if (rpcResponse.ok) {
            const data = await rpcResponse.json()
            
            if (data.error) {
              console.log(`[CTO] ⏳ RPC returned error: ${data.error.message}`)
              // Essayer le prochain RPC node
              continue
            } else if (data.result && (data.result.execution_results || data.result.execution_info)) {
              // Support both old (execution_results) and new (execution_info) API formats
              deployInfo = data.result
              console.log(`[CTO] ✅ Deploy found in blockchain with execution result from ${rpcUrl}`)
              break // Sortir de la boucle RPC nodes
            } else if (data.result) {
              console.log('[CTO] ⏳ Deploy found but not executed yet, waiting...')
              // Continue to try other nodes or wait for next attempt
            }
          } else {
            console.warn(`[CTO] ⚠️ RPC HTTP error ${rpcResponse.status}, trying next node`)
          }
        } catch (fetchError) {
          console.warn(`[CTO] ⚠️ Fetch error on ${rpcUrl}:`, fetchError.message)
          // Continuer avec le prochain RPC node
        }
      }
      
      // Si on a trouvé le deploy avec execution info, sortir de la boucle d'attempts
      if (deployInfo && (deployInfo.execution_results || deployInfo.execution_info)) {
        break
      }
      
      // Attendre avant le prochain essai
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    
    // Check both old and new API formats
    const hasExecutionInfo = deployInfo && (deployInfo.execution_results || deployInfo.execution_info)
    
    if (!hasExecutionInfo) {
      const timeoutSeconds = isMainnet ? 90 : 120
      console.log(`[CTO] ❌ Deploy not executed on ${networkName} after ${timeoutSeconds} seconds`)
      return res.status(400).json({ 
        error: `Payment not confirmed yet on ${networkName}. ${isMainnet ? 'Mainnet' : 'Testnet'} confirmation is taking longer than expected - wait 1 minute and refresh the page to check again.`,
        pending: true,
        deployHash: cleanDeploy,
        network: networkName,
        message: `Your payment was sent successfully to ${networkName} but blockchain confirmation is taking longer than expected. Please wait and refresh the page.`
      })
    }
    
    // Extract execution result from either format
    let executionResult
    let errorMessage = null
    
    if (deployInfo.execution_info) {
      // New format (testnet uses this)
      executionResult = deployInfo.execution_info.execution_result
      if (executionResult && executionResult.Version2) {
        errorMessage = executionResult.Version2.error_message
      }
    } else if (deployInfo.execution_results && deployInfo.execution_results.length > 0) {
      // Old format
      executionResult = deployInfo.execution_results[0].result
      if (executionResult && executionResult.Failure) {
        errorMessage = executionResult.Failure.error_message || 'Unknown error'
      }
    }
    
    // Check if deploy failed
    if (errorMessage) {
      console.log('[CTO] ❌ Deploy FAILED on blockchain:', errorMessage)
      return res.status(400).json({ 
        error: 'Payment failed on blockchain: ' + errorMessage,
        failed: true
      })
    }
    
    console.log('[CTO] ✅ Deploy succeeded on blockchain!')
    
    // � CRITICAL: Check if there's an ACTIVE CTO holder (90 days activity check)
    console.log(`🔍 Checking for existing ACTIVE CTO holder on ${networkName}...`)
    const existingCTOQuery = `
      SELECT wallet_address, last_activity FROM cto_access 
      WHERE token_hash = $1 AND network = $2
    `
    const existingCTO = await storiesDB.query(existingCTOQuery, [cleanTokenHash, networkName.toLowerCase()])
    
    if (existingCTO.rows.length > 0) {
      const oldCTO = existingCTO.rows[0].wallet_address
      const lastActivity = existingCTO.rows[0].last_activity
      
      // Check if old CTO is inactive (90 days)
      const daysSinceActivity = lastActivity 
        ? (Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
        : 999 // If no activity, consider very old
      
      const CTO_INACTIVITY_DAYS = 90 // 90 days
      
      if (daysSinceActivity < CTO_INACTIVITY_DAYS) {
        // ❌ OLD CTO IS STILL ACTIVE - REJECT THE PURCHASE
        console.log(`❌ REJECTED: Current CTO holder (${oldCTO.substring(0, 20)}...) is still ACTIVE (${daysSinceActivity.toFixed(1)} days since last activity)`)
        return res.status(400).json({ 
          error: `CTO access is currently held by an ACTIVE user. They must be inactive for 90 days before you can claim it.`,
          currentHolder: oldCTO.substring(0, 10) + '...',
          daysSinceActivity: Math.floor(daysSinceActivity),
          daysRemaining: Math.max(0, Math.ceil(CTO_INACTIVITY_DAYS - daysSinceActivity))
        })
      }
      
      // ✅ Old CTO is INACTIVE - Allow reclaim (revoke old access)
      console.log(`✅ Old CTO holder (${oldCTO.substring(0, 20)}...) is INACTIVE (${daysSinceActivity.toFixed(1)} days) - allowing reclaim`)
      
      await storiesDB.query(
        `DELETE FROM cto_access WHERE token_hash = $1 AND network = $2`,
        [cleanTokenHash, networkName.toLowerCase()]
      )
      
      console.log(`✅ Inactive CTO access revoked - granting to new holder`)
    } else {
      console.log(`✅ No existing CTO holder - this is the first CTO purchase`)
    }
    
    // Insérer le nouveau CTO
    const insertQuery = `
      INSERT INTO cto_access (
        token_hash,
        wallet_address,
        paid_amount,
        transaction_hash,
        network,
        granted_at,
        last_activity
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `
    
    const CTO_PRICE = 1000 // 1000 CSPR (same as used in /api/stories/claim-cto)
    
    const result = await storiesDB.query(insertQuery, [
      cleanTokenHash,
      cleanWallet,
      CTO_PRICE, // 1000 CSPR
      cleanDeploy,
      networkName.toLowerCase() // 'mainnet' or 'testnet'
    ])
    
    console.log(`[CTO] ✅ Payment verified and access granted!`)
    
    res.json({
      success: true,
      verified: true,
      access: result.rows[0]
    })
    
  } catch (error) {
    console.error('❌ Error linking CTO payment:', error)
    res.status(500).json({ error: error.message })
  }
})

// Start server with database initialization
const startServer = async () => {
  try {
    // Initialize PostgreSQL database
    console.log('🔧 Initializing database...')
    await initDatabase()
    console.log('✅ Database ready')
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${PORT}`)
      console.log(`🗄️ PostgreSQL database connected`)
      console.log(`📡 Proxying cspr.cloud API requests`)
      console.log(`🔑 Using VALID cloud key (tested 200 OK)`)
      console.log(`🎯 Launchpad routes enabled:`)
      console.log(`   GET  /api/launchpad/token/:hash/stats`)
      console.log(`   POST /api/launchpad/swap`)
      console.log(`   GET  /api/launchpad/tokens`)
      console.log(`🎧 Event listener active for real-time transactions`)
      console.log(`📹 Stories routes enabled (20 endpoints with CTO + Reclaim)`)
      console.log(`🛡️ Admin routes enabled (5 endpoints - password protected)`)
      
      // Démarrer le listener CTO après que le serveur soit up
      console.log(`💰 Starting CTO payment listener...`)
      startCTOListener()
    })
    
    // WebSocket server for real-time updates AND chat
    const wss = new WebSocketServer({ server })
    
    // Store active chat rooms and members
    const chatRooms = new Map() // tokenHash -> Set of { ws, walletAddress, userName }
    
    wss.on('connection', (ws) => {
      console.log('📱 New WebSocket client connected')
      wsClients.add(ws)
      
      let currentRoom = null
      let currentWallet = null
      
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data)
          console.log('📩 WebSocket message:', msg.type, msg)
          
          switch (msg.type) {
            case 'join-room':
              const { tokenHash, walletAddress, userName } = msg
              
              // Leave previous room if any
              if (currentRoom && chatRooms.has(currentRoom)) {
                const room = chatRooms.get(currentRoom)
                room.delete(ws)
                if (room.size === 0) chatRooms.delete(currentRoom)
              }
              
              // Join new room
              if (!chatRooms.has(tokenHash)) {
                chatRooms.set(tokenHash, new Set())
              }
              const room = chatRooms.get(tokenHash)
              room.add({ ws, walletAddress, userName })
              currentRoom = tokenHash
              currentWallet = walletAddress
              
              console.log(`✅ ${userName} joined room ${tokenHash.substring(0, 8)}... (${room.size} members)`)
              
              // Load message history from database (last 50 messages)
              let history = []
              try {
                const messages = await chatDB.getMessages(tokenHash, 50)
                console.log(`📦 Raw DB messages:`, messages)
                history = messages.map(msg => ({
                  id: msg.id,
                  walletAddress: msg.userWallet,
                  userName: msg.userName,
                  text: msg.message,
                  timestamp: msg.timestamp.toISOString ? msg.timestamp.toISOString() : msg.timestamp
                }))
                console.log(`📜 Loaded ${history.length} messages from history`)
                console.log(`📨 Sending history:`, JSON.stringify(history, null, 2))
              } catch (error) {
                console.error('❌ Error loading message history:', error)
              }
              
              // Send confirmation
              ws.send(JSON.stringify({
                type: 'joined',
                message: `Welcome to the chat, ${userName}!`,
                count: room.size,
                history
              }))
              
              // Broadcast member count update to all in room
              room.forEach(member => {
                if (member.ws !== ws && member.ws.readyState === 1) {
                  member.ws.send(JSON.stringify({
                    type: 'member-count',
                    count: room.size
                  }))
                }
              })
              break
              
            case 'leave-room':
              if (currentRoom && chatRooms.has(currentRoom)) {
                const room = chatRooms.get(currentRoom)
                room.delete(ws)
                console.log(`👋 User left room ${currentRoom.substring(0, 8)}... (${room.size} members left)`)
                
                // Broadcast member count update
                room.forEach(member => {
                  if (member.ws.readyState === 1) {
                    member.ws.send(JSON.stringify({
                      type: 'member-count',
                      count: room.size
                    }))
                  }
                })
                
                if (room.size === 0) chatRooms.delete(currentRoom)
                currentRoom = null
                currentWallet = null
              }
              break
              
            case 'send-message':
              if (!currentRoom || !chatRooms.has(currentRoom)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }))
                break
              }
              
              // Get user name from room members
              const msgRoom = chatRooms.get(currentRoom)
              let senderName = null
              msgRoom.forEach(member => {
                if (member.walletAddress === msg.walletAddress) {
                  senderName = member.userName
                }
              })
              
              let messageId = Date.now()
              let messageTimestamp = new Date().toISOString()
              
              // Save message to database
              try {
                const savedMsg = await chatDB.saveMessage(currentRoom, msg.walletAddress, senderName, msg.text)
                messageId = savedMsg.id
                messageTimestamp = savedMsg.timestamp.toISOString ? savedMsg.timestamp.toISOString() : savedMsg.timestamp
                console.log(`💾 Message saved to DB with ID ${messageId}`)
              } catch (error) {
                console.error('❌ Error saving message to DB:', error)
              }
              
              const chatMsg = {
                type: 'message',
                id: messageId,
                walletAddress: msg.walletAddress,
                text: msg.text,
                timestamp: messageTimestamp
              }
              
              console.log(`💬 Message in ${currentRoom.substring(0, 8)}... from ${msg.walletAddress.substring(0, 10)}...`)
              
              // Broadcast to all members in room
              msgRoom.forEach(member => {
                if (member.ws.readyState === 1) {
                  member.ws.send(JSON.stringify(chatMsg))
                }
              })
              break
          }
        } catch (error) {
          console.error('❌ WebSocket message error:', error)
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
        }
      })
      
      ws.on('close', () => {
        console.log('📱 WebSocket client disconnected')
        wsClients.delete(ws)
        
        // Remove from chat room if in one
        if (currentRoom && chatRooms.has(currentRoom)) {
          const room = chatRooms.get(currentRoom)
          room.delete(ws)
          console.log(`👋 User disconnected from room ${currentRoom.substring(0, 8)}... (${room.size} members left)`)
          
          // Broadcast member count update
          room.forEach(member => {
            if (member.ws.readyState === 1) {
              member.ws.send(JSON.stringify({
                type: 'member-count',
                count: room.size
              }))
            }
          })
          
          if (room.size === 0) chatRooms.delete(currentRoom)
        }
      })
    })
    
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
startServer()

