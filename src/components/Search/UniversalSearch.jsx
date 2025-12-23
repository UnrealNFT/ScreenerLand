import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FaSearch, FaTimes, FaClock } from 'react-icons/fa'
import toast from 'react-hot-toast'

export default function UniversalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [recentSearches, setRecentSearches] = useState([])
  const [suggestions, setSuggestions] = useState([])
  
  const detectAndNavigate = async (searchQuery) => {
    const trimmed = searchQuery.trim()
    
    if (!trimmed) {
      toast.error('Please enter a search query')
      return
    }
    
    // Add to recent searches
    const recent = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 5)
    setRecentSearches(recent)
    localStorage.setItem('recentSearches', JSON.stringify(recent))
    
    toast.loading('Searching...', { id: 'search' })
    
    try {
      // Remove prefixes
      let cleanHash = trimmed
      if (trimmed.startsWith('contract-package-')) {
        cleanHash = trimmed.replace('contract-package-', '')
      } else if (trimmed.startsWith('hash-')) {
        cleanHash = trimmed.replace('hash-', '')
      } else if (trimmed.startsWith('deploy-')) {
        // Open transaction on CSPR.live
        window.open(`https://cspr.live/deploy/${trimmed}`, '_blank')
        toast.success('Opening on CSPR.live', { id: 'search' })
        setIsOpen(false)
        setQuery('')
        return
      }
      
      // Check if it's a valid hex hash (64 chars)
      const isValidHash = /^[0-9a-fA-F]{64}$/.test(cleanHash)
      
      if (isValidHash) {
        // It's a token package hash
        navigate(`/token/${cleanHash}`)
        toast.success('Token found!', { id: 'search' })
      } else {
        // Search by name
        toast.error('Invalid hash format. Use 64 character hex.', { id: 'search' })
      }
      
      setIsOpen(false)
      setQuery('')
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Search failed', { id: 'search' })
    }
  }
  
  const searchByName = async (name) => {
    // TODO: Implement name search in API
    return []
  }
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      detectAndNavigate(query)
    }
  }
  
  return (
    <>
      {/* Search Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 glass px-4 py-2 rounded-xl hover:border-primary transition-colors"
      >
        <FaSearch className="text-gray-400" />
        <span className="hidden md:inline text-gray-400">Search wallet, token, or tx...</span>
      </motion.button>
      
      {/* Search Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 pt-20"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl glass rounded-2xl overflow-hidden"
            >
              {/* Search Input */}
              <div className="p-6 border-b border-dark-border">
                <div className="flex items-center gap-4">
                  <FaSearch className="text-2xl text-primary" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Paste wallet address, contract hash, or token name..."
                    className="flex-1 bg-transparent text-white text-lg outline-none placeholder-gray-500"
                    autoFocus
                  />
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-dark-hover transition-colors"
                  >
                    <FaTimes className="text-gray-400" />
                  </button>
                </div>
                
                {/* Type hint */}
                {query && query.length === 64 && /^[0-9a-fA-F]{64}$/.test(query) && (
                  <div className="mt-3 text-sm text-gray-400">
                    Detected: <span className="text-primary font-semibold">🪙 Token Contract</span>
                  </div>
                )}
              </div>
              
              {/* Recent Searches */}
              {recentSearches.length > 0 && !query && (
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                    <FaClock /> Recent Searches
                  </h3>
                  <div className="space-y-2">
                    {recentSearches.map((search, index) => (
                      <motion.button
                        key={index}
                        whileHover={{ x: 5 }}
                        onClick={() => {
                          setQuery(search)
                          detectAndNavigate(search)
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-dark-hover transition-colors flex items-center gap-3"
                      >
                        <FaSearch className="text-gray-500" />
                        <span className="text-gray-300 truncate">{search}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="p-6 max-h-96 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-400 mb-3">
                    Search Results
                  </h3>
                  <div className="space-y-2">
                    {suggestions.map((item, index) => (
                      <motion.button
                        key={index}
                        whileHover={{ x: 5 }}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-dark-hover transition-colors"
                      >
                        {/* TODO: Render suggestion item */}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Quick Actions */}
              <div className="p-6 border-t border-dark-border bg-dark-bg/50">
                <div className="text-xs text-gray-400 text-center">
                  <span className="font-semibold text-secondary">🪙 Token Search</span>
                  <div className="mt-1">Paste 64-character contract package hash</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
