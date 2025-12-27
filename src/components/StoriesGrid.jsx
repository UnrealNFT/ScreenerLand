import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaHeart, FaComment, FaEye, FaPlay, FaTimes } from 'react-icons/fa'
import { useWallet } from '../contexts/WalletContext'
import { API_URL } from '../config'
import toast from 'react-hot-toast'

// Helper functions for 24h countdown timer
const isStoryEligible = (timestamp) => {
  const elapsed = Date.now() - new Date(timestamp)
  return elapsed < 24 * 60 * 60 * 1000
}

const getShortTime = (timestamp) => {
  const remaining = (24 * 60 * 60 * 1000) - (Date.now() - new Date(timestamp))
  if (remaining <= 0) return null
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  return `${hours}h`
}

const getTimeProgress = (timestamp) => {
  const elapsed = Date.now() - new Date(timestamp)
  const total = 24 * 60 * 60 * 1000
  return Math.min(elapsed / total, 1)
}

export default function StoriesGrid({ tokenHash, tokenSymbol, limit = 12, showUploadButton = false, onUploadClick }) {
  const { walletAddress } = useWallet()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState(null)
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    loadStories()
  }, [tokenHash, limit])

  // Update timer every second for real-time circular progress
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const loadStories = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/stories/token/${tokenHash}?limit=${limit}`)
      const data = await response.json()
      
      if (data.success) {
        setStories(data.stories || [])
      }
    } catch (error) {
      console.error('❌ Error loading stories:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleLike = async (e, storyId) => {
    e.stopPropagation()
    
    if (!walletAddress) {
      toast.error('Connect wallet to like')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/stories/${storyId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      })

      const data = await response.json()
      
      if (data.success) {
        setStories(prev => prev.map(s => 
          s.id === storyId ? data.story : s
        ))
        toast.success(data.liked ? '❤️' : '🤍', { duration: 1000 })
      }
    } catch (error) {
      console.error('❌ Error toggling like:', error)
    }
  }

  const openStoryModal = (storyIndex) => {
    setSelectedStoryIndex(storyIndex)
    setIsPlaying(true)
  }

  const closeStoryModal = () => {
    setSelectedStoryIndex(null)
  }

  const goToNext = () => {
    if (selectedStoryIndex < stories.length - 1) {
      setSelectedStoryIndex(selectedStoryIndex + 1)
    }
  }

  const goToPrevious = () => {
    if (selectedStoryIndex > 0) {
      setSelectedStoryIndex(selectedStoryIndex - 1)
    }
  }

  const togglePlayPause = () => {
    const currentStory = stories[selectedStoryIndex]
    if (currentStory?.mediaType === 'video') {
      const video = document.querySelector('.modal-story-video')
      if (video) {
        if (isPlaying) {
          video.pause()
        } else {
          video.play()
        }
        setIsPlaying(!isPlaying)
      }
    }
  }

  const deleteStory = async (storyId) => {
    if (!walletAddress) {
      toast.error('Connect wallet to delete')
      return
    }

    const story = stories.find(s => s.id === storyId)
    if (story.userWallet !== walletAddress) {
      toast.error('You can only delete your own stories')
      return
    }

    if (!confirm('Delete this story? This cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/stories/${storyId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      })

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned ${response.status}: Not a JSON response`)
      }

      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Story deleted!')
        setShowMenu(false)
        closeStoryModal()
        // Reload stories
        loadStories()
      } else {
        toast.error(data.error || `Failed to delete: ${response.status}`)
      }
    } catch (error) {
      console.error('❌ Error deleting story:', error)
      toast.error(error.message || 'Failed to delete story')
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="glass rounded-2xl aspect-[9/16] animate-pulse" />
        ))}
      </div>
    )
  }

  if (stories.length === 0 && !showUploadButton) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center">
          📹
        </div>
        <p className="text-white/60">No stories yet for {tokenSymbol}</p>
        <p className="text-white/40 text-sm mt-2">Be the first to upload!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {/* Upload Button Card (YouTube Shorts style) */}
      {showUploadButton && (
        <motion.div
          onClick={onUploadClick}
          className="glass rounded-2xl aspect-[9/16] overflow-hidden cursor-pointer group relative"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary opacity-20 group-hover:opacity-40 transition-opacity" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/10 backdrop-blur rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
              <FaPlay className="text-white text-2xl ml-1" />
            </div>
            <p className="text-white font-bold text-center">Upload Story</p>
            <p className="text-white/60 text-xs text-center mt-1">
              Earn rewards from engagement
            </p>
          </div>
        </motion.div>
      )}

      {/* Story Cards */}
      {stories.map((story, index) => (
        <motion.div
          key={story.id}
          onClick={() => openStoryModal(index)}
          onMouseEnter={() => setHoveredId(story.id)}
          onMouseLeave={() => setHoveredId(null)}
          className="glass rounded-2xl aspect-[9/16] overflow-hidden cursor-pointer group relative"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Media Preview */}
          <div className="absolute inset-0">
            {story.mediaType === 'image' ? (
              <img
                src={`${API_URL}${story.videoUrl}`}
                alt={story.caption}
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={`${API_URL}${story.videoUrl}`}
                className="w-full h-full object-cover"
                autoPlay={hoveredId === story.id}
                muted
                loop
              />
            )}
          </div>

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
              <FaPlay className="text-white text-2xl ml-1" />
            </div>
          </div>

          {/* Story Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            {/* Caption */}
            <p className="text-white text-sm font-medium line-clamp-4 mb-2">
              {story.caption}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-4 text-white/80 text-sm">
              <button
                onClick={(e) => toggleLike(e, story.id)}
                className="flex items-center gap-1 hover:text-red-400 transition-colors"
              >
                <FaHeart className={story.isLiked ? 'text-red-500' : ''} />
                <span>{story.likesCount || 0}</span>
              </button>
              
              <div className="flex items-center gap-1">
                <FaComment />
                <span>{story.commentsCount || 0}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <FaEye />
                <span>{story.viewsCount || 0}</span>
              </div>
            </div>

            {/* Circular Score Badge with Timer */}
            {story.score > 0 && (
              <div className="absolute top-4 right-4 w-16 h-16">
                {/* Circular progress ring (only if eligible) */}
                {isStoryEligible(story.createdAt) && (
                  <svg className="absolute inset-0 -rotate-90" width="64" height="64">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="url(#gradient-badge)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - getTimeProgress(story.createdAt))}`}
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                    <defs>
                      <linearGradient id="gradient-badge" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
                
                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl rounded-full border-2 border-white/10 shadow-2xl">
                  <span className="text-lg">🔥</span>
                  <span className="text-white text-[11px] font-bold">{story.score}</span>
                  {isStoryEligible(story.createdAt) && (
                    <span className="text-green-400 text-[9px]">{getShortTime(story.createdAt)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Duration Badge */}
            {story.duration && (
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-2 py-1 rounded">
                <span className="text-white text-xs">
                  {Math.floor(story.duration / 60)}:{String(Math.floor(story.duration % 60)).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* Fullscreen Story Modal */}
      <AnimatePresence>
        {selectedStoryIndex !== null && stories[selectedStoryIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[100]"
            onClick={togglePlayPause}
          >
            {/* Media - Image or Video */}
            {stories[selectedStoryIndex].mediaType === 'image' ? (
              <img
                key={stories[selectedStoryIndex].id}
                src={`${API_URL}${stories[selectedStoryIndex].videoUrl}`}
                alt={stories[selectedStoryIndex].caption}
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : (
              <video
                key={stories[selectedStoryIndex].id}
                src={`${API_URL}${stories[selectedStoryIndex].videoUrl}`}
                className="modal-story-video absolute inset-0 w-full h-full object-contain"
                autoPlay
                loop
                playsInline
              />
            )}

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeStoryModal()
              }}
              className="absolute top-6 right-6 w-12 h-12 bg-black/80 backdrop-blur-xl rounded-full flex items-center justify-center z-50 hover:bg-black/90"
            >
              <FaTimes className="text-white text-xl" />
            </button>

            {/* Menu Button (Delete/Report) */}
            <div className="absolute top-6 left-6 z-50">
              <div className="relative">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(!showMenu)
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-12 h-12 rounded-full bg-black/80 backdrop-blur-xl flex items-center justify-center hover:bg-black/90"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="6" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="18" r="2"/>
                  </svg>
                </motion.button>
                
                {/* Dropdown Menu */}
                <AnimatePresence>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute top-full mt-2 left-0 bg-black/95 backdrop-blur-2xl rounded-xl overflow-hidden shadow-2xl border border-white/20 min-w-[160px] z-50"
                      >
                        {walletAddress === stories[selectedStoryIndex].userWallet ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteStory(stories[selectedStoryIndex].id)
                            }}
                            className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/30 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                            Delete
                          </button>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              setShowMenu(false)
                              
                              if (!walletAddress) {
                                toast.error('Please connect your wallet first')
                                return
                              }
                              
                              const reason = prompt('Reason for report:\n1. Spam\n2. Inappropriate content\n3. Misleading information\n4. Scam/Fraud\n5. Other\n\nEnter 1-5:')
                              
                              if (!reason) return
                              
                              const reasons = {
                                '1': 'spam',
                                '2': 'inappropriate',
                                '3': 'misleading',
                                '4': 'scam',
                                '5': 'other'
                              }
                              
                              const selectedReason = reasons[reason] || 'other'
                              const description = prompt('Additional details (optional):')
                              
                              try {
                                const response = await fetch(`${API_URL}/api/stories/${stories[selectedStoryIndex].id}/report`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reporterWallet: walletAddress,
                                    reason: selectedReason,
                                    description: description || ''
                                  })
                                })
                                
                                const data = await response.json()
                                
                                if (data.success) {
                                  toast.success('Report submitted! Admins will review it.')
                                } else {
                                  toast.error('Failed to submit report')
                                }
                              } catch (error) {
                                console.error('Report error:', error)
                                toast.error('Failed to submit report')
                              }
                            }}
                            className="w-full px-4 py-3 text-left text-yellow-400 hover:bg-yellow-500/30 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                            </svg>
                            Report
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Navigation */}
            <div className="absolute inset-y-0 left-6 flex items-center z-40">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrevious()
                }}
                disabled={selectedStoryIndex === 0}
                className="w-12 h-12 bg-black/80 backdrop-blur-xl rounded-full flex items-center justify-center disabled:opacity-30"
              >
                ←
              </button>
            </div>
            <div className="absolute inset-y-0 right-6 flex items-center z-40">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToNext()
                }}
                disabled={selectedStoryIndex === stories.length - 1}
                className="w-12 h-12 bg-black/80 backdrop-blur-xl rounded-full flex items-center justify-center disabled:opacity-30"
              >
                →
              </button>
            </div>

            {/* Story Info Bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 z-40">
              <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent pr-2 mb-2">
                <p className="text-white text-lg leading-relaxed">{stories[selectedStoryIndex].caption}</p>
              </div>
            </div>

            {/* Play/Pause Indicator - Only for videos */}
            {stories[selectedStoryIndex].mediaType === 'video' && !isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 bg-black/80 backdrop-blur-xl rounded-full flex items-center justify-center">
                  <span className="text-white text-4xl">⏸️</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
