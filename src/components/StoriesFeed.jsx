import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaHeart, FaComment, FaShare, FaPlay, FaPause, FaTimes, FaChevronUp, FaChevronDown } from 'react-icons/fa'
import { useWallet } from '../contexts/WalletContext'
import { API_URL } from '../config'
import toast from 'react-hot-toast'

export default function StoriesFeed({ tokenHash, tokenSymbol }) {
  const { walletAddress } = useWallet()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')

  useEffect(() => {
    loadStories()
  }, [tokenHash])

  useEffect(() => {
    if (stories.length > 0 && currentIndex >= 0) {
      incrementView(stories[currentIndex].id)
      loadComments(stories[currentIndex].id)
    }
  }, [currentIndex, stories])

  const loadStories = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/stories/token/${tokenHash}?limit=50`)
      const data = await response.json()
      
      if (data.success) {
        setStories(data.stories || [])
        console.log(`📹 Loaded ${data.stories?.length || 0} stories for ${tokenSymbol}`)
      }
    } catch (error) {
      console.error('❌ Error loading stories:', error)
      toast.error('Failed to load stories')
    } finally {
      setLoading(false)
    }
  }

  const incrementView = async (storyId) => {
    try {
      await fetch(`${API_URL}/api/stories/${storyId}/view`, {
        method: 'POST'
      })
    } catch (error) {
      console.error('❌ Error incrementing view:', error)
    }
  }

  const toggleLike = async (storyId) => {
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
        // Update story in state
        setStories(prev => prev.map(s => 
          s.id === storyId ? data.story : s
        ))
        toast.success(data.liked ? '❤️ Liked!' : 'Like removed')
      }
    } catch (error) {
      console.error('❌ Error toggling like:', error)
      toast.error('Failed to like')
    }
  }

  const loadComments = async (storyId) => {
    try {
      const response = await fetch(`${API_URL}/api/stories/${storyId}/comments`)
      const data = await response.json()
      
      if (data.success) {
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error('❌ Error loading comments:', error)
    }
  }

  const addComment = async (storyId) => {
    if (!walletAddress) {
      toast.error('Connect wallet to comment')
      return
    }

    if (!commentText.trim()) return

    try {
      const response = await fetch(`${API_URL}/api/stories/${storyId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          text: commentText.trim()
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setComments(prev => [...prev, data.comment])
        setCommentText('')
        
        // Update comment count in story
        setStories(prev => prev.map(s => 
          s.id === storyId ? { ...s, commentsCount: s.commentsCount + 1 } : s
        ))
        
        toast.success('Comment added!')
      }
    } catch (error) {
      console.error('❌ Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  const shareStory = async (storyId) => {
    try {
      await fetch(`${API_URL}/api/stories/${storyId}/share`, {
        method: 'POST'
      })

      // Update share count in story
      setStories(prev => prev.map(s => 
        s.id === storyId ? { ...s, sharesCount: s.sharesCount + 1 } : s
      ))

      // Copy link to clipboard
      const link = `${window.location.origin}/story/${storyId}`
      await navigator.clipboard.writeText(link)
      toast.success('Link copied to clipboard!')
    } catch (error) {
      console.error('❌ Error sharing story:', error)
      toast.error('Failed to share')
    }
  }

  const goToNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setShowComments(false)
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setShowComments(false)
    }
  }

  const formatAddress = (address) => {
    if (!address) return 'Anonymous'
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-white/60">Loading stories...</p>
      </div>
    )
  }

  if (stories.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <span className="text-6xl mb-4 block">📹</span>
        <h3 className="text-xl font-bold text-white mb-2">No Stories Yet</h3>
        <p className="text-white/60 mb-6">
          Be the first to share a story about {tokenSymbol}!
        </p>
        <button className="btn-primary px-6 py-3">
          Upload Story
        </button>
      </div>
    )
  }

  const currentStory = stories[currentIndex]

  return (
    <div className="relative">
      {/* TikTok-style Vertical Feed */}
      <div className="relative bg-black rounded-2xl overflow-hidden" style={{ height: '70vh', maxHeight: '800px' }}>
        
        {/* Video Background */}
        <video
          key={currentStory.id}
          className="absolute inset-0 w-full h-full object-cover"
          src={`${API_URL}${currentStory.videoUrl}`}
          autoPlay={isPlaying}
          loop
          muted={false}
          playsInline
        />

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

        {/* Top Info */}
        <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-bold">
              {tokenSymbol.substring(0, 2)}
            </div>
            <div>
              <p className="text-white font-semibold">{formatAddress(currentStory.userWallet)}</p>
              <p className="text-white/60 text-sm">{formatTime(currentStory.createdAt)}</p>
            </div>
          </div>
          
          {/* Progress Indicators */}
          <div className="flex gap-1">
            {stories.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all ${
                  idx === currentIndex ? 'w-8 bg-white' : 'w-1 bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-32 left-0 right-0 px-6 z-10">
            <p className="text-white text-lg font-semibold drop-shadow-lg">
              {currentStory.caption}
            </p>
          </div>
        )}

        {/* Engagement Stats - Bottom Left */}
        <div className="absolute bottom-6 left-6 z-10 flex items-center gap-4 text-white">
          <div className="flex items-center gap-1.5">
            <FaHeart className="text-red-400" />
            <span className="font-semibold">{currentStory.likesCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FaComment className="text-blue-400" />
            <span className="font-semibold">{currentStory.commentsCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FaShare className="text-green-400" />
            <span className="font-semibold">{currentStory.sharesCount}</span>
          </div>
          <div className="px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-400 text-sm font-semibold">
            🏆 Score: {currentStory.score}
          </div>
        </div>

        {/* Action Buttons - Bottom Right */}
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-4">
          
          {/* Like Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => toggleLike(currentStory.id)}
            className={`p-4 rounded-full backdrop-blur-xl transition-all ${
              currentStory.isLikedByUser 
                ? 'bg-red-500/30 text-red-400' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <FaHeart className="text-2xl" />
          </motion.button>

          {/* Comment Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowComments(!showComments)}
            className="p-4 bg-white/10 backdrop-blur-xl rounded-full hover:bg-white/20 transition-all"
          >
            <FaComment className="text-2xl text-white" />
          </motion.button>

          {/* Share Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => shareStory(currentStory.id)}
            className="p-4 bg-white/10 backdrop-blur-xl rounded-full hover:bg-white/20 transition-all"
          >
            <FaShare className="text-2xl text-white" />
          </motion.button>

          {/* Play/Pause */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-4 bg-white/10 backdrop-blur-xl rounded-full hover:bg-white/20 transition-all"
          >
            {isPlaying ? (
              <FaPause className="text-2xl text-white" />
            ) : (
              <FaPlay className="text-2xl text-white" />
            )}
          </motion.button>
        </div>

        {/* Navigation Arrows */}
        {currentIndex > 0 && (
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 backdrop-blur-xl rounded-full hover:bg-white/20 transition-all z-10"
          >
            <FaChevronUp className="text-white text-xl" />
          </button>
        )}
        
        {currentIndex < stories.length - 1 && (
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 backdrop-blur-xl rounded-full hover:bg-white/20 transition-all z-10"
          >
            <FaChevronDown className="text-white text-xl" />
          </button>
        )}

        {/* Comments Drawer */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl z-20 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h3 className="text-xl font-bold text-white">
                  Comments ({comments.length})
                </h3>
                <button
                  onClick={() => setShowComments(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <FaTimes className="text-white text-xl" />
                </button>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {comments.length === 0 ? (
                  <p className="text-white/60 text-center py-8">No comments yet. Be the first!</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {comment.walletAddress.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white/80 text-sm font-semibold">
                            {formatAddress(comment.walletAddress)}
                          </span>
                          <span className="text-white/40 text-xs">
                            {formatTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-white">{comment.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment */}
              {walletAddress && (
                <div className="p-6 border-t border-white/10">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addComment(currentStory.id)}
                      placeholder="Add a comment..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={() => addComment(currentStory.id)}
                      disabled={!commentText.trim()}
                      className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Post
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
