/**
 * Chat Service - Manage online members count
 * This ensures consistent member count across TokenPage and TokenChat
 * Now powered by real WebSocket backend!
 */

// Store member count per token (synced with backend)
const memberCounts = {}

// Event listeners for member count changes
const listeners = {}

/**
 * Subscribe to member count changes for a token
 * @param {string} tokenHash - Token contract hash
 * @param {Function} callback - Called when count changes
 * @returns {Function} Unsubscribe function
 */
export const subscribeMemberCount = (tokenHash, callback) => {
  if (!listeners[tokenHash]) {
    listeners[tokenHash] = []
  }
  listeners[tokenHash].push(callback)
  
  // Return unsubscribe function
  return () => {
    listeners[tokenHash] = listeners[tokenHash].filter(cb => cb !== callback)
  }
}

/**
 * Notify all listeners of count change
 */
const notifyListeners = (tokenHash, newCount) => {
  if (listeners[tokenHash]) {
    listeners[tokenHash].forEach(callback => callback(newCount))
  }
}

/**
 * Get online member count for a token
 * @param {string} tokenHash - Token contract hash
 * @returns {number} Number of online members
 */
export const getMemberCount = (tokenHash) => {
  // Return actual count, default to 0 (no fake members)
  const count = memberCounts[tokenHash] || 0
  console.log(`👥 Member count for ${tokenHash.substring(0, 8)}...: ${count}`)
  return count
}

/**
 * Increment member count when user joins
 * @param {string} tokenHash - Token contract hash
 */
export const joinChat = (tokenHash) => {
  // Start from 0 if not exists, then increment
  if (!memberCounts[tokenHash]) {
    memberCounts[tokenHash] = 0
  }
  memberCounts[tokenHash]++
  const newCount = memberCounts[tokenHash]
  console.log(`✅ User joined ${tokenHash.substring(0, 8)}..., now ${newCount} online`)
  
  // Notify all listeners
  notifyListeners(tokenHash, newCount)
  
  return newCount
}

/**
 * Decrement member count when user leaves
 * @param {string} tokenHash - Token contract hash
 */
export const leaveChat = (tokenHash) => {
  if (memberCounts[tokenHash] && memberCounts[tokenHash] > 0) {
    memberCounts[tokenHash]--
  }
  const newCount = memberCounts[tokenHash] || 0
  
  // Notify all listeners
  notifyListeners(tokenHash, newCount)
  
  return newCount
}

/**
 * Simulate realistic member fluctuation
 * Call this periodically to make counts feel alive
 * NOTE: Disabled for production - only real users count
 */
export const simulateMemberActivity = (tokenHash) => {
  // Disabled - no fake activity
  return memberCounts[tokenHash] || 0
}

/**
 * Update member count (called by WebSocket service)
 * @param {string} tokenHash - Token contract hash
 * @param {number} count - New member count from backend
 */
export const updateMemberCount = (tokenHash, count) => {
  memberCounts[tokenHash] = count
  console.log(`👥 Updated member count for ${tokenHash.substring(0, 8)}...: ${count}`)
  notifyListeners(tokenHash, count)
}

console.log('✅ Chat Service loaded (WebSocket-powered)')
