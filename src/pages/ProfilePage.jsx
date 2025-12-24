import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useWallet } from '../contexts/WalletContext'
import { FaWallet, FaComments, FaCog, FaUser, FaCoins, FaChartLine, FaHistory, FaEdit, FaArrowUp, FaArrowDown, FaExternalLinkAlt, FaFire, FaExchangeAlt } from 'react-icons/fa'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getAllTokens } from '../services/api.service'
import TokenAvatar from '../components/Token/TokenAvatar'
import UserAvatar from '../components/User/UserAvatar'
import { getTokenColor } from '../utils/tokenColors'

export default function ProfilePage() {
  const { walletAddress, balance, assets, network } = useWallet()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState({
    name: '',
    avatar: '',
    bio: ''
  })
  const [joinedCommunities, setJoinedCommunities] = useState([])
  const [transactions, setTransactions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyFilter, setHistoryFilter] = useState('all') // all, in, out
  const [csprPrice, setCsprPrice] = useState(null)
  const [ctoPayments, setCtoPayments] = useState([])
  const [ctoLoading, setCtoLoading] = useState(false)

  // Load CTO payment history
  useEffect(() => {
    if (walletAddress) {
      fetchCTOPayments()
    }
  }, [walletAddress, network])

  const fetchCTOPayments = async () => {
    setCtoLoading(true)
    try {
      const response = await fetch(`http://localhost:3001/api/cto/payment-history/${walletAddress}?network=${network}`)
      const data = await response.json()
      
      if (data.success) {
        setCtoPayments(data.payments || [])
      }
    } catch (error) {
      console.error('Failed to fetch CTO payments:', error)
    } finally {
      setCtoLoading(false)
    }
  }

  // Load profile from localStorage (wallet-specific)
  useEffect(() => {
    if (!walletAddress) return
    
    const profileKey = `userProfile_${walletAddress}`
    const savedProfile = localStorage.getItem(profileKey)
    
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile))
    } else {
      // Clear profile if no data for this wallet
      setProfile({ name: '', avatar: '', bio: '' })
    }

    // Load joined communities and fix their names
    const loadCommunities = async () => {
      const savedCommunities = localStorage.getItem('joinedCommunities')
      if (savedCommunities) {
        const communities = JSON.parse(savedCommunities)
        
        // Fix communities with generic "Token" name or missing data
        const needsFix = communities.some(c => 
          !c.tokenName || 
          c.tokenName === 'Token' || 
          c.tokenName.startsWith('Token ') ||
          !c.tokenLogo ||
          !c.tokenSymbol
        )
        
        if (needsFix) {
          console.log('🔧 Fixing community names and logos...')
          try {
            // Get all tokens from API
            const response = await getAllTokens(1, 300)
            const allTokens = response.tokens || []
            
            // Update each community with correct name, logo, symbol
            const fixed = communities.map(community => {
              // Find token by hash
              const found = allTokens.find(t => {
                const hash = t.contractHash || ''
                return hash.includes(community.tokenHash.substring(0, 16)) ||
                       community.tokenHash.includes(hash.substring(0, 16))
              })
              
              if (found) {
                console.log(`✅ Fixed: ${community.tokenName} → ${found.name}`)
                return { 
                  ...community, 
                  tokenName: found.name,
                  tokenSymbol: found.symbol,
                  tokenLogo: found.logo
                }
              }
              
              return community
            })
            
            // Save fixed data
            localStorage.setItem('joinedCommunities', JSON.stringify(fixed))
            setJoinedCommunities(fixed)
          } catch (error) {
            console.error('❌ Failed to fix community names:', error)
            setJoinedCommunities(communities)
          }
        } else {
          setJoinedCommunities(communities)
        }
      }
    }
    
    loadCommunities()
  }, [])

  // Load transaction history when history tab is opened
  useEffect(() => {
    if (activeTab === 'history' && walletAddress) {
      fetchTransactionHistory()
    }
  }, [activeTab, walletAddress, historyPage, network])

  // Fetch CSPR price for USD conversion
  useEffect(() => {
    const fetchCSPRPrice = async () => {
      try {
        // Try CoinGecko API first
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd')
        const data = await response.json()
        if (data['casper-network']?.usd) {
          setCsprPrice(data['casper-network'].usd)
          console.log('💰 CSPR Price:', data['casper-network'].usd, 'USD')
          return
        }
      } catch (error) {
        console.warn('⚠️ CoinGecko failed, trying CoinCompare...')
      }

      try {
        // Fallback to CoinCompare API
        const response = await fetch('https://min-api.cryptocompare.com/data/price?fsym=CSPR&tsyms=USD')
        const data = await response.json()
        if (data.USD) {
          setCsprPrice(data.USD)
          console.log('💰 CSPR Price (CoinCompare):', data.USD, 'USD')
        }
      } catch (error) {
        console.error('❌ Failed to fetch CSPR price:', error)
      }
    }

    fetchCSPRPrice()
    // Refresh price every 5 minutes
    const interval = setInterval(fetchCSPRPrice, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchTransactionHistory = async () => {
    if (!walletAddress) return
    
    setHistoryLoading(true)
    try {
      const response = await fetch(
        `http://localhost:3001/api/accounts/${walletAddress}/history?network=${network}&page=${historyPage}&page_size=20`
      )
      const data = await response.json()
      
      if (data.success) {
        setTransactions(data.transactions || [])
        setHistoryTotal(data.total || 0)
        console.log(`✅ Loaded ${data.transactions.length} transactions`)
      }
    } catch (error) {
      console.error('❌ Failed to fetch history:', error)
      toast.error('Failed to load transaction history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const formatAddress = (addr) => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  const formatBalance = (bal) => {
    if (bal === null) return '0.00'
    return parseFloat(bal).toFixed(2)
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FaUser },
    { id: 'communities', label: 'My Communities', icon: FaComments },
    { id: 'wallet', label: 'Wallet', icon: FaWallet },
    { id: 'history', label: 'History', icon: FaHistory },
    { id: 'settings', label: 'Settings', icon: FaCog }
  ]

  return (
    <div className="min-h-screen bg-dark pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header Card */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-4 sm:p-6 mb-6"
        >
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0 mx-auto sm:mx-0">
              <div className="ring-4 ring-primary/30 rounded-full">
                <UserAvatar
                  userAvatar={profile.avatar}
                  userName={profile.name}
                  userWallet={walletAddress}
                  size="2xl"
                />
              </div>
              <button 
                onClick={() => setActiveTab('settings')}
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition-colors shadow-lg"
              >
                <FaEdit className="text-sm text-white" />
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 mb-3 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {profile.name || formatAddress(walletAddress) || 'Guest'}
                </h1>
                <span className="px-3 py-1 bg-success/20 text-success rounded-full text-sm font-semibold flex items-center gap-2">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                  Connected
                </span>
              </div>

              {profile.bio && (
                <p className="text-white/60 mb-4 text-center sm:text-left">{profile.bio}</p>
              )}

              {/* Stats - Responsive Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Wallet */}
                <div className="flex items-center justify-center sm:justify-start gap-2 px-3 py-2 bg-white/5 rounded-lg">
                  <FaWallet className="text-primary flex-shrink-0" />
                  <span className="text-white/80 text-xs sm:text-sm font-mono truncate">{formatAddress(walletAddress)}</span>
                </div>

                {/* Balance */}
                <div className="flex flex-col items-center sm:items-start gap-1 px-3 py-2 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FaCoins className="text-yellow-400 flex-shrink-0" />
                    <span className="text-white font-bold text-sm">{formatBalance(balance)} CSPR</span>
                  </div>
                  {csprPrice && (
                    <span className="text-white/40 text-xs ml-6">
                      ~${(parseFloat(balance) * csprPrice).toFixed(2)} USD
                    </span>
                  )}
                </div>

                {/* Communities */}
                <div className="flex items-center justify-center sm:justify-start gap-2 px-3 py-2 bg-secondary/10 rounded-lg">
                  <FaComments className="text-secondary flex-shrink-0" />
                  <span className="text-white text-sm">{joinedCommunities.length} Communities</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-white/10">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary/20 text-primary border-b-2 border-primary'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-white mb-4">Account Overview</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total Balance */}
                  <div className="glass-panel p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                        <FaCoins className="text-primary" />
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">Total Balance</p>
                        <p className="text-white font-bold text-xl">{formatBalance(balance)} CSPR</p>
                      </div>
                    </div>
                  </div>

                  {/* Communities */}
                  <div className="glass-panel p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-secondary/20 rounded-lg flex items-center justify-center">
                        <FaComments className="text-secondary" />
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">Communities Joined</p>
                        <p className="text-white font-bold text-xl">{joinedCommunities.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div className="glass-panel p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                        <FaChartLine className="text-success" />
                      </div>
                      <div>
                        <p className="text-white/60 text-sm">Activity Score</p>
                        <p className="text-white font-bold text-xl">--</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <FaHistory />
                    Recent Activity
                  </h3>
                  <div className="text-white/60 text-center py-8">
                    <p>No recent activity</p>
                    <p className="text-sm mt-2">Start by joining a community or trading tokens!</p>
                  </div>
                </div>

                {/* CTO Payments History */}
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <FaCoins className="text-yellow-400" />
                    CTO Access Payments
                  </h3>
                  
                  {ctoLoading ? (
                    <div className="text-white/60 text-center py-8">
                      <div className="animate-spin text-3xl mb-2">⏳</div>
                      <p>Loading payment history...</p>
                    </div>
                  ) : ctoPayments.length === 0 ? (
                    <div className="text-white/60 text-center py-8">
                      <FaCoins className="text-4xl text-white/20 mx-auto mb-2" />
                      <p>No CTO payments yet</p>
                      <p className="text-sm mt-2">Purchase CTO access to upload stories and earn rewards!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ctoPayments.map((payment, index) => (
                        <div key={index} className="glass-inner p-4 rounded-lg hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-4">
                            {/* Token Logo - Clickable */}
                            <Link 
                              to={`/token/${payment.token_hash}`}
                              className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              {payment.tokenLogo ? (
                                <img 
                                  src={payment.tokenLogo} 
                                  alt={payment.tokenName}
                                  className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    const fallback = e.target.parentElement.querySelector('.fallback-logo')
                                    if (fallback) fallback.style.display = 'flex'
                                  }}
                                />
                              ) : null}
                              {/* Fallback logo with gradient from hash */}
                              <div 
                                className={`fallback-logo w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg ring-2 ring-primary/20`}
                                style={{ 
                                  display: payment.tokenLogo ? 'none' : 'flex',
                                  background: `linear-gradient(135deg, ${getTokenColor(payment.token_hash).from}, ${getTokenColor(payment.token_hash).to})`
                                }}
                              >
                                {payment.tokenSymbol?.substring(0, 2) || '??'}
                              </div>
                            </Link>
                            
                            {/* Token Info - Clickable */}
                            <Link 
                              to={`/token/${payment.token_hash}`}
                              className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <p className="text-white font-semibold mb-1 flex items-center gap-2 truncate">
                                {payment.tokenName || 'Unknown Token'}
                                <span className="text-purple-400 text-xs font-mono">{payment.tokenSymbol || '???'}</span>
                              </p>
                              <p className="text-white/40 text-xs font-mono truncate" title={payment.token_hash}>
                                {payment.token_hash}
                              </p>
                              <p className="text-white/40 text-xs mt-1">
                                {new Date(payment.granted_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </Link>
                            
                            {/* Payment Amount */}
                            <div className="text-right flex-shrink-0">
                              <p className="text-green-400 font-bold text-xl">
                                {parseFloat(payment.paid_amount || 0).toFixed(2)} CSPR
                              </p>
                              {payment.transaction_hash && (
                                <a
                                  href={`https://cspr.live/deploy/${payment.transaction_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs mt-1 transition-colors"
                                >
                                  View TX <FaExternalLinkAlt className="text-xs" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <div className="text-center pt-4 border-t border-white/10">
                        <p className="text-white/60 text-sm">
                          Total CTO Payments: <span className="text-green-400 font-bold">{ctoPayments.reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0).toFixed(2)} CSPR</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* COMMUNITIES TAB */}
            {activeTab === 'communities' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">My Communities</h2>
                  <span className="text-white/60">{joinedCommunities.length} joined</span>
                </div>

                {joinedCommunities.length === 0 ? (
                  <div className="glass-panel p-12 rounded-xl text-center">
                    <FaComments className="text-6xl text-white/20 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">No Communities Yet</h3>
                    <p className="text-white/60 mb-6">Join a token community to start chatting with holders!</p>
                    <button
                      onClick={() => navigate('/screener')}
                      className="btn-primary"
                    >
                      Explore Tokens
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {joinedCommunities.map((community, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="glass-panel p-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer"
                        onClick={() => navigate(`/chat/${community.tokenHash}`)}
                      >
                        <div className="flex items-center gap-3">
                          <TokenAvatar
                            tokenHash={community.tokenHash}
                            tokenName={community.tokenName}
                            tokenSymbol={community.tokenSymbol}
                            tokenLogo={community.tokenLogo}
                            size="md"
                          />
                          <div className="flex-1">
                            <h3 className="text-white font-bold">{community.tokenName || 'Unknown Token'} Community</h3>
                            <p className="text-white/60 text-sm">
                              Joined {new Date(community.joinedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button className="btn-secondary">
                            Open Chat
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* WALLET TAB */}
            {activeTab === 'wallet' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-white mb-4">Wallet Details</h2>

                {/* Balance Card */}
                <div className="glass-panel p-6 rounded-xl">
                  <div className="text-center">
                    <p className="text-white/60 mb-2">Total Balance</p>
                    <p className="text-5xl font-bold text-white mb-1">{formatBalance(balance)}</p>
                    <p className="text-white/60">CSPR</p>
                    {csprPrice && (
                      <p className="text-white/40 text-lg mt-2">
                        ~${(parseFloat(balance) * csprPrice).toFixed(2)} USD
                      </p>
                    )}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-3">Wallet Address</h3>
                  <div className="flex items-center gap-3 bg-white/5 p-4 rounded-lg">
                    <code className="flex-1 text-white/80 font-mono text-sm break-all">
                      {walletAddress || 'Not connected'}
                    </code>
                    <button
                      onClick={() => {
                        if (walletAddress) {
                          navigator.clipboard.writeText(walletAddress)
                        }
                      }}
                      className="btn-secondary text-sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Assets */}
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-4">Assets</h3>
                  
                  {/* Tokens */}
                  {assets.tokens && assets.tokens.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-white/80 text-sm font-medium mb-3">Tokens ({assets.tokens.length})</h4>
                      <div className="space-y-2">
                        {assets.tokens.map((token, index) => {
                          // Special case: WCSPR uses CSPR logo (check by hash OR symbol)
                          const isWCSPR = token.contractHash === '40bd4a45c414df61be3832e28ff6dcedc479744707c611fd97fea0d90619146f' 
                            || token.symbol === 'WCSPR'
                            || token.name === 'Wrapped Casper'
                          
                          const displayLogo = isWCSPR 
                            ? '/cspr-logo.webp'
                            : token.logo
                          
                          return (
                            <div 
                              key={index} 
                              onClick={() => navigate(`/token/${token.contractHash}`)}
                              className="flex items-center gap-3 p-3 rounded-lg bg-dark-lighter hover:bg-dark-hover transition-colors cursor-pointer"
                            >
                              {displayLogo ? (
                                <img src={displayLogo} alt={token.symbol} className="w-10 h-10 rounded-full" />
                              ) : (
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                  style={{
                                    background: `linear-gradient(135deg, ${getTokenColor(token.contractHash).from}, ${getTokenColor(token.contractHash).to})`
                                  }}
                                >
                                  {token.symbol?.substring(0, 2).toUpperCase() || '??'}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="text-white font-medium">{token.name}</div>
                                <div className="text-white/60 text-sm">{token.symbol}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-white font-medium">{token.balance || '0.00'}</div>
                                <div className="text-white/60 text-sm">{token.symbol}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* NFTs */}
                  {assets.nfts && assets.nfts.length > 0 && (
                    <div>
                      <h4 className="text-white/80 text-sm font-medium mb-3">NFTs ({assets.nfts.length})</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {assets.nfts.map((nft, index) => (
                          <div key={index} className="aspect-square rounded-lg bg-dark-lighter overflow-hidden">
                            {nft.image && <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Empty state */}
                  {(!assets.tokens || assets.tokens.length === 0) && (!assets.nfts || assets.nfts.length === 0) && (
                    <div className="text-white/60 text-center py-8">
                      <p>No assets found</p>
                      <p className="text-sm mt-2">Your tokens and NFTs will appear here</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-white">Transaction History</h2>
                  
                  {/* Filter buttons */}
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setHistoryFilter('all')}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors ${
                        historyFilter === 'all'
                          ? 'bg-primary text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setHistoryFilter('in')}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors ${
                        historyFilter === 'in'
                          ? 'bg-green-500 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      Received
                    </button>
                    <button
                      onClick={() => setHistoryFilter('out')}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors ${
                        historyFilter === 'out'
                          ? 'bg-red-500 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      Sent
                    </button>
                  </div>
                </div>

                {/* Loading State */}
                {historyLoading && (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-white/60 mt-4">Loading transactions...</p>
                  </div>
                )}

                {/* Transactions List */}
                {!historyLoading && transactions.length > 0 && (
                  <div className="space-y-3">
                    {transactions
                      .filter(tx => {
                        if (historyFilter === 'all') return true
                        return tx.direction === historyFilter
                      })
                      .map((tx, index) => (
                        <motion.div
                          key={`${tx.deployHash}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="glass-panel p-4 rounded-xl hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            {/* Transaction Icon */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              tx.direction === 'in' 
                                ? 'bg-green-500/20' 
                                : tx.direction === 'out'
                                ? 'bg-red-500/20'
                                : 'bg-blue-500/20'
                            }`}>
                              {tx.direction === 'in' ? (
                                <FaArrowDown className="text-green-400 text-xl" />
                              ) : tx.direction === 'out' ? (
                                <FaArrowUp className="text-red-400 text-xl" />
                              ) : (
                                <FaExchangeAlt className="text-blue-400 text-xl" />
                              )}
                            </div>

                            {/* Token Info */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {tx.tokenLogo ? (
                                  <img src={tx.tokenLogo} alt={tx.symbol} className="w-5 h-5 rounded-full" />
                                ) : (
                                  <div 
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                                    style={{
                                      background: `linear-gradient(135deg, ${getTokenColor(tx.contractHash).from}, ${getTokenColor(tx.contractHash).to})`
                                    }}
                                  >
                                    {tx.symbol?.substring(0, 2).toUpperCase() || '??'}
                                  </div>
                                )}
                                <span className="text-white font-bold">{tx.type}</span>
                                <span className="text-white/60">·</span>
                                <span 
                                  className="text-primary hover:text-primary-light cursor-pointer text-sm"
                                  onClick={() => navigate(`/token/${tx.contractHash}`)}
                                >
                                  {tx.tokenName}
                                </span>
                              </div>
                              <div className="text-white/40 text-xs">
                                {new Date(tx.timestamp).toLocaleString()}
                              </div>
                            </div>

                            {/* Amount */}
                            <div className="text-right">
                              <div className={`text-lg font-bold ${
                                tx.direction === 'in' 
                                  ? 'text-green-400' 
                                  : tx.direction === 'out'
                                  ? 'text-red-400'
                                  : 'text-white'
                              }`}>
                                {tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : ''}{tx.amount}
                              </div>
                              <div className="text-white/60 text-sm">{tx.symbol}</div>
                              {csprPrice && (tx.symbol === 'CSPR' || tx.symbol === 'WCSPR') && (
                                <div className="text-white/40 text-xs mt-0.5">
                                  ~${(parseFloat(tx.amount) * csprPrice).toFixed(2)} USD
                                </div>
                              )}
                            </div>

                            {/* View on Explorer */}
                            <a
                              href={`https://cspr.live/deploy/${tx.deployHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-colors"
                            >
                              <FaExternalLinkAlt className="text-white/60" />
                            </a>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                )}

                {/* Empty State */}
                {!historyLoading && transactions.length === 0 && (
                  <div className="text-center py-12 text-white/60">
                    <FaHistory className="text-6xl mx-auto mb-4 text-white/20" />
                    <p className="text-lg">No transactions yet</p>
                    <p className="text-sm mt-2">Your token transfer history will appear here</p>
                  </div>
                )}

                {/* Pagination */}
                {!historyLoading && transactions.length > 0 && (
                  <div className="flex items-center justify-between pt-6">
                    <div className="text-white/60 text-sm">
                      Showing {(historyPage - 1) * 20 + 1} - {Math.min(historyPage * 20, historyTotal)} of {historyTotal} transactions
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setHistoryPage(p => p + 1)}
                        disabled={historyPage * 20 >= historyTotal}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-white mb-4">Profile Settings</h2>

                {/* Edit Profile Form */}
                <div className="glass-panel p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-4">Edit Profile</h3>

                  <div className="space-y-6">
                    {/* Avatar Upload */}
                    <div>
                      <label className="text-white/80 text-sm mb-3 block">Profile Picture</label>
                      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 py-6">
                        {/* Preview */}
                        <div className="ring-4 ring-primary/30 rounded-full flex-shrink-0">
                          <UserAvatar
                            userAvatar={profile.avatar}
                            userName={profile.name}
                            userWallet={walletAddress}
                            size="2xl"
                          />
                        </div>

                        {/* Upload Controls */}
                        <div className="flex-1 space-y-3 w-full text-center sm:text-left">
                          <div className="flex flex-col sm:flex-row gap-2 justify-center sm:justify-start">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files[0]
                                if (file) {
                                  // Check file size (max 5MB)
                                  if (file.size > 5 * 1024 * 1024) {
                                    toast.error('Image too large! Max 5MB')
                                    return
                                  }
                                  
                                  try {
                                    // Upload to server instead of base64
                                    const formData = new FormData()
                                    formData.append('avatar', file)
                                    formData.append('walletAddress', walletAddress)
                                    
                                    const response = await fetch('http://localhost:3001/api/users/upload-avatar', {
                                      method: 'POST',
                                      body: formData
                                    })
                                    
                                    const data = await response.json()
                                    
                                    if (data.success) {
                                      // Save URL instead of base64
                                      setProfile({ ...profile, avatar: data.avatarUrl })
                                      toast.success('Avatar uploaded!')
                                    } else {
                                      toast.error('Upload failed')
                                    }
                                  } catch (error) {
                                    console.error('Upload error:', error)
                                    toast.error('Upload failed')
                                  }
                                }
                              }}
                              className="hidden"
                              id="avatar-upload"
                            />
                            <label
                              htmlFor="avatar-upload"
                              className="btn-primary cursor-pointer inline-block"
                            >
                              Upload Photo
                            </label>
                            {profile.avatar && (
                              <button
                                onClick={() => setProfile({ ...profile, avatar: '' })}
                                className="btn-secondary"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <p className="text-white/40 text-xs">
                            Recommended: Square image, at least 400x400px<br />
                            Max size: 5MB • Formats: JPG, PNG, GIF
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="text-white/80 text-sm mb-2 block">Display Name</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        placeholder="Enter your name"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Bio */}
                    <div>
                      <label className="text-white/80 text-sm mb-2 block">Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        placeholder="Tell us about yourself..."
                        rows={4}
                        maxLength={160}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:border-primary focus:outline-none resize-none"
                      />
                      <p className="text-white/40 text-xs mt-2">
                        {profile.bio.length}/160 characters
                      </p>
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={async () => {
                        try {
                          // Save to server first
                          const response = await fetch(`http://localhost:3001/api/profile/${walletAddress}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: profile.name,
                              avatarUrl: profile.avatar,
                              bio: profile.bio
                            })
                          })
                          
                          const data = await response.json()
                          
                          if (data.success) {
                            // Save the current profile state to localStorage (just URLs, no base64)
                            const profileToSave = {
                              name: profile.name,
                              avatar: profile.avatar, // This is now a URL, not base64
                              bio: profile.bio
                            }
                            
                            // Use wallet-specific key
                            const profileKey = `userProfile_${walletAddress}`
                            localStorage.setItem(profileKey, JSON.stringify(profileToSave))
                            
                            console.log('✅ Profile saved for', walletAddress.substring(0, 10) + '...:', profileToSave)
                            
                            // Dispatch custom event to update navbar immediately
                            window.dispatchEvent(new Event('profileUpdated'))
                            toast.success('Profile saved!')
                          } else {
                            toast.error('Failed to save profile')
                          }
                        } catch (error) {
                          console.error('Error saving profile:', error)
                          toast.error('Error saving profile')
                        }
                      }}
                      className="btn-primary w-full"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="glass-panel p-6 rounded-xl border border-red-500/20">
                  <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        if (confirm('Clear all profile data? This cannot be undone.')) {
                          localStorage.removeItem('userProfile')
                          localStorage.removeItem(`profile_${walletAddress}`)
                          setProfile({ name: '', avatar: '', bio: '' })
                          toast.success('Profile data cleared!')
                        }
                      }}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Clear Profile Data
                    </button>
                    <button 
                      onClick={() => {
                        if (confirm('Clear ALL localStorage data? This will remove all saved data including communities, preferences, etc.')) {
                          localStorage.clear()
                          toast.success('All localStorage cleared!')
                          window.location.reload()
                        }
                      }}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors block"
                    >
                      Clear All Cache (Fix Quota Error)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
