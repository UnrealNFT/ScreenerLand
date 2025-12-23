import { motion } from 'framer-motion'
import { FaFire, FaArrowUp } from 'react-icons/fa'

export default function TrendingTokens({ limit = 6 }) {
  // Mock data - will be replaced with real API
  const tokens = [
    { name: 'STARSHIB', symbol: 'SSHIB', price: 0.000123, change: 127.5, mcap: 1200000, image: 'https://via.placeholder.com/48' },
    { name: 'CasperMoon', symbol: 'CMOON', price: 0.000789, change: 85.3, mcap: 890000, image: 'https://via.placeholder.com/48' },
    { name: 'RocketCSPR', symbol: 'RCSPR', price: 0.001234, change: 67.8, mcap: 2100000, image: 'https://via.placeholder.com/48' },
    { name: 'MemeKing', symbol: 'MKING', price: 0.000456, change: 45.2, mcap: 560000, image: 'https://via.placeholder.com/48' },
    { name: 'DiamondHands', symbol: 'DHAND', price: 0.002100, change: 38.9, mcap: 1800000, image: 'https://via.placeholder.com/48' },
    { name: 'MoonShot', symbol: 'MOON', price: 0.000333, change: 29.4, mcap: 420000, image: 'https://via.placeholder.com/48' },
  ].slice(0, limit)
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tokens.map((token, index) => (
        <TokenCard key={token.symbol} token={token} index={index} />
      ))}
    </div>
  )
}

function TokenCard({ token, index }) {
  return (
    <motion.a
      href={`/token/${token.symbol}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.02 }}
      className="glass p-4 rounded-xl card-hover block"
    >
      <div className="flex items-center gap-3 mb-3">
        <img
          src={token.image}
          alt={token.name}
          className="w-12 h-12 rounded-full"
        />
        <div className="flex-1">
          <h3 className="font-bold">{token.name}</h3>
          <span className="text-sm text-gray-400">${token.symbol}</span>
        </div>
        <FaFire className="text-orange-500 text-xl" />
      </div>
      
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl font-bold">${token.price.toFixed(6)}</span>
        <span className="flex items-center gap-1 text-success font-semibold">
          <FaArrowUp />
          {token.change.toFixed(1)}%
        </span>
      </div>
      
      <div className="text-sm text-gray-400">
        MCap: ${(token.mcap / 1000).toFixed(0)}K
      </div>
    </motion.a>
  )
}
