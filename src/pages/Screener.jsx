import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaFire, FaRocket, FaFilter, FaSearch, FaChevronLeft, FaChevronRight, FaBolt, FaChartLine } from 'react-icons/fa'
import { getAllTokens } from '../services/api.service'
import toast from 'react-hot-toast'
import { getTokenColor } from '../utils/tokenColors'
import { API_URL } from '../config'

export default function Screener() {
  const [allTokens, setAllTokens] = useState([]) // ALL 239 tokens
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(() => {
    const saved = sessionStorage.getItem('screener_page')
    return saved ? parseInt(saved) : 1
  })
  const [sortBy, setSortBy] = useState('age') // name, age
  const [sortDir, setSortDir] = useState('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCsprFun, setFilterCsprFun] = useState(false)
  const [filterScreenerFun, setFilterScreenerFun] = useState(false)
  const [liveTransactions, setLiveTransactions] = useState([]) // Live transactions
  const [csprData, setCsprData] = useState(null) // CSPR from CoinGecko
  
  // Main effect: load tokens and transactions
  useEffect(() => {
    loadAllTokens()
    loadLatestTransactions()
    
    // Refresh transactions every 10 seconds
    const interval = setInterval(() => {
      loadLatestTransactions()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [])
  
  useEffect(() => {
    sessionStorage.setItem('screener_page', page.toString())
  }, [page])
  
  const loadLatestTransactions = async () => {
    try {
      console.log('🔄 Loading latest transactions from backend...')
      const response = await fetch(`${API_URL}/api/transactions/latest?limit=50`)
      const data = await response.json()
      
      if (data.success && data.data) {
        console.log(`✅ Loaded ${data.data.length} transactions`)
        setLiveTransactions(data.data)
      }
    } catch (error) {
      console.error('❌ Error loading transactions:', error)
    }
  }
  
  const loadAllTokens = async () => {
    setLoading(true)
    try {
      // Fetch CSPR data from CoinGecko (separate widget)
      try {
        const cgResponse = await fetch('https://api.coingecko.com/api/v3/coins/casper-network')
        if (cgResponse.ok) {
          const cgData = await cgResponse.json()
          setCsprData({
            name: 'Casper Network',
            symbol: 'CSPR',
            logo: cgData.image?.large || 'https://s2.coinmarketcap.com/static/img/coins/64x64/5899.png',
            currentPrice: cgData.market_data?.current_price?.usd || 0,
            priceChange24h: cgData.market_data?.price_change_percentage_24h || 0,
            volume24h: cgData.market_data?.total_volume?.usd || 0,
            marketCap: cgData.market_data?.market_cap?.usd || 0,
            rank: cgData.market_cap_rank || 0
          })
          console.log('✅ CSPR data from CoinGecko')
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch CSPR from CoinGecko:', err)
      }
      
      // Fetch ALL CEP-18 tokens at once (no pagination needed)
      const data = await getAllTokens(1, 1000)
      console.log('📊 Loaded tokens data:', data)
      console.log('📊 Total available:', data.totalCount, '| Returned:', data.tokens?.length || 0)
      
      // If we have a cache with all tokens, use it directly
      const allTokensFromCache = window._allTokensCache || data.tokens || []
      console.log('📊 Setting allTokens with', allTokensFromCache.length, 'tokens')
      setAllTokens(allTokensFromCache)
    } catch (error) {
      console.error('Error loading tokens:', error)
      toast.error('Failed to load tokens')
      setAllTokens([])
    } finally {
      setLoading(false)
    }
  }
  
  const handleSort = (column) => {
    console.log(`🔄 Changing sort to: ${column} (current: ${sortBy})`)
    
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir(column === 'name' ? 'asc' : 'desc')
    }
  }
  
  const filteredAndSortedTokens = allTokens
    .filter(token => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!(token.name?.toLowerCase().includes(query) ||
              token.symbol?.toLowerCase().includes(query))) {
          return false
        }
      }
      
      if (filterCsprFun && !token.isCsprFun) {
        return false
      }
      
      if (filterScreenerFun && !token.isScreenerFun) {
        return false
      }
      
      return true
    })
    .sort((a, b) => {
      let aVal, bVal
      
      switch (sortBy) {
        case 'name':
          aVal = (a.name || a.symbol || '').toLowerCase()
          bVal = (b.name || b.symbol || '').toLowerCase()
          return sortDir === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        case 'age':
          aVal = new Date(a.timestamp).getTime()
          bVal = new Date(b.timestamp).getTime()
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        default:
          return 0
      }
    })
  
  // Calculate pagination
  const pageSize = 50
  const totalPages = Math.ceil(filteredAndSortedTokens.length / pageSize)
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedTokens = filteredAndSortedTokens.slice(startIndex, endIndex)
  
  console.log('🔍 Screener render:', {
    allTokens: allTokens.length,
    filtered: filteredAndSortedTokens.length,
    paginated: paginatedTokens.length,
    page,
    totalPages
  })

  return (
    <div className="min-h-screen pt-20 pb-24 px-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <img 
              src="/logo.png" 
              alt="ScreenerLand Logo" 
              className="h-12 w-auto object-contain"
            />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
              ScreenerLand
            </h1>
          </div>
          <div className="flex items-center gap-4 text-lg">
            <div className="flex items-center gap-2">
              <FaSearch className="text-primary" />
              <span className="text-white/60">{filteredAndSortedTokens.length} Tokens</span>
            </div>
            <span className="text-white/20">•</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-md bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-sm text-blue-400">
                Casper Network
              </span>
            </div>
          </div>
        </motion.div>

        {/* CSPR Widget - Premium Terminal Style */}
        {csprData && (
          <motion.div
            className="mb-6 relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
              {/* Premium Glass Container */}
            <div className="relative glass rounded-xl shadow-2xl">              <div className="relative p-4 md:p-6">
                {/* Header: Logo + Identity + Badges */}
                <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-white/5">
                  {/* Left: Logo + Name */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/10 blur-lg rounded-full" />
                      <img 
                        src={csprData.logo} 
                        alt="CSPR" 
                        className="relative w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/20 shadow-lg" 
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base md:text-lg font-bold text-white">{csprData.symbol}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-semibold text-gray-400">
                          #{csprData.rank}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 font-medium">Casper Network</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: CoinGecko Badge */}
                  <a 
                    href="https://www.coingecko.com/en/coins/casper-network" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 hover:border-green-400/50 hover:from-green-500/20 hover:to-emerald-500/20 transition-all duration-300 shadow-lg hover:shadow-green-500/20"
                  >
                    <svg className="w-3 h-3 md:w-4 md:h-4 text-green-400 group-hover:text-green-300 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 7.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zM8 8c1.7 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.3-3 3-3zm8 12H8c-1.7 0-3-1.3-3-3s1.3-3 3-3h8c1.7 0 3 1.3 3 3s-1.3 3-3 3z"/>
                    </svg>
                    <span className="text-[10px] md:text-xs font-bold text-green-400 group-hover:text-green-300 transition-colors tracking-wide">
                      CoinGecko
                    </span>
                  </a>
                </div>
                
                {/* Stats Grid - Clean Style */}
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  {/* Price Module */}
                  <div className="bg-gray-900/50 rounded-lg p-3 md:p-4 border border-white/5 hover:border-white/10 transition-all group">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1 h-1 rounded-full bg-gray-500" />
                      <span className="text-[9px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</span>
                    </div>
                    <div className="text-base md:text-xl font-bold text-white mb-1">
                      ${csprData.currentPrice.toFixed(4)}
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] md:text-xs font-semibold ${
                      csprData.priceChange24h >= 0 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      <span className="text-xs">{csprData.priceChange24h >= 0 ? '↗' : '↘'}</span>
                      <span>{Math.abs(csprData.priceChange24h).toFixed(2)}%</span>
                    </div>
                  </div>
                  
                  {/* Market Cap Module */}
                  <div className="bg-gray-900/50 rounded-lg p-3 md:p-4 border border-white/5 hover:border-white/10 transition-all group">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1 h-1 rounded-full bg-gray-500" />
                      <span className="text-[9px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">MCap</span>
                    </div>
                    <div className="text-sm md:text-lg font-bold text-white">
                      ${(csprData.marketCap / 1e6).toFixed(2)}M
                    </div>
                  </div>
                  
                  {/* Volume Module */}
                  <div className="bg-gray-900/50 rounded-lg p-3 md:p-4 border border-white/5 hover:border-white/10 transition-all group">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1 h-1 rounded-full bg-gray-500" />
                      <span className="text-[9px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">Vol 24h</span>
                    </div>
                    <div className="text-sm md:text-lg font-bold text-white">
                      ${(csprData.volume24h / 1e6).toFixed(2)}M
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bottom Accent Line */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </motion.div>
        )}

        {/* Filters & Search */}
        <motion.div 
          className="mb-6 glass rounded-xl p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search tokens by name or symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-dark-hover rounded-xl text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
            
            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-3">
              {/* CSPR.fun Filter */}
              <button
                onClick={() => setFilterCsprFun(!filterCsprFun)}
                className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                  filterCsprFun 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-dark-hover text-white/60 hover:bg-dark-hover/80'
                }`}
              >
                <span>⚡</span>
                CSPR.FUN
                {filterCsprFun && <span className="text-xs">✓</span>}
              </button>
              
              {/* Clear Filters */}
              {(filterCsprFun || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterCsprFun(false)
                    setSearchQuery('')
                  }}
                  className="px-4 py-2 rounded-xl font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                >
                  Clear Filters ✕
                </button>
              )}
              
              {/* Results Count */}
              <div className="ml-auto flex items-center px-4 py-2 bg-dark-hover rounded-xl text-white/60">
                <span className="font-semibold text-primary">{filteredAndSortedTokens.length}</span>
                <span className="ml-1">tokens</span>
              </div>
            </div>
            
            {/* Sort Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSort('name')}
                className={`px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm md:text-base font-semibold transition-all ${
                  sortBy === 'name' 
                      ? 'bg-primary text-white' 
                      : 'bg-dark-hover text-white/60 hover:bg-dark-hover/80'
                  }`}
                >
                  Name {sortBy === 'name' && (sortDir === 'desc' ? '↓' : '↑')}
                </button>
                
                <button
                  onClick={() => handleSort('age')}
                  className={`px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm md:text-base font-semibold transition-all ${
                    sortBy === 'age' 
                      ? 'bg-secondary text-white' 
                      : 'bg-dark-hover text-white/60 hover:bg-dark-hover/80'
                  }`}
                >
                  Age {sortBy === 'age' && (sortDir === 'desc' ? '↓' : '↑')}
                </button>
                
                <button
                  onClick={() => setSortBy('transactions')}
                  className={`px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm md:text-base font-semibold transition-all flex items-center gap-2 ${
                    sortBy === 'transactions' 
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg' 
                      : 'bg-dark-hover text-white/60 hover:bg-dark-hover/80'
                  }`}
                >
                  <FaBolt className={sortBy === 'transactions' ? 'animate-pulse' : ''} />
                  <span className="hidden sm:inline">Latest </span>TX
                </button>
            </div>
          </div>
        </motion.div>

        {/* Content Area - Token Table or Transactions */} 
        {loading ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="inline-block animate-spin text-6xl mb-4">⚡</div>
            <p className="text-white/60">Loading degen plays...</p>
          </div>
        ) : sortBy === 'transactions' ? (
          // Transaction Feed
          <div className="space-y-6">
            <motion.div 
              className="glass rounded-2xl overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {/* Transaction Header */}
              <div className="p-4 bg-dark-hover border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaBolt className="text-orange-500 text-xl animate-pulse" />
                  <span className="text-white font-bold text-lg">Latest Transactions</span>
                </div>
                <span className="text-white/40 text-sm">{liveTransactions.length} transactions</span>
              </div>

              {/* Transaction List */}
              <div className="divide-y divide-white/5">
                {liveTransactions.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    No transactions yet...
                  </div>
                ) : (
                  liveTransactions
                    .filter(tx => {
                      // Search filter
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase()
                        if (!tx.tokenSymbol?.toLowerCase().includes(query)) return false
                      }
                      return true
                    })
                    .map((tx, index) => {
                      // Raccourcir le nom si > 30 caractères
                      const displayName = tx.tokenName && tx.tokenName.length > 30 
                        ? tx.tokenName.substring(0, 30) + '...' 
                        : tx.tokenName || tx.tokenSymbol || 'Unknown'
                      
                      return (
                        <div key={`${tx.hash}-${index}`} className="p-4 hover:bg-primary/5 transition-all">
                          <div className="grid grid-cols-12 gap-4 items-center">
                            {/* Token Logo + Name - Cliquable vers page token */}
                            <Link 
                              to={`/token/${tx.tokenHash}`}
                              className="col-span-12 md:col-span-5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                            >
                              {tx.tokenLogo ? (
                                <img 
                                  src={tx.tokenLogo} 
                                  alt={tx.tokenSymbol}
                                  className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold text-white">
                                  {tx.tokenSymbol?.substring(0, 2).toUpperCase() || '??'}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold truncate">{displayName}</div>
                                <div className="text-primary hover:text-secondary text-xs font-medium transition-colors cursor-pointer">
                                  ${tx.tokenSymbol}
                                </div>
                              </div>
                            </Link>

                            {/* Type Badge */}
                            <div className="col-span-3 md:col-span-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${
                                tx.type === 'mint' ? 'bg-green-500/20 text-green-400' :
                                tx.type === 'burn' ? 'bg-red-500/20 text-red-400' :
                                'bg-blue-500/20 text-blue-400'
                              }`}>
                                {tx.type === 'mint' ? '🪙 MINT' : tx.type === 'burn' ? '🔥 BURN' : '💱 SWAP'}
                              </span>
                            </div>

                            {/* Amount */}
                            <div className="col-span-4 md:col-span-2 text-right">
                              <Link to={`/token/${tx.tokenHash}`} className="hover:opacity-80 transition-opacity inline-block">
                                <div className="text-white font-semibold text-sm">
                                  {parseFloat(tx.tokens || 0).toLocaleString()}{' '}
                                  <span className="text-primary hover:text-secondary transition-colors">
                                    ${tx.tokenSymbol}
                                  </span>
                                </div>
                              </Link>
                              {tx.amount && parseFloat(tx.amount) > 0 && (
                                <div className="text-white/40 text-xs">{tx.amount} CSPR</div>
                              )}
                            </div>

                            {/* Date + Heure + Lien CSPR.live */}
                            <div className="col-span-5 md:col-span-3 flex flex-col items-end gap-1">
                              <div className="text-white/60 text-xs">
                                {tx.timestamp ? (
                                  <>
                                    <div>{new Date(tx.timestamp).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}</div>
                                    <div>{new Date(tx.timestamp).toLocaleTimeString('en-US', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit'
                                    })}</div>
                                  </>
                                ) : '-'}
                              </div>
                              <a
                                href={`https://cspr.live/deploy/${tx.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-secondary text-xs font-semibold transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View TX →
                              </a>
                            </div>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            <motion.div 
              className="glass rounded-2xl overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 p-4 bg-dark-hover border-b border-white/10 font-semibold text-white/60 text-sm">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-7">TOKEN</div>
                <div className="col-span-3 text-right">CREATED</div>
                <div className="col-span-1"></div>
              </div>
              
              {/* Token Rows */}
              <div className="divide-y divide-white/5">
                {paginatedTokens.map((token, index) => (
                  <Link
                    key={token.contractHash}
                    to={`/token/${token.contractHash}`}
                    className="grid grid-cols-12 gap-4 p-4 hover:bg-primary/5 transition-all group"
                  >
                    {/* Rank */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="text-white/40 group-hover:text-primary transition-colors font-bold">
                        {startIndex + index + 1}
                      </span>
                    </div>
                    
                    {/* Token Info */}
                    <div className="col-span-7 flex items-center gap-3">
                      {token.logo ? (
                        <img 
                          src={token.logo} 
                          alt={token.name}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                          onError={(e) => {
                            // Fallback si l'image ne charge pas
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      
                      {/* Fallback logo avec initiales - couleur unique par token */}
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                        style={{ 
                          display: token.logo ? 'none' : 'flex',
                          background: `linear-gradient(135deg, ${getTokenColor(token.contractHash).from}, ${getTokenColor(token.contractHash).to})`
                        }}
                      >
                        {token.symbol?.substring(0, 2).toUpperCase() || token.name?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold group-hover:text-primary transition-colors truncate">
                            {token.name && token.name.length > 50 
                              ? token.name.substring(0, 50) + '...' 
                              : token.name || 'Unknown Token'}
                          </span>
                          
                          {/* Badges */}
                          {token.isScreenerFun && (
                            <span className="px-2 py-0.5 bg-gradient-to-r from-primary to-secondary rounded text-xs font-bold">
                              🔥 SF
                            </span>
                          )}
                          {token.isCsprFun && (
                            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs font-bold">
                              ⚡ CF
                            </span>
                          )}
                        </div>
                        <span className="text-white/40 text-sm">{token.symbol || 'N/A'}</span>
                      </div>
                    </div>
                    
                    {/* Created Date */}
                    <div className="col-span-3 flex items-center justify-end">
                      <span className="text-white/60 text-sm">
                        {token.timestamp ? new Date(token.timestamp).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        }) : '-'}
                      </span>
                    </div>
                    
                    {/* Action */}
                    <div className="col-span-1 flex items-center justify-end">
                      <button className="px-3 py-1 bg-primary/20 text-primary rounded-lg text-sm font-semibold hover:bg-primary/30 transition-all">
                        VIEW
                      </button>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 glass rounded-xl hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <FaChevronLeft />
              </button>
              
              <span className="text-white font-semibold">
                Page {page} / {totalPages}
              </span>
              
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 glass rounded-xl hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
