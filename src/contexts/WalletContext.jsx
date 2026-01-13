import { createContext, useContext, useState, useEffect } from 'react'
import { API_URL } from '../config'

const WalletContext = createContext()

export function WalletProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState(() => {
    // Restore wallet from localStorage on page load
    return localStorage.getItem('connectedWallet') || null
  })
  const [isConnected, setIsConnected] = useState(() => {
    // Restore connection state
    return !!localStorage.getItem('connectedWallet')
  })
  const [balance, setBalance] = useState(null)
  const [assets, setAssets] = useState({ tokens: [], nfts: [] })
  const [network, setNetwork] = useState(() => {
    // Restore network from localStorage
    return localStorage.getItem('connectedNetwork') || 'mainnet'
  })
  
  // Fetch balance and assets when wallet connects OR network changes
  useEffect(() => {
    if (walletAddress && network) {
      console.log(`🔄 Wallet changed: ${walletAddress.substring(0, 10)}... on ${network}`)
      fetchBalance(walletAddress, network)
      fetchAssets(walletAddress, network)
    } else {
      setBalance(null)
      setAssets({ tokens: [], nfts: [] })
    }
  }, [walletAddress, network])
  
  const fetchBalance = async (address, networkHint = 'mainnet') => {
    try {
      console.log('💰 Fetching balance for:', address, 'on network:', networkHint)
      
      // Pass network to backend so it uses the correct network
      const response = await fetch(`${API_URL}/api/accounts/${address}/balance?network=${networkHint}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data && data.balance !== undefined) {
        setBalance(data.balance)
        // Don't change network - keep user's selected network
        console.log('✅ Balance fetched:', data.balance, 'CSPR on', networkHint, '(API returned:', data.network, ')')
      } else {
        console.warn('⚠️ No balance found')
        setBalance(0)
      }
    } catch (error) {
      console.error('❌ Error fetching balance:', error)
      setBalance(0)
    }
  }
  
  const fetchAssets = async (address, networkHint = 'mainnet') => {
    try {
      console.log('🪙 Fetching assets for:', address, 'on network:', networkHint)
      
      // Pass network to backend so it uses the correct network
      const [tokensRes, nftsRes] = await Promise.all([
        fetch(`${API_URL}/api/accounts/${address}/tokens?network=${networkHint}`),
        fetch(`${API_URL}/api/accounts/${address}/nfts?network=${networkHint}`)
      ])
      
      const tokensData = await tokensRes.json()
      const nftsData = await nftsRes.json()
      
      const tokens = tokensData.success ? tokensData.tokens : []
      const nfts = nftsData.success ? nftsData.nfts : []
      
      setAssets({ tokens, nfts })
      console.log(`✅ Assets fetched: ${tokens.length} tokens, ${nfts.length} NFTs on ${tokensData.network || networkHint}`)
    } catch (error) {
      console.error('❌ Error fetching assets:', error)
      setAssets({ tokens: [], nfts: [] })
    }
  }
  
  const connect = (address, detectedNetwork = 'mainnet') => {
    console.log('🔗 WalletContext: Setting wallet address:', address, 'network:', detectedNetwork)
    setWalletAddress(address)
    setNetwork(detectedNetwork)
    setIsConnected(true)
    // Persist to localStorage to survive page refresh
    localStorage.setItem('connectedWallet', address)
    localStorage.setItem('connectedNetwork', detectedNetwork)
  }
  
  const disconnect = () => {
    console.log('👋 WalletContext: Disconnecting wallet')
    setWalletAddress(null)
    setIsConnected(false)
    setBalance(null)
    setAssets({ tokens: [], nfts: [] })
    setNetwork('mainnet')
    // Clear from localStorage
    localStorage.removeItem('connectedWallet')
    localStorage.removeItem('connectedNetwork')
  }
  
  return (
    <WalletContext.Provider value={{ walletAddress, isConnected, balance, assets, network, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider')
  }
  return context
}
