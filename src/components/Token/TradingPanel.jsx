import { useState, useEffect } from 'react'
import { FaExchangeAlt, FaWallet, FaCoins, FaCog } from 'react-icons/fa'
import { useWallet } from '../../contexts/WalletContext'
import toast from 'react-hot-toast'
import walletService from '../../services/wallet.service'
import casperDeployService from '../../services/casper.deploy.service'

export default function TradingPanel({ mintAddress, tokenData, onTradeSuccess }) {
  const { walletAddress, isConnected } = useWallet()
  const [mode, setMode] = useState('buy') // 'buy' or 'sell'
  const [csprAmount, setCsprAmount] = useState('')
  const [tokenAmount, setTokenAmount] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [loading, setLoading] = useState(false)
  const [csprBalance, setCsprBalance] = useState(0)
  const [tokenBalance, setTokenBalance] = useState(0)
  const [csprPriceUSD, setCsprPriceUSD] = useState(0.0065)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (isConnected) {
      loadBalances()
    }
  }, [isConnected, mintAddress])

  useEffect(() => {
    // Auto-calculate tokens when CSPR amount changes (buy mode)
    if (mode === 'buy' && csprAmount && !isNaN(parseFloat(csprAmount))) {
      const cspr = parseFloat(csprAmount)
      const tokens = calculateTokensOut(cspr)
      setTokenAmount(tokens.toFixed(4))
    }
  }, [csprAmount, mode, tokenData])

  useEffect(() => {
    // Auto-calculate CSPR when token amount changes (sell mode)
    if (mode === 'sell' && tokenAmount && !isNaN(parseFloat(tokenAmount))) {
      const tokens = parseFloat(tokenAmount)
      const cspr = calculateCsprOut(tokens)
      setCsprAmount(cspr.toFixed(4))
    }
  }, [tokenAmount, mode, tokenData])

  const loadBalances = async () => {
    if (!isConnected) return

    try {
      // CSPR balance
      const balance = await walletService.getBalance()
      setCsprBalance(parseFloat(balance))

      // Token balance - TODO: fetch from contract
      // For now, mock it
      setTokenBalance(0)
    } catch (error) {
      console.error('Error loading balances:', error)
    }
  }

  const calculateTokensOut = (csprIn) => {
    if (!tokenData) return 0

    const fee = csprIn * 0.01
    const netCspr = csprIn - fee
    const virtualCspr = parseFloat(tokenData.virtual_cspr_reserves || tokenData.virtualCsprReserves || 0)
    const virtualTokens = parseFloat(tokenData.virtual_token_reserves || tokenData.virtualTokenReserves || 0)
    
    if (virtualCspr === 0 || virtualTokens === 0) return 0

    const k = virtualCspr * virtualTokens
    const newCspr = virtualCspr + netCspr * 1e9
    const newTokens = k / newCspr
    const tokensOut = (virtualTokens - newTokens) / 1e9

    return tokensOut > 0 ? tokensOut : 0
  }

  const calculateCsprOut = (tokensIn) => {
    if (!tokenData) return 0

    const virtualCspr = parseFloat(tokenData.virtual_cspr_reserves || tokenData.virtualCsprReserves || 0)
    const virtualTokens = parseFloat(tokenData.virtual_token_reserves || tokenData.virtualTokenReserves || 0)
    
    if (virtualCspr === 0 || virtualTokens === 0) return 0

    const k = virtualCspr * virtualTokens
    const newTokens = virtualTokens + tokensIn * 1e9
    const newCspr = k / newTokens
    const grossCspr = (virtualCspr - newCspr) / 1e9
    const fee = grossCspr * 0.01

    return grossCspr - fee > 0 ? grossCspr - fee : 0
  }

  const handleBuy = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet')
      return
    }

    if (!csprAmount || parseFloat(csprAmount) <= 0) {
      toast.error('Please enter a valid CSPR amount')
      return
    }

    try {
      setLoading(true)
      
      // TODO: Replace with real smart contract call
      toast.error('🚧 Smart contract integration pending. Deploy contract first!')
      
      // const result = await casperDeployService.buyTokens(
      //   mintAddress,
      //   parseFloat(csprAmount),
      //   parseFloat(slippage)
      // )
      
      // toast.success(`✅ Bought ${result.tokensOut.toFixed(2)} tokens!`)
      // setCsprAmount('')
      // setTokenAmount('')
      // loadBalances()
      // if (onTradeSuccess) onTradeSuccess()
      
    } catch (error) {
      console.error('Buy error:', error)
      toast.error(error.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSell = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet')
      return
    }

    if (!tokenAmount || parseFloat(tokenAmount) <= 0) {
      toast.error('Please enter a valid token amount')
      return
    }

    try {
      setLoading(true)
      
      // TODO: Replace with real smart contract call
      toast.error('🚧 Smart contract integration pending. Deploy contract first!')
      
      // const result = await casperDeployService.sellTokens(
      //   mintAddress,
      //   parseFloat(tokenAmount),
      //   parseFloat(slippage)
      // )
      
      // toast.success(`✅ Sold for ${result.csprOut.toFixed(4)} CSPR!`)
      // setCsprAmount('')
      // setTokenAmount('')
      // loadBalances()
      // if (onTradeSuccess) onTradeSuccess()
      
    } catch (error) {
      console.error('Sell error:', error)
      toast.error(error.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  const setMaxCspr = () => {
    if (csprBalance > 0.5) {
      setCsprAmount((csprBalance - 0.5).toFixed(2)) // Keep 0.5 CSPR for gas
    }
  }

  const setMaxTokens = () => {
    if (tokenBalance > 0) {
      setTokenAmount(tokenBalance.toFixed(4))
    }
  }

  const tokensOut = mode === 'buy' && csprAmount ? calculateTokensOut(parseFloat(csprAmount)) : 0
  const csprOut = mode === 'sell' && tokenAmount ? calculateCsprOut(parseFloat(tokenAmount)) : 0
  const priceImpact = tokenData && mode === 'buy' && csprAmount
    ? ((tokensOut * (parseFloat(tokenData.virtual_cspr_reserves || 0) / parseFloat(tokenData.virtual_token_reserves || 1))) / parseFloat(csprAmount) - 1) * 100
    : 0

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden sticky top-4">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <FaExchangeAlt className="text-primary" />
          Trade
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <FaCog />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700">
          <label className="block text-sm text-gray-400 mb-2">
            Slippage Tolerance
          </label>
          <div className="flex gap-2">
            {['0.5', '1', '2', '5'].map(value => (
              <button
                key={value}
                onClick={() => setSlippage(value)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  slippage === value
                    ? 'bg-primary text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {value}%
              </button>
            ))}
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-white text-sm"
              placeholder="Custom"
            />
          </div>
        </div>
      )}

      {/* Mode Tabs */}
      <div className="px-6 py-4 flex gap-2">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 py-3 rounded-lg font-bold transition-colors ${
            mode === 'buy'
              ? 'bg-green-500 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 py-3 rounded-lg font-bold transition-colors ${
            mode === 'sell'
              ? 'bg-red-500 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Trading Form */}
      <div className="p-6 space-y-4">
        {/* Input CSPR (for buy) or Token (for sell) */}
        <div className="glass p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">
              {mode === 'buy' ? 'You pay' : 'You sell'}
            </label>
            <div className="text-xs text-gray-500">
              Balance:{' '}
              {mode === 'buy'
                ? `${csprBalance.toFixed(2)} CSPR`
                : `${tokenBalance.toFixed(4)} ${tokenData?.symbol || 'TOKENS'}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={mode === 'buy' ? csprAmount : tokenAmount}
              onChange={(e) =>
                mode === 'buy' ? setCsprAmount(e.target.value) : setTokenAmount(e.target.value)
              }
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-bold text-white outline-none"
            />
            <button
              onClick={mode === 'buy' ? setMaxCspr : setMaxTokens}
              className="px-3 py-1 bg-primary-dark hover:bg-primary rounded-lg text-xs font-semibold text-white transition-colors"
            >
              MAX
            </button>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
              <span className="text-sm font-semibold text-white">
                {mode === 'buy' ? 'CSPR' : tokenData?.symbol || 'TOKEN'}
              </span>
            </div>
          </div>
          {mode === 'buy' && csprAmount && (
            <div className="text-xs text-gray-500 mt-2">
              ≈ ${(parseFloat(csprAmount) * csprPriceUSD).toFixed(2)} USD
            </div>
          )}
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
            <FaExchangeAlt className="text-gray-400" />
          </div>
        </div>

        {/* Output Token (for buy) or CSPR (for sell) */}
        <div className="glass p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">
              {mode === 'buy' ? 'You receive' : 'You receive'}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={mode === 'buy' ? tokenAmount : csprAmount}
              readOnly
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-bold text-white outline-none"
            />
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
              <span className="text-sm font-semibold text-white">
                {mode === 'buy' ? tokenData?.symbol || 'TOKEN' : 'CSPR'}
              </span>
            </div>
          </div>
        </div>

        {/* Trade Info */}
        {(csprAmount || tokenAmount) && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Price Impact</span>
              <span className={priceImpact > 5 ? 'text-red-400' : 'text-green-400'}>
                {priceImpact.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Slippage Tolerance</span>
              <span>{slippage}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Trading Fee (1%)</span>
              <span>
                {mode === 'buy'
                  ? `${(parseFloat(csprAmount || 0) * 0.01).toFixed(4)} CSPR`
                  : `${(parseFloat(tokenAmount || 0) * 0.01).toFixed(4)} ${tokenData?.symbol || 'TOKENS'}`}
              </span>
            </div>
          </div>
        )}

        {/* Trade Button */}
        {isConnected ? (
          <button
            onClick={mode === 'buy' ? handleBuy : handleSell}
            disabled={loading || (!csprAmount && !tokenAmount)}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all ${
              loading || (!csprAmount && !tokenAmount)
                ? 'bg-gray-700 cursor-not-allowed'
                : mode === 'buy'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              `${mode === 'buy' ? 'Buy' : 'Sell'} ${tokenData?.symbol || 'Token'}`
            )}
          </button>
        ) : (
          <button
            onClick={() => toast.error('Please connect your wallet')}
            className="w-full py-4 rounded-xl font-bold bg-primary hover:bg-primary-light text-white transition-all"
          >
            Connect Wallet
          </button>
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
          <span className="text-yellow-400 text-xl">⚠️</span>
          <p className="text-xs text-yellow-200">
            Trading is currently disabled until the smart contract is deployed. All transactions will fail.
          </p>
        </div>
      </div>
    </div>
  )
}
