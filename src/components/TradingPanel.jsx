import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FaArrowDown, FaArrowUp, FaCog, FaWallet, FaExchangeAlt } from 'react-icons/fa'
import toast from 'react-hot-toast'
import walletService from '../services/wallet.service'
import casperDeployService from '../services/casper.deploy.service'
import { getTokenColor } from '../utils/tokenColors'

export default function TradingPanel({ tokenData, onTradeComplete }) {
  const [activeTab, setActiveTab] = useState('buy') // 'buy' or 'sell'
  const [amount, setAmount] = useState('1') // Default: 1 CSPR
  const [slippage, setSlippage] = useState(1) // 1%
  const [showSettings, setShowSettings] = useState(false)
  const [estimatedOut, setEstimatedOut] = useState(null)
  const [priceImpact, setPriceImpact] = useState(0)
  const [isCalculating, setIsCalculating] = useState(false)

  // Calculate output amount when input changes (SIMULATION ONLY)
  useEffect(() => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setEstimatedOut(null)
      setPriceImpact(0)
      return
    }

    calculateOutput()
  }, [amount, activeTab, tokenData])

  const calculateOutput = () => {
    setIsCalculating(true)
    try {
      const amountIn = parseFloat(amount)
      
      // Si pas de montant valide, on met 0
      if (!amountIn || isNaN(amountIn) || amountIn <= 0) {
        setEstimatedOut(0)
        setPriceImpact(0)
        setIsCalculating(false)
        return
      }
      
      // Get price from various possible locations
      let currentPrice = 0
      
      // Try csprFunData first (for cspr.fun tokens)
      if (tokenData.csprFunData?.price) {
        currentPrice = parseFloat(tokenData.csprFunData.price)
      }
      // Try price.cspr (for Friendly Market tokens)
      else if (tokenData.price?.cspr) {
        currentPrice = parseFloat(tokenData.price.cspr)
      }
      // Try direct price field
      else if (tokenData.price) {
        currentPrice = parseFloat(tokenData.price)
      }
      
      console.log('🔍 Price sources:', {
        csprFunPrice: tokenData.csprFunData?.price,
        priceCSPR: tokenData.price?.cspr,
        directPrice: tokenData.price,
        finalPrice: currentPrice
      })
      
      if (!currentPrice || currentPrice === 0) {
        console.warn('⚠️ No price data available for calculation')
        setEstimatedOut(0)
        setPriceImpact(0)
        setIsCalculating(false)
        return
      }
      
      if (activeTab === 'buy') {
        // Buy: CSPR in → Tokens out
        // Use simple price calculation (reserves data unreliable)
        
        const tokensOut = amountIn / currentPrice
        
        // Estimate impact based on trade size vs liquidity
        const liquidityCSPR = tokenData.csprFunData?.liquidityCSPR || tokenData.liquidity?.cspr || 10000
        const impact = (amountIn / liquidityCSPR) * 100
        
        console.log(`💰 Buy simulation: ${amountIn} CSPR → ${tokensOut.toFixed(2)} ${tokenData.symbol}`)
        console.log(`📊 Price: ${currentPrice} CSPR, Liquidity: ${liquidityCSPR.toFixed(2)} CSPR`)
        console.log(`📈 Estimated impact: ${impact.toFixed(4)}%`)
        
        setEstimatedOut(tokensOut)
        setPriceImpact(Math.max(0, impact))
        
      } else {
        // Sell: Tokens in → CSPR out
        // Use simple price calculation (reserves data unreliable)
        
        const csprOut = amountIn * currentPrice
        
        // Estimate impact based on trade size vs liquidity
        const liquidityCSPR = tokenData.csprFunData?.liquidityCSPR || tokenData.liquidity?.cspr || 10000
        const tradeValueCSPR = amountIn * currentPrice
        const impact = (tradeValueCSPR / liquidityCSPR) * 100
        
        console.log(`💸 Sell simulation: ${amountIn} ${tokenData.symbol} → ${csprOut.toFixed(4)} CSPR`)
        console.log(`📊 Price: ${currentPrice} CSPR, Liquidity: ${liquidityCSPR.toFixed(2)} CSPR`)
        console.log(`📉 Estimated impact: ${impact.toFixed(4)}%`)
        
        setEstimatedOut(csprOut)
        setPriceImpact(Math.max(0, impact))
      }
    } catch (error) {
      console.error('❌ Calculate error:', error)
      setEstimatedOut(0)
      setPriceImpact(0)
    } finally {
      setIsCalculating(false)
    }
  }

  const handleTradeRedirect = () => {
    // Redirect to Friendly Market for actual trading
    const cleanHash = tokenData.contractHash?.replace('contract-package-', '').replace('hash-', '') || ''
    const url = `https://www.friendly.market/swap/CSPR/${cleanHash}`
    window.open(url, '_blank')
    toast.success('Opening Friendly Market... 🚀')
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      
      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 glass-inner rounded-xl p-1">
          <button
            onClick={() => setActiveTab('buy')}
            className={`px-6 py-2 rounded-lg font-bold transition-all ${
              activeTab === 'buy'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <FaArrowUp className="inline mr-2" />
            Buy
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`px-6 py-2 rounded-lg font-bold transition-all ${
              activeTab === 'sell'
                ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <FaArrowDown className="inline mr-2" />
            Sell
          </button>
        </div>
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-10 h-10 glass-inner rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:bg-white/5"
        >
          <FaCog className={showSettings ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          className="glass-inner rounded-xl p-4 space-y-3"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <label className="block text-white font-semibold mb-2">
            Slippage Tolerance: {slippage}%
          </label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(parseFloat(e.target.value))}
            className="w-full h-2 bg-dark-hover rounded-full appearance-none cursor-pointer"
          />
          <div className="flex gap-2">
            {[0.5, 1, 2, 5].map(s => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`flex-1 px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                  slippage === s
                    ? 'bg-primary text-white'
                    : 'bg-dark-hover text-white/60 hover:text-white'
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Input Section */}
      <div className="space-y-4">
        
        {/* From */}
        <div className="glass-inner rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/60 text-sm">
              {activeTab === 'buy' ? 'You pay' : 'You sell'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-2xl font-bold text-white outline-none"
              step="0.01"
            />
            <div className="flex items-center gap-2 glass rounded-xl px-4 py-2 flex-shrink-0">
              {activeTab === 'buy' ? (
                <>
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex-shrink-0" />
                  <span className="font-bold text-white whitespace-nowrap">CSPR</span>
                </>
              ) : (
                <>
                  {tokenData.logo ? (
                    <img src={tokenData.logo} alt={tokenData.symbol} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                  ) : (
                    <div 
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${getTokenColor(tokenData.contractHash).from}, ${getTokenColor(tokenData.contractHash).to})`
                      }}
                    />
                  )}
                  <span className="font-bold text-white whitespace-nowrap">{tokenData.symbol}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Swap Arrow */}
        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-10 h-10 glass rounded-full flex items-center justify-center text-white/60">
            <FaArrowDown />
          </div>
        </div>

        {/* To */}
        <div className="glass-inner rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white/60 text-sm">
              {activeTab === 'buy' ? 'You receive' : 'You receive'}
            </span>
            {priceImpact > 0 && (
              <span className={`text-sm font-semibold ${
                priceImpact < 1 ? 'text-green-400' 
                : priceImpact < 5 ? 'text-yellow-400' 
                : 'text-red-400'
              }`}>
                Impact: {priceImpact.toFixed(2)}%
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 text-2xl font-bold text-white">
              {isCalculating ? (
                <span className="text-white/40">Calculating...</span>
              ) : estimatedOut ? (
                // Show decimals for CSPR (SELL), whole numbers for tokens (BUY)
                activeTab === 'sell' 
                  ? estimatedOut.toFixed(6).replace(/\.?0+$/, '')
                  : Math.floor(estimatedOut).toLocaleString('en-US')
              ) : (
                <span className="text-white/40">0.0</span>
              )}
            </div>
            <div className="flex items-center gap-2 glass rounded-xl px-4 py-2 flex-shrink-0">
              {activeTab === 'sell' ? (
                <>
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex-shrink-0" />
                  <span className="font-bold text-white whitespace-nowrap">CSPR</span>
                </>
              ) : (
                <>
                  {tokenData.logo ? (
                    <img src={tokenData.logo} alt={tokenData.symbol} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                  ) : (
                    <div 
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${getTokenColor(tokenData.contractHash).from}, ${getTokenColor(tokenData.contractHash).to})`
                      }}
                    >
                      {tokenData.symbol?.substring(0, 2).toUpperCase() || '??'}
                    </div>
                  )}
                  <span className="font-bold text-white whitespace-nowrap">{tokenData.symbol}</span>
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Trade Info */}
      {estimatedOut && (
        <div className="glass-inner rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between text-white/60">
            <span>Current price</span>
            <span className="text-white/80 font-medium">
              {(() => {
                const currentPrice = tokenData.csprFunData?.price || tokenData.price?.cspr || tokenData.price || 0
                return `${parseFloat(currentPrice).toFixed(8)} CSPR`
              })()}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Average price (your trade)</span>
            <span className="text-white font-semibold">
              {activeTab === 'buy' 
                ? `${(parseFloat(amount) / estimatedOut).toFixed(8)} CSPR per ${tokenData.symbol}`
                : `${(estimatedOut / parseFloat(amount)).toFixed(8)} CSPR per ${tokenData.symbol}`
              }
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Minimum received</span>
            <span className="text-white font-semibold">
              {Math.floor(estimatedOut * (1 - slippage / 100)).toLocaleString('en-US')} {activeTab === 'buy' ? tokenData.symbol : 'CSPR'}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Trading fee (1%)</span>
            <span className="text-white font-semibold">
              {activeTab === 'buy' 
                ? `${(parseFloat(amount) * 0.01).toFixed(4)} CSPR`
                : `${(parseFloat(amount) * 0.01).toFixed(0)} ${tokenData.symbol}`
              }
            </span>
          </div>
        </div>
      )}

      {/* Trade Button - Redirect to Friendly Market */}
      <button
        onClick={handleTradeRedirect}
        disabled={!amount || !estimatedOut || isCalculating}
        className="w-full px-6 py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-green-500 to-emerald-500 hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
      >
        <FaExchangeAlt className="inline mr-2" />
        Trade on Friendly Market 👻
      </button>
      
      {/* Info text */}
      <p className="text-center text-white/40 text-sm">
        💡 Simulation only - Actual trading on Friendly Market
      </p>

      {/* Warnings based on impact */}
      {priceImpact > 50 && (
        <div className="glass-inner rounded-xl p-3 border-l-4 border-red-500">
          <p className="text-red-400 text-sm font-bold">
            🚨 EXTREME IMPACT! Your trade will move the price by {priceImpact.toFixed(1)}%
          </p>
          <p className="text-red-300/70 text-xs mt-1">
            Pool has low liquidity. You'll pay much more than the current price.
          </p>
        </div>
      )}
      {priceImpact > 15 && priceImpact <= 50 && (
        <div className="glass-inner rounded-xl p-3 border-l-4 border-orange-500">
          <p className="text-orange-400 text-sm font-semibold">
            ⚠️ High price impact ({priceImpact.toFixed(1)}%)
          </p>
          <p className="text-orange-300/70 text-xs mt-1">
            Consider splitting your trade into smaller parts.
          </p>
        </div>
      )}
      {priceImpact > 5 && priceImpact <= 15 && (
        <div className="glass-inner rounded-xl p-3 border-l-4 border-yellow-500">
          <p className="text-yellow-400 text-sm font-semibold">
            💡 Moderate impact ({priceImpact.toFixed(1)}%)
          </p>
        </div>
      )}
      {priceImpact > 0 && priceImpact <= 5 && (
        <div className="glass-inner rounded-xl p-3 border-l-4 border-green-500">
          <p className="text-green-400 text-sm font-semibold">
            ✅ Low impact ({priceImpact.toFixed(2)}%) - Good trade size
          </p>
        </div>
      )}

    </div>
  )
}
