import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaFire, FaWallet, FaCoins, FaExternalLinkAlt } from 'react-icons/fa'
import { startMonitoring, getCsprPrice, formatAddress } from '../services/blockchain.service'
import { Link } from 'react-router-dom'

export default function LiveFeed() {
  const [transactions, setTransactions] = useState([])
  const [csprPrice, setCsprPrice] = useState(0.034)
  const [isMonitoring, setIsMonitoring] = useState(false)
  
  useEffect(() => {
    // Fetch CSPR price
    getCsprPrice().then(price => setCsprPrice(price))
    
    // Start monitoring blockchain
    startMonitoring((buyInfo) => {
      const usdValue = buyInfo.amount * csprPrice
      
      const newTx = {
        id: buyInfo.deployHash,
        contractHash: buyInfo.contractHash,
        buyer: buyInfo.buyer,
        amountCspr: buyInfo.amount,
        amountUsd: usdValue,
        tokenAmount: buyInfo.tokenAmount,
        timestamp: Date.now(),
        deployHash: buyInfo.deployHash
      }
      
      setTransactions(prev => [newTx, ...prev].slice(0, 50)) // Keep last 50
    })
    
    setIsMonitoring(true)
  }, [csprPrice])
  
  const getEmojiCount = (usdValue) => {
    if (usdValue < 1) return 1
    if (usdValue < 5) return 3
    if (usdValue < 10) return 5
    if (usdValue < 20) return 8
    if (usdValue < 50) return 12
    if (usdValue < 100) return 18
    if (usdValue < 200) return 25
    if (usdValue < 500) return 40
    return 60
  }
  
  return (
    <div className="min-h-screen pt-20 pb-24 px-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Live Feed</span>
          </h1>
          <p className="text-white/60 text-lg mb-4">
            Real-time token buys on Casper Network
          </p>
          
          <div className="flex items-center justify-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
            <span className="text-white/80">
              {isMonitoring ? 'Monitoring blockchain...' : 'Connecting...'}
            </span>
          </div>
        </motion.div>
        
        {/* Stats Bar */}
        <motion.div 
          className="glass rounded-xl p-4 mb-6 flex items-center justify-around"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-center">
            <p className="text-white/60 text-sm">Transactions</p>
            <p className="text-2xl font-bold text-white">{transactions.length}</p>
          </div>
          
          <div className="text-center">
            <p className="text-white/60 text-sm">CSPR Price</p>
            <p className="text-2xl font-bold text-green-400">${csprPrice.toFixed(4)}</p>
          </div>
          
          <div className="text-center">
            <p className="text-white/60 text-sm">Status</p>
            <p className="text-2xl font-bold text-primary">
              <FaFire className="inline animate-pulse" />
            </p>
          </div>
        </motion.div>
        
        {/* Transactions List */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {transactions.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass rounded-xl p-12 text-center"
              >
                <FaFire className="text-6xl text-primary mx-auto mb-4 animate-pulse" />
                <p className="text-white/60 text-lg">Waiting for transactions...</p>
                <p className="text-white/40 text-sm mt-2">Monitoring the blockchain in real-time</p>
              </motion.div>
            )}
            
            {transactions.map((tx, index) => {
              const emojiCount = getEmojiCount(tx.amountUsd)
              const emojis = '🚀'.repeat(Math.min(emojiCount, 20))
              
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -50, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="glass rounded-xl p-6 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FaFire className="text-orange-400" />
                        <Link 
                          to={`/token/${tx.contractHash}`}
                          className="text-lg font-bold text-white hover:text-primary transition-colors"
                        >
                          Token Buy Detected
                        </Link>
                      </div>
                      
                      <div className="text-2xl mb-3">
                        {emojis}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <FaCoins className="text-primary" />
                          <div>
                            <p className="text-white/60 text-xs">Amount</p>
                            <p className="text-white font-bold">
                              {tx.amountCspr.toFixed(2)} CSPR
                            </p>
                            <p className="text-green-400 text-sm">
                              ${tx.amountUsd.toFixed(2)} USD
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <FaWallet className="text-secondary" />
                          <div>
                            <p className="text-white/60 text-xs">Buyer</p>
                            <Link 
                              to={`/wallet/${tx.buyer}`}
                              className="text-white hover:text-secondary transition-colors text-sm font-mono"
                            >
                              {formatAddress(tx.buyer)}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <a
                      href={`https://cspr.live/deploy/${tx.deployHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 glass hover:bg-white/10 rounded-lg transition-all"
                    >
                      <FaExternalLinkAlt className="text-white" />
                    </a>
                  </div>
                  
                  <div className="text-white/40 text-xs">
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        
      </div>
    </div>
  )
}
