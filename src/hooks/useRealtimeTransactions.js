import { useState, useEffect, useRef } from 'react'

export function useRealtimeTransactions(contractHash) {
  const [transactions, setTransactions] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!contractHash) return

    // Connect to WebSocket server
    const ws = new WebSocket('ws://localhost:3001')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('✅ Connected to real-time transaction feed')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'new_transaction' && data.tokenHash === contractHash) {
          console.log('💫 New transaction received:', data.transaction)
          
          // Add new transaction to the beginning
          setTransactions(prev => {
            const newTxs = [data.transaction, ...prev]
            // Keep only last 50 transactions
            return newTxs.slice(0, 50)
          })
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsConnected(false)
    }

    ws.onclose = () => {
      console.log('🔌 Disconnected from real-time feed')
      setIsConnected(false)
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [contractHash])

  return { transactions, isConnected }
}
