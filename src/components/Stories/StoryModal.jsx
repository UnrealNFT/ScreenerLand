import { motion, AnimatePresence } from 'framer-motion'
import { FaTimes, FaHeart, FaComment, FaShare } from 'react-icons/fa'
import { useState, useEffect } from 'react'

export default function StoryModal({ story, onClose }) {
  const [progress, setProgress] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(234)
  
  useEffect(() => {
    // Auto-advance progress bar (120s)
    const duration = 120000
    const interval = 100
    const increment = (interval / duration) * 100
    
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer)
          onClose()
          return 100
        }
        return prev + increment
      })
    }, interval)
    
    return () => clearInterval(timer)
  }, [onClose])
  
  const handleLike = () => {
    if (!liked) {
      setLikes(prev => prev + 1)
      setLiked(true)
    }
  }
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md h-[80vh] md:h-[90vh] bg-dark-card rounded-2xl overflow-hidden"
        >
          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-10">
            <motion.div
              className="h-full bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Header */}
          <div className="absolute top-4 left-0 right-0 px-4 z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={story.avatar}
                alt={story.tokenName}
                className="w-10 h-10 rounded-full border-2 border-white"
              />
              <div>
                <h3 className="font-bold text-white">{story.tokenName}</h3>
                <span className="text-sm text-gray-300">{story.tokenSymbol}</span>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            >
              <FaTimes className="text-white" />
            </button>
          </div>
          
          {/* Video/Image content */}
          <div className="w-full h-full bg-gradient-to-br from-purple-900/20 via-dark-card to-blue-900/20 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">🚀</div>
              <h2 className="text-3xl font-bold mb-2 gradient-text">
                {story.tokenName}
              </h2>
              <p className="text-gray-400 mb-6">
                Join the revolution! Trade now on ScreenerLand
              </p>
              <div className="inline-flex items-center gap-4 bg-dark-bg/50 rounded-full px-6 py-3">
                <span className="text-success text-2xl font-bold">+127%</span>
                <span className="text-gray-400">24h</span>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-6">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleLike}
                  className="flex flex-col items-center gap-1"
                >
                  <FaHeart className={`text-2xl ${liked ? 'text-danger' : 'text-white'}`} />
                  <span className="text-sm text-white">{likes}</span>
                </motion.button>
                
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="flex flex-col items-center gap-1"
                >
                  <FaComment className="text-2xl text-white" />
                  <span className="text-sm text-white">42</span>
                </motion.button>
                
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="flex flex-col items-center gap-1"
                >
                  <FaShare className="text-2xl text-white" />
                  <span className="text-sm text-white">Share</span>
                </motion.button>
              </div>
              
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href={`/token/${story.contractHash}`}
                className="btn-primary"
              >
                Trade Now
              </motion.a>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
