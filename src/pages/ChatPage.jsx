import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaArrowLeft } from 'react-icons/fa'
import { useState, useEffect } from 'react'
import TokenChat from '../components/Social/TokenChat'
import { useWallet } from '../contexts/WalletContext'
import { getTokenDetails, getAllTokens } from '../services/api.service'
import { getTokenColor } from '../utils/tokenColors'

export default function ChatPage() {
  const { contractHash } = useParams()
  const navigate = useNavigate()
  const { walletAddress } = useWallet()
  const [tokenData, setTokenData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadToken = async () => {
      try {
        console.log(`🔍 ChatPage: Loading token ${contractHash}`)
        
        let data = null
        
        // STRATEGY 1: Try CSPR.fun API first (best data with logo)
        console.log('🔥 Trying CSPR.fun API first...')
        try {
          const { getTokenByHash } = await import('../services/csprfun.service')
          const csprFunData = await getTokenByHash(contractHash)
          if (csprFunData) {
            console.log('✅ Found token in CSPR.fun:', csprFunData.name)
            data = {
              contract_name: csprFunData.name,
              contract_package_hash: contractHash,
              symbol: csprFunData.symbol,
              logo: csprFunData.logo || csprFunData.icon_url
            }
          }
        } catch (csprError) {
          console.warn('⚠️ CSPR.fun search failed:', csprError.message)
        }
        
        // STRATEGY 2: Check API cache if not found
        if (!data || !data.contract_name) {
          console.log('🔍 Searching in local cache...')
          try {
            const tokenResponse = await getAllTokens(1, 237)
            const allTokens = tokenResponse.tokens || []
            
            console.log(`📦 Cache has ${allTokens.length} tokens`)
            
            const found = allTokens.find(t => {
              const cacheHash = t.contractHash || ''
              if (!cacheHash) return false
            
            // Match if either contains the other (handles long vs short hash)
            const match = cacheHash.includes(contractHash.substring(0, 16)) ||
                         contractHash.includes(cacheHash.substring(0, 16)) ||
                         cacheHash === contractHash ||
                         contractHash.includes(cacheHash)
            
            if (match) {
              console.log(`✅ MATCH: ${cacheHash} ↔️ ${contractHash}`)
            }
            return match
          })
          
          if (found) {
            console.log('✅ Found token in cache:', found.name)
            // Map API fields to expected format
            data = {
              contract_name: found.name,
              contract_package_hash: found.contractHash,
              symbol: found.symbol,
              logo: found.logo
            }
          } else {
            console.warn('⚠️ Token not found in cache')
          }
        } catch (cacheError) {
          console.warn('⚠️ Cache search failed:', cacheError.message)
        }
      }
        
        // STRATEGY 3: If not found, try API (for new tokens)
        if (!data || !data.contract_name) {
          console.log('🌐 Not in cache, trying API...')
          try {
            const apiData = await getTokenDetails(contractHash)
            if (apiData && apiData.contract_name) {
              console.log('✅ Token found via API:', apiData.contract_name)
              data = apiData
            }
          } catch (apiError) {
            console.warn('⚠️ API call failed:', apiError.message)
          }
        }
        
        // FALLBACK: Use hash as name (new token not synced yet)
        if (data && data.contract_name) {
          console.log('📛 Token name:', data.contract_name)
          setTokenData(data)
        } else {
          console.warn('⚠️ Token not found anywhere, using hash as name (might be new token)')
          setTokenData({
            contract_name: `Token ${contractHash.substring(0, 8)}...`,
            contract_package_hash: contractHash,
            isUnknown: true // Flag for UI to show "newly created" badge
          })
        }
      } catch (error) {
        console.error('❌ ChatPage: Critical error loading token:', error)
        // Last resort fallback
        setTokenData({
          contract_name: `Token ${contractHash.substring(0, 8)}...`,
          contract_package_hash: contractHash,
          isUnknown: true
        })
      } finally {
        setLoading(false)
      }
    }

    if (contractHash) {
      loadToken()
    }
  }, [contractHash])

  return (
    <div className="min-h-screen bg-dark pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate(`/token/${contractHash}`)}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-4"
          >
            <FaArrowLeft />
            <span>Back to Token</span>
          </button>

          {loading ? (
            <div className="h-12 bg-white/5 rounded-lg animate-pulse"></div>
          ) : (
            <div className="flex items-center gap-4">
              {tokenData?.logo ? (
                <img 
                  src={tokenData.logo} 
                  alt={tokenData.symbol || tokenData.contract_name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-white/10"
                  onError={(e) => e.target.style.display = 'none'}
                />
              ) : (
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-white/10"
                  style={{
                    background: `linear-gradient(135deg, ${getTokenColor(contractHash).from}, ${getTokenColor(contractHash).to})`
                  }}
                >
                  {tokenData?.symbol?.substring(0, 2).toUpperCase() || tokenData?.contract_name?.substring(0, 2).toUpperCase() || '??'}
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {tokenData?.contract_name || 'Unknown Token'} Community
                </h1>
                <p className="text-white/60">
                  Real-time chat for holders and enthusiasts
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Chat Component */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {loading ? (
            <div className="glass-panel p-8 rounded-xl text-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-white/60">Loading chat...</p>
            </div>
          ) : (
            <TokenChat
              tokenHash={contractHash}
              tokenName={tokenData?.contract_name || 'Token'}
              tokenSymbol={tokenData?.symbol}
              tokenLogo={tokenData?.logo}
              walletAddress={walletAddress}
            />
          )}
        </motion.div>
      </div>
    </div>
  )
}
