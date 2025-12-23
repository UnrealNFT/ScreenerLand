import { motion } from 'framer-motion'
import { FaHeart, FaComment, FaChartLine } from 'react-icons/fa'
import { useInView } from 'react-intersection-observer'
import { useState } from 'react'

export default function TokenFeed() {
  const tokens = [
    {
      id: 1,
      name: 'STARSHIB',
      symbol: 'SSHIB',
      description: '🚀 To the moon! Community-driven memecoin on Casper',
      price: 0.000123,
      priceChange: 127.5,
      image: 'https://via.placeholder.com/400x600',
      likes: 1542,
      comments: 234,
      contractHash: 'de1ecc0d...',
    },
    {
      id: 2,
      name: 'CasperMoon',
      symbol: 'CMOON',
      description: '🌙 First lunar token on Casper. HODL for rewards!',
      price: 0.000789,
      priceChange: 85.3,
      image: 'https://via.placeholder.com/400x600',
      likes: 892,
      comments: 145,
      contractHash: 'example123...',
    }
  ]
  
  return (
    <div className="space-y-4">
      {tokens.map((token, index) => (
        <TokenFeedCard key={token.id} token={token} index={index} />
      ))}
    </div>
  )
}

function TokenFeedCard({ token, index }) {
  const { ref, inView } = useInView({
    threshold: 0.5,
    triggerOnce: false
  })
  
  const [liked, setLiked] = useState(false)
  const [localLikes, setLocalLikes] = useState(token.likes)
  
  const handleLike = () => {
    if (!liked) {
      setLocalLikes(prev => prev + 1)
      setLiked(true)
    } else {
      setLocalLikes(prev => prev - 1)
      setLiked(false)
    }
  }
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ delay: index * 0.1 }}
      className="glass rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
            {token.symbol[0]}
          </div>
          <div>
            <h3 className="font-bold">{token.name}</h3>
            <span className="text-sm text-gray-400">${token.symbol}</span>
          </div>
        </div>
        
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
          token.priceChange >= 0
            ? 'bg-success/10 text-success'
            : 'bg-danger/10 text-danger'
        }`}>
          {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(1)}%
        </div>
      </div>
      
      {/* Content Image */}
      <div className="relative aspect-[4/5] bg-gradient-to-br from-purple-900/20 to-blue-900/20">
        <img
          src={token.image}
          alt={token.name}
          className="w-full h-full object-cover"
        />
        
        {/* Floating price */}
        <div className="absolute bottom-4 left-4 right-4 glass p-3 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">Current Price</div>
              <div className="text-2xl font-bold">${token.price}</div>
            </div>
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={`/token/${token.contractHash}`}
              className="btn-primary text-sm py-2 px-4"
            >
              <FaChartLine className="inline mr-2" />
              Trade
            </motion.a>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="p-4 space-y-3">
        {/* Like, Comment buttons */}
        <div className="flex items-center gap-6">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleLike}
            className="flex items-center gap-2 group"
          >
            <FaHeart className={`text-xl ${
              liked ? 'text-danger' : 'text-gray-400 group-hover:text-danger'
            } transition-colors`} />
            <span className={liked ? 'text-danger font-semibold' : 'text-gray-400'}>
              {localLikes.toLocaleString()}
            </span>
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="flex items-center gap-2 group"
          >
            <FaComment className="text-xl text-gray-400 group-hover:text-primary transition-colors" />
            <span className="text-gray-400">{token.comments}</span>
          </motion.button>
        </div>
        
        {/* Description */}
        <p className="text-gray-300">
          <span className="font-semibold">{token.symbol}</span>{' '}
          {token.description}
        </p>
      </div>
    </motion.div>
  )
}
