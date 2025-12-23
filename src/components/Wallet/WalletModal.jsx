import { motion } from 'framer-motion'
import { FaTimes, FaWallet } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { useState } from 'react'

export default function WalletModal({ isOpen, onClose, onConnect }) {
  const [selectedNetwork, setSelectedNetwork] = useState('mainnet')
  
  if (!isOpen) return null
  
  const connectCasperWallet = async () => {
    try {
      console.log('🔍 Checking for Casper Wallet extension...')
      console.log('window.CasperWalletProvider:', typeof window.CasperWalletProvider)
      
      // Check if Casper Wallet extension is installed
      if (typeof window.CasperWalletProvider !== 'function') {
        console.error('❌ Casper Wallet not found')
        toast.error('Please install Casper Wallet extension')
        window.open('https://www.casperwallet.io/', '_blank')
        return
      }
      
      console.log('✅ Casper Wallet found, creating provider...')
      // Get provider instance
      const provider = window.CasperWalletProvider()
      console.log('Provider:', provider)
      
      console.log('📞 Requesting connection...')
      // Request connection
      const isConnected = await provider.requestConnection()
      console.log('Connection result:', isConnected)
      
      if (isConnected) {
        console.log('✅ Connected! Getting public key...')
        const publicKey = await provider.getActivePublicKey()
        console.log('Public key:', publicKey)
        console.log('🌐 Using selected network:', selectedNetwork)
        
        toast.success(`Wallet connected! (${selectedNetwork})`)
        onConnect(publicKey, selectedNetwork) // Pass selected network
        onClose()
      } else {
        console.log('❌ Connection rejected by user')
        toast.error('Connection rejected')
      }
    } catch (error) {
      console.error('❌ Wallet connection error:', error)
      toast.error('Failed to connect wallet: ' + error.message)
    }
  }
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-dark-hover transition-colors"
          >
            <FaTimes />
          </button>
        </div>
        
        {/* Network Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Network</label>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedNetwork('mainnet')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                selectedNetwork === 'mainnet'
                  ? 'bg-primary text-white'
                  : 'glass hover:border-primary/50'
              }`}
            >
              Mainnet
            </button>
            <button
              onClick={() => setSelectedNetwork('testnet')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                selectedNetwork === 'testnet'
                  ? 'bg-primary text-white'
                  : 'glass hover:border-primary/50'
              }`}
            >
              Testnet
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={connectCasperWallet}
            className="w-full glass p-4 rounded-xl flex items-center gap-4 hover:border-primary transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <FaWallet className="text-2xl text-primary" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold">Casper Wallet</div>
              <div className="text-sm text-gray-400">Official Casper extension</div>
            </div>
          </motion.button>
          
          <div className="text-center text-sm text-gray-400 pt-4">
            By connecting, you agree to our Terms of Service
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
