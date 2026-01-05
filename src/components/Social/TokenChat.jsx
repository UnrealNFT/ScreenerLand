import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaPaperPlane, FaUsers, FaTimes, FaComments } from 'react-icons/fa'
import UserAvatar from '../User/UserAvatar'
import { API_URL } from '../../config'
import { getMemberCount, subscribeMemberCount, updateMemberCount } from '../../services/chat.service'
import { 
  connectWebSocket, 
  disconnectWebSocket, 
  joinRoom, 
  leaveRoom, 
  sendMessage as wsSendMessage,
  onMessage,
  onStatusChange,
  getStatus
} from '../../services/websocket.service'
import toast from 'react-hot-toast'

export default function TokenChat({ tokenHash, tokenName, tokenSymbol, tokenLogo, walletAddress }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const messagesEndRef = useRef(null)
  const messageProcessedRef = useRef(new Set()) // Use ref to persist across renders

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Reset state when token changes (MUST run before auto-join)
  useEffect(() => {
    console.log('🔄 Token changed, resetting chat state')
    setIsJoined(false)
    setMessages([])
    
    // Get initial member count
    const count = getMemberCount(tokenHash)
    console.log(`💬 TokenChat: Initial member count for ${tokenHash?.substring(0, 8) || 'unknown'}...: ${count}`)
    setUserCount(count)
    
    // Subscribe to real-time updates
    const unsubscribe = subscribeMemberCount(tokenHash, (newCount) => {
      console.log(`🔄 TokenChat: Member count updated to ${newCount}`)
      setUserCount(newCount)
    })
    
    return () => {
      unsubscribe()
    }
  }, [tokenHash])

  // Auto-join when wallet is connected and WebSocket is ready
  useEffect(() => {
    if (walletAddress && wsStatus === 'connected' && tokenHash && !isJoined) {
      console.log('🚀 Auto-joining chat (wallet connected, WebSocket ready)')
      const success = joinRoom(tokenHash, walletAddress, tokenName || 'Token')
      if (!success) {
        console.warn('⚠️ Auto-join failed, will retry when status changes')
      }
    }
  }, [walletAddress, wsStatus, tokenHash, isJoined, tokenName])

  // Connect to WebSocket on mount
  useEffect(() => {
    console.log('🔌 Connecting to WebSocket...')
    connectWebSocket()
    
    // Subscribe to status changes
    const unsubscribeStatus = onStatusChange((status) => {
      console.log('🔌 WebSocket status:', status)
      setWsStatus(status)
    })
    use ref to track processed messages
    const unsubscribeMessages = onMessage(async (msg) => {
      // Skip duplicate messages
      const msgKey = `${msg.type}-${msg.id || msg.timestamp}`
      if (messageProcessedRef.current.has(msgKey)) {
        console.log('⏭️ Skipping duplicate message:', msgKey)
        return
      }
      messageProcessedRef.current
      messageProcessed.add(msgKey)
      
      console.log('📩 Received WebSocket message:', msg.type)
      
      switch (msg.type) {
        case 'joined':
          console.log('✅ Successfully joined room')
          setIsJoined(true)
          toast.success(msg.message)
          
          // Save to joinedCommunities in localStorage
          try {
            console.log('💾 Attempting to save community:', { tokenHash, tokenName, tokenSymbol, tokenLogo })
            const saved = localStorage.getItem('joinedCommunities')
            const communities = saved ? JSON.parse(saved) : []
            
            // Check if already joined
            const exists = communities.find(c => c.tokenHash === tokenHash)
            if (!exists) {
              communities.push({
                tokenHash,
                tokenName,
                tokenSymbol,
                tokenLogo,
                joinedAt: Date.now()
              })
              localStorage.setItem('joinedCommunities', JSON.stringify(communities))
              console.log('✅ Saved community to localStorage:', { tokenHash, tokenName, tokenSymbol })
            } else {
              console.log('ℹ️ Community already exists in localStorage')
            }
          } catch (error) {
            console.error('❌ Failed to save community:', error)
          }
          
          // Load message history if provided
          if (msg.history && msg.history.length > 0) {
            console.log(`📚 Loading ${msg.history.length} messages from history`)
            console.log('📋 Raw history data:', msg.history)
            const historyMessages = await Promise.all(msg.history.map(async h => {
              console.log(`🔍 Processing history message from: ${h.walletAddress}`)
              let userName = formatWallet(h.walletAddress)
              let avatar = null
              try {
                const profileRes = await fetch(`${API_URL}/api/profile/${h.walletAddress}`)
                console.log(`📡 Profile API response status: ${profileRes.status}`)
                if (profileRes.ok) {
                  const profileData = await profileRes.json()
                  console.log(`👤 Profile loaded:`, profileData)
                  // Extract the nested profile object
                  const profile = profileData.profile || profileData
                  console.log(`🔍 Extracted profile object:`, profile)
                  console.log(`🔍 profile.name: "${profile.name}", profile.avatar: "${profile.avatar}"`)
                  if (profile.name) userName = profile.name
                  if (profile.avatar) avatar = profile.avatar
                  console.log(`✅ userName: ${userName}, avatar: ${avatar}`)
                }
              } catch (error) {
                console.error('Failed to load profile:', error)
              }
              const msgObj = {
                id: h.id,
                walletAddress: h.walletAddress,
                wallet: h.walletAddress,
                walletShort: formatWallet(h.walletAddress),
                userName,
                avatar,
                text: h.text,
                timestamp: new Date(h.timestamp)
              }
              console.log(`📦 Final message object:`, msgObj)
              return msgObj
            }))
            console.log('📨 Setting messages:', historyMessages)
            setMessages(historyMessages)
            console.log('✅ History loaded with profiles and avatars')
          }
          break
          
        case 'user_joined':
          // Another user joined
          setMessages(prev => [...prev, {
            id: `system-${Date.now()}`,
            type: 'system',
            text: `${formatWallet(msg.walletAddress)} joined the chat`,
            timestamp: new Date(msg.timestamp)
          }])
          break
          
        case 'user_left':
          // Another user left
          if (msg.walletAddress) {
            setMessages(prev => [...prev, {
              id: `system-${Date.now()}`,
              type: 'system',
              text: `${formatWallet(msg.walletAddress)} left the chat`,
              timestamp: new Date(msg.timestamp)
            }])
          }
          break
          
        case 'member_count':
          // Update member count
          updateMemberCount(tokenHash, msg.count)
          setUserCount(msg.count)
          break
          
        case 'message':
          // New chat message
          let userName = formatWallet(msg.walletAddress)
          let avatar = null
          try {
            const profileRes = await fetch(`${API_URL}/api/profile/${msg.walletAddress}`)
            if (profileRes.ok) {
              const profileData = await profileRes.json()
              console.log(`🔍 Real-time profile loaded:`, profileData)
              // Extract the nested profile object
              const profile = profileData.profile || profileData
              console.log(`🔍 Extracted profile:`, profile)
              console.log(`🔍 profile.name: "${profile.name}", profile.avatar: "${profile.avatar}"`)
              if (profile.name) userName = profile.name
              if (profile.avatar) avatar = profile.avatar
              console.log(`✅ Real-time userName: ${userName}, avatar: ${avatar}`)
            }
          } catch (error) {
            console.error('Failed to load profile:', error)
          }
          
          setMessages(prev => [...prev, {
            id: msg.id,
            walletAddress: msg.walletAddress,
            wallet: msg.walletAddress, // For compatibility
            walletShort: formatWallet(msg.walletAddress), // Add formatted wallet
            userName,
            avatar,
            text: msg.text,
            timestamp: new Date(msg.timestamp)
          }])
          break
          
        case 'error':
          toast.error(msg.message)
          break
      }
    })
    
    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up WebSocket connection')
      messageProcessed.clear() // Clear processed messages on cleanup
      unsubscribeStatuRef.currents()
      unsubscribeMessages()
      
      // IMPORTANT: Leave room if joined
      if (isJoined && tokenHash) {
        console.log('👋 Leaving room on cleanup:', tokenHash)
        leaveRoom()
        setIsJoined(false) // Reset state so auto-join can work when we return
      }
      
      // Don't disconnect WebSocket - keep it for other pages
    }
  }, [tokenHash, isJoined]) // Need isJoined to properly cleanup
  


  const handleLeaveChat = () => {
    console.log('👋 User manually leaving chat')
    
    // Send leave message to server
    if (isJoined && tokenHash) {
      leaveRoom()
    }
    
    // Update local state
    setIsJoined(false)
    setMessages([])
    
    toast('Left the chat', { icon: 'ℹ️' })
  }

  const handleJoinChat = () => {
    if (!walletAddress) {
      toast.error('Connect your wallet to join the chat')
      return
    }
    
    // Force reconnect WebSocket if not connected
    const status = getStatus()
    console.log('🔌 Current WebSocket status:', status)
    
    if (status !== 'connected') {
      console.log('🔄 WebSocket not connected, forcing reconnect...')
      connectWebSocket()
      
      toast.loading('Connecting to chat server...', { duration: 8000 })
      
      // Wait for connection and retry (15 attempts x 1 second = 15 seconds max)
      let retryCount = 0
      const retryInterval = setInterval(() => {
        const newStatus = getStatus()
        console.log(`🔄 Retry ${retryCount + 1}/15: WebSocket status = ${newStatus}`)
        
        if (newStatus === 'connected') {
          clearInterval(retryInterval)
          console.log('✅ WebSocket connected! Joining room...')
          
          const success = joinRoom(tokenHash, walletAddress, tokenName || 'Token')
          if (success) {
            toast.success('Connected!')
          } else {
            toast.error('Failed to join. Please try again.')
          }
        } else if (retryCount >= 15) {
          clearInterval(retryInterval)
          toast.error('Connection timeout. Please refresh the page.')
        }
        
        retryCount++
      }, 1000) // Check every 1 second instead of 500ms
      
      return
    }
    
    console.log(`🚪 Joining room: ${tokenHash}`)
    const success = joinRoom(tokenHash, walletAddress, tokenName || 'Token')
    
    if (!success) {
      toast.error('Failed to join chat. Please try again.')
    }
  }

  const handleSendMessage = () => {
    console.log('🔍 handleSendMessage - State:', {
      walletAddress: walletAddress ? walletAddress.substring(0, 10) + '...' : 'null',
      isJoined,
      wsStatus,
      hasMessage: !!newMessage.trim()
    })
    
    if (!walletAddress || !isJoined) {
      console.warn('❌ Not joined:', { walletAddress: !!walletAddress, isJoined })
      toast.error('Please join the chat first')
      return
    }

    if (!newMessage.trim()) return
    
    if (wsStatus !== 'connected') {
      console.error('❌ WebSocket not connected! Status:', wsStatus)
      toast.error('Not connected to chat server')
      return
    }

    console.log('📤 Sending message:', newMessage)
    const success = wsSendMessage(tokenHash, walletAddress, newMessage.trim())
    
    if (success) {
      setNewMessage('')
    } else {
      toast.error('Failed to send message')
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatWallet = (wallet) => {
    if (!wallet) return ''
    return `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`
  }

  const formatTime = (date) => {
    const now = new Date()
    const diff = now - new Date(date)
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    
    return new Date(date).toLocaleDateString()
  }

  if (!isJoined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-8 text-center"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center mx-auto mb-4">
          <FaComments className="text-3xl" />
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-2">
          Join {tokenName} Community
        </h3>
        
        <p className="text-white/60 mb-6">
          Connect with holders, discuss price action, and share memes in real-time
        </p>
        
        <div className="flex items-center justify-center gap-2 mb-6 text-white/40">
          <FaUsers />
          <span>{userCount} members online</span>
        </div>
        
        <button
          onClick={handleJoinChat}
          className="btn-primary px-8 py-3 text-lg font-bold"
          disabled={!walletAddress}
        >
          {walletAddress ? '🚀 Join Chat' : '🔒 Connect Wallet First'}
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel rounded-2xl overflow-hidden"
    >
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
              <FaComments />
            </div>
            <div>
              <h3 className="text-white font-bold">{tokenName} Chat</h3>
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>{userCount} online</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleLeaveChat}
            className="text-white/60 hover:text-red-500 transition-colors"
            title="Leave chat"
          >
            <FaTimes />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-dark-panel/50">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={msg.type === 'system' ? 'text-center' : ''}
            >
              {msg.type === 'system' ? (
                <p className="text-white/40 text-sm italic">{msg.text}</p>
              ) : (
                <div className={`flex gap-3 ${msg.wallet === walletAddress ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <UserAvatar
                    userAvatar={msg.avatar}
                    userName={msg.userName}
                    userWallet={msg.wallet}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  
                  <div className={`flex flex-col ${msg.wallet === walletAddress ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white/60 text-xs">
                        {msg.wallet === walletAddress ? 'You' : (msg.userName || msg.walletShort)}
                      </span>
                      <span className="text-white/40 text-xs">{formatTime(msg.timestamp)}</span>
                    </div>
                    
                    <div className={`rounded-2xl px-4 py-2 ${
                      msg.wallet === walletAddress
                        ? 'bg-gradient-to-br from-primary to-secondary text-white'
                        : 'bg-white/5 text-white/90 border border-white/10'
                    }`}>
                      <p className="break-words">{msg.text}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-dark-panel border-t border-white/10">
        <div className="flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="btn-primary px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
