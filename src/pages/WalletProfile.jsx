import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FaCopy, FaExternalLinkAlt, FaWallet, FaCoins, FaHistory } from 'react-icons/fa'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import csprCloudWalletService from '../services/cspr.cloud.wallet.service'

export default function WalletProfile() {
  const { address } = useParams()
  const [walletData, setWalletData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadWalletData()
  }, [address])
  
  const loadWalletData = async () => {
    setLoading(true)
    
    try {
      // Fetch REAL data from CSPR.cloud API - NO FAKE!
      const data = await csprCloudWalletService.getWalletProfile(address)
      
      if (!data) {
        throw new Error('Wallet not found')
      }
      
      setWalletData(data)
      
    } catch (error) {
      console.error('Error loading wallet:', error)
      toast.error('Failed to load wallet data')
    } finally {
      setLoading(false)
    }
  }
  
  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    toast.success('Address copied!')
  }
  
  const openCSPRLive = () => {
    window.open(`https://cspr.live/account/${address}`, '_blank')
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Loading wallet...</p>
        </div>
      </div>
    )
  }
  
  if (!walletData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-400">Wallet not found</p>
        </div>
      </div>
    )
  }
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-6"
    >
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-bold">
              {address.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">Wallet Profile</h1>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-sm text-gray-400 bg-dark-card px-3 py-1 rounded">
                  {address.substring(0, 10)}...{address.substring(address.length - 8)}
                </code>
                <button
                  onClick={copyAddress}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-dark-hover transition-colors"
                >
                  <FaCopy className="text-gray-400" />
                </button>
                <button
                  onClick={openCSPRLive}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-dark-hover transition-colors"
                >
                  <FaExternalLinkAlt className="text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Balance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-dark-card p-4 rounded-xl">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <FaWallet />
              <span>CSPR Balance</span>
            </div>
            <div className="text-3xl font-bold">{parseFloat(walletData.balance).toLocaleString()} CSPR</div>
            <div className="text-sm text-gray-400 mt-1">
              ≈ ${walletData.balanceUSD.toFixed(2)} USD
            </div>
          </div>
          
          <div className="bg-dark-card p-4 rounded-xl">
            <div className="flex items-center gap-2 text-gray-400 mb-2">
              <FaCoins />
              <span>Tokens Owned</span>
            </div>
            <div className="text-3xl font-bold">{walletData.tokenCount}</div>
            <div className="text-sm text-gray-400 mt-1">
              CEP-18 tokens
            </div>
          </div>
        </div>
      </div>
      
      {/* Token Holdings */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <FaCoins className="text-secondary" />
          Token Holdings ({walletData.tokens.length})
        </h2>
        {walletData.tokens.length > 0 ? (
          <div className="space-y-3">
            {walletData.tokens.map((token, index) => {
              const balanceFormatted = (BigInt(token.balance) / BigInt(10 ** token.decimals)).toString()
              
              return (
                <motion.a
                  key={index}
                  href={`/token/${token.contractHash}`}
                  whileHover={{ x: 5 }}
                  className="block p-4 bg-dark-card rounded-xl hover:bg-dark-hover transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {token.iconUrl ? (
                        <img src={token.iconUrl} alt={token.name} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-bold">
                          {token.symbol[0]}
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{token.name}</div>
                        <div className="text-sm text-gray-400">
                          {parseFloat(balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 2 })} {token.symbol}
                        </div>
                      </div>
                    </div>
                    {token.websiteUrl && (
                      <FaExternalLinkAlt className="text-gray-400" />
                    )}
                  </div>
                </motion.a>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No tokens found</p>
        )}
      </div>
      
      {/* Transaction History */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <FaHistory className="text-warning" />
          Recent Transactions ({walletData.transactions.length})
        </h2>
        {walletData.transactions.length > 0 ? (
          <>
            <div className="space-y-3">
              {walletData.transactions.map((tx, index) => {
                const date = new Date(tx.timestamp)
                const timeAgo = getTimeAgo(date)
                
                return (
                  <a
                    key={index}
                    href={`https://cspr.live/deploy/${tx.deployHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-dark-card rounded-xl hover:bg-dark-hover transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          {tx.type}
                          <span className="text-xs text-gray-400">
                            {tx.tokenSymbol}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 font-mono">
                          {tx.deployHash.substring(0, 16)}...
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">
                          {timeAgo}
                        </div>
                        <FaExternalLinkAlt className="text-gray-400 ml-auto mt-1" size={12} />
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
            <button onClick={openCSPRLive} className="w-full mt-4 btn-secondary">
              View All on CSPR.live
            </button>
          </>
        ) : (
          <p className="text-gray-400 text-center py-8">No transactions found</p>
        )}
      </div>
    </motion.div>
  )
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
