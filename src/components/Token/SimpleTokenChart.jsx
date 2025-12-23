import { useState, useEffect, useRef } from 'react'
import { FaChartLine, FaArrowUp, FaArrowDown } from 'react-icons/fa'

export default function SimpleTokenChart({ tokenData }) {
  const canvasRef = useRef(null)
  const [priceChange, setPriceChange] = useState(0)

  useEffect(() => {
    if (canvasRef.current && tokenData) {
      drawChart()
    }
  }, [tokenData])

  const drawChart = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Generate mock price data (30 days)
    const days = 30
    const data = []
    let basePrice = 0.00001 // Prix de base en CSPR
    
    for (let i = 0; i < days; i++) {
      // Random walk avec tendance
      const change = (Math.random() - 0.48) * 0.0000002 // Légère tendance haussière
      basePrice += change
      basePrice = Math.max(0.000005, basePrice) // Prix min
      data.push(basePrice)
    }

    const minPrice = Math.min(...data)
    const maxPrice = Math.max(...data)
    const priceRange = maxPrice - minPrice

    // Calculate price change
    const change = ((data[data.length - 1] - data[0]) / data[0]) * 100
    setPriceChange(change)

    // Margins
    const margin = { top: 30, right: 20, bottom: 40, left: 60 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Scales
    const xScale = (i) => margin.left + (i / (data.length - 1)) * chartWidth
    const yScale = (price) => margin.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight

    // Background
    ctx.fillStyle = '#1F2937' // gray-800
    ctx.fillRect(0, 0, width, height)

    // Grid
    ctx.strokeStyle = '#374151' // gray-700
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + (priceRange * i / 4)
      const y = yScale(price)
      
      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
      ctx.stroke()

      // Price labels
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '11px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(price.toFixed(8), margin.left - 5, y + 4)
    }

    // Vertical grid lines (every 7 days)
    for (let i = 0; i <= 4; i++) {
      const day = Math.floor((days - 1) * i / 4)
      const x = xScale(day)
      
      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, height - margin.bottom)
      ctx.stroke()

      // Day labels
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${days - day}d ago`, x, height - margin.bottom + 20)
    }

    ctx.setLineDash([])

    // Area gradient
    const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom)
    gradient.addColorStop(0, change >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)')
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')

    ctx.beginPath()
    ctx.moveTo(xScale(0), height - margin.bottom)
    
    data.forEach((price, i) => {
      ctx.lineTo(xScale(i), yScale(price))
    })
    
    ctx.lineTo(xScale(data.length - 1), height - margin.bottom)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    // Line
    ctx.beginPath()
    ctx.strokeStyle = change >= 0 ? '#10B981' : '#EF4444'
    ctx.lineWidth = 2

    data.forEach((price, i) => {
      if (i === 0) {
        ctx.moveTo(xScale(i), yScale(price))
      } else {
        ctx.lineTo(xScale(i), yScale(price))
      }
    })

    ctx.stroke()

    // Current point
    const lastPrice = data[data.length - 1]
    const lastX = xScale(data.length - 1)
    const lastY = yScale(lastPrice)

    ctx.beginPath()
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2)
    ctx.fillStyle = change >= 0 ? '#10B981' : '#EF4444'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()

    // Title
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Price History (30 Days)', margin.left, 20)

    // Axes labels
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Time', width / 2, height - 5)

    ctx.save()
    ctx.translate(15, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Price (CSPR)', 0, 0)
    ctx.restore()
  }

  const currentPrice = tokenData?.current_price || 0.00001234
  const volume24h = tokenData?.volume24h || 1250

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaChartLine className="text-primary text-xl" />
            <div>
              <h3 className="text-lg font-bold text-white">
                {tokenData?.symbol || 'TOKEN'}/CSPR
              </h3>
              <p className="text-sm text-gray-400">Last 30 days</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              {currentPrice.toFixed(8)} CSPR
            </div>
            <div className={`flex items-center gap-1 justify-end text-sm font-semibold ${
              priceChange >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {priceChange >= 0 ? <FaArrowUp /> : <FaArrowDown />}
              {Math.abs(priceChange).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        <canvas
          ref={canvasRef}
          width={900}
          height={350}
          className="w-full h-auto rounded-lg"
        />
      </div>

      {/* Stats */}
      <div className="px-6 pb-6 grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">24h Volume</div>
          <div className="text-lg font-bold text-white">
            {volume24h.toLocaleString()} CSPR
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Market Cap</div>
          <div className="text-lg font-bold text-white">
            ${((currentPrice * (tokenData?.total_supply || 1000000000)) * 0.0065).toLocaleString(undefined, {maximumFractionDigits: 0})}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">24h Change</div>
          <div className={`text-lg font-bold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="px-6 pb-6">
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 flex items-center gap-2">
          <span className="text-blue-400">ℹ️</span>
          <p className="text-xs text-blue-200">
            Demo data shown. Real price data will be fetched from cspr.cloud API once CORS is configured.
          </p>
        </div>
      </div>
    </div>
  )
}
