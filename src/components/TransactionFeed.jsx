import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaArrowUp, FaArrowDown, FaExchangeAlt, FaExternalLinkAlt, FaClock, FaFire } from 'react-icons/fa'
import { useRealtimeTransactions } from '../hooks/useRealtimeTransactions'

export default function TransactionFeed({ contractHash, tokenSymbol, decimals = 9 }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState('all') // 'all', 'buy', 'sell'
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  
  // Real-time WebSocket connection
  const { transactions: realtimeTransactions, isConnected } = useRealtimeTransactions(contractHash)

  useEffect(() => {
    if (!contractHash) {
      console.log('⚠️ TransactionFeed: No contractHash provided')
      setError('No contract hash provided')
      setLoading(false)
      return
    }
    
    console.log('📊 TransactionFeed: Loading transactions for', contractHash.substring(0, 20) + '...')
    
    // Reset and load first page
    setTransactions([])
    setPage(1)
    setHasMore(true)
    setError(null)
    loadTransactions(1, false)
    
    // No need for interval anymore - we have WebSocket!
    // Auto-refresh only if not connected to WebSocket
    let interval
    if (autoRefresh && !isConnected) {
      interval = setInterval(() => {
        loadTransactions(1, true) // Silent refresh of first page
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [contractHash, autoRefresh, isConnected])
  
  // Merge real-time transactions with loaded transactions
  useEffect(() => {
    if (realtimeTransactions.length > 0) {
      setTransactions(prev => {
        // Merge without duplicates (check by hash)
        const existingHashes = new Set(prev.map(tx => tx.hash))
        const newTxs = realtimeTransactions.filter(tx => !existingHashes.has(tx.hash))
        return [...newTxs, ...prev]
      })
    }
  }, [realtimeTransactions])

  const loadTransactions = async (pageNum = 1, silent = false) => {
    try {
      if (!silent && pageNum === 1) setLoading(true)
      if (pageNum > 1) setLoadingMore(true)
      
      // Clean hash - remove any prefixes
      const cleanHash = contractHash.replace('contract-package-', '').replace('hash-', '')
      
      console.log(`📡 Fetching transactions page ${pageNum} for:`, cleanHash.substring(0, 20) + '...')
      
      const url = `http://localhost:3001/api/token/${cleanHash}/transactions?limit=20&page=${pageNum}`
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Transaction API error:', response.status, errorText)
        setError(`API Error: ${response.status}`)
        return
      }
      
      const result = await response.json()
      console.log(`✅ Received ${result.data?.length || 0} transactions, total: ${result.pagination?.total || 0}`)
      
      if (result.success) {
        const newTransactions = result.data || []
        
        if (pageNum === 1) {
          // Replace transactions for page 1
          setTransactions(newTransactions)
        } else {
          // Append for pagination
          setTransactions(prev => [...prev, ...newTransactions])
        }
        
        setTotalCount(result.pagination?.total || 0)
        setHasMore(newTransactions.length === 20) // Has more if we got a full page
        setError(null)
      }
    } catch (error) {
      console.error('❌ Failed to load transactions:', error)
      setError(error.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreTransactions = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1
      setPage(nextPage)
      loadTransactions(nextPage, false)
    }
  }

  const formatAddress = (address) => {
    if (!address || address === 'null' || address === 'undefined') {
      return 'Contract'
    }
    // Remove account-hash- prefix if present
    const cleanAddress = address.replace('account-hash-', '').replace('hash-', '')
    return `${cleanAddress.substring(0, 6)}...${cleanAddress.substring(cleanAddress.length - 4)}`
  }

  const formatAmount = (amount) => {
    const value = parseFloat(amount) / Math.pow(10, decimals)
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
    return value.toFixed(2)
  }

  const getTypeLabel = (type) => {
    switch (type?.toLowerCase()) {
      case 'mint':
        return 'Buy'
      case 'burn':
        return 'Sell'
      case 'transfer':
        return 'Transfer'
      default:
        return type?.toUpperCase() || 'TRANSFER'
    }
  }

  const getTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'mint':
        return <FaArrowUp className="text-green-400" />
      case 'burn':
        return <FaArrowDown className="text-red-400" />
      default:
        return <FaExchangeAlt className="text-blue-400" />
    }
  }

  const getTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'mint':
        return 'bg-green-500/10 border-green-500/30'
      case 'burn':
        return 'bg-red-500/10 border-red-500/30'
      default:
        return 'bg-blue-500/10 border-blue-500/30'
    }
  }

  const getTimeAgo = (timestamp) => {
    const now = Date.now()
    const time = new Date(timestamp).getTime()
    const seconds = Math.floor((now - time) / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  // Filter transactions by type
  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true
    if (filter === 'buy') return tx.type?.toLowerCase() === 'mint'
    if (filter === 'sell') return tx.type?.toLowerCase() === 'burn'
    return true
  })

  if (loading && transactions.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-center py-12">
          {error ? (
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-white/60">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  loadTransactions(1, false)
                }}
                className="mt-4 px-4 py-2 bg-primary rounded-xl font-semibold text-white hover:bg-primary/80 transition-all"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="animate-spin text-4xl mb-3">🔄</div>
              <p className="text-white/60">Loading transactions...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
            <FaFire className="text-white text-xl" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Live Transactions</h3>
            <p className="text-white/60 text-sm">
              {totalCount > 0 ? `${totalCount.toLocaleString()} total` : `${filteredTransactions.length} recent`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              isConnected 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : autoRefresh
                ? 'bg-primary/20 text-primary border border-primary/30' 
                : 'bg-white/5 text-white/60 border border-white/10'
            }`}
            title={isConnected ? 'Real-time WebSocket connected' : 'Polling API'}
          >
            {isConnected ? '🟢 Live (WebSocket)' : autoRefresh ? '🟢 Live' : '⚪ Paused'}
          </button>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
            filter === 'all'
              ? 'bg-primary text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          All ({transactions.length})
        </button>
        <button
          onClick={() => setFilter('buy')}
          className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
            filter === 'buy'
              ? 'bg-green-500 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          🟢 Buys ({transactions.filter(tx => tx.type?.toLowerCase() === 'mint').length})
        </button>
        <button
          onClick={() => setFilter('sell')}
          className={`flex-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
            filter === 'sell'
              ? 'bg-red-500 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          🔴 Sells ({transactions.filter(tx => tx.type?.toLowerCase() === 'burn').length})
        </button>
      </div>

      {/* Transactions List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {filteredTransactions.length === 0 && !loading ? (
            <div className="text-center py-12 text-white/40">
              <FaClock className="text-4xl mx-auto mb-3 opacity-50" />
              <p>No {filter !== 'all' ? filter : ''} transactions yet</p>
              <p className="text-sm mt-1">Be the first to trade!</p>
            </div>
          ) : (
            <>
              {filteredTransactions.map((tx, index) => (
                <motion.div
                  key={tx.hash}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`glass-inner rounded-xl p-4 border-2 transition-all hover:border-primary/50 cursor-pointer ${getTypeColor(tx.type)}`}
                  onClick={() => window.open(`https://cspr.live/deploy/${tx.hash}`, '_blank')}
                >
                  <div className="flex items-center justify-between">
                    
                    {/* Left: Type + Amount */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 glass rounded-xl flex items-center justify-center">
                        {getTypeIcon(tx.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            tx.type?.toLowerCase() === 'mint' ? 'bg-green-500 text-white' :
                            tx.type?.toLowerCase() === 'burn' ? 'bg-red-500 text-white' :
                            'bg-blue-500 text-white'
                          }`}>
                            {getTypeLabel(tx.type)}
                          </span>
                          <span className="font-bold text-white text-lg">
                            {formatAmount(tx.amount)} {tokenSymbol}
                          </span>
                        </div>
                        <div className="text-white/60 text-sm">
                          {tx.trader ? formatAddress(tx.trader) : `${formatAddress(tx.from)} → ${formatAddress(tx.to)}`}
                        </div>
                      </div>
                    </div>

                    {/* Right: Time + Link */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-white/60 text-sm flex items-center gap-1">
                          <FaClock className="text-xs" />
                          {getTimeAgo(tx.timestamp)}
                        </div>
                        {tx.valueUSD && (
                          <div className="text-primary font-semibold text-sm">
                            ${tx.valueUSD.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <FaExternalLinkAlt className="text-white/40 hover:text-primary transition-colors" />
                    </div>

                  </div>
                </motion.div>
              ))}
              
              {/* Load More Button */}
              {hasMore && !loading && (
                <motion.button
                  onClick={loadMoreTransactions}
                  disabled={loadingMore}
                  className="w-full py-3 glass rounded-xl font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {loadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin">🔄</div>
                      Loading more...
                    </span>
                  ) : (
                    <span>Load More Transactions ↓</span>
                  )}
                </motion.button>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-white/60 text-xs mb-1">Total Loaded</p>
          <p className="text-white font-bold text-lg">{transactions.length}</p>
        </div>
        <div>
          <p className="text-white/60 text-xs mb-1">Buys</p>
          <p className="text-green-400 font-bold text-lg">
            {transactions.filter(tx => tx.type?.toLowerCase() === 'mint').length}
          </p>
        </div>
        <div>
          <p className="text-white/60 text-xs mb-1">Sells</p>
          <p className="text-red-400 font-bold text-lg">
            {transactions.filter(tx => tx.type?.toLowerCase() === 'burn').length}
          </p>
        </div>
      </div>

    </div>
  )
}
