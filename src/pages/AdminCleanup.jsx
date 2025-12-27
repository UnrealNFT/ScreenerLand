import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'

export default function AdminCleanup() {
  const [activeTab, setActiveTab] = useState('cto') // 'cto' | 'stories' | 'reports' | 'chat' | 'community'
  const [tokenHash, setTokenHash] = useState('de1ecc0d030cb2fba62098db5c53ca1b28a9a8e4138dea47ef42f6b285bda423')
  const [ownerWallet, setOwnerWallet] = useState('0203d7710216e4967ee0873c6ad05e5605c7ac725cafe2ee1829cc6705badf477445')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [holders, setHolders] = useState([])
  const [allCTO, setAllCTO] = useState([])
  const [tokenInfo, setTokenInfo] = useState({}) // Cache token info
  const [stories, setStories] = useState([])
  const [selectedToken, setSelectedToken] = useState('')
  const [allStories, setAllStories] = useState([])
  const [reports, setReports] = useState([])
  const [reportFilter, setReportFilter] = useState('all') // 'all' | 'pending' | 'approved' | 'rejected'
  const [chatMessages, setChatMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [adminName, setAdminName] = useState(localStorage.getItem('adminName') || 'Admin')
  const [communityMessages, setCommunityMessages] = useState([])
  const [selectedMessages, setSelectedMessages] = useState(new Set())
  const [resetWallet, setResetWallet] = useState('')
  const [resetResult, setResetResult] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])
  const [profilesLoading, setProfilesLoading] = useState(false)

  useEffect(() => {
    // Load chat history from localStorage
    const savedChat = localStorage.getItem('adminChat')
    if (savedChat) {
      setChatMessages(JSON.parse(savedChat))
    }
  }, [])

  const sendChatMessage = () => {
    if (!newMessage.trim()) return

    const message = {
      id: Date.now(),
      admin: adminName,
      text: newMessage,
      timestamp: new Date().toISOString()
    }

    const updatedMessages = [...chatMessages, message]
    setChatMessages(updatedMessages)
    localStorage.setItem('adminChat', JSON.stringify(updatedMessages))
    setNewMessage('')
    
    // Auto-scroll to bottom
    setTimeout(() => {
      const chatContainer = document.getElementById('chat-messages')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }, 100)
  }

  const clearChat = () => {
    if (!confirm('Clear all chat history?')) return
    setChatMessages([])
    localStorage.removeItem('adminChat')
  }

  // Fetch token info from API
  const fetchTokenInfo = async (hash) => {
    if (tokenInfo[hash]) return tokenInfo[hash]
    
    try {
      const cleanHash = hash.replace(/^hash-/, '')
      
      // Try cspr.cloud contract-packages endpoint
      const response = await fetch(`${API_URL}/api/cspr-cloud/contract-packages/${cleanHash}`)
      const data = await response.json()
      
      if (data?.data) {
        const info = {
          name: data.data.metadata?.name || data.data.name || 'Unknown',
          logo: data.data.metadata?.logo || data.data.icon_url || '',
          symbol: data.data.metadata?.symbol || ''
        }
        setTokenInfo(prev => ({ ...prev, [hash]: info }))
        return info
      }
    } catch (error) {
      console.error('Error fetching token info:', error)
    }
    
    return { name: hash.substring(0, 8) + '...', logo: '', symbol: '?' }
  }

  const checkAllCTO = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/all-cto`)
      const data = await response.json()
      
      if (data.success) {
        setAllCTO(data.entries)
        setResult({ type: 'info', message: `Found ${data.count} total CTO entries in database` })
        
        // Fetch token info for all entries
        for (const entry of data.entries) {
          await fetchTokenInfo(entry.token_hash)
        }
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const loadStories = async (hash) => {
    setLoading(true)
    setSelectedToken(hash)
    try {
      const response = await fetch(`${API_URL}/api/stories/token/${hash}?limit=100`)
      const data = await response.json()
      
      if (data.success) {
        setStories(data.stories)
        setResult({ type: 'info', message: `Found ${data.stories.length} stories for this token` })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const loadAllStories = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/stories?limit=100`)
      const data = await response.json()
      
      if (data.success) {
        setAllStories(data.stories)
        setResult({ type: 'info', message: `Found ${data.stories.length} total stories` })
        
        // Fetch token info for each unique token
        const uniqueTokens = [...new Set(data.stories.map(s => s.tokenHash).filter(Boolean))]
        for (const hash of uniqueTokens) {
          await fetchTokenInfo(hash)
        }
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const loadReports = async (status = null) => {
    setLoading(true)
    try {
      const url = status && status !== 'all' 
        ? `${API_URL}/api/admin/reports?status=${status}`
        : `${API_URL}/api/admin/reports`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.success) {
        setReports(data.reports)
        setResult({ type: 'info', message: `Found ${data.reports.length} reports` })
        
        // Fetch token info for each unique token
        const uniqueTokens = [...new Set(data.reports.map(r => r.token_hash).filter(Boolean))]
        for (const hash of uniqueTokens) {
          await fetchTokenInfo(hash)
        }
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const resolveReport = async (reportId, action) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: adminName, action })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({ type: 'success', message: `✅ Report ${action}` })
        await loadReports(reportFilter === 'all' ? null : reportFilter)
      } else {
        setResult({ type: 'error', message: data.error })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const loadAllProfiles = async () => {
    setProfilesLoading(true)
    setResetResult(null)
    try {
      const adminPassword = prompt('Enter admin password:')
      if (!adminPassword) {
        setProfilesLoading(false)
        return
      }

      const response = await fetch(`${API_URL}/api/admin/profiles?limit=100`, {
        headers: {
          'X-Admin-Password': adminPassword
        }
      })
      
      console.log('🔍 Response status:', response.status, response.ok)
      const data = await response.json()
      console.log('🔍 Full API response data:', JSON.stringify(data, null, 2))
      console.log('🔍 data.profiles:', data.profiles)
      console.log('🔍 Array.isArray(data.profiles):', Array.isArray(data.profiles))
      
      if (response.ok && data.success) {
        console.log('✅ Profiles loaded:', data.profiles)
        setAllProfiles(data.profiles || [])
        setResetResult({ type: 'info', message: `Found ${data.profiles?.length || 0} user profiles` })
      } else {
        console.error('❌ Failed to load profiles:', data)
        setResetResult({ type: 'error', message: data.error || 'Failed to load profiles' })
      }
    } catch (error) {
      setResetResult({ type: 'error', message: error.message })
    }
    setProfilesLoading(false)
  }

  const loadCommunityMessages = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/community/messages?limit=100`)
      const data = await response.json()
      
      if (data.success) {
        setCommunityMessages(data.messages)
        setResult({ type: 'info', message: `Found ${data.messages.length} community messages` })
        
        // Fetch token info for each unique token
        const uniqueTokens = [...new Set(data.messages.map(m => m.tokenHash).filter(Boolean))]
        for (const hash of uniqueTokens) {
          await fetchTokenInfo(hash)
        }
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const deleteCommunityMessage = async (messageId) => {
    if (!confirm('Delete this community message?')) return
    
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/community/messages/${messageId}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({ type: 'success', message: '✅ Message deleted' })
        await loadCommunityMessages()
      } else {
        setResult({ type: 'error', message: data.error })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const deleteSelectedMessages = async () => {
    if (selectedMessages.size === 0) {
      alert('No messages selected')
      return
    }
    
    if (!confirm(`Delete ${selectedMessages.size} messages?`)) return
    
    setLoading(true)
    try {
      const promises = Array. from(selectedMessages).map(id =>
        fetch(`${API_URL}/api/community/messages/${id}`, { method: 'DELETE' })
      )
      
      await Promise.all(promises)
      
      setResult({ type: 'success', message: `✅ Deleted ${selectedMessages.size} messages` })
      setSelectedMessages(new Set())
      await loadCommunityMessages()
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const toggleMessageSelection = (messageId) => {
    const newSelected = new Set(selectedMessages)
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId)
    } else {
      newSelected.add(messageId)
    }
    setSelectedMessages(newSelected)
  }

  const selectAllMessages = () => {
    setSelectedMessages(new Set(communityMessages.map(m => m.id)))
  }

  const deselectAllMessages = () => {
    setSelectedMessages(new Set())
  }

  const deleteStory = async (storyId) => {
    if (!confirm('Delete this story? This cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/stories/${storyId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminOverride: true })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({ type: 'success', message: '✅ Story deleted' })
        // Refresh stories
        await loadStories(selectedToken)
      } else {
        setResult({ type: 'error', message: data.error })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const checkHolders = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/stories/cto-holders/${tokenHash}`)
      const data = await response.json()
      
      if (data.success) {
        setHolders(data.holders)
        setResult({ type: 'info', message: `Found ${data.count} CTO entries` })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const revokeOne = async (tokenHashToRevoke, walletToRevoke) => {
    if (!confirm(`Remove CTO access for:\n${walletToRevoke}?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/stories/cto-access/${tokenHashToRevoke}/${walletToRevoke}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({ 
          type: 'success', 
          message: `✅ ${data.message}` 
        })
        // Refresh ALL CTO list
        await checkAllCTO()
      } else {
        setResult({ type: 'error', message: data.error })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  const cleanDuplicates = async () => {
    if (!confirm(`Are you sure? This will remove all CTO entries and keep only:\n${ownerWallet}`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/clean-cto-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenHash, ownerWallet })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({ 
          type: 'success', 
          message: `✅ ${data.message}` 
        })
        // Refresh holders list
        await checkHolders()
      } else {
        setResult({ type: 'error', message: data.error })
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">🔐 Admin Dashboard</h1>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('cto')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'cto'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            🔐 CTO Management
          </button>
          <button
            onClick={() => {
              setActiveTab('stories')
              if (allStories.length === 0) loadAllStories()
            }}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'stories'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            📹 Story Management
          </button>
          <button
            onClick={() => {
              setActiveTab('reports')
              if (reports.length === 0) loadReports()
            }}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'reports'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            🚨 Reports
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'chat'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            💬 Admin Chat
          </button>
          <button
            onClick={() => {
              setActiveTab('community')
              if (communityMessages.length === 0) loadCommunityMessages()
            }}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'community'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            📣 Community Messages
          </button>
          <button
            onClick={() => {
              setActiveTab('users')
              setResult(null) // Clear global result message
              if (allProfiles.length === 0) loadAllProfiles()
            }}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'users'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            👤 User Profiles
          </button>
        </div>

        {result && (
          <div className={`p-4 rounded-lg mb-6 ${
            result.type === 'success' ? 'bg-green-500/20 border border-green-500' :
            result.type === 'error' ? 'bg-red-500/20 border border-red-500' :
            'bg-blue-500/20 border border-blue-500'
          }`}>
            <p className="text-white">{result.message}</p>
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'cto' && (
            <motion.div
              key="cto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* CTO Management Tab */}
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">🔍 Search CTO Entries</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Token Hash (Package Hash)</label>
                      <input
                        type="text"
                        value={tokenHash}
                        onChange={(e) => setTokenHash(e.target.value)}
                        className="w-full px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white"
                        placeholder="de1ecc0d..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Owner Wallet (Public Key)</label>
                      <input
                        type="text"
                        value={ownerWallet}
                        onChange={(e) => setOwnerWallet(e.target.value)}
                        className="w-full px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white"
                        placeholder="0203d771..."
                      />
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={checkHolders}
                        disabled={loading}
                        className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                      >
                        {loading ? '⏳ Loading...' : '🔍 Check This Token'}
                      </button>
                      
                      <button
                        onClick={checkAllCTO}
                        disabled={loading}
                        className="flex-1 px-6 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                      >
                        {loading ? '⏳ Loading...' : '📊 Show ALL CTO'}
                      </button>
                    </div>
                  </div>
                </div>

                {holders.length > 0 && (
                  <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                    <h2 className="text-2xl font-bold text-white mb-4">CTO Holders for This Token ({holders.length})</h2>
                    <div className="space-y-3">
                      {holders.map((holder, index) => (
                        <div key={index} className="bg-black/40 p-4 rounded-lg border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-white font-mono text-sm break-all">{holder.wallet_address}</p>
                              <p className="text-white/40 text-xs mt-1">
                                Granted: {new Date(holder.granted_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                holder.wallet_address.toLowerCase() === ownerWallet.toLowerCase()
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {holder.wallet_address.toLowerCase() === ownerWallet.toLowerCase() ? '✅ OWNER' : '⚠️ EXTRA'}
                              </div>
                              <button
                                onClick={() => revokeOne(tokenHash, holder.wallet_address)}
                                disabled={loading}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded text-xs font-bold transition-all"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {allCTO.length > 0 && (
                  <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                    <h2 className="text-2xl font-bold text-white mb-4">ALL CTO Entries ({allCTO.length})</h2>
                    <div className="space-y-3">
                      {allCTO.map((entry, index) => {
                        const info = tokenInfo[entry.token_hash] || { name: 'Loading...', logo: '', symbol: '' }
                        return (
                          <div key={index} className="bg-black/40 p-4 rounded-lg border border-white/10">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0">
                                {info.logo ? (
                                  <img src={info.logo} alt={info.name} className="w-12 h-12 rounded-full" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span className="text-white font-bold">{info.symbol?.[0] || '?'}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-white font-bold">{info.name}</span>
                                  <span className="text-white/60 text-sm">({info.symbol})</span>
                                </div>
                                <p className="text-white/60 font-mono text-xs break-all mb-1">
                                  Token: {entry.token_hash}
                                </p>
                                <p className="text-white font-mono text-sm break-all mb-1">
                                  Wallet: {entry.wallet_address}
                                </p>
                                <p className="text-white/40 text-xs">
                                  Granted: {new Date(entry.granted_at).toLocaleString()} | 
                                  Paid: {entry.paid_amount} CSPR
                                </p>
                              </div>
                              
                              <button
                                onClick={() => revokeOne(entry.token_hash, entry.wallet_address)}
                                disabled={loading}
                                className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded font-bold transition-all"
                              >
                                🗑️ Revoke
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'stories' && (
            <motion.div
              key="stories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Story Management Tab */}
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white">📹 All Stories</h2>
                    <button
                      onClick={loadAllStories}
                      disabled={loading}
                      className="px-6 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                    >
                      {loading ? '⏳ Loading...' : '🔄 Refresh'}
                    </button>
                  </div>
                  
                  {allStories.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allStories.map((story) => {
                        const storyTokenInfo = tokenInfo[story.tokenHash] || {}
                        return (
                          <div key={story.id} className="bg-black/40 rounded-lg border border-white/10 overflow-hidden">
                            {story.mediaType === 'video' ? (
                              <video
                                src={`${API_URL}${story.videoUrl}`}
                                className="w-full aspect-video object-cover"
                                muted
                              />
                            ) : (
                              <img
                                src={`${API_URL}${story.videoUrl}`}
                                alt="Story"
                                className="w-full aspect-video object-cover"
                              />
                            )}
                            
                            <div className="p-3">
                              <div className="flex items-center gap-2 mb-2">
                                {storyTokenInfo.logo ? (
                                  <img src={storyTokenInfo.logo} alt="" className="w-6 h-6 rounded-full" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-purple-500" />
                                )}
                                <span className="text-white font-bold text-sm">
                                  {storyTokenInfo.name || story.tokenHash?.substring(0, 8) + '...'}
                                </span>
                              </div>
                              <p className="text-white text-sm mb-2 line-clamp-2">{story.caption}</p>
                              <p className="text-white/40 text-xs mb-2">
                                By: {story.userName || story.userWallet?.substring(0, 10) + '...'}
                              </p>
                              <p className="text-white/40 text-xs mb-2">
                                {new Date(story.createdAt).toLocaleString()}
                              </p>
                              <div className="flex items-center gap-2 text-white/60 text-xs mb-3">
                                <span>👁️ {story.views}</span>
                                <span>❤️ {story.likes}</span>
                                <span>💬 {story.comments}</span>
                                <span>🔄 {story.shares}</span>
                              </div>
                              <button
                                onClick={() => {
                                  if (confirm('Delete this story?')) {
                                    deleteStory(story.id).then(() => loadAllStories())
                                  }
                                }}
                                disabled={loading}
                                className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded font-bold transition-all"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-white/60 text-center py-8">No stories loaded. Click Refresh to load all stories.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Reports Tab */}
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white">🚨 User Reports</h2>
                    <div className="flex gap-2">
                      <select
                        value={reportFilter}
                        onChange={(e) => {
                          setReportFilter(e.target.value)
                          loadReports(e.target.value === 'all' ? null : e.target.value)
                        }}
                        className="px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white"
                      >
                        <option value="all">All Reports</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button
                        onClick={() => loadReports(reportFilter === 'all' ? null : reportFilter)}
                        disabled={loading}
                        className="px-6 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                      >
                        {loading ? '⏳ Loading...' : '🔄 Refresh'}
                      </button>
                    </div>
                  </div>
                  
                  {reports.length > 0 ? (
                    <div className="space-y-4">
                      {reports.map((report) => {
                        const reportTokenInfo = tokenInfo[report.token_hash] || {}
                        return (
                          <div key={report.id} className="bg-black/40 rounded-lg border border-white/10 p-4">
                            <div className="flex gap-4">
                              {/* Story Preview */}
                              <div className="flex-shrink-0 w-32">
                                {report.media_type === 'video' ? (
                                  <video
                                    src={`${API_URL}${report.video_url}`}
                                    className="w-full aspect-video object-cover rounded"
                                    muted
                                  />
                                ) : (
                                  <img
                                    src={`${API_URL}${report.video_url}`}
                                    alt="Report"
                                    className="w-full aspect-video object-cover rounded"
                                  />
                                )}
                              </div>
                              
                              {/* Report Info */}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {reportTokenInfo.logo ? (
                                    <img src={reportTokenInfo.logo} alt="" className="w-6 h-6 rounded-full" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-purple-500" />
                                  )}
                                  <span className="text-white font-bold">
                                    {reportTokenInfo.name || report.token_hash?.substring(0, 8) + '...'}
                                  </span>
                                </div>
                                <p className="text-white/60 text-sm mb-2">
                                  Reported by: {report.reporter_wallet?.substring(0, 10)}...
                                </p>
                                <p className="text-white/80 text-sm mb-2">
                                  Reason: <span className="text-yellow-400">{report.reason}</span>
                                </p>
                                <p className="text-white/40 text-xs">
                                  {new Date(report.created_at).toLocaleString()}
                                </p>
                              </div>
                              
                              {/* Actions */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this story?')) {
                                      deleteStory(report.story_id).then(() => loadReports())
                                    }
                                  }}
                                  disabled={loading}
                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded font-bold transition-all"
                                >
                                  🗑️ Delete Story
                                </button>
                                <button
                                  onClick={() => {
                                    dismissReport(report.id).then(() => loadReports())
                                  }}
                                  disabled={loading}
                                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white rounded font-bold transition-all"
                                >
                                  ✓ Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-white/60 text-center py-8">No reports. All clear!</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Admin Chat Tab */}
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">💬 Admin Team Chat</h2>
                  <button
                    onClick={clearChat}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all text-sm"
                  >
                    🗑️ Clear Chat
                  </button>
                </div>

                <div className="mb-4">
                  <label className="block text-white/60 text-sm mb-2">Your Name</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => {
                      setAdminName(e.target.value)
                      localStorage.setItem('adminName', e.target.value)
                    }}
                    className="w-full px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white"
                    placeholder="Enter your admin name..."
                  />
                </div>

                {/* Chat Messages */}
                <div id="chat-messages" className="bg-black/40 rounded-lg border border-white/20 p-4 mb-4 h-96 overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <p className="text-white/40 text-center py-8">No messages yet. Start the conversation!</p>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className="bg-white/5 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-purple-400 font-bold text-sm">{msg.admin}</span>
                            <span className="text-white/40 text-xs">
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-white text-sm">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send Message */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    className="flex-1 px-4 py-3 bg-black/40 border border-white/20 rounded-lg text-white"
                    placeholder="Type a message to your team..."
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!newMessage.trim()}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div
              key="community"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Community Messages Tab */}
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white">📣 Community Messages</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={loadCommunityMessages}
                        disabled={loading}
                        className="px-6 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                      >
                        {loading ? '⏳ Loading...' : '🔄 Refresh'}
                      </button>
                    </div>
                  </div>

                  {selectedMessages.size > 0 && (
                    <div className="bg-purple-500/20 border border-purple-500 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold">{selectedMessages.size} messages selected</span>
                        <div className="flex gap-2">
                          <button
                            onClick={deselectAllMessages}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-bold transition-all text-sm"
                          >
                            Deselect All
                          </button>
                          <button
                            onClick={deleteSelectedMessages}
                            disabled={loading}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded font-bold transition-all text-sm"
                          >
                            🗑️ Delete Selected
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {communityMessages.length > 0 ? (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <button
                          onClick={selectAllMessages}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-bold transition-all text-sm"
                        >
                          ☑️ Select All
                        </button>
                        <span className="text-white/60 text-sm">Total: {communityMessages.length} messages</span>
                      </div>

                      <div className="space-y-3">
                        {communityMessages.map((msg) => {
                          const msgTokenInfo = tokenInfo[msg.tokenHash] || {}
                          const isSelected = selectedMessages.has(msg.id)
                          
                          return (
                            <div
                              key={msg.id}
                              className={`bg-black/40 rounded-lg border p-4 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-purple-500 bg-purple-500/10'
                                  : 'border-white/10 hover:border-white/30'
                              }`}
                              onClick={() => toggleMessageSelection(msg.id)}
                            >
                              <div className="flex gap-4">
                                <div className="flex-shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleMessageSelection(msg.id)}
                                    className="w-5 h-5 cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>

                                <div className="flex-shrink-0">
                                  {msgTokenInfo.logo ? (
                                    <img src={msgTokenInfo.logo} alt={msgTokenInfo.name} className="w-12 h-12 rounded-full" />
                                  ) : (
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                      <span className="text-white font-bold text-lg">{msgTokenInfo.symbol?.[0] || '?'}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-white font-bold">{msgTokenInfo.name || 'Loading...'}</span>
                                    <span className="text-white/60 text-sm">({msgTokenInfo.symbol || '...'})</span>
                                  </div>
                                  <p className="text-white text-lg mb-2">{msg.text}</p>
                                  <div className="flex items-center gap-4 text-white/40 text-xs">
                                    <span>👤 {msg.userName}</span>
                                    <span>📅 {new Date(msg.timestamp).toLocaleString()}</span>
                                    <span className="font-mono text-xs">ID: {msg.id}</span>
                                  </div>
                                  <p className="text-white/30 font-mono text-xs mt-1 truncate">
                                    Token: {msg.tokenHash}
                                  </p>
                                </div>

                                <div className="flex-shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      deleteCommunityMessage(msg.id)
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded font-bold transition-all"
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-white/60 text-center py-8">No community messages loaded. Click Refresh to load messages.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
                <div className="space-y-6">
                  {/* Load Profiles Button */}
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">👤 User Profiles Management</h2>
                    <button
                      onClick={loadAllProfiles}
                      disabled={profilesLoading}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                    >
                      {profilesLoading ? '⏳ Loading...' : '🔄 Refresh Profiles'}
                    </button>
                  </div>

                  {resetResult && (
                    <div className={`p-4 rounded-lg ${
                      resetResult.type === 'success' ? 'bg-green-500/20 border border-green-500' :
                      resetResult.type === 'error' ? 'bg-red-500/20 border border-red-500' :
                      'bg-blue-500/20 border border-blue-500'
                    }`}>
                      <p className="text-white">{resetResult.message}</p>
                    </div>
                  )}

                  {/* Profiles List */}
                  {allProfiles.length > 0 ? (
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <h3 className="text-xl font-bold text-white mb-4">📋 All User Profiles ({allProfiles.length})</h3>
                      <div className="space-y-3">
                        {allProfiles.map((profile) => (
                          <div key={profile.wallet_address} className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-all">
                            <div className="flex items-center justify-between gap-4">
                              {/* Profile Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0">
                                  {profile.avatar_url ? (
                                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold">
                                      {profile.name?.substring(0, 2) || '??'}
                                    </div>
                                  )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-white font-bold">
                                      {profile.name || <span className="text-white/40">No name</span>}
                                    </span>
                                    <span className="text-white/40 text-xs">
                                      {profile.story_count} stories
                                    </span>
                                  </div>
                                  <p className="text-white/60 text-sm font-mono truncate">
                                    {profile.wallet_address}
                                  </p>
                                  {profile.bio && (
                                    <p className="text-white/50 text-xs mt-1 line-clamp-1">{profile.bio}</p>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <button
                                onClick={async () => {
                                  if (!confirm(`Reset profile for ${profile.name || profile.wallet_address.substring(0, 10)}...?`)) return

                                  setLoading(true)
                                  setResetResult(null)
                                  
                                  try {
                                    const adminPassword = prompt('Enter admin password:')
                                    if (!adminPassword) {
                                      setLoading(false)
                                      return
                                    }

                                    const response = await fetch(`${API_URL}/api/admin/reset-profile`, {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'X-Admin-Password': adminPassword
                                      },
                                      body: JSON.stringify({ walletAddress: profile.wallet_address })
                                    })

                                    const data = await response.json()

                                    if (response.ok) {
                                      setResetResult({ 
                                        type: 'success', 
                                        message: `✅ Profile reset for ${profile.wallet_address.substring(0, 10)}...`
                                      })
                                      // Reload profiles
                                      await loadAllProfiles()
                                    } else {
                                      setResetResult({ type: 'error', message: data.error || 'Reset failed' })
                                    }
                                  } catch (error) {
                                    setResetResult({ type: 'error', message: error.message })
                                  } finally {
                                    setLoading(false)
                                  }
                                }}
                                disabled={loading}
                                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all flex-shrink-0"
                              >
                                🔄 Reset
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <p className="text-white/60 text-center">No profiles loaded. Click "Refresh Profiles" to load all user profiles.</p>
                    </div>
                  )}

                  {/* Manual Reset Section */}
                  <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold text-white mb-4">🔄 Manual Reset by Wallet</h3>
                  <p className="text-white/60 mb-4">Reset a specific profile by entering the wallet address</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-white/80 text-sm font-medium mb-2 block">
                        Wallet Address
                      </label>
                      <input
                        type="text"
                        value={resetWallet}
                        onChange={(e) => setResetWallet(e.target.value)}
                        placeholder="0203d7710216e4967ee0873c6ad05e5605c7ac725cafe2ee1829cc6705badf477445"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40"
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (!resetWallet.trim()) {
                          setResetResult({ type: 'error', message: 'Please enter a wallet address' })
                          return
                        }

                        setLoading(true)
                        setResetResult(null)
                        
                        try {
                          const adminPassword = prompt('Enter admin password:')
                          if (!adminPassword) {
                            setLoading(false)
                            return
                          }

                          const response = await fetch(`${API_URL}/api/admin/reset-profile`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'X-Admin-Password': adminPassword
                            },
                            body: JSON.stringify({ walletAddress: resetWallet.trim() })
                          })

                          const data = await response.json()

                          if (response.ok) {
                            setResetResult({ 
                              type: 'success', 
                              message: `✅ Profile reset successfully for ${resetWallet.substring(0, 10)}...`
                            })
                            setResetWallet('')
                          } else {
                            setResetResult({ type: 'error', message: data.error || 'Reset failed' })
                          }
                        } catch (error) {
                          setResetResult({ type: 'error', message: error.message })
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white rounded-lg font-bold transition-all"
                    >
                      {loading ? '⏳ Resetting...' : '🔄 Reset Profile'}
                    </button>

                    {resetResult && (
                      <div className={`p-4 rounded-lg ${
                        resetResult.type === 'success' ? 'bg-green-500/20 border border-green-500' :
                        'bg-red-500/20 border border-red-500'
                      }`}>
                        <p className="text-white">{resetResult.message}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
