import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { FaHeart, FaComment, FaShare, FaPlay, FaPause, FaChevronUp, FaChevronDown, FaFire, FaClock, FaFilter } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { getTokenColor } from '../utils/tokenColors'
import UserAvatar from '../components/User/UserAvatar'

// Format time ago (e.g., "5 min ago", "2h ago")
const timeAgo = (timestamp) => {
  const now = new Date()
  const past = new Date(timestamp)
  const diffMs = now - past
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

// Check if story is still eligible for rewards (< 24h old)
const isStoryEligible = (timestamp) => {
  const now = new Date()
  const created = new Date(timestamp)
  const diffHours = (now - created) / (1000 * 60 * 60)
  return diffHours < 24
}

// Get remaining time for rewards eligibility
const getRemainingTime = (timestamp) => {
  const now = new Date()
  const created = new Date(timestamp)
  const elapsed = now - created
  const remaining = (24 * 60 * 60 * 1000) - elapsed // 24h in ms
  
  if (remaining <= 0) return null
  
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  
  return `${hours}h ${minutes}m left`
}

// Get short time for badge (ex: '23h')
const getShortTime = (timestamp) => {
  const now = new Date()
  const created = new Date(timestamp)
  const elapsed = now - created
  const remaining = (24 * 60 * 60 * 1000) - elapsed
  
  if (remaining <= 0) return null
  
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  return `${hours}h`
}

// Get progress percentage (0-1) for circular timer
const getTimeProgress = (timestamp) => {
  const now = new Date()
  const created = new Date(timestamp)
  const elapsed = now - created
  const total = 24 * 60 * 60 * 1000
  return Math.min(elapsed / total, 1)
}

export default function Home() {
  const navigate = useNavigate()
  const { walletAddress } = useWallet()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0) // 0-100% pour barre de progression
  const [currentTime, setCurrentTime] = useState(Date.now()) // Force re-render for timer
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [fullscreenStory, setFullscreenStory] = useState(null) // null = grid view, number = fullscreen index
  const [timeFilter, setTimeFilter] = useState('all') // 'all' or '24h'
  const [selectedToken, setSelectedToken] = useState(null) // null = all tokens, string = specific token hash
  const [showSidebar, setShowSidebar] = useState(false) // Mobile sidebar toggle
  const [userProfiles, setUserProfiles] = useState({}) // Map of wallet -> profile (fetched from backend)
  const [storyReloadTrigger, setStoryReloadTrigger] = useState(0) // Force reload for single story
  
  // Audio control refs
  const videoRef = useRef(null)
  const isManualPauseRef = useRef(false) // Track if user manually paused
  const lastToggleTimeRef = useRef(0) // Debounce toggle calls
  const savedProgressRef = useRef(0) // Save progress when pausing

  useEffect(() => {
    loadAllStories()
    
    // Check URL params for story navigation from TokenPage
    const params = new URLSearchParams(window.location.search)
    const storyIndex = params.get('story')
    const tokenHash = params.get('token')
    
    if (storyIndex && tokenHash) {
      // Will set index after stories load
      setCurrentIndex(parseInt(storyIndex))
    }
  }, [])

  // Update time every second for timer animations
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // CRITICAL: Check manual pause FIRST before doing ANYTHING
    if (isManualPauseRef.current) {
      console.log('⏸️ Manual pause active - skipping useEffect')
      return
    }
    
    if (stories.length > 0 && currentIndex >= 0) {
      const currentStory = stories[currentIndex]
      
      // Only increment view on actual story change (not trigger)
      if (currentIndex !== undefined) {
        incrementView(currentStory.id)
        loadComments(currentStory.id)
      }
      
      // Auto-play on story change
      setIsPlaying(true)
      
      // Reset video when story changes
      if (videoRef.current) {
        videoRef.current.currentTime = 0
      }
    }
  }, [currentIndex, storyReloadTrigger]) // Add trigger to dependencies

  // Reload comments when opening comment panel (to get fresh profiles)
  useEffect(() => {
    if (showComments && stories.length > 0 && currentIndex >= 0) {
      console.log('🔄 Reloading comments with fresh profiles...')
      loadComments(stories[currentIndex].id)
    }
  }, [showComments])

  // Auto-advance for images (10 seconds) - DISABLED, using progress bar instead
  /*
  useEffect(() => {
    const currentStory = stories[currentIndex]
    if (!currentStory) return

    // Only auto-advance for images
    if (currentStory.mediaType === 'image') {
      console.log(`⏱️ Starting 10s timer for image story: ${currentStory.id}`)
      const timer = setTimeout(() => {
        console.log(`⏰ Timer finished! Advancing from story ${currentIndex}`)
        if (currentIndex < stories.length - 1) {
          setCurrentIndex(currentIndex + 1)
          setShowComments(false)
        }
      }, 10000) // 10 seconds

      return () => {
        console.log(`🛑 Clearing timer for story ${currentStory.id}`)
        clearTimeout(timer)
      }
    }
  }, [currentIndex, stories])
  */

  // Progress bar animation (YouTube style) - handles ALL stories (video + images)
  useEffect(() => {
    setProgress(0) // Reset progress when story changes
    savedProgressRef.current = 0
    
    const currentStory = stories[currentIndex]
    if (!currentStory) return
    
    // Don't run if paused
    if (!isPlaying) return

    const duration = currentStory.duration * 1000 // Convert to ms
    const interval = 100 // Update every 100ms
    let elapsed = 0

    const timer = setInterval(() => {
      elapsed += interval
      const newProgress = Math.min((elapsed / duration) * 100, 100)
      setProgress(newProgress)

      // Auto-advance when progress reaches 100% (but ONLY if not manually paused)
      if (newProgress >= 100 && !isManualPauseRef.current) {
        if (currentIndex < stories.length - 1) {
          // Go to next story
          setCurrentIndex(currentIndex + 1)
          setShowComments(false)
        } else if (stories.length > 1) {
          // Multiple stories - loop back to first
          console.log('🔁 Last story finished, looping to first')
          setCurrentIndex(0)
          setShowComments(false)
        } else {
          // Single story - force reload by incrementing trigger
          console.log('🔁 Single story finished, restarting')
          setStoryReloadTrigger(prev => prev + 1)
        }
      }
    }, interval)

    return () => clearInterval(timer)
  }, [currentIndex, stories, isPlaying, storyReloadTrigger])

  const loadAllStories = async () => {
    try {
      setLoading(true)
      // Load ALL stories from all tokens (no 24h limit on backend)
      const response = await fetch(`http://localhost:3001/api/stories?limit=1000`)
      const data = await response.json()
      
      if (data.success) {
        // Add fallback for mediaType (old stories without it)
        const storiesWithDefaults = (data.stories || []).map(story => ({
          ...story,
          mediaType: story.mediaType || 'video', // Default to video for old stories
          overlayText: story.overlayText || ''
        }))
        
        // Sort by creation date - newest first (most recent at top)
        const sortedStories = storiesWithDefaults.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        )
        
        // Debug: show first 3 stories order
        console.log('🔍 First 3 stories order:', sortedStories.slice(0, 3).map(s => ({
          symbol: s.tokenSymbol,
          caption: s.caption?.substring(0, 20),
          createdAt: s.createdAt
        })))
        
        setStories(sortedStories)
        console.log(`📹 Loaded ${sortedStories.length} total stories (sorted newest first)`)
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
      await fetch(`http://localhost:3001/api/stories/${storyId}/view`, {
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
      const response = await fetch(`http://localhost:3001/api/stories/${storyId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      })

      const data = await response.json()
      
      if (data.success) {
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
      const response = await fetch(`http://localhost:3001/api/stories/${storyId}/comments`)
      const data = await response.json()
      
      if (data.success) {
        setComments(data.comments || [])
        console.log(`📝 Loaded ${data.comments?.length || 0} comments`)
        
        // Load profiles for all comment users from backend (no localStorage cache)
        const uniqueWallets = [...new Set((data.comments || []).map(c => c.userWallet))]
        console.log(`👥 Loading ${uniqueWallets.length} profiles from backend`)
        
        // Fetch all profiles in parallel
        const profilePromises = uniqueWallets.map(wallet => 
          fetch(`http://localhost:3001/api/profile/${wallet}`)
            .then(r => r.json())
            .then(data => ({ wallet, data }))
            .catch(err => {
              console.error(`❌ Error loading profile for ${wallet.substring(0, 8)}:`, err)
              return { wallet, data: null }
            })
        )
        
        const profileResults = await Promise.all(profilePromises)
        
        // Store profiles in state (not localStorage)
        const profilesMap = {}
        profileResults.forEach(({ wallet, data }) => {
          if (data?.success && data.profile) {
            profilesMap[wallet] = {
              name: data.profile.username,
              avatar: data.profile.avatarUrl,
              bio: data.profile.bio
            }
            console.log(`✅ Loaded profile: ${data.profile.username} (${wallet.substring(0, 8)}...) - Avatar: ${data.profile.avatarUrl ? 'YES' : 'NO'}`)
          }
        })
        
        // Save profiles map to state for rendering
        setUserProfiles(profilesMap)
        console.log(`✅ All profiles loaded from backend:`, Object.keys(profilesMap).length)
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
      const response = await fetch(`http://localhost:3001/api/stories/${storyId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          text: commentText.trim()
        })
      })

      const data = await response.json()
      
      if (data.success) {
        // Reload all comments after adding
        await loadComments(storyId)
        setStories(prev => prev.map(s => 
          s.id === storyId ? { ...s, commentsCount: (s.commentsCount || 0) + 1 } : s
        ))
        setCommentText('')
        toast.success('Comment added!')
      }
    } catch (error) {
      console.error('❌ Error adding comment:', error)
      toast.error('Failed to add comment')
    }
  }

  const shareStory = async (storyId) => {
    try {
      const story = stories.find(s => s.id === storyId)
      const shareUrl = `${window.location.origin}/token/${story.tokenHash}?story=${currentIndex}`
      
      // Check if already shared by this wallet
      const alreadyShared = story.hasShared || false
      
      if (!alreadyShared) {
        // First time: Count the share
        const response = await fetch(`http://localhost:3001/api/stories/${storyId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: walletAddress || 'anonymous' })
        })
        
        if (response.ok) {
          console.log('✅ Share counted (+5pts)')
          // Update share count and mark as shared
          setStories(prev => prev.map(s => 
            s.id === storyId ? { ...s, sharesCount: (s.sharesCount || 0) + 1, hasShared: true } : s
          ))
          toast.success('🔗 Shared! Link copied (+5pts)', { icon: '✅' })
        } else {
          console.log('ℹ️ Already shared by this wallet')
          // Mark as already shared without incrementing
          setStories(prev => prev.map(s => 
            s.id === storyId ? { ...s, hasShared: true } : s
          ))
          toast.success('🔗 Link copied (already counted)')
        }
      } else {
        // Already shared: Just copy link
        console.log('🔗 Link copied (already shared)')
        toast.success('🔗 Link copied!')
      }
      
      // Always copy to clipboard
      await navigator.clipboard.writeText(shareUrl)
      
    } catch (error) {
      console.error('❌ Error sharing story:', error)
      toast.error('Failed to share')
    }
  }

  const goToNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setShowComments(false)
      isManualPauseRef.current = false // Clear manual pause on navigation
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setShowComments(false)
      isManualPauseRef.current = false // Clear manual pause on navigation
    }
  }

  const togglePlayPause = (e) => {
    // Prevent event propagation and default behavior
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    
    // DEBOUNCE: Ignore calls within 300ms
    const now = Date.now()
    if (now - lastToggleTimeRef.current < 300) {
      console.log('🚫 Debounced - ignoring rapid toggle')
      return
    }
    lastToggleTimeRef.current = now
    
    const currentStory = stories[currentIndex]
    if (!currentStory) return
    
    const video = document.querySelector('.current-story-video')
    
    // Toggle state first
    const newPlayingState = !isPlaying
    setIsPlaying(newPlayingState)
    
    // Mark as manual pause/play
    isManualPauseRef.current = !newPlayingState
    console.log(`${newPlayingState ? '▶️' : '⏸️'} Toggle Play/Pause - isManualPause: ${!newPlayingState}`)
    
    // Control video
    if (newPlayingState) {
      if (video) video.play()
    } else {
      if (video) video.pause()
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
      const response = await fetch(`http://localhost:3001/api/stories/${storyId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      })

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned ${response.status}: Not a JSON response`)
      }

      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Story deleted!')
        // Remove from local state
        const newStories = stories.filter(s => s.id !== storyId)
        setStories(newStories)
        // Go to next or previous story
        if (newStories.length === 0) {
          // No more stories, reload
          loadAllStories()
        } else if (currentIndex >= newStories.length) {
          setCurrentIndex(newStories.length - 1)
        }
        setShowMenu(false)
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
      <div className="fixed inset-0 bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 border-4 border-primary/30 border-t-primary rounded-full mx-auto mb-6"
          />
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-white text-xl font-medium"
          >
            Loading Stories
          </motion.p>
        </motion.div>
      </div>
    )
  }

  if (stories.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center overflow-auto pt-20 pb-20">
        {/* Animated background gradient */}
        <motion.div
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)'
            ]
          }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute inset-0 -z-10"
        />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl px-6"
        >
          {/* Icon with animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="relative inline-block mb-8"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-full blur-2xl opacity-50" />
            <div className="relative text-9xl">📹</div>
          </motion.div>
          
          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-6xl font-black mb-4"
          >
            <span className="bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent">
              Stories
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-white/70 text-xl mb-12 font-light"
          >
            Share updates, build hype, grow your community.
          </motion.p>
          
          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-2 gap-4 mb-12 max-w-xl mx-auto"
          >
            <div className="glass-inner rounded-2xl p-5 text-left hover:scale-105 transition-transform">
              <div className="text-3xl mb-2">📱</div>
              <p className="text-white font-bold text-sm">Vertical Stories</p>
              <p className="text-white/50 text-xs">Full screen</p>
            </div>
            <div className="glass-inner rounded-2xl p-5 text-left hover:scale-105 transition-transform">
              <div className="text-3xl mb-2">🔥</div>
              <p className="text-white font-bold text-sm">CTO Access</p>
              <p className="text-white/50 text-xs">90 days posting</p>
            </div>
            <div className="glass-inner rounded-2xl p-5 text-left hover:scale-105 transition-transform">
              <div className="text-3xl mb-2">💬</div>
              <p className="text-white font-bold text-sm">Engage</p>
              <p className="text-white/50 text-xs">Comments & likes</p>
            </div>
            <div className="glass-inner rounded-2xl p-5 text-left hover:scale-105 transition-transform">
              <div className="text-3xl mb-2">📈</div>
              <p className="text-white font-bold text-sm">Go Viral</p>
              <p className="text-white/50 text-xs">Top feed ranking</p>
            </div>
          </motion.div>
          
          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a
              href="/screener"
              className="group relative px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-2xl font-bold text-white text-lg overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              <span className="relative flex items-center justify-center gap-2">
                🔍 Explore Tokens
              </span>
            </a>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-white/30 text-sm mt-8"
          >
            Own the narrative for your token
          </motion.p>
        </motion.div>
      </div>
    )
  }

  const currentStory = stories[currentIndex]
  
  // Safety check: if currentStory is undefined, reset index
  if (!currentStory) {
    console.warn('⚠️ Invalid story index, resetting to 0')
    if (currentIndex !== 0) {
      setCurrentIndex(0)
    }
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-xl">Loading Story...</p>
        </div>
      </div>
    )
  }

  // GRID VIEW (Instagram/X style)
  if (fullscreenStory === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black pt-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            <h1 className="text-4xl font-black text-white mb-2">📹 Stories</h1>
            <p className="text-white/60 text-lg mb-6">Share updates, build hype, grow your community.</p>
            
            {/* Features Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="glass-panel p-3 rounded-xl">
                <div className="text-2xl mb-1">📱</div>
                <p className="text-white font-bold text-xs">Vertical Stories</p>
              </div>
              <div className="glass-panel p-3 rounded-xl">
                <div className="text-2xl mb-1">🔥</div>
                <p className="text-white font-bold text-xs">CTO Access</p>
              </div>
              <div className="glass-panel p-3 rounded-xl">
                <div className="text-2xl mb-1">💬</div>
                <p className="text-white font-bold text-xs">Engage</p>
              </div>
              <div className="glass-panel p-3 rounded-xl">
                <div className="text-2xl mb-1">📈</div>
                <p className="text-white font-bold text-xs">Go Viral</p>
              </div>
            </div>
            
            {/* CTA Buttons */}
            <div className="flex gap-3 justify-center">
              <a href="/screener" className="btn-primary px-6 py-2 text-sm rounded-xl">
                🔍 Explore Tokens
              </a>
            </div>
          </motion.div>

          {/* Stories Feed */}
          <div className="border-t border-white/10 pt-6">

          {/* Single column feed - Latest first */}
          <div className="space-y-6">
            {stories.map((story, index) => {
              return (
                <motion.div
                  key={story.id}
                  onClick={() => {
                    setFullscreenStory(index)
                    setCurrentIndex(index)
                  }}
                  className="glass rounded-3xl overflow-hidden cursor-pointer group relative hover:shadow-2xl hover:shadow-primary/20"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    delay: index * 0.03,
                    type: "spring",
                    stiffness: 260,
                    damping: 20
                  }}
                  whileHover={{ 
                    scale: 1.02,
                    y: -5,
                    transition: { duration: 0.2 }
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Content Preview - Media (Video or Image) */}
                  <div className="relative aspect-video bg-dark-lighter overflow-hidden">
                    {story.videoUrl && (
                      <>
                        {story.mediaType === 'image' ? (
                          <motion.img
                            src={`http://localhost:3001${story.videoUrl}`}
                            alt="Story preview"
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <motion.video
                            src={`http://localhost:3001${story.videoUrl}`}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            muted
                            loop
                            onMouseEnter={(e) => {
                              e.target.play()
                            }}
                            onMouseLeave={(e) => {
                              e.target.pause()
                              e.target.currentTime = 0
                            }}
                          />
                        )}
                        
                        {/* Overlay Text Preview (if exists) */}
                        {story.overlayText && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-white text-sm font-bold text-center px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg max-w-[80%]">
                              {story.overlayText.substring(0, 30)}{story.overlayText.length > 30 ? '...' : ''}
                            </div>
                          </div>
                        )}
                        
                        {/* Gradient overlays */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        {/* Play Icon Overlay - Enhanced */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <motion.div
                            initial={{ scale: 0.8, rotate: 0 }}
                            whileHover={{ 
                              scale: 1.15,
                              rotate: 90,
                              transition: { duration: 0.3 }
                            }}
                            className="w-24 h-24 bg-gradient-to-br from-primary/30 to-secondary/30 backdrop-blur-xl rounded-full flex items-center justify-center border-3 border-white/60 shadow-2xl"
                          >
                            <motion.svg 
                              width="32" 
                              height="32" 
                              viewBox="0 0 24 24" 
                              fill="white"
                              initial={{ x: 0 }}
                              whileHover={{ x: 2 }}
                            >
                              <path d="M8 5v14l11-7z"/>
                            </motion.svg>
                          </motion.div>
                        </div>
                      </>
                    )}

                    {/* Token Badge - Enhanced */}
                    <motion.div 
                      className="absolute top-4 left-4 z-10"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.03 + 0.2 }}
                    >
                      <motion.div 
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/token/${story.tokenHash}`)
                        }}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-primary via-secondary to-primary px-4 py-2 rounded-full text-sm font-bold shadow-2xl backdrop-blur-xl border border-white/20 cursor-pointer"
                        whileHover={{ 
                          scale: 1.05,
                          boxShadow: "0 20px 40px rgba(255, 87, 34, 0.4)"
                        }}
                        style={{
                          backgroundSize: "200% 100%",
                        }}
                      >
                        {story.tokenLogo ? (
                          <img 
                            src={story.tokenLogo} 
                            alt={story.tokenSymbol}
                            className="w-5 h-5 rounded-full object-cover ring-1 ring-white/30"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        ) : (
                          <div 
                            className="w-5 h-5 rounded-full ring-1 ring-white/30 flex items-center justify-center text-[8px] font-bold text-white"
                            style={{
                              background: `linear-gradient(135deg, ${getTokenColor(story.tokenHash).from}, ${getTokenColor(story.tokenHash).to})`
                            }}
                          >
                            {story.tokenSymbol?.substring(0, 2).toUpperCase() || '??'}
                          </div>
                        )}
                        ${story.tokenSymbol}
                      </motion.div>
                    </motion.div>

                    {/* Time Ago Badge */}
                    <motion.div 
                      className="absolute top-16 left-4 bg-black/70 backdrop-blur-xl px-3 py-1 rounded-full text-white/80 text-xs font-medium"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.03 + 0.3 }}
                    >
                      {timeAgo(story.createdAt)}
                    </motion.div>

                    {/* Duration Badge - Enhanced */}
                    {story.duration && (
                      <motion.div 
                        className="absolute top-4 right-4 bg-black/90 backdrop-blur-xl px-3 py-1.5 rounded-full text-white text-xs font-bold border border-white/20 shadow-lg"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: index * 0.03 + 0.25 }}
                      >
                        {Math.floor(story.duration / 60)}:{String(Math.floor(story.duration % 60)).padStart(2, '0')}
                      </motion.div>
                    )}
                  </div>

                  {/* Story Info - Below video */}
                  <div className="p-6 space-y-4">
                    {/* Caption */}
                    <p className="text-white text-base font-medium mb-3 line-clamp-2 leading-relaxed">
                      {story.caption}
                    </p>

                    {/* Stats Bar */}
                    <div className="flex items-center justify-between">
                      {/* Stats - Enhanced with hover effects */}
                      <div className="flex items-center gap-6 text-white/60 text-sm">
                        <motion.span 
                          className="flex items-center gap-2 hover:text-blue-400 transition-colors cursor-pointer"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                          <span className="font-semibold">{(story.viewsCount || 0).toLocaleString()}</span>
                        </motion.span>
                        
                        <motion.span 
                          className="flex items-center gap-2 hover:text-red-400 transition-colors cursor-pointer"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="text-lg">❤️</span>
                          <span className="font-semibold">{story.likesCount || 0}</span>
                        </motion.span>
                        
                        <motion.span 
                          className="flex items-center gap-2 hover:text-green-400 transition-colors cursor-pointer"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="text-lg">💬</span>
                          <span className="font-semibold">{story.commentsCount || 0}</span>
                        </motion.span>
                      </div>
                    </div>

                    {/* Trending Badge - Enhanced with animation */}
                    {(story.viewsCount > 100 || story.likesCount > 10) && (
                      <motion.div 
                        className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 px-4 py-2 rounded-full text-sm font-bold shadow-xl"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ 
                          scale: 1, 
                          rotate: 0,
                        }}
                        transition={{ 
                          type: "spring",
                          stiffness: 260,
                          damping: 20,
                          delay: index * 0.03 + 0.3
                        }}
                        whileHover={{ 
                          scale: 1.05,
                          boxShadow: "0 10px 30px rgba(251, 146, 60, 0.5)"
                        }}
                      >
                        <motion.span
                          animate={{ 
                            rotate: [0, 10, -10, 0],
                            scale: [1, 1.2, 1.2, 1]
                          }}
                          transition={{ 
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        >
                          🔥
                        </motion.span>
                        <span className="text-white">TRENDING</span>
                        <motion.span
                          animate={{ 
                            y: [0, -2, 0],
                          }}
                          transition={{ 
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        >
                          📈
                        </motion.span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
          </div>
        </div>
      </div>
    )
  }

  // FULLSCREEN VIEW (TikTok/Instagram style)

  return (
    <div className="fixed inset-0 bg-black">
      {/* Content Layer - Video */}
      <div className="absolute inset-0">
        {currentStory.videoUrl && (
          <>
            {/* Blurred Background */}
            {currentStory.mediaType === 'image' ? (
              <img
                src={`http://localhost:3001${currentStory.videoUrl}`}
                className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110"
                alt="Background"
              />
            ) : (
              <video
                src={`http://localhost:3001${currentStory.videoUrl}`}
                className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110"
                autoPlay
                loop
                muted
                playsInline
              />
            )}
            
            {/* Main Media (Video or Image) */}
            {currentStory.mediaType === 'image' ? (
              <img
                key={currentStory.id}
                src={`http://localhost:3001${currentStory.videoUrl}`}
                className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                alt="Story"
                onClick={togglePlayPause}
              />
            ) : (
              <video
                ref={videoRef}
                key={currentStory.id}
                src={`http://localhost:3001${currentStory.videoUrl}`}
                className="current-story-video absolute inset-0 w-full h-full object-contain"
                autoPlay
                loop
                playsInline
                preload="auto"
                onClick={togglePlayPause}
              />
            )}

            {/* Overlay Text (if exists) */}
            {currentStory.overlayText && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-white text-3xl md:text-5xl font-bold text-center px-8 py-4 bg-black/40 backdrop-blur-sm rounded-2xl shadow-2xl">
                  {currentStory.overlayText}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* UI Layer - Above everything */}
      <div className="absolute inset-0 pointer-events-none">
        {/* TOP BAR - Progress + Close */}
        <div className="absolute top-0 left-0 right-0 p-4 pt-24 md:pt-20 pointer-events-auto z-[60]">
          <div className="flex items-start gap-3">
            {/* Progress bars */}
            <div className="flex-1 flex gap-1.5">
              {stories.slice(Math.max(0, currentIndex - 2), Math.min(stories.length, currentIndex + 3)).map((_, idx) => {
                const actualIndex = Math.max(0, currentIndex - 2) + idx
                const isActive = actualIndex === currentIndex
                const isPast = actualIndex < currentIndex
                
                return (
                  <div
                    key={actualIndex}
                    className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        isActive 
                          ? 'bg-white shadow-lg' 
                          : isPast
                          ? 'bg-white/50'
                          : 'bg-transparent'
                      }`}
                      style={{
                        width: isActive ? `${progress}%` : isPast ? '100%' : '0%',
                        transition: isActive ? 'width 0.1s linear' : 'width 0.3s ease'
                      }}
                    />
                  </div>
                )
              })}
            </div>
            
            {/* Close Button - Back to Grid */}
            <motion.button
              onClick={(e) => {
                e.stopPropagation()
                setFullscreenStory(null)
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-14 h-14 bg-red-500 backdrop-blur-xl rounded-full flex items-center justify-center shadow-2xl border-3 border-white hover:bg-red-600 z-[60]"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </motion.button>
          </div>
        </div>

        {/* BOTTOM BAR - Single unified control bar */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto z-40">
          <div className="bg-gradient-to-t from-black via-black/95 to-transparent pt-32 pb-6 md:pb-6 pb-20">
            {/* Story Info */}
            <div className="px-5 pb-4 max-w-xl space-y-3">
              {/* Token Badge */}
              <motion.button
                onClick={() => {
                  setFullscreenStory(null)
                  navigate(`/token/${currentStory.tokenHash}`)
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-secondary px-4 py-2 rounded-full shadow-lg"
              >
                {currentStory.tokenLogo ? (
                  <img 
                    src={currentStory.tokenLogo} 
                    alt={currentStory.tokenSymbol}
                    className="w-6 h-6 rounded-full object-cover ring-2 ring-white/30"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                ) : (
                  <div 
                    className="w-6 h-6 rounded-full ring-2 ring-white/30 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${getTokenColor(currentStory.tokenHash).from}, ${getTokenColor(currentStory.tokenHash).to})`
                    }}
                  >
                    {currentStory.tokenSymbol?.substring(0, 2).toUpperCase() || '??'}
                  </div>
                )}
                <span className="text-white font-bold text-sm">${currentStory.tokenSymbol}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
              </motion.button>

              {/* Time Ago */}
              <div className="text-white/60 text-sm font-medium">
                {timeAgo(currentStory.createdAt)}
              </div>

              {/* Caption - Scrollable */}
              <div className="max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent pr-2">
                <p className="text-white text-sm font-medium leading-relaxed">
                  {currentStory.caption}
                </p>
              </div>
            </div>

            {/* Unified Control Bar */}
            <div className="px-4 pb-4 mb-16 md:mb-0">
              <div className="bg-black/60 backdrop-blur-2xl rounded-full border border-white/20 shadow-2xl">
                <div className="flex items-center justify-around px-4 py-3 gap-2">
                  {/* Previous Arrow */}
                  <motion.button
                    onClick={goToPrevious}
                    disabled={currentIndex === 0}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                  </motion.button>

                  {/* Menu (Delete/Report) */}
                  <div className="relative">
                    <motion.button
                      onClick={() => setShowMenu(!showMenu)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
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
                          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/95 backdrop-blur-2xl rounded-xl overflow-hidden shadow-2xl border border-white/20 min-w-[160px] z-50"
                          >
                            {walletAddress === currentStory.userWallet ? (
                              <button
                                onClick={() => deleteStory(currentStory.id)}
                                className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/30 transition-all flex items-center gap-2 text-sm font-bold"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                                Delete
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
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
                                    const response = await fetch(`http://localhost:3001/api/stories/${currentStory.id}/report`, {
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

                  {/* Like */}
                  <motion.button
                    onClick={() => toggleLike(currentStory.id)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex flex-col items-center gap-0.5 min-w-[44px]"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={currentStory.isLiked ? "#ef4444" : "white"}>
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </div>
                    <span className="text-white text-[10px] font-bold">{currentStory.likesCount || 0}</span>
                  </motion.button>

                  {/* Comments */}
                  <motion.button
                    onClick={() => setShowComments(!showComments)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex flex-col items-center gap-0.5 min-w-[44px]"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                      </svg>
                    </div>
                    <span className="text-white text-[10px] font-bold">{currentStory.commentsCount || 0}</span>
                  </motion.button>

                  {/* Share */}
                  <motion.button
                    onClick={() => shareStory(currentStory.id)}
                    whileHover={{ scale: 1.1, rotate: 15 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex flex-col items-center gap-0.5 min-w-[44px]"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      currentStory.hasShared 
                        ? 'bg-green-500 shadow-lg shadow-green-500/50' 
                        : 'bg-white/10 hover:bg-green-500/20'
                    }`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                      </svg>
                    </div>
                    <span className={`text-[10px] font-bold transition-colors ${
                      currentStory.hasShared ? 'text-green-400' : 'text-white'
                    }`}>{currentStory.sharesCount || 0}</span>
                  </motion.button>

                  {/* Views */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex flex-col items-center gap-0.5 min-w-[44px]"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                      </svg>
                    </div>
                    <span className="text-white text-[10px] font-bold">{(currentStory.views || 0).toLocaleString()}</span>
                  </motion.div>

                  {/* Trending Badge (if views growing) */}
                  {currentStory.viewsTrend === 'up' && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="flex flex-col items-center gap-0.5 min-w-[44px]"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                        </svg>
                      </div>
                      <span className="text-yellow-400 text-[10px] font-bold">📈</span>
                    </motion.div>
                  )}

                  {/* Next Arrow */}
                  <motion.button
                    onClick={goToNext}
                    disabled={currentIndex === stories.length - 1}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                    </svg>
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Play/Pause Indicator */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <div className="w-20 h-20 bg-black/80 backdrop-blur-xl rounded-full flex items-center justify-center shadow-2xl border border-white/40">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comments Drawer */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl rounded-t-3xl max-h-[70vh] overflow-hidden z-[60] shadow-2xl border-t border-white/10"
          >
            <div className="p-6 pb-24 md:pb-6">
              {/* Drag Handle */}
              <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mb-4" />
              
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Comments ({comments.length})</h3>
                <button
                  onClick={() => setShowComments(false)}
                  className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
                >
                  <span className="text-white text-xl">✕</span>
                </button>
              </div>

              {/* Comments List */}
              <div className="space-y-4 max-h-64 overflow-y-auto mb-6 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {comments.length === 0 ? (
                  <p className="text-white/60 text-center py-12">No comments yet. Be the first!</p>
                ) : (
                  comments.map((comment, idx) => {
                    // Get user profile for this comment
                    // Get user profile - current user from localStorage, others from state
                    let profile = null
                    if (comment.userWallet === walletAddress) {
                      // Use wallet-specific key for current user
                      const profileKey = `userProfile_${walletAddress}`
                      const currentUserProfile = localStorage.getItem(profileKey)
                      profile = currentUserProfile ? JSON.parse(currentUserProfile) : null
                    } else {
                      // Get from backend-loaded profiles (always fresh)
                      profile = userProfiles[comment.userWallet] || null
                    }
                    
                    const displayName = profile?.name || `${comment.userWallet.substring(0, 8)}...`
                    const avatarUrl = profile?.avatar || '/images/user.png'
                    
                    return (
                      <div key={idx} className="flex gap-3 animate-fadeIn">
                        {/* User Avatar - Default to user.png if no avatar */}
                        <UserAvatar
                          userAvatar={profile?.avatar}
                          userName={profile?.name}
                          userWallet={comment.userWallet}
                          size="md"
                          className="border-2 border-primary/30"
                        />
                        
                        <div className="flex-1 bg-white/5 rounded-2xl p-3">
                          <p className="text-white/80 text-sm font-medium mb-1">
                            {displayName}
                          </p>
                          <p className="text-white">{comment.text}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Comment Input */}
              {walletAddress ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addComment(currentStory.id)}
                    placeholder="Add a comment..."
                    className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary focus:bg-white/15 transition-all"
                  />
                  <button
                    onClick={() => addComment(currentStory.id)}
                    disabled={!commentText.trim()}
                    className="btn-primary px-6 py-3 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all shadow-lg"
                  >
                    Post
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-white/60 mb-3">Connect wallet to comment</p>
                  <button className="btn-primary px-6 py-2 rounded-xl text-sm">
                    Connect Wallet
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}