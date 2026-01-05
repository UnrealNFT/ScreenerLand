import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaCopy, FaExternalLinkAlt, FaChartLine, FaUsers, FaExchangeAlt, FaFire, FaTwitter, FaTelegram, FaGlobe, FaInfoCircle, FaCoins, FaArrowLeft, FaPlay, FaDiscord } from 'react-icons/fa'
import { SiX } from 'react-icons/si'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { API_URL } from '../config'
import { getTokenDetails, isTokenFromCsprFun, getAllTokens } from '../services/api.service'
import { getMemberCount, subscribeMemberCount } from '../services/chat.service'
import { useWallet } from '../contexts/WalletContext'
import TokenPriceChart from '../components/TokenPriceChart'
import TransactionFeed from '../components/TransactionFeed'
import StoriesFeed from '../components/StoriesFeed'
import StoriesGrid from '../components/StoriesGrid'
import StoryUpload from '../components/StoryUpload'
import csprCloudService from '../services/cspr.cloud.service'
import casperService from '../services/casper.service'
import statsCalculator from '../services/stats.calculator'
import { getFriendlyMarketPairData, getFriendlyMarketHistorical, WCSPR_HASH } from '../services/friendlymarket.service'
import { getTokenColor } from '../utils/tokenColors'
import { getTokenByHash, calculateTokenPrice, formatMarketCap, formatVolume, formatLiquidity, getSocialLinks } from '../services/csprfun.service'

export default function TokenPage() {
  const { contractHash } = useParams()
  const navigate = useNavigate()
  const { walletAddress } = useWallet()
  const [tokenData, setTokenData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [memberCount, setMemberCount] = useState(0)
  const [isCsprFunToken, setIsCsprFunToken] = useState(false)
  const [realStats, setRealStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [calculatedStats, setCalculatedStats] = useState(null)
  const [friendlyMarketData, setFriendlyMarketData] = useState(null)
  const [isGraduated, setIsGraduated] = useState(false)
  const [historicalData, setHistoricalData] = useState(null)
  const [activeTab, setActiveTab] = useState('chart') // 'chart' | 'transactions' | 'stories'
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [hasCTOAccess, setHasCTOAccess] = useState(false)
  const [tokenInfo, setTokenInfo] = useState(null) // Website, X, TG, Banner
  
  useEffect(() => {
    loadTokenData()
    // Load member count for this token
    if (contractHash) {
      const count = getMemberCount(contractHash)
      console.log(`📄 TokenPage: Loading member count for ${contractHash.substring(0, 8)}...: ${count}`)
      setMemberCount(count)
      
      // Subscribe to member count changes (real-time updates)
      const unsubscribe = subscribeMemberCount(contractHash, (newCount) => {
        console.log(`🔄 TokenPage: Member count updated to ${newCount}`)
        setMemberCount(newCount)
      })
      
      // Cleanup subscription on unmount
      return () => {
        unsubscribe()
      }
    }
  }, [contractHash])
  
  // Load stats AFTER tokenData is available
  useEffect(() => {
    if (tokenData && contractHash) {
      loadRealStats()
      loadFriendlyMarketData()
    }
  }, [tokenData, contractHash])
  
  // Merge Friendly.Market data with stats
  useEffect(() => {
    if (friendlyMarketData && tokenData) {
      console.log('🔄 Merging Friendly.Market data...')
      console.log('💰 Live CSPR price (CoinGecko):', friendlyMarketData.liveCSPRPrice)
      
      const csprPriceUSD = friendlyMarketData.liveCSPRPrice || 0.006 // Use live CoinGecko CSPR price
      
      // Format Market Cap from FM data
      let marketCapFormatted = 'N/A'
      if (friendlyMarketData.marketCap.usd > 0) {
        const mcap = friendlyMarketData.marketCap.usd
        if (mcap >= 1e9) {
          marketCapFormatted = `$${(mcap / 1e9).toFixed(2)}B`
        } else if (mcap >= 1e6) {
          marketCapFormatted = `$${(mcap / 1e6).toFixed(2)}M`
        } else if (mcap >= 1e3) {
          marketCapFormatted = `$${(mcap / 1e3).toFixed(1)}K`
        } else {
          marketCapFormatted = `$${mcap.toFixed(0)}`
        }
      }
      
      // Format Liquidity
      let liquidityFormatted = 'N/A'
      if (friendlyMarketData.liquidity.usd > 0) {
        const liq = friendlyMarketData.liquidity.usd
        if (liq >= 1e6) {
          liquidityFormatted = `$${(liq / 1e6).toFixed(2)}M`
        } else if (liq >= 1e3) {
          liquidityFormatted = `$${(liq / 1e3).toFixed(1)}K`
        } else {
          liquidityFormatted = `$${liq.toFixed(0)}`
        }
      }
      
      // Format Volume 24h
      let volumeFormatted = 'N/A'
      if (friendlyMarketData.volume.daily > 0) {
        const vol = friendlyMarketData.volume.daily
        if (vol >= 1e6) {
          volumeFormatted = `$${(vol / 1e6).toFixed(2)}M`
        } else if (vol >= 1e3) {
          volumeFormatted = `$${(vol / 1e3).toFixed(1)}K`
        } else {
          volumeFormatted = `$${vol.toFixed(0)}`
        }
      }
      
      setCalculatedStats(prev => ({
        ...prev,
        marketCap: marketCapFormatted,
        liquidity: liquidityFormatted,
        volume24h: volumeFormatted,
        price: `${friendlyMarketData.price.cspr.toFixed(6)} CSPR`,
        priceUsd: `$${friendlyMarketData.price.cspr * csprPriceUSD}`,
        fromFriendlyMarket: true
      }))
      
      console.log('✅ Stats updated with Friendly.Market data:', {
        marketCap: marketCapFormatted,
        liquidity: liquidityFormatted,
        volume: volumeFormatted,
        price: friendlyMarketData.price.cspr
      })
    }
  }, [friendlyMarketData, tokenData])
  
  // Merge calculatedStats with realStats when realStats arrives
  useEffect(() => {
    if (realStats && realStats.fromBlockchain && tokenData && !friendlyMarketData) {
      console.log('🔄 Merging real blockchain stats with calculated stats...')
      console.log('📊 Real Stats:', realStats)
      
      // Calculate Market Cap ONLY if we have REAL price from DEX
      let marketCap = 'N/A'
      
      if (realStats.currentPrice > 0 && realStats.circulatingSupply) {
        // REAL MARKET CAP: Real DEX price × Real circulating supply
        const decimals = parseInt(tokenData.decimals) || 9
        const circulatingSupply = parseFloat(realStats.circulatingSupply) / Math.pow(10, decimals)
        const csprPriceUSD = 0.006 // $0.006 per CSPR
        const mcap = circulatingSupply * realStats.currentPrice * csprPriceUSD
        
        console.log('💰 REAL Market Cap (from DEX):', {
          circulatingSupply: circulatingSupply.toLocaleString(),
          priceCSPR: realStats.currentPrice,
          mcapUSD: mcap.toFixed(0)
        })
        
        if (mcap >= 1e9) {
          marketCap = `$${(mcap / 1e9).toFixed(2)}B`
        } else if (mcap >= 1e6) {
          marketCap = `$${(mcap / 1e6).toFixed(2)}M`
        } else if (mcap >= 1e3) {
          marketCap = `$${(mcap / 1e3).toFixed(1)}K`
        } else {
          marketCap = `$${mcap.toFixed(0)}`
        }
      } else {
        // No DEX price - Keep existing market cap if from CSPR.fun
        console.log('⚠️ No DEX price available')
        // Don't override CSPR.fun market cap
      }
      
      // Update calculatedStats with merged data
      // PRESERVE existing marketCap/liquidity/volume if fromCsprFun or fromFriendlyMarket
      setCalculatedStats(prev => ({
        ...prev,
        holders: realStats.holders,
        transfers: realStats.transfers,
        // Only update marketCap if we calculated one from DEX, otherwise keep existing (CSPR.fun/FM)
        ...(marketCap !== 'N/A' ? { marketCap } : {}),
        // Don't override volume if it's from FriendlyMarket or CSPR.fun
        ...(!prev?.fromFriendlyMarket && !prev?.fromCsprFun && realStats.volume24h ? { volume24h: realStats.volume24h } : {}),
        fromBlockchain: true
      }))
      
      console.log('✅ Merged stats updated', marketCap !== 'N/A' ? `with Market Cap: ${marketCap}` : '(preserved existing data)')
    }
  }, [realStats, tokenData, friendlyMarketData])
  
  const loadFriendlyMarketData = async () => {
    try {
      console.log('🔍 Checking Friendly.Market for token:', contractHash)
      
      // Use ACTUAL CONTRACT HASH (not package hash) for Friendly.Market
      // Package hash doesn't work with FM API
      const actualHash = tokenData.contractHashActual || tokenData.contractHash || contractHash
      
      // Clean hash
      let cleanHash = actualHash
      if (cleanHash.startsWith('contract-package-')) {
        cleanHash = cleanHash.replace('contract-package-', '')
      }
      if (cleanHash.startsWith('hash-')) {
        cleanHash = cleanHash.replace('hash-', '')
      }
      
      console.log('🔑 Using contract hash for FM:', cleanHash.substring(0, 20) + '...')
      
      // Try to get pair data from Friendly.Market
      const pairData = await getFriendlyMarketPairData(cleanHash)
      
      if (pairData && pairData.reserves.cspr > 0) {
        console.log('✅ Token is on Friendly.Market DEX!', pairData)
        setFriendlyMarketData(pairData)
        setIsGraduated(true)
        
        // Load historical data for chart
        try {
          const dayID = Math.floor(Date.now() / 1000 / 86400)
          const historical = await getFriendlyMarketHistorical(
            pairData.pairContractHash,
            dayID,
            '1W',
            30
          )
          setHistoricalData(historical)
        } catch (e) {
          console.warn('⚠️ Could not load historical data:', e)
        }
      } else {
        console.log('ℹ️ Token not on Friendly.Market (not graduated yet)')
        setIsGraduated(false)
      }
    } catch (error) {
      console.log('ℹ️ Token not on Friendly.Market:', error.message)
      setIsGraduated(false)
    }
  }
  
  const loadRealStats = async () => {
    try {
      setLoadingStats(true)
      console.log('📊 Loading REAL stats from APIs...')
      console.log('🎯 Token data:', tokenData)
      console.log('🔑 Contract hashes:', {
        packageHash: contractHash,
        contractHash: tokenData.contractHashActual
      })
      
      // Passe les données du token ET le contract hash pour les APIs DEX
      const stats = await casperService.getTokenStats(contractHash, tokenData, tokenData.contractHashActual)
      console.log('✅ Got real stats from blockchain:', stats)
      
      setRealStats(stats)
    } catch (error) {
      console.error('❌ Error loading real stats:', error)
      setRealStats({
        holders: 0,
        transfers: 0,
        volume24h: 0
      })
    } finally {
      setLoadingStats(false)
    }
  }
  
  const loadTokenData = async () => {
    setLoading(true)
    
    try {
      // Clean hash - remove any prefixes
      let cleanHash = contractHash
      if (contractHash.startsWith('contract-package-')) {
        cleanHash = contractHash.replace('contract-package-', '')
      }
      if (contractHash.startsWith('hash-')) {
        cleanHash = contractHash.replace('hash-', '')
      }
      
      // Check CTO access if wallet connected
      if (walletAddress && cleanHash) {
        try {
          const ctoResponse = await fetch(`${API_URL}/api/stories/cto-access/${cleanHash}/${walletAddress}`)
          const ctoData = await ctoResponse.json()
          if (ctoData.success && ctoData.hasAccess) {
            setHasCTOAccess(true)
          }
        } catch (err) {
          console.warn('⚠️ Could not check CTO access:', err.message)
        }
      }
      
      // Load token info (website, X, telegram, banner)
      try {
        const infoResponse = await fetch(`${API_URL}/api/tokens/info/${cleanHash}`)
        const infoData = await infoResponse.json()
        if (infoData.success && infoData.data) {
          setTokenInfo(infoData.data)
          console.log('📋 Token info loaded:', infoData.data)
        }
      } catch (err) {
        console.warn('⚠️ Could not load token info:', err.message)
      }
      
      console.log(`🔍 TokenPage: Loading token ${cleanHash}`)
      
      let data = null
      
      // STRATEGY 0: Check CSPR.fun API for non-graduated tokens (74 pre-curve tokens)
      console.log('🎯 STRATEGY 0: Checking CSPR.fun API...')
      try {
        const csprFunToken = await getTokenByHash(cleanHash)
        if (csprFunToken) {
          console.log('✅ Found token in CSPR.fun API:', csprFunToken.name)
          console.log('📊 CSPR.fun data:', {
            csprReserve: csprFunToken.csprReserveUi,
            tokenReserve: csprFunToken.tokenReserveUi,
            marketCap: csprFunToken.marketCapCSPR,
            volume: csprFunToken.allTimeVolumeCSPR,
            graduated: csprFunToken.isGraduated
          })
          
          // Build base token data
          data = {
            name: csprFunToken.name,
            contract_name: csprFunToken.name,
            contract_package_hash: csprFunToken.contractPackageHash || cleanHash,
            contractHash: csprFunToken.contractHash || cleanHash,
            contractHashActual: csprFunToken.contractHash || cleanHash,
            symbol: csprFunToken.symbol,
            logo: csprFunToken.logo,
            icon_url: csprFunToken.logo,
            description: csprFunToken.description || '',
            timestamp: csprFunToken.creationTimestamp,
            holders: 0,
            volume24h: 0,
            deployCount: 0,
            totalTransactions: 0,
            owner: 'Unknown', // Will fetch real owner from cspr.cloud below
            decimals: 9,
            total_supply: csprFunToken.totalSupply || '0',
            isCsprFun: true,
            isGraduated: csprFunToken.isGraduated || false
          }
          
          // Add CSPR.fun pricing data ONLY if NOT graduated
          if (!csprFunToken.isGraduated) {
            console.log('📈 Token NOT graduated - using CSPR.fun bonding curve data')
            
            const price = calculateTokenPrice(csprFunToken.csprReserve, csprFunToken.tokenReserve)
            const csprPriceUSD = 0.0059
            const marketCapUSD = parseFloat(csprFunToken.marketCapCSPR) * csprPriceUSD
            
            let marketCapUSDFormatted = '$0'
            if (marketCapUSD >= 1e6) {
              marketCapUSDFormatted = `$${(marketCapUSD / 1e6).toFixed(2)}M`
            } else if (marketCapUSD >= 1e3) {
              marketCapUSDFormatted = `$${(marketCapUSD / 1e3).toFixed(1)}K`
            } else {
              marketCapUSDFormatted = `$${marketCapUSD.toFixed(0)}`
            }
            
            data.csprFunData = {
              price: price,
              priceFormatted: price.toFixed(8),
              marketCapCSPR: csprFunToken.marketCapCSPR,
              marketCapUSD: marketCapUSD,
              marketCapFormatted: marketCapUSDFormatted,
              marketCapCSPRFormatted: formatMarketCap(csprFunToken.marketCapCSPR),
              volumeCSPR: csprFunToken.allTimeVolumeCSPR,
              volumeFormatted: formatVolume(csprFunToken.allTimeVolumeCSPR),
              liquidityCSPR: csprFunToken.csprReserveUi,
              liquidityFormatted: formatLiquidity(csprFunToken.csprReserveUi),
              csprReserve: csprFunToken.csprReserveUi,
              tokenReserve: csprFunToken.tokenReserveUi,
              taxPercentage: csprFunToken.taxPercentage || 0,
              socialLinks: getSocialLinks(csprFunToken)
            }
            
            console.log('✨ Mapped CSPR.fun token data with price:', data.csprFunData.priceFormatted, 'CSPR')
            console.log('💰 Market Cap USD:', marketCapUSDFormatted)
          } else {
            console.log('⚠️ Token is graduated - will use Friendly.Market data for pricing')
          }
        }
      } catch (csprFunError) {
        console.warn('⚠️ CSPR.fun API check failed:', csprFunError.message)
      }
      
      // STRATEGY 1: Search in legacy cache FIRST (ALL 239 tokens)
      if (!data) {
        console.log('🔍 Searching in legacy cache...')
        try {
          const tokenResponse = await getAllTokens(1, 1000)
          const allTokens = tokenResponse.tokens || []
          
          const found = allTokens.find(t => {
            const cacheHash = t.contractHash || ''
            if (!cacheHash) return false
            
            const exactMatch = cacheHash === cleanHash
            const shortMatch = cacheHash.substring(0, 16) === cleanHash.substring(0, 16)
            
            return exactMatch || shortMatch
          })
          
          if (found) {
            console.log('✅ Found token in legacy cache:', found.name)
            data = {
              name: found.name,
              contract_name: found.name,
              contract_package_hash: found.contractHash,
              contractHash: found.contractHash,
              contractHashActual: found.contractHash,
              symbol: found.symbol,
              logo: found.logo,
              icon_url: found.logo,
              description: found.description,
              timestamp: found.timestamp,
              holders: found.holders,
              volume24h: found.volume24h,
              deployCount: found.deployCount || 0,
              totalTransactions: found.deployCount || 0,
              owner: found.owner || 'Unknown',
              decimals: found.decimals || 9,
              total_supply: found.totalSupply || '0',
              isCsprFun: found.isCsprFun || false
            }
          }
        } catch (cacheError) {
          console.warn('⚠️ Cache search failed:', cacheError.message)
        }
      }
      
      // STRATEGY 2: Last resort - API call
      if (!data) {
        console.log('🌐 Last resort: trying getTokenDetails API...')
        try {
          const apiData = await getTokenDetails(cleanHash)
          if (apiData && apiData.contract_name) {
            console.log('✅ Token found via API:', apiData.contract_name)
            data = apiData
          }
        } catch (apiError) {
          console.warn('⚠️ API call failed:', apiError.message)
        }
      }
      
      if (data) {
        console.log('📛 TokenPage: Token name:', data.contract_name)
        console.log('📊 TokenPage: Full data:', data)
        
        // ALWAYS fetch owner from cspr.cloud (CSPR.fun returns account-hash, not public key)
        if (!data.ownerPublicKey || data.owner === 'Unknown' || data.isCsprFun) {
          console.log('🔍 Fetching owner from cspr.cloud API...')
          
          // Use package hash if available, otherwise contract hash
          const hashForOwner = data.contract_package_hash 
            ? data.contract_package_hash.replace('hash-', '').replace('contract-package-wasm', '').trim()
            : cleanHash
          
          console.log(`🔑 Using hash for owner fetch: ${hashForOwner.substring(0, 20)}...`)
          
          try {
            const packageResponse = await fetch(`${API_URL}/api/cspr-cloud/contract-packages/${hashForOwner}`)
            if (packageResponse.ok) {
              const packageData = await packageResponse.json()
              if (packageData.data?.owner_public_key) {
                console.log('✅ Found owner from cspr.cloud:', packageData.data.owner_public_key.substring(0, 20) + '...')
                data.ownerPublicKey = packageData.data.owner_public_key
                data.owner = packageData.data.owner_public_key
              }
            } else {
              console.warn('⚠️ cspr.cloud API failed, trying cspr.live...')
              // Fallback to cspr.live
              const liveResponse = await fetch(`https://api.cspr.live/contract-packages/${hashForOwner}`)
              if (liveResponse.ok) {
                const liveData = await liveResponse.json()
                if (liveData.data?.owner_public_key) {
                  console.log('✅ Found owner from cspr.live:', liveData.data.owner_public_key.substring(0, 20) + '...')
                  data.ownerPublicKey = liveData.data.owner_public_key
                  data.owner = liveData.data.owner_public_key
                }
              }
            }
          } catch (err) {
            console.warn('⚠️ Could not fetch owner from APIs:', err.message)
            // Last resort: try cspr.live directly
            try {
              const liveResponse = await fetch(`https://api.cspr.live/contract-packages/${hashForOwner}`)
              if (liveResponse.ok) {
                const liveData = await liveResponse.json()
                if (liveData.data?.owner_public_key) {
                  console.log('✅ Found owner from cspr.live (fallback):', liveData.data.owner_public_key.substring(0, 20) + '...')
                  data.ownerPublicKey = liveData.data.owner_public_key
                  data.owner = liveData.data.owner_public_key
                }
              }
            } catch (liveErr) {
              console.warn('⚠️ cspr.live also failed:', liveErr.message)
            }
          }
        }
        
        setTokenData(data)
        
        // Set graduated status
        if (data.isGraduated !== undefined) {
          setIsGraduated(data.isGraduated)
        }
        
        // Set CSPR.fun status
        if (data.isCsprFun !== undefined) {
          setIsCsprFunToken(data.isCsprFun)
        }
        
        // If token has CSPR.fun data, use it for stats
        if (data.csprFunData) {
          console.log('✨ Using CSPR.fun data for stats:', data.csprFunData)
          setCalculatedStats({
            marketCap: data.csprFunData.marketCapFormatted,
            liquidity: data.csprFunData.liquidityFormatted,
            volume24h: data.csprFunData.volumeFormatted,
            price: data.csprFunData.priceFormatted + ' CSPR',
            holders: 0, // Will be loaded from blockchain if available
            transfers: 0, // Will be loaded from blockchain if available
            fromCsprFun: true
          })
        } else {
          // Calculate stats from available data (existing logic)
          const calculatedTokenStats = statsCalculator.calculateAllStats(data)
          console.log('📈 Calculated stats:', calculatedTokenStats)
          setCalculatedStats(calculatedTokenStats)
        }
      } else {
        console.error('❌ Token not found anywhere')
        toast.error('Token not found')
      }
      
    } catch (error) {
      console.error('❌ Error loading token:', error)
      toast.error('Failed to load token data')
    } finally {
      setLoading(false)
    }
  }
  
  const copyAddress = () => {
    navigator.clipboard.writeText(contractHash)
    toast.success('Contract hash copied!')
  }
  
  if (loading) {
    return (
      <div className="min-h-screen pt-20 pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-2xl p-8 animate-pulse">
            <div className="h-8 bg-white/10 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }
  
  if (!tokenData) {
    return (
      <div className="min-h-screen pt-20 pb-24 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Token Not Found</h1>
          <p className="text-white/60">Unable to load token data</p>
        </div>
      </div>
    )
  }

  // Extract social links - ONLY from tokenInfo (Dev Access updates)
  // Do NOT use CSPR.fun or description links (often fake/wrong)
  const twitterUrl = tokenInfo?.x_url || null
  const telegramUrl = tokenInfo?.telegram_url || null
  const websiteUrl = tokenInfo?.website || null
  const discordUrl = null // Not supported yet
  const bannerUrl = tokenInfo?.banner_url || null
  
  // Check if token is from CSPR.fun (use state or quick check)
  const isCsprFun = isCsprFunToken || 
                    tokenData?.logo?.includes('cspr.fun') || 
                    tokenData?.icon_url?.includes('cspr.fun') ||
                    tokenData?.logo?.includes('assets.cspr.fun') ||
                    tokenData?.isCsprFun === true

  return (
    <div className="min-h-screen pt-20 pb-24 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Back Button */}
        <motion.button
          onClick={() => navigate('/screener')}
          className="flex items-center gap-2 px-4 py-2 glass rounded-xl hover:bg-white/10 transition-all text-white/60 hover:text-white"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <FaArrowLeft />
          <span className="font-semibold">Back to Screener</span>
        </motion.button>
        
        {/* Banner Section (if exists) */}
        {bannerUrl && (
          <motion.div
            className="glass rounded-3xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="relative w-full" style={{ aspectRatio: '7/1' }}>
              <img
                src={bannerUrl.startsWith('http') ? bannerUrl : `${API_URL}${bannerUrl}`}
                alt={`${tokenData.name} banner`}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-dark/80 to-transparent pointer-events-none" />
            </div>
          </motion.div>
        )}

        {/* Hero Section */}
        <motion.div 
          className="glass rounded-3xl p-8 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '40px 40px'
            }} />
          </div>
          
          <div className="relative">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              {/* Token Info */}
              <div className="flex items-center gap-6">
                {tokenData.logo ? (
                  <img 
                    src={tokenData.logo} 
                    alt={tokenData.name}
                    className="w-24 h-24 rounded-full object-cover ring-4 ring-primary/20"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div 
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white ring-4 ring-white/10"
                  style={{ 
                    display: tokenData.logo ? 'none' : 'flex',
                    background: `linear-gradient(135deg, ${getTokenColor(contractHash).from}, ${getTokenColor(contractHash).to})`
                  }}
                >
                  {tokenData.symbol?.substring(0, 2).toUpperCase() || 'TK'}
                </div>
                
                <div>
                  <h1 className="text-4xl font-bold text-white mb-2">
                    {tokenData.name || 'Unknown Token'}
                  </h1>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-semibold">
                      {tokenData.symbol || 'TKN'}
                    </span>
                    {isCsprFun && (tokenData.contractHashActual || contractHash) && !isGraduated && (() => {
                      const hashToUse = tokenData.contractHashActual || contractHash
                      const cleanedHash = hashToUse.replace('contract-package-', '').replace('hash-', '')
                      return (
                        <a
                          href={`https://cspr.fun/trade/hash-${cleanedHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-secondary/20 text-secondary hover:bg-secondary/30 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 group"
                          title="View on CSPR.fun"
                        >
                          CSPR.FUN
                          <FaExternalLinkAlt className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )
                    })()}
                    {hasCTOAccess && (
                      <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-semibold flex items-center gap-1.5">
                        👑 CTO ACCESS
                      </span>
                    )}
                    {isGraduated && (() => {
                      const cleanHash = contractHash.replace('contract-package-', '').replace('hash-', '')
                      return (
                        <a
                          href={`https://www.friendly.market/swap/CSPR/${cleanHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 group"
                          title="View on Friendly.Market"
                        >
                          👻 GRADUATED
                          <FaExternalLinkAlt className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      )
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Action Buttons - Trading Links */}
              <div className="flex flex-wrap gap-3 mb-4">
                {/* Friendly.Market Link - Si le token est gradué */}
                {isGraduated && (() => {
                  const cleanHash = contractHash.replace('contract-package-', '').replace('hash-', '')
                  return (
                    <a
                      href={`https://www.friendly.market/swap/CSPR/${cleanHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[160px] px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl transition-all group flex items-center justify-center gap-2 font-semibold shadow-lg hover:shadow-green-500/20"
                    >
                      <span className="text-2xl">👻</span>
                      <span className="text-white">Trade Now</span>
                      <FaExternalLinkAlt className="text-white/60 text-sm" />
                    </a>
                  )
                })()}
                
                {/* CSPR.fun Link - Si le token vient de CSPR.fun et n'est pas gradué */}
                {isCsprFun && !isGraduated && (tokenData.contractHashActual || contractHash) && (() => {
                  const hashToUse = tokenData.contractHashActual || contractHash
                  const cleanedHash = hashToUse.replace('contract-package-', '').replace('hash-', '')
                  return (
                    <a
                      href={`https://cspr.fun/trade/hash-${cleanedHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[160px] px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl transition-all group flex items-center justify-center gap-2 font-semibold shadow-lg hover:shadow-orange-500/20"
                    >
                      <FaFire className="text-white text-lg" />
                      <span className="text-white">Trade on CSPR.fun</span>
                      <FaExternalLinkAlt className="text-white/60 text-sm" />
                    </a>
                  )
                })()}
              </div>
              
              {/* Social Links & Info */}
              <div className="flex flex-wrap gap-2">
                {twitterUrl && (
                  <a
                    href={twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Follow on X"
                    className="p-3 glass hover:bg-primary/20 rounded-xl transition-all group"
                  >
                    <SiX className="text-white text-xl group-hover:text-primary transition-colors" />
                  </a>
                )}
                
                {telegramUrl && (
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Join Telegram"
                    className="p-3 glass hover:bg-blue-500/20 rounded-xl transition-all group"
                  >
                    <FaTelegram className="text-white text-xl group-hover:text-blue-400 transition-colors" />
                  </a>
                )}
                
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Visit Website"
                    className="p-3 glass hover:bg-white/20 rounded-xl transition-all group"
                  >
                    <FaGlobe className="text-white text-xl group-hover:text-white transition-colors" />
                  </a>
                )}
                
                {discordUrl && (
                  <a
                    href={discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Join Discord"
                    className="p-3 glass hover:bg-purple-500/20 rounded-xl transition-all group"
                  >
                    <FaDiscord className="text-white text-xl group-hover:text-purple-400 transition-colors" />
                  </a>
                )}
                
                <div className="flex-1"></div>
                
                <a
                  href={`https://cspr.live/contract-package/${contractHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on CasperLive"
                  className="p-3 glass hover:bg-white/10 rounded-xl transition-all group"
                >
                  <FaExternalLinkAlt className="text-white text-xl group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
            
            {/* Description */}
            {tokenData.description && (
              <div className="mt-6 p-4 bg-black/20 rounded-xl">
                <p className="text-white/80 text-sm leading-relaxed">
                  {tokenData.description.replace(/https?:\/\/[^\s]+/g, '').trim()}
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="space-y-6">
          
          {/* Tabs Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-2xl p-2 flex gap-2"
          >
            <button
              onClick={() => setActiveTab('chart')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'chart'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              📈 Chart & Price
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              💰 Transactions
            </button>
            <button
              onClick={() => setActiveTab('stories')}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'stories'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              📹 Stories
            </button>
          </motion.div>

          {/* Tab Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'chart' && (
              <TokenPriceChart
                contractPackageHash={contractHash}
                tokenSymbol={tokenData.symbol}
                days={30}
                friendlyMarketData={friendlyMarketData}
                historicalData={historicalData}
                isGraduated={isGraduated}
                csprFunData={tokenData?.csprFunData || null}
              />
            )}

            {activeTab === 'transactions' && (
              <TransactionFeed 
                contractHash={contractHash}
                tokenSymbol={tokenData?.symbol || 'TOKEN'}
                decimals={tokenData?.decimals || 9}
              />
            )}

            {activeTab === 'stories' && (
              <div className="space-y-6">
                {/* Upload Story CTA - Style YouTube Shorts */}
                {!walletAddress ? (
                  <div className="glass-inner rounded-2xl p-8 text-center border-2 border-primary/20">
                    <div className="flex items-center justify-center gap-4 mb-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                        📹
                      </div>
                      <div className="text-left">
                        <h3 className="text-2xl font-bold text-white">Share Your {tokenData?.symbol} Story</h3>
                        <p className="text-primary font-semibold">Top performers earn 10% of daily fees</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                      <div className="glass rounded-xl p-4">
                        <div className="text-3xl mb-2">👑</div>
                        <p className="text-white font-bold">Token Owner</p>
                        <p className="text-green-400 text-sm">FREE Unlimited Access</p>
                      </div>
                      <div className="glass rounded-xl p-4">
                        <div className="text-3xl mb-2">🔥</div>
                        <p className="text-white font-bold">Community Takeover</p>
                        <p className="text-primary text-sm">1,000 CSPR One-Time</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        toast('Please connect your wallet first', { icon: '👛' })
                      }}
                      className="btn-primary px-8 py-4 text-lg font-bold w-full md:w-auto"
                    >
                      👛 Connect Wallet to Start
                    </button>
                  </div>
                ) : (
                  <motion.button
                    onClick={() => setShowUploadModal(true)}
                    className="w-full glass-inner border-2 border-primary/30 hover:border-primary rounded-2xl p-6 flex items-center justify-between group transition-all"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FaPlay className="text-white text-xl ml-1" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-white">🛠️ Dev Access for {tokenData?.symbol}</h3>
                        <p className="text-white/60 text-sm">Post stories, update info & banner • Owner & CTO only</p>
                      </div>
                    </div>
                    <div className="text-primary text-2xl group-hover:translate-x-1 transition-transform">
                      →
                    </div>
                  </motion.button>
                )}
                
                {/* Stories Grid - YouTube Shorts Style */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-white">All Stories</h4>
                    <p className="text-white/60 text-sm">Swipe to explore</p>
                  </div>
                  <StoriesGrid
                    tokenHash={contractHash}
                    tokenSymbol={tokenData?.symbol || 'TOKEN'}
                    limit={50}
                    showUploadButton={false}
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Quick Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Market Cap */}
              <motion.div 
                className="glass rounded-xl p-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                <FaCoins className="text-yellow-400 text-2xl mb-2" />
                <p className="text-white/60 text-sm">Market Cap</p>
                <p className="text-2xl font-bold text-white">
                  {calculatedStats?.marketCap || 'N/A'}
                </p>
                {calculatedStats?.fromCsprFun ? (
                  <p className="text-xs text-orange-400 mt-1">✓ CSPR.fun</p>
                ) : isGraduated && calculatedStats?.marketCap !== 'N/A' ? (
                  <p className="text-xs text-green-400 mt-1">✓ Friendly.Market</p>
                ) : realStats?.currentPrice > 0 && calculatedStats?.marketCap !== 'N/A' ? (
                  <p className="text-xs text-green-400 mt-1">✓ DEX Price</p>
                ) : (
                  <p className="text-xs text-white/40 mt-1">Not on DEX</p>
                )}
              </motion.div>

              {/* Liquidity */}
              <motion.div 
                className="glass rounded-xl p-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 }}
              >
                <FaChartLine className="text-blue-400 text-2xl mb-2" />
                <p className="text-white/60 text-sm">Liquidity</p>
                <p className="text-2xl font-bold text-white">
                  {calculatedStats?.liquidity || 'N/A'}
                </p>
                {calculatedStats?.fromCsprFun ? (
                  <p className="text-xs text-orange-400 mt-1">✓ CSPR Reserve</p>
                ) : isGraduated && friendlyMarketData ? (
                  <p className="text-xs text-green-400 mt-1">✓ {friendlyMarketData.liquidityProviderCount} LPs</p>
                ) : calculatedStats?.liquidityRating && calculatedStats.liquidityRating !== 'Unknown' ? (
                  <p className="text-xs text-white/40 mt-1">{calculatedStats.liquidityRating}</p>
                ) : null}
              </motion.div>
              
              {/* Holders */}
              <motion.div 
                className="glass rounded-xl p-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                <FaUsers className="text-green-400 text-2xl mb-2" />
                <p className="text-white/60 text-sm">Holders</p>
                <p className="text-2xl font-bold text-white">
                  {loadingStats ? (
                    <span className="animate-pulse">...</span>
                  ) : typeof realStats?.holders === 'number' && realStats.holders > 0 ? (
                    realStats.holders.toLocaleString()
                  ) : calculatedStats?.holders >= 0 ? (
                    calculatedStats.holders.toLocaleString()
                  ) : (
                    'N/A'
                  )}
                </p>
                {realStats?.fromBlockchain && (
                  <p className="text-xs text-green-400 mt-1">✓ Blockchain</p>
                )}
              </motion.div>
              
              {/* Transfers */}
              <motion.div 
                className="glass rounded-xl p-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
              >
                <FaExchangeAlt className="text-purple-400 text-2xl mb-2" />
                <p className="text-white/60 text-sm">Transfers</p>
                <p className="text-2xl font-bold text-white">
                  {loadingStats ? (
                    <span className="animate-pulse">...</span>
                  ) : typeof realStats?.transfers === 'number' && realStats.transfers > 0 ? (
                    realStats.transfers.toLocaleString()
                  ) : calculatedStats?.transfers >= 0 ? (
                    calculatedStats.transfers.toLocaleString()
                  ) : (
                    'N/A'
                  )}
                </p>
                {realStats?.fromBlockchain && (
                  <p className="text-xs text-green-400 mt-1">✓ Blockchain</p>
                )}
              </motion.div>
              
              {/* Volume 24h */}
              <motion.div 
                className="glass rounded-xl p-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 }}
              >
                <FaFire className="text-orange-400 text-2xl mb-2" />
                <p className="text-white/60 text-sm">{calculatedStats?.fromCsprFun ? 'All-Time Volume' : 'Volume 24h'}</p>
                <p className="text-2xl font-bold text-white">
                  {calculatedStats?.volume24h || 'N/A'}
                </p>
                {calculatedStats?.fromCsprFun ? (
                  <p className="text-xs text-orange-400 mt-1">✓ CSPR.fun</p>
                ) : isGraduated && friendlyMarketData ? (
                  <p className="text-xs text-green-400 mt-1">✓ {friendlyMarketData.txCount} trades</p>
                ) : null}
              </motion.div>
              
              {/* Price */}
              {(calculatedStats?.fromCsprFun || (isGraduated && friendlyMarketData)) && (
                <motion.div 
                  className="glass rounded-xl p-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.75 }}
                >
                  <FaCoins className="text-green-400 text-2xl mb-2" />
                  <p className="text-white/60 text-sm">Price</p>
                  <p className="text-lg font-bold text-white">
                    {calculatedStats?.fromCsprFun 
                      ? calculatedStats.price 
                      : friendlyMarketData.price.cspr.toFixed(6) + ' CSPR'}
                  </p>
                  {calculatedStats?.fromCsprFun ? (
                    <p className="text-xs text-orange-400 mt-1">✓ CSPR.fun</p>
                  ) : (
                    <p className="text-xs text-green-400 mt-1">✓ Friendly.Market</p>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Contract Info */}
          <motion.div 
              className="glass rounded-2xl p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <FaInfoCircle className="text-primary" />
                Contract Information
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-black/20 rounded-xl">
                  <p className="text-white/40 text-xs mb-1">Package Hash</p>
                  <div className="flex items-center gap-2">
                    <p className="text-white/80 text-sm font-mono break-all flex-1">
                      {contractHash}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(contractHash)
                        toast.success('Hash copied!')
                      }}
                      className="p-2 hover:bg-white/10 rounded-lg transition-all group flex-shrink-0"
                      title="Copy hash"
                    >
                      <FaCopy className="text-white/60 group-hover:text-primary transition-colors" />
                    </button>
                  </div>
                </div>
                
                <div className="p-4 bg-black/20 rounded-xl hover:bg-black/30 transition-all group">
                  <p className="text-white/40 text-xs mb-1">Owner</p>
                  {tokenData?.ownerPublicKey ? (
                    <a
                      href={`https://cspr.live/account/${tokenData.ownerPublicKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/80 hover:text-primary text-sm font-mono flex items-center gap-2 transition-colors"
                      title="View on CSPR.live"
                    >
                      <span>
                        {`${tokenData.ownerPublicKey.substring(0, 12)}...${tokenData.ownerPublicKey.substring(tokenData.ownerPublicKey.length - 8)}`}
                      </span>
                      <FaExternalLinkAlt className="text-xs opacity-0 group-hover:opacity-60" />
                    </a>
                  ) : tokenData?.owner && tokenData.owner !== 'Unknown' ? (
                    <a
                      href={`https://cspr.live/account/${tokenData.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/80 hover:text-primary text-sm font-mono flex items-center gap-2 transition-colors"
                      title="View on CSPR.live"
                    >
                      <span>
                        {`${tokenData.owner.substring(0, 12)}...${tokenData.owner.substring(tokenData.owner.length - 8)}`}
                      </span>
                      <FaExternalLinkAlt className="text-xs opacity-0 group-hover:opacity-60" />
                    </a>
                  ) : (
                    <p className="text-white/80 text-sm font-mono">Unknown</p>
                  )}
                </div>
                
                <div className="p-4 bg-black/20 rounded-xl">
                  <p className="text-white/40 text-xs mb-1">Decimals</p>
                  <p className="text-white/80 text-lg font-semibold">
                    {tokenData.decimals || 9}
                  </p>
                </div>
                
                <div className="p-4 bg-black/20 rounded-xl">
                  <p className="text-white/40 text-xs mb-1">Contract Type</p>
                  <p className="text-white/80 text-lg font-semibold">
                    CEP-18 Token
                  </p>
                </div>
              </div>
              
              {/* REMOVED: View Transactions Button - now integrated in tabs */}
            </motion.div>

          {/* Community Chat Button */}
          <motion.div 
              className="glass rounded-3xl p-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    💬 Community Chat
                  </h2>
                  <p className="text-white/60">
                    Join the {tokenData?.contract_name || 'token'} community and discuss with holders in real-time
                  </p>
                </div>
                <div className="text-white/40 flex items-center gap-2">
                  <FaUsers />
                  <span>{memberCount} online</span>
                </div>
              </div>
              
              <button
                onClick={() => {
                  // Clean hash: remove prefixes for consistent URL format
                  const cleanHash = contractHash.replace('contract-package-', '').replace('hash-', '')
                  navigate(`/chat/${cleanHash}`)
                }}
                className="w-full btn-primary py-4 text-lg font-bold flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform"
              >
                <span>🚀 Join {tokenData?.contract_name || 'Token'} Community</span>
              </button>
            </motion.div>

        </div>

      </div>

      {/* Dev Access Modal (formerly Upload Story) */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl my-8">
            <StoryUpload
              tokenData={{
                ...tokenData,
                packageHash: contractHash.replace('contract-package-', '').replace('hash-', '') // Pass clean package hash
              }}
              onUploadComplete={(story) => {
                console.log('✅ Dev action completed:', story)
                setShowUploadModal(false)
                // Reload token data to get updated info/banner
                loadTokenData()
                // Optionally switch to stories tab if story was uploaded
                if (story?.id) {
                  setActiveTab('stories')
                  toast.success('Story uploaded! Check the Stories tab')
                } else {
                  toast.success('Token info updated successfully!')
                }
              }}
              onClose={() => setShowUploadModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
