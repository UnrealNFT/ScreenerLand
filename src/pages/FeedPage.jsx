import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaFire, FaTrophy, FaComments, FaEye, FaHeart, FaShare, FaClock, FaComment } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { getTokenColor } from '../utils/tokenColors'
import TokenAvatar from '../components/Token/TokenAvatar'
import UserAvatar from '../components/User/UserAvatar'
import { API_URL } from '../config'

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState('communities') // 'communities' or 'stories'
  const [communityMessages, setCommunityMessages] = useState([])
  const [storyRanking, setStoryRanking] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCommunityFeed()
    loadStoryRanking()
  }, [])

  const loadCommunityFeed = async () => {
    try {
      const response = await fetch('${API_URL}/api/communities/latest-messages')
      const data = await response.json()
      
      if (data.success) {
        setCommunityMessages(data.data || [])
      }
    } catch (error) {
      console.error('❌ Error loading community feed:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStoryRanking = async () => {
    try {
      const response = await fetch('${API_URL}/api/stories/ranking/24h')
      const data = await response.json()
      
      if (data.success) {
        setStoryRanking(data.data || [])
      }
    } catch (error) {
      console.error('❌ Error loading story ranking:', error)
    }
  }

  const calculatePoints = (story) => {
    // New formula: views×1 + likes×2 + shares×5 + comments×1
    return (story.views || 0) * 1 + (story.likes || 0) * 2 + (story.shares || 0) * 5 + (story.comments || 0) * 1
  }

  const formatTimeAgo = (timestamp) => {
    const now = Date.now()
    const diff = now - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen pt-20 pb-24 px-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Feed</span>
          </h1>
          <p className="text-white/60 text-lg">
            Community activity & Story rankings
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-dark-border">
          <button
            onClick={() => setActiveTab('communities')}
            className={`px-6 py-3 font-semibold transition-all duration-300 ${
              activeTab === 'communities'
                ? 'text-primary border-b-2 border-primary'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <FaComments className="inline mr-2" />
            Community Feed
          </button>
          
          <button
            onClick={() => setActiveTab('stories')}
            className={`px-6 py-3 font-semibold transition-all duration-300 ${
              activeTab === 'stories'
                ? 'text-secondary border-b-2 border-secondary'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <FaTrophy className="inline mr-2" />
            Story Ranking (24h)
          </button>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'communities' && (
            <motion.div
              key="communities"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {loading ? (
                <div className="glass rounded-xl p-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-white/60">Loading community feed...</p>
                </div>
              ) : communityMessages.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                  <FaComments className="text-6xl text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 text-lg">No messages yet</p>
                  <p className="text-white/40 text-sm mt-2">Be the first to chat in a token community!</p>
                </div>
              ) : (
                communityMessages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass rounded-xl p-6 hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {/* Token Logo */}
                      <Link to={`/token/${msg.tokenHash}`}>
                        {msg.tokenLogo ? (
                          <img
                            src={msg.tokenLogo}
                            alt={msg.tokenSymbol}
                            className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
                          />
                        ) : (
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-lg"
                            style={{
                              background: `linear-gradient(135deg, ${getTokenColor(msg.tokenHash).from}, ${getTokenColor(msg.tokenHash).to})`
                            }}
                          >
                            {msg.tokenSymbol?.substring(0, 2)}
                          </div>
                        )}
                      </Link>

                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <Link 
                            to={`/token/${msg.tokenHash}`}
                            className="font-bold text-white hover:text-primary transition-colors"
                          >
                            {msg.tokenName || msg.tokenSymbol}
                          </Link>
                          <span className="text-white/40">•</span>
                          <span className="text-white/60 text-sm">{formatTimeAgo(msg.timestamp)}</span>
                        </div>

                        {/* Message with icon */}
                        <div className="flex items-start gap-2 mb-3">
                          <FaComment className="text-primary mt-1 flex-shrink-0" />
                          <p className="text-white flex-1">{msg.message}</p>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-white/60">
                          <span>{msg.memberCount || 0} members</span>
                          <Link 
                            to={`/token/${msg.tokenHash}`}
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            View Chat →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'stories' && (
            <motion.div
              key="stories"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {loading ? (
                <div className="glass rounded-xl p-12 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary mx-auto mb-4"></div>
                  <p className="text-white/60">Loading story ranking...</p>
                </div>
              ) : storyRanking.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                  <FaTrophy className="text-6xl text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 text-lg">No stories in the last 24h</p>
                  <p className="text-white/40 text-sm mt-2">Upload a story to appear in the ranking!</p>
                </div>
              ) : (
                storyRanking.map((story, index) => {
                  const points = calculatePoints(story)
                  const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''
                  const timeLeft = Math.max(0, 24 - Math.floor((Date.now() - new Date(story.createdAt).getTime()) / (1000 * 60 * 60)))

                  // DEBUG: Log story data to see what's in userName and tokenSymbol
                  console.log(`📊 Story #${index + 1}:`, {
                    tokenSymbol: story.tokenSymbol,
                    userName: story.userName,
                    userWallet: story.userWallet
                  })

                  return (
                    <motion.div
                      key={story.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`glass rounded-xl p-6 hover:bg-white/5 transition-all ${
                        index < 3 ? 'ring-2 ring-secondary/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Rank */}
                        <div className="flex-shrink-0 w-12 text-center">
                          {medalEmoji ? (
                            <span className="text-4xl">{medalEmoji}</span>
                          ) : (
                            <span className="text-2xl font-bold text-white/40">#{index + 1}</span>
                          )}
                        </div>

                        {/* Story Preview */}
                        <Link to={`/`} className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 group">
                          {story.mediaType === 'video' ? (
                            <video
                              src={`${API_URL}${story.videoUrl}`}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <img
                              src={`${API_URL}${story.videoUrl}`}
                              alt="Story"
                              className="w-full h-full object-cover"
                            />
                          )}
                          {/* Overlay Text Preview */}
                          {story.overlayText && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-2">
                              <span className="text-white text-xs font-bold text-center line-clamp-3">
                                {story.overlayText}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-all flex items-center justify-center">
                            <FaFire className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-2xl" />
                          </div>
                          {/* Duration */}
                          {story.duration > 0 && (
                            <div className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded text-white text-xs font-bold">
                              {formatDuration(story.duration)}
                            </div>
                          )}
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Token Info */}
                          <Link 
                            to={`/token/${story.tokenHash}`}
                            className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
                          >
                            <div className="flex-shrink-0">
                              <TokenAvatar 
                                tokenHash={story.tokenHash}
                                tokenSymbol={story.tokenSymbol}
                                tokenLogo={story.tokenLogo}
                                size="sm"
                              />
                            </div>
                            <span className="font-bold text-white text-lg">
                              {story.tokenSymbol}
                            </span>
                          </Link>
                          
                          {/* User Info */}
                          <div className="flex items-center gap-2 mb-3">
                            <UserAvatar
                              userAvatar={story.userAvatar}
                              userName={story.userName}
                              userWallet={story.userWallet}
                              size="xs"
                            />
                            <span className="text-white/60 text-sm">
                              {story.userName || (story.userWallet ? `${story.userWallet.substring(0, 6)}...` : 'Anonymous')}
                            </span>
                          </div>

                          {story.caption && (
                            <p className="text-white/80 text-sm mb-2 line-clamp-2">{story.caption}</p>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-4 gap-3 text-sm">
                            <div className="flex items-center gap-1 text-blue-400">
                              <FaEye />
                              <span>{story.views || 0}</span>
                            </div>
                            <div className="flex items-center gap-1 text-red-400">
                              <FaHeart />
                              <span>{story.likes || 0}</span>
                            </div>
                            <div className="flex items-center gap-1 text-green-400">
                              <FaComments />
                              <span>{story.comments || 0}</span>
                            </div>
                            <div className="flex items-center gap-1 text-purple-400">
                              <FaShare />
                              <span>{story.shares || 0}</span>
                            </div>
                          </div>
                        </div>

                        {/* Points & Time Left */}
                        <div className="flex-shrink-0 text-right">
                          <div className="flex items-center gap-2 mb-2">
                            <FaFire className="text-orange-400" />
                            <span className="text-2xl font-bold text-white">{points}</span>
                          </div>
                          <div className="flex items-center gap-1 text-white/60 text-sm">
                            <FaClock className="text-xs" />
                            <span>{timeLeft}h left</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
