/**
 * WebSocket Chat Service - Real-time communication
 * Connects to chat server for multi-user chat
 */

let ws = null
let reconnectTimer = null
let currentTokenHash = null
let messageHandlers = []
let statusHandlers = []

const WS_URL = 'ws://localhost:3001'

/**
 * Connect to WebSocket server
 */
export const connectWebSocket = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('🔗 Already connected to WebSocket')
    return
  }

  console.log('🔌 Connecting to WebSocket:', WS_URL)
  
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('✅ WebSocket connected')
    notifyStatusHandlers('connected')
    
    // Rejoin room if we were in one
    if (currentTokenHash) {
      // Will be handled by component
    }
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      console.log('📩 WebSocket message:', message.type)
      
      // Notify all message handlers
      messageHandlers.forEach(handler => handler(message))
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error)
    }
  }

  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected')
    notifyStatusHandlers('disconnected')
    ws = null
    
    // Auto-reconnect after 3 seconds
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      console.log('🔄 Reconnecting...')
      connectWebSocket()
    }, 3000)
  }

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error)
    notifyStatusHandlers('error')
  }
}

/**
 * Disconnect from WebSocket
 */
export const disconnectWebSocket = () => {
  clearTimeout(reconnectTimer)
  if (ws) {
    ws.close()
    ws = null
  }
  currentTokenHash = null
}

/**
 * Join a token chat room
 */
export const joinRoom = (tokenHash, walletAddress, tokenName) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('❌ WebSocket not connected')
    return false
  }

  console.log(`🚪 Joining room ${tokenHash.substring(0, 8)}...`)
  
  currentTokenHash = tokenHash
  
  ws.send(JSON.stringify({
    type: 'join-room',
    tokenHash,
    walletAddress,
    userName: tokenName || walletAddress.substring(0, 8)
  }))
  
  return true
}

/**
 * Leave current room
 */
export const leaveRoom = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN || !currentTokenHash) {
    return
  }

  console.log(`🚪 Leaving room ${currentTokenHash.substring(0, 8)}...`)
  
  ws.send(JSON.stringify({
    type: 'leave-room',
    tokenHash: currentTokenHash
  }))
  
  currentTokenHash = null
}

/**
 * Send a chat message
 */
export const sendMessage = (tokenHash, walletAddress, text) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('❌ WebSocket not connected')
    return false
  }

  ws.send(JSON.stringify({
    type: 'send-message',
    tokenHash,
    walletAddress,
    text
  }))
  
  return true
}

/**
 * Subscribe to incoming messages
 * @param {Function} handler - Called with message object
 * @returns {Function} Unsubscribe function
 */
export const onMessage = (handler) => {
  messageHandlers.push(handler)
  
  return () => {
    messageHandlers = messageHandlers.filter(h => h !== handler)
  }
}

/**
 * Subscribe to connection status changes
 * @param {Function} handler - Called with status string
 * @returns {Function} Unsubscribe function
 */
export const onStatusChange = (handler) => {
  statusHandlers.push(handler)
  
  // Immediately notify handler of current status
  const currentStatus = getStatus()
  setTimeout(() => handler(currentStatus), 0)
  
  return () => {
    statusHandlers = statusHandlers.filter(h => h !== handler)
  }
}

/**
 * Notify status handlers
 */
const notifyStatusHandlers = (status) => {
  statusHandlers.forEach(handler => handler(status))
}

/**
 * Get connection status
 */
export const getStatus = () => {
  if (!ws) return 'disconnected'
  
  switch (ws.readyState) {
    case WebSocket.CONNECTING:
      return 'connecting'
    case WebSocket.OPEN:
      return 'connected'
    case WebSocket.CLOSING:
      return 'closing'
    case WebSocket.CLOSED:
      return 'disconnected'
    default:
      return 'unknown'
  }
}

console.log('✅ WebSocket Chat Service loaded')
