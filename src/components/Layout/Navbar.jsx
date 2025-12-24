import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaChartLine, FaWallet, FaCoins, FaUser, FaComments, FaCog, FaSignOutAlt, FaChevronDown, FaHome, FaRocket, FaTelegram } from 'react-icons/fa'
import { SiX } from 'react-icons/si'
import { useState, useEffect, useRef } from 'react'
import WalletModal from '../Wallet/WalletModal'
import UniversalSearch from '../Search/UniversalSearch'
import UserAvatar from '../User/UserAvatar'
import { useWallet } from '../../contexts/WalletContext'
import toast from 'react-hot-toast'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const { walletAddress, isConnected, balance, network, connect, disconnect } = useWallet()
  const [userProfile, setUserProfile] = useState({ name: '', avatar: '', bio: '' })
  
  const handleConnect = (publicKey, network = 'mainnet') => {
    console.log('🔗 Navbar: Wallet connected:', publicKey, 'network:', network)
    connect(publicKey, network)
    setShowWalletModal(false)
    toast.success(`🎉 Wallet connected! (${network})`, {
      style: {
        background: '#10b981',
        color: '#fff'
      }
    })
  }

  const handleDisconnect = () => {
    console.log('👋 Navbar: Disconnecting wallet')
    disconnect()
    toast.success('👋 Wallet disconnected', {
      style: {
        background: '#6366f1',
        color: '#fff'
      }
    })
  }
  
  const formatAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const formatBalance = (balance) => {
    if (!balance && balance !== 0) return '0'
    return parseFloat(balance).toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    })
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load user profile from localStorage (specific to connected wallet)
  useEffect(() => {
    const loadProfile = () => {
      if (!walletAddress) {
        // No wallet connected - clear profile
        setUserProfile({ name: '', avatar: '', bio: '' })
        return
      }
      
      // Use wallet-specific key to avoid showing wrong profile
      const profileKey = `userProfile_${walletAddress}`
      const savedProfile = localStorage.getItem(profileKey)
      
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile)
        console.log('📱 Navbar loaded profile for', walletAddress.substring(0, 10) + '...:', parsed)
        setUserProfile(parsed)
      } else {
        // No profile for this wallet - clear it
        setUserProfile({ name: '', avatar: '', bio: '' })
      }
    }
    
    loadProfile()
    
    // Listen for profile updates (custom event for same-tab updates)
    const handleProfileUpdate = () => {
      console.log('🔔 Navbar received profileUpdated event')
      loadProfile()
    }
    window.addEventListener('profileUpdated', handleProfileUpdate)
    window.addEventListener('storage', loadProfile)
    
    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate)
      window.removeEventListener('storage', loadProfile)
    }
  }, [walletAddress])

  // Balance is now handled by WalletContext, no need to fetch here
  
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/screener', label: 'Screener' },
    { path: '/feed', label: 'Feed' },
  ]
  
  return (
    <>
      <nav className="sticky top-0 z-50 glass border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-0 sm:gap-1 group ml-2 sm:ml-16 py-2">
              <img 
                src="/logo.png" 
                alt="ScreenerLand Logo" 
                className="h-12 sm:h-20 w-auto object-contain group-hover:scale-110 transition-transform duration-300" 
              />
              <span className="text-base sm:text-xl font-bold gradient-text hidden sm:inline">
                ScreenerLand
              </span>
            </Link>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative px-4 py-2 text-gray-300 hover:text-white transition-colors duration-300"
                >
                  {item.label}
                  {location.pathname === item.path && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              ))}
            </div>
            
            {/* Universal Search */}
            <div className="flex items-center gap-3">
              {/* Social Links */}
              <div className="hidden md:flex items-center gap-2">
                <a
                  href="https://x.com/screenerland"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  title="Follow us on X"
                >
                  <SiX className="text-lg" />
                </a>
                <a
                  href="https://t.me/screenerland"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                  title="Join our Telegram"
                >
                  <FaTelegram className="text-lg" />
                </a>
              </div>
              
              <UniversalSearch />
              
              {/* Wallet / Profile Section */}
              {isConnected ? (
                <div className="flex items-center gap-3">
                  {/* Network Indicator */}
                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${ 
                    network === 'mainnet' 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${network === 'mainnet' ? 'bg-green-400' : 'bg-orange-400'}`} />
                    {network === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                  </div>
                  
                  {/* Balance (Desktop only) */}
                  {balance !== null && (
                    <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                      <FaCoins className="text-yellow-400 text-sm" />
                      <span className="text-primary font-bold text-sm">{formatBalance(balance)}</span>
                      <span className="text-primary/60 text-xs">CSPR</span>
                    </div>
                  )}

                  {/* Profile Avatar Dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      {/* Avatar */}
                      <div className="ring-2 ring-primary/30 hover:ring-primary transition-all rounded-full">
                        <UserAvatar
                          userAvatar={userProfile.avatar}
                          userName={userProfile.name}
                          userWallet={walletAddress}
                          size="md"
                        />
                      </div>

                      {/* Username/Wallet Address + Chevron (Desktop) */}
                      <div className="hidden md:flex items-center gap-2">
                        <div className="text-left">
                          <div className="text-white font-semibold text-sm">
                            {userProfile.name || formatAddress(walletAddress)}
                          </div>
                          {balance !== null && (
                            <div className="text-white/40 text-xs">{formatBalance(balance)} CSPR</div>
                          )}
                        </div>
                        <FaChevronDown className={`text-white/60 text-xs transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Dropdown Menu */}
                    {showDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-3 w-64 bg-gray-900 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 z-50"
                      >
                        {/* User Info Header */}
                        <div className="p-4 bg-gray-800 border-b-2 border-gray-700">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="ring-2 ring-primary/50 rounded-full">
                              <UserAvatar
                                userAvatar={userProfile.avatar}
                                userName={userProfile.name}
                                userWallet={walletAddress}
                                size="md"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-bold truncate">
                                {userProfile.name || formatAddress(walletAddress) || 'Guest User'}
                              </div>
                              <div className="text-white/60 text-xs font-mono truncate">{formatAddress(walletAddress)}</div>
                            </div>
                          </div>
                          {balance !== null && (
                            <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg">
                              <span className="text-white/60 text-sm">Balance</span>
                              <div className="flex items-center gap-1">
                                <FaCoins className="text-yellow-400 text-xs" />
                                <span className="text-white font-bold text-sm">{formatBalance(balance)} CSPR</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Menu Items */}
                        <div className="py-2">
                          {/* Profile */}
                          <button
                            onClick={() => {
                              navigate('/profile')
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-white hover:bg-gray-700 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-lg bg-primary/30 flex items-center justify-center">
                              <FaUser className="text-primary text-sm" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-semibold text-sm">Profile</div>
                              <div className="text-white/40 text-xs">View and edit your profile</div>
                            </div>
                          </button>

                          {/* My Communities */}
                          <button
                            onClick={() => {
                              navigate('/profile?tab=communities')
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-white hover:bg-gray-700 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
                              <FaComments className="text-secondary text-sm" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-semibold text-sm">My Communities</div>
                              <div className="text-white/40 text-xs">Your joined token chats</div>
                            </div>
                          </button>

                          {/* Settings */}
                          <button
                            onClick={() => {
                              navigate('/profile?tab=settings')
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-white hover:bg-gray-700 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
                              <FaCog className="text-gray-300 text-sm" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-semibold text-sm">Settings</div>
                              <div className="text-white/40 text-xs">Customize your experience</div>
                            </div>
                          </button>
                        </div>

                        <div className="border-t-2 border-gray-700"></div>

                        {/* Disconnect */}
                        <div className="p-2">
                          <button
                            onClick={() => {
                              handleDisconnect()
                              setShowDropdown(false)
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                          >
                            <FaSignOutAlt className="text-red-400" />
                            <span className="font-semibold text-sm">Disconnect Wallet</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="btn-primary flex items-center space-x-2 px-4 py-2"
                >
                  <FaWallet />
                  <span className="hidden sm:inline">Connect</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Wallet Modal */}
      {showWalletModal && (
        <WalletModal
          isOpen={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          onConnect={handleConnect}
        />
      )}
    </>
  )
}
