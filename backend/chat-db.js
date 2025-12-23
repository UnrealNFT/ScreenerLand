import { query } from './db.js'

/**
 * Save chat message
 */
async function saveMessage(tokenHash, userWallet, userName, message) {
  try {
    const result = await query(
      `INSERT INTO chat_messages (token_hash, user_wallet, user_name, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tokenHash, userWallet, userName, message]
    )
    
    return {
      id: result.rows[0].id,
      tokenHash: result.rows[0].token_hash,
      userWallet: result.rows[0].user_wallet,
      userName: result.rows[0].user_name,
      message: result.rows[0].message,
      timestamp: result.rows[0].created_at
    }
  } catch (error) {
    console.error('❌ Error saving message:', error)
    throw error
  }
}

/**
 * Get chat messages for a token
 */
async function getMessages(tokenHash, limit = 50) {
  try {
    const result = await query(
      `SELECT * FROM chat_messages
       WHERE token_hash = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tokenHash, limit]
    )
    
    // Return in chronological order (oldest first)
    return result.rows.reverse().map(row => ({
      id: row.id,
      tokenHash: row.token_hash,
      userWallet: row.user_wallet,
      userName: row.user_name,
      message: row.message,
      timestamp: row.created_at
    }))
  } catch (error) {
    console.error('❌ Error getting messages:', error)
    return []
  }
}

/**
 * Get message count for a token (member count approximation)
 */
async function getMessageCount(tokenHash) {
  try {
    const result = await query(
      'SELECT COUNT(DISTINCT user_wallet) as count FROM chat_messages WHERE token_hash = $1',
      [tokenHash]
    )
    return parseInt(result.rows[0].count) || 0
  } catch (error) {
    console.error('❌ Error getting message count:', error)
    return 0
  }
}

export {
  saveMessage,
  getMessages,
  getMessageCount
}
