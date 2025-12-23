import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { FaWallet, FaSearch, FaTrophy, FaUsers } from 'react-icons/fa'
import csprCloudWalletService from '../services/cspr.cloud.wallet.service'
import toast from 'react-hot-toast'

export default function CommunityPage() {
  const [topHolders, setTopHolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    loadTopHolders()
  }, [])

  const loadTopHolders = async () => {
    try {
      const holders = await csprCloudWalletService.getTopHolders(50)
      setTopHolders(holders)
    } catch (error) {
      console.error('Error loading top holders:', error)
      toast.error('Failed to load community data')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    
    if (!searchQuery.trim()) {
      return
    }

    setSearching(true)
    
    try {
      const profile = await csprCloudWalletService.getWalletProfile(searchQuery.trim())
      
      if (profile) {
        // Redirect to wallet profile page
        window.location.href = `/wallet/${searchQuery.trim()}`
      } else {
        toast.error('Wallet not found')
      }
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Wallet not found')
    } finally {
      setSearching(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-8"
    >
      {/* Header */}
      <section className="text-center py-8">
        <motion.h1
          initial={{ y: -20 }}
          animate={{ y: 0 }}
          className="text-4xl md:text-5xl font-bold mb-4"
        >
          <span className="gradient-text">Community</span>
        </motion.h1>
        <p className="text-xl text-gray-400 mb-8">
          Explore wallets, track holders, and discover the Casper community
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by public key or account hash..."
                className="w-full pl-12 pr-4 py-4 bg-dark-card border border-gray-700 rounded-xl focus:border-primary focus:outline-none text-white"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-8 py-4 btn-primary rounded-xl disabled:opacity-50"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={<FaUsers />}
          value={topHolders.length.toLocaleString()}
          label="Active Holders"
          gradient="from-purple-500 to-pink-500"
        />
        <StatCard
          icon={<FaWallet />}
          value={topHolders.reduce((sum, h) => sum + parseFloat(h.balance), 0).toFixed(0).toLocaleString()}
          label="Total CSPR Held"
          gradient="from-blue-500 to-cyan-500"
        />
        <StatCard
          icon={<FaTrophy />}
          value={topHolders[0] ? `${parseFloat(topHolders[0].balance).toLocaleString()} CSPR` : '-'}
          label="Top Holder"
          gradient="from-green-500 to-emerald-500"
        />
      </section>

      {/* Top Holders List */}
      <section className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <FaTrophy className="text-warning" />
          Top 50 CSPR Holders
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-20 bg-dark-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {topHolders.map((holder, index) => (
              <motion.a
                key={holder.accountHash}
                href={`/wallet/${holder.publicKey}`}
                whileHover={{ x: 5 }}
                className="block p-4 bg-dark-card rounded-xl hover:bg-dark-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl
                      ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                      ${index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                      ${index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : ''}
                      ${index > 2 ? 'bg-dark-hover' : ''}
                    `}>
                      {index + 1}
                    </div>

                    {/* Avatar & Info */}
                    <div className="flex items-center gap-3">
                      {holder.logo ? (
                        <img src={holder.logo} alt={holder.name} className="w-12 h-12 rounded-full" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-bold">
                          {holder.publicKey.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold">
                          {holder.name !== 'Anonymous' ? holder.name : 'Anonymous Holder'}
                        </div>
                        <div className="text-sm text-gray-400 font-mono">
                          {holder.publicKey.substring(0, 10)}...{holder.publicKey.substring(holder.publicKey.length - 8)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="text-right">
                    <div className="text-xl font-bold">
                      {parseFloat(holder.balance).toLocaleString()} CSPR
                    </div>
                    <div className="text-sm text-gray-400">
                      ≈ ${(parseFloat(holder.balance) * 0.034).toFixed(2)} USD
                    </div>
                  </div>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  )
}

function StatCard({ icon, value, label, gradient }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="glass p-6 rounded-2xl"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-2xl bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
          {icon}
        </div>
      </div>
      <div className={`text-3xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent mb-2`}>
        {value}
      </div>
      <div className="text-sm text-gray-400">{label}</div>
    </motion.div>
  )
}
