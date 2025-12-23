import { useEffect, useState } from 'react'
import { FaChartLine, FaCoins, FaFire } from 'react-icons/fa'
import csprCloudService from '../../services/cspr.cloud.service'

export default function TokenStats({ tokenData }) {
  const [csprPrice, setCsprPrice] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCsprPrice()
  }, [])

  const loadCsprPrice = async () => {
    try {
      // TODO: Get real CSPR price from CoinGecko or cspr.cloud
      // For now, use a fixed price
      setCsprPrice(0.0065) // $0.0065 per CSPR
    } catch (error) {
      console.error('Failed to load CSPR price:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!tokenData) return null

  // Parse values
  const realCspr = parseFloat(tokenData.real_cspr_reserves || tokenData.realCsprReserves || 0)
  const virtualCspr = parseFloat(tokenData.virtual_cspr_reserves || tokenData.virtualCsprReserves || 0)
  const virtualTokens = parseFloat(tokenData.virtual_token_reserves || tokenData.virtualTokenReserves || 0)
  const totalSupply = parseFloat(tokenData.total_supply || tokenData.totalSupply || 0)

  // Prix actuel = virtualCspr / virtualTokens
  const price = virtualTokens > 0 ? virtualCspr / virtualTokens : 0

  // Market cap = prix × total supply (comme pump.fun)
  const marketCapCSPR = (price * totalSupply) / 1e9 // Converti en CSPR
  const marketCapUSD = marketCapCSPR * csprPrice

  // Liquidity = real CSPR reserves
  const liquidityCSPR = realCspr / 1e9
  const liquidityUSD = liquidityCSPR * csprPrice

  // Total supply formatté
  const totalSupplyFormatted = totalSupply / 1e9

  // Circulating supply
  const circulatingSupply = Math.max(0, totalSupply - virtualTokens) / 1e9

  // Progress vers graduation (100K CSPR)
  const graduationTarget = 100000
  const progress = (liquidityCSPR / graduationTarget) * 100
  const isGraduated = tokenData.graduated || progress >= 100

  // Format USD avec K/M
  const formatUSD = (value) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  // Format nombre avec K/M
  const formatNumber = (value) => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
    return value.toFixed(2)
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <FaChartLine className="text-primary" />
          Token Stats
        </h3>
      </div>

      {/* Stats Grid */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {/* Market Cap */}
          <div className="glass p-4 rounded-xl text-center">
            <div className="text-sm text-gray-400 mb-2">Market Cap</div>
            <div className="text-2xl font-bold text-white mb-1">
              {loading ? '...' : formatUSD(marketCapUSD)}
            </div>
            <div className="text-xs text-gray-500">
              {marketCapCSPR.toFixed(2)} CSPR
            </div>
          </div>

          {/* Virtual Liquidity */}
          <div className="glass p-4 rounded-xl text-center">
            <div className="text-sm text-gray-400 mb-2">Virtual Liquidity</div>
            <div className="text-2xl font-bold text-white mb-1">
              {loading ? '...' : formatUSD(liquidityUSD)}
            </div>
            <div className="text-xs text-gray-500">
              {liquidityCSPR.toFixed(2)} CSPR
            </div>
          </div>

          {/* Total Supply */}
          <div className="glass p-4 rounded-xl text-center">
            <div className="text-sm text-gray-400 mb-2">Total Supply</div>
            <div className="text-2xl font-bold text-white mb-1">
              {formatNumber(totalSupplyFormatted)}
            </div>
            <div className="text-xs text-gray-500">
              {formatNumber(circulatingSupply)} circulating
            </div>
          </div>
        </div>

        {/* Progress vers Graduation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <FaFire className="text-orange-400" />
              Bonding curve progress
            </span>
            <strong className="text-lg font-bold text-white">
              {progress.toFixed(1)}%
            </strong>
          </div>

          {/* Progress Bar */}
          <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-300 rounded-full ${
                isGraduated
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500'
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          {/* Progress Text */}
          <p className="text-sm text-gray-400 leading-relaxed">
            {isGraduated ? (
              <span className="text-green-400 font-semibold">
                🎉 Ready for DEX migration! All liquidity will be deposited into CasperSwap.
              </span>
            ) : (
              <>
                When the bonding curve reaches{' '}
                <span className="text-white font-semibold">100,000 CSPR</span>,
                all liquidity will be deposited into{' '}
                <span className="text-primary font-semibold">CasperSwap</span> and burned.
                Progress increases as the price goes up.
              </>
            )}
          </p>
        </div>

        {/* Additional Info */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Real Reserves:</span>
            <span className="text-sm text-white font-semibold">
              {liquidityCSPR.toFixed(2)} CSPR
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current Price:</span>
            <span className="text-sm text-white font-semibold">
              {(price * 1e9).toFixed(9)} CSPR
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Creator Fees:</span>
            <span className="text-sm text-green-400 font-semibold">
              {((parseFloat(tokenData.creator_fees_unclaimed || tokenData.creatorFeesUnclaimed || 0) / 1e9).toFixed(4))} CSPR
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Stories Pool:</span>
            <span className="text-sm text-purple-400 font-semibold">
              {((parseFloat(tokenData.stories_fees_unclaimed || tokenData.storiesFeesUnclaimed || 0) / 1e9).toFixed(4))} CSPR
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
