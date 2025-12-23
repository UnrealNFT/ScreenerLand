import { useEffect, useRef, useState } from 'react'
import { FaChartLine } from 'react-icons/fa'

export default function BondingCurveChart({ tokenData }) {
  const canvasRef = useRef(null)
  const [chartData, setChartData] = useState(null)

  useEffect(() => {
    if (tokenData && canvasRef.current) {
      calculateChartData()
    }
  }, [tokenData])

  useEffect(() => {
    if (chartData && canvasRef.current) {
      drawChart()
    }
  }, [chartData])

  const calculateChartData = () => {
    // Valeurs par défaut si pas de données
    const virtualCspr = parseFloat(tokenData?.virtual_cspr_reserves || tokenData?.virtualCsprReserves || 30e9) // 30 CSPR en motes
    const virtualTokens = parseFloat(tokenData?.virtual_token_reserves || tokenData?.virtualTokenReserves || 1.073e18) // 1.073B tokens
    const realCspr = parseFloat(tokenData?.real_cspr_reserves || tokenData?.realCsprReserves || 0)
    const soldTokens = parseFloat(tokenData?.tokens_sold || tokenData?.tokensSold || 0)
    const totalSupply = parseFloat(tokenData?.total_supply || tokenData?.totalSupply || 1e18) // 1B tokens

    const k = virtualCspr * virtualTokens
    const graduationTarget = 100_000e9 // 100K CSPR en motes

    // Calculer les points de la courbe
    const points = []
    const steps = 100

    for (let i = 0; i <= steps; i++) {
      const csprProgress = (i / steps) * graduationTarget
      const tokensRemaining = k / (virtualCspr + csprProgress)
      const tokensSold = virtualTokens - tokensRemaining
      const pricePerToken = csprProgress / (tokensSold / 1e9) // Prix en CSPR par token

      points.push({
        cspr: csprProgress / 1e9, // Convertir en CSPR
        price: pricePerToken,
        tokensSold: tokensSold / 1e9
      })
    }

    // Position actuelle
    const currentCspr = realCspr / 1e9
    const currentTokensSold = soldTokens / 1e9
    const currentPrice = currentCspr > 0 ? currentCspr / currentTokensSold : 0

    setChartData({
      points,
      currentCspr,
      currentTokensSold,
      currentPrice,
      graduationTarget: graduationTarget / 1e9,
      progress: (currentCspr / (graduationTarget / 1e9)) * 100
    })
  }

  const drawChart = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#111827' // gray-900
    ctx.fillRect(0, 0, width, height)

    // Marges
    const margin = { top: 40, right: 40, bottom: 60, left: 80 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Trouver les échelles
    const maxCspr = chartData.graduationTarget
    const maxPrice = Math.max(...chartData.points.map(p => p.price))
    const minPrice = 0

    const xScale = (cspr) => margin.left + (cspr / maxCspr) * chartWidth
    const yScale = (price) => margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight

    // Grille
    ctx.strokeStyle = '#374151' // gray-700
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])

    // Lignes horizontales (prix)
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (maxPrice - minPrice) * (i / 5)
      const y = yScale(price)

      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
      ctx.stroke()

      // Label prix
      ctx.fillStyle = '#9CA3AF' // gray-400
      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(price.toFixed(6), margin.left - 10, y + 4)
    }

    // Lignes verticales (CSPR)
    for (let i = 0; i <= 5; i++) {
      const cspr = maxCspr * (i / 5)
      const x = xScale(cspr)

      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, height - margin.bottom)
      ctx.stroke()

      // Label CSPR
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${(cspr / 1000).toFixed(0)}K`, x, height - margin.bottom + 20)
    }

    ctx.setLineDash([])

    // Dessiner la courbe de bonding
    ctx.beginPath()
    ctx.strokeStyle = '#3B82F6' // blue-500
    ctx.lineWidth = 3

    chartData.points.forEach((point, i) => {
      const x = xScale(point.cspr)
      const y = yScale(point.price)

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()

    // Remplir sous la courbe avec gradient
    ctx.beginPath()
    ctx.moveTo(xScale(0), height - margin.bottom)

    chartData.points.forEach((point) => {
      const x = xScale(point.cspr)
      const y = yScale(point.price)
      ctx.lineTo(x, y)
    })

    ctx.lineTo(xScale(maxCspr), height - margin.bottom)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom)
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)') // blue-500 with opacity
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')

    ctx.fillStyle = gradient
    ctx.fill()

    // Position actuelle
    if (chartData.currentCspr > 0) {
      const x = xScale(chartData.currentCspr)
      const y = yScale(chartData.currentPrice)

      // Ligne verticale
      ctx.strokeStyle = '#10B981' // green-500
      ctx.lineWidth = 2
      ctx.setLineDash([10, 5])
      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, height - margin.bottom)
      ctx.stroke()
      ctx.setLineDash([])

      // Point actuel
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#10B981'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      ctx.stroke()

      // Label "Current"
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Current', x, margin.top - 10)

      // Valeur actuelle
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '12px monospace'
      ctx.fillText(
        `${chartData.currentCspr.toFixed(0)} CSPR`,
        x,
        height - margin.bottom + 40
      )
    }

    // Ligne de graduation
    const gradX = xScale(chartData.graduationTarget)
    ctx.strokeStyle = '#EF4444' // red-500
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])
    ctx.beginPath()
    ctx.moveTo(gradX, margin.top)
    ctx.lineTo(gradX, height - margin.bottom)
    ctx.stroke()
    ctx.setLineDash([])

    // Label "Graduation"
    ctx.fillStyle = '#EF4444'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Graduation', gradX, margin.top - 10)

    // Axes labels
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 14px sans-serif'

    // X-axis label
    ctx.textAlign = 'center'
    ctx.fillText('CSPR Raised', width / 2, height - 10)

    // Y-axis label
    ctx.save()
    ctx.translate(20, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('Price (CSPR per Token)', 0, 0)
    ctx.restore()

    // Titre
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Bonding Curve', width / 2, 25)
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <FaChartLine className="text-primary" />
          Bonding Curve
        </h3>
        {chartData && (
          <div className="text-right">
            <div className="text-sm text-gray-400">Progress to Graduation</div>
            <div className="text-lg font-bold text-white">
              {chartData.progress.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="p-6">
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full h-auto"
          style={{ maxHeight: '400px' }}
        />
      </div>

      {/* Stats */}
      {chartData && (
        <div className="px-6 pb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Current Price</div>
            <div className="text-sm font-bold text-white">
              {chartData.currentPrice > 0 
                ? `${chartData.currentPrice.toFixed(9)} CSPR`
                : '0 CSPR'}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">CSPR Raised</div>
            <div className="text-sm font-bold text-green-400">
              {chartData.currentCspr.toFixed(2)} / {chartData.graduationTarget.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Tokens Sold</div>
            <div className="text-sm font-bold text-blue-400">
              {chartData.currentTokensSold.toFixed(0)}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Final Price</div>
            <div className="text-sm font-bold text-red-400">
              {chartData.points[chartData.points.length - 1].price.toFixed(9)} CSPR
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="px-6 pb-6">
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 flex items-start gap-3">
          <span className="text-blue-400 text-xl">ℹ️</span>
          <div className="flex-1">
            <p className="text-sm text-blue-200 leading-relaxed">
              This chart shows the bonding curve formula <strong>x × y = k</strong>. 
              As more CSPR is invested, the price per token increases. 
              When 100K CSPR is reached, the token graduates to DEX.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
