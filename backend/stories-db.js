import { query, transaction } from './db.js'

/**
 * Create a new story
 */
async function createStory(data) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = data.tokenHash?.replace(/^hash-/, '') || data.tokenHash
    
    const result = await query(
      `INSERT INTO stories (
        user_wallet, token_hash, token_symbol, token_logo, caption,
        video_url, media_type, overlay_text, music_url, duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.userWallet,
        cleanHash,
        data.tokenSymbol,
        data.tokenLogo || null,
        data.caption || '',
        data.videoUrl,
        data.mediaType || 'video',
        data.overlayText || '',
        data.musicUrl || null,
        data.duration || 0
      ]
    )
    
    const story = formatStory(result.rows[0])
    console.log(`✅ Story created: ${story.id} (${story.mediaType}) by ${data.userWallet.substring(0, 10)}...`)
    
    // 🔥 Update activity timestamp to reset inactivity counter (use cleanHash)
    await updateCTOActivity(cleanHash, data.userWallet)
    
    return story
  } catch (error) {
    console.error('❌ Error creating story:', error)
    throw error
  }
}

/**
 * Get all stories with 24h eligibility check
 */
async function getAllStories(limit = 50, offset = 0) {
  try {
    // Update eligibility for expired stories
    await query(
      `UPDATE stories 
       SET is_eligible_reward = false 
       WHERE is_eligible_reward = true 
       AND created_at < NOW() - INTERVAL '24 hours'`
    )
    
    // Homepage: Only show stories from last 24 hours (Instagram style)
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count,
        (SELECT COUNT(*) FROM shares WHERE story_id = s.id) as shares_count
       FROM stories s
       WHERE s.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    
    return result.rows.map(formatStory)
  } catch (error) {
    console.error('❌ Error getting all stories:', error)
    throw error
  }
}

/**
 * Get stories by token
 */
async function getStoriesByToken(tokenHash, limit = 20) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    // Update eligibility for expired stories
    await query(
      `UPDATE stories 
       SET is_eligible_reward = false 
       WHERE is_eligible_reward = true 
       AND created_at < NOW() - INTERVAL '24 hours'`
    )
    
    // TokenPage: Show ALL stories (archive) - no 24h limit
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count,
        (SELECT COUNT(*) FROM shares WHERE story_id = s.id) as shares_count
       FROM stories s
       WHERE s.token_hash = $1
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [cleanHash, limit]
    )
    
    return result.rows.map(formatStory)
  } catch (error) {
    console.error('❌ Error getting stories by token:', error)
    throw error
  }
}

/**
 * Get stories by user
 */
async function getStoriesByUser(walletAddress, limit = 20) {
  try {
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count
       FROM stories s
       WHERE s.user_wallet = $1
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [walletAddress, limit]
    )
    
    return result.rows.map(formatStory)
  } catch (error) {
    console.error('❌ Error getting stories by user:', error)
    throw error
  }
}

/**
 * Get single story by ID
 */
async function getStoryById(storyId) {
  try {
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count
       FROM stories s
       WHERE s.id = $1`,
      [storyId]
    )
    
    if (result.rows.length === 0) return null
    return formatStory(result.rows[0])
  } catch (error) {
    console.error('❌ Error getting story:', error)
    throw error
  }
}

/**
 * Increment view count (TikTok-style: counts every view with 30s rate limit)
 */
async function incrementViews(storyId, walletAddress = null) {
  try {
    // Rate limit: Check if user viewed in last 30 seconds
    if (walletAddress) {
      const recentView = await query(
        `SELECT id FROM views 
         WHERE story_id = $1 AND user_wallet = $2 
         AND created_at > NOW() - INTERVAL '30 seconds'`,
        [storyId, walletAddress]
      )
      
      if (recentView.rows.length > 0) {
        console.log(`⏱️ Rate limited: ${walletAddress.substring(0, 10)}... viewed too recently`)
        return await getStoryById(storyId)
      }
    }
    
    // Add view record
    await query(
      'INSERT INTO views (story_id, user_wallet) VALUES ($1, $2)',
      [storyId, walletAddress]
    )
    
    // Update story score
    await updateStoryScore(storyId)
    
    return await getStoryById(storyId)
  } catch (error) {
    console.error('❌ Error incrementing views:', error)
    throw error
  }
}

/**
 * Toggle like (add if not liked, remove if already liked)
 */
async function toggleLike(storyId, walletAddress) {
  try {
    const result = await transaction(async (client) => {
      // Check if already liked
      const checkResult = await client.query(
        'SELECT id FROM likes WHERE story_id = $1 AND user_wallet = $2',
        [storyId, walletAddress]
      )
      
      let liked
      if (checkResult.rows.length > 0) {
        // Unlike
        await client.query(
          'DELETE FROM likes WHERE story_id = $1 AND user_wallet = $2',
          [storyId, walletAddress]
        )
        liked = false
        console.log(`💔 ${walletAddress.substring(0, 10)}... unliked story ${storyId}`)
      } else {
        // Like
        await client.query(
          'INSERT INTO likes (story_id, user_wallet) VALUES ($1, $2)',
          [storyId, walletAddress]
        )
        liked = true
        console.log(`❤️ ${walletAddress.substring(0, 10)}... liked story ${storyId}`)
      }
      
      // Update story score
      await updateStoryScore(storyId, client)
      
      return { liked }
    })
    
    const story = await getStoryById(storyId)
    return { story, liked: result.liked }
  } catch (error) {
    console.error('❌ Error toggling like:', error)
    throw error
  }
}

/**
 * Check if user has liked a story
 */
async function hasUserLiked(storyId, walletAddress) {
  try {
    const result = await query(
      'SELECT id FROM likes WHERE story_id = $1 AND user_wallet = $2',
      [storyId, walletAddress]
    )
    return result.rows.length > 0
  } catch (error) {
    console.error('❌ Error checking like:', error)
    return false
  }
}

/**
 * Add comment to story
 */
async function addComment(storyId, walletAddress, text, userName = null) {
  try {
    const result = await transaction(async (client) => {
      // Insert comment
      const commentResult = await client.query(
        `INSERT INTO comments (story_id, user_wallet, user_name, text)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [storyId, walletAddress, userName, text]
      )
      
      // Update story score
      await updateStoryScore(storyId, client)
      
      return commentResult.rows[0]
    })
    
    console.log(`💬 Comment added to story ${storyId} by ${walletAddress.substring(0, 10)}...`)
    
    return {
      id: result.id,
      storyId: result.story_id,
      userWallet: result.user_wallet,
      userName: result.user_name,
      text: result.text,
      timestamp: result.created_at
    }
  } catch (error) {
    console.error('❌ Error adding comment:', error)
    throw error
  }
}

/**
 * Get comments for a story
 */
async function getComments(storyId) {
  try {
    const result = await query(
      `SELECT * FROM comments 
       WHERE story_id = $1 
       ORDER BY created_at ASC`,
      [storyId]
    )
    
    return result.rows.map(row => ({
      id: row.id,
      storyId: row.story_id,
      userWallet: row.user_wallet,
      userName: row.user_name,
      text: row.text,
      timestamp: row.created_at
    }))
  } catch (error) {
    console.error('❌ Error getting comments:', error)
    return []
  }
}

/**
 * Delete story
 */
async function deleteStory(storyId) {
  try {
    const result = await query(
      'DELETE FROM stories WHERE id = $1 RETURNING *',
      [storyId]
    )
    
    if (result.rows.length > 0) {
      console.log(`🗑️ Story ${storyId} deleted`)
      return true
    }
    return false
  } catch (error) {
    console.error('❌ Error deleting story:', error)
    throw error
  }
}

/**
 * ADMIN: Get all stories with filters
 */
async function getAllStoriesAdmin(filters = {}) {
  try {
    let queryText = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count,
        (SELECT COUNT(*) FROM shares WHERE story_id = s.id) as shares_count,
        (SELECT COUNT(*) FROM reports WHERE story_id = s.id AND status = 'pending') as reports_count
      FROM stories s
      WHERE 1=1
    `
    const params = []
    let paramIndex = 1

    if (filters.tokenHash) {
      const cleanHash = filters.tokenHash.replace(/^hash-/, '')
      queryText += ` AND s.token_hash = $${paramIndex}`
      params.push(cleanHash)
      paramIndex++
    }

    if (filters.userWallet) {
      queryText += ` AND s.user_wallet = $${paramIndex}`
      params.push(filters.userWallet)
      paramIndex++
    }

    if (filters.minReports) {
      queryText += ` AND (SELECT COUNT(*) FROM reports WHERE story_id = s.id AND status = 'pending') >= $${paramIndex}`
      params.push(filters.minReports)
      paramIndex++
    }

    queryText += ` ORDER BY s.created_at DESC`

    if (filters.limit) {
      queryText += ` LIMIT $${paramIndex}`
      params.push(filters.limit)
    }

    const result = await query(queryText, params)
    return result.rows.map(formatStory)
  } catch (error) {
    console.error('❌ Error getting all stories (admin):', error)
    throw error
  }
}

/**
 * ADMIN: Delete multiple stories by IDs
 */
async function deleteStoriesAdmin(storyIds) {
  try {
    const result = await query(
      'DELETE FROM stories WHERE id = ANY($1) RETURNING id',
      [storyIds]
    )
    console.log(`🗑️ Admin deleted ${result.rows.length} stories`)
    return result.rows.map(r => r.id)
  } catch (error) {
    console.error('❌ Error deleting stories (admin):', error)
    throw error
  }
}

/**
 * ADMIN: Delete all stories by user
 */
async function deleteStoriesByUserAdmin(walletAddress) {
  try {
    const result = await query(
      'DELETE FROM stories WHERE user_wallet = $1 RETURNING id',
      [walletAddress]
    )
    console.log(`🗑️ Admin deleted ${result.rows.length} stories from user ${walletAddress}`)
    return result.rows.length
  } catch (error) {
    console.error('❌ Error deleting user stories (admin):', error)
    throw error
  }
}

/**
 * ADMIN: Delete all stories by token
 */
async function deleteStoriesByTokenAdmin(tokenHash) {
  try {
    const cleanHash = tokenHash.replace(/^hash-/, '')
    const result = await query(
      'DELETE FROM stories WHERE token_hash = $1 RETURNING id',
      [cleanHash]
    )
    console.log(`🗑️ Admin deleted ${result.rows.length} stories from token ${cleanHash}`)
    return result.rows.length
  } catch (error) {
    console.error('❌ Error deleting token stories (admin):', error)
    throw error
  }
}

/**
 * Update story score based on engagement
 * Formula: Views×1 + Likes×3 + Comments×5
 */
async function updateStoryScore(storyId, client = null) {
  const db = client || { query }
  
  await db.query(
    `UPDATE stories s
     SET score = (
       (SELECT COUNT(*) FROM views WHERE story_id = s.id) * 1 +
       (SELECT COUNT(*) FROM likes WHERE story_id = s.id) * 2 +
       (SELECT COUNT(*) FROM shares WHERE story_id = s.id) * 5 +
       (SELECT COUNT(*) FROM comments WHERE story_id = s.id) * 1
     )
     WHERE s.id = $1`,
    [storyId]
  )
}

/**
 * Format story object from database row
 */
function formatStory(row) {
  return {
    id: row.id,
    userWallet: row.user_wallet,
    tokenHash: row.token_hash,
    tokenSymbol: row.token_symbol,
    tokenLogo: row.token_logo,
    caption: row.caption,
    videoUrl: row.video_url,
    mediaType: row.media_type,
    overlayText: row.overlay_text,
    musicUrl: row.music_url,
    duration: row.duration,
    score: row.score,
    likesCount: parseInt(row.likes_count) || 0,
    commentsCount: parseInt(row.comments_count) || 0,
    viewsCount: parseInt(row.views_count) || 0,
    sharesCount: parseInt(row.shares_count) || 0,
    isEligibleReward: row.is_eligible_reward,
    createdAt: row.created_at
  }
}

/**
 * Increment share count (1 max per wallet to prevent spam)
 */
async function incrementShares(storyId, walletAddress = null) {
  try {
    // Check if user already shared
    if (walletAddress) {
      const existingShare = await query(
        'SELECT id FROM shares WHERE story_id = $1 AND user_wallet = $2',
        [storyId, walletAddress]
      )
      
      if (existingShare.rows.length > 0) {
        console.log(`🔄 Already shared: ${walletAddress.substring(0, 10)}... already shared story ${storyId}`)
        return await getStoryById(storyId)
      }
    }
    
    // Add share record
    await query(
      'INSERT INTO shares (story_id, user_wallet) VALUES ($1, $2)',
      [storyId, walletAddress]
    )
    
    // Update story score
    await updateStoryScore(storyId)
    
    console.log(`🔗 ${walletAddress?.substring(0, 10) || 'Anonymous'}... shared story ${storyId}`)
    return await getStoryById(storyId)
  } catch (error) {
    console.error('❌ Error incrementing shares:', error)
    throw error
  }
}

/**
 * Get user profile (for backward compatibility)
 */
async function getProfile(walletAddress) {
  const { getProfile: getUserProfile } = await import('./users-db.js')
  return getUserProfile(walletAddress)
}

/**
 * Update user profile (for backward compatibility)
 */
async function updateProfile(walletAddress, updates) {
  const { updateProfile: updateUserProfile } = await import('./users-db.js')
  return updateUserProfile(walletAddress, updates)
}

// ==================== CTO ACCESS MANAGEMENT ====================

// 🔧 PRODUCTION MODE: 90 days inactivity
const CTO_INACTIVITY_DAYS = 90 // 90 days of inactivity before CTO can be reclaimed

/**
 * Update CTO activity timestamp
 */
async function updateCTOActivity(tokenHash, walletAddress) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    await query(
      `INSERT INTO cto_access (token_hash, wallet_address, last_activity)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (token_hash, wallet_address)
       DO UPDATE SET last_activity = CURRENT_TIMESTAMP`,
      [cleanHash, walletAddress.toLowerCase()]
    )
    console.log(`⏰ Activity updated for ${walletAddress.substring(0, 10)}... on ${tokenHash.substring(0, 10)}...`)
  } catch (error) {
    console.error('❌ Error updating CTO activity:', error)
  }
}

/**
 * Grant CTO access
 */
async function grantCTOAccess(tokenHash, walletAddress, paymentAmount = 1000, txHash = null) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    const result = await query(
      `INSERT INTO cto_access (token_hash, wallet_address, paid_amount, transaction_hash, last_activity)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (token_hash, wallet_address)
       DO UPDATE SET last_activity = CURRENT_TIMESTAMP, paid_amount = $3, transaction_hash = $4
       RETURNING *`,
      [cleanHash, walletAddress.toLowerCase(), paymentAmount, txHash]
    )
    
    console.log(`🔥 CTO access granted to ${walletAddress.substring(0, 10)}... for token ${tokenHash.substring(0, 10)}...`)
    
    return {
      tokenHash: result.rows[0].token_hash,
      walletAddress: result.rows[0].wallet_address,
      grantedAt: result.rows[0].granted_at,
      paidAmount: result.rows[0].paid_amount
    }
  } catch (error) {
    console.error('❌ Error granting CTO access:', error)
    throw error
  }
}

/**
 * Check if wallet has CTO access
 */
async function hasCTOAccess(tokenHash, walletAddress, network = 'mainnet') {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    console.log(`🔎 hasCTOAccess query:`, { 
      cleanHash: cleanHash.substring(0, 12) + '...', 
      wallet: walletAddress.substring(0, 12) + '...',
      walletLower: walletAddress.toLowerCase().substring(0, 12) + '...',
      network
    })
    
    // Check ONLY for specific token - each token must be paid separately
    const result = await query(
      'SELECT id FROM cto_access WHERE token_hash = $1 AND wallet_address = $2 AND network = $3',
      [cleanHash, walletAddress.toLowerCase(), network]
    )
    
    console.log(`📊 hasCTOAccess result:`, { found: result.rows.length > 0, rows: result.rows.length })
    
    return result.rows.length > 0
  } catch (error) {
    console.error('❌ Error checking CTO access:', error)
    return false
  }
}

/**
 * Get all CTO holders for a token
 */
async function getCTOHolders(tokenHash, network = 'mainnet') {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    console.log(`🔍 getCTOHolders for token:`, cleanHash.substring(0, 12) + '...', `(${network})`)
    
    const result = await query(
      'SELECT wallet_address, last_activity, granted_at FROM cto_access WHERE token_hash = $1 AND network = $2',
      [cleanHash, network]
    )
    
    console.log(`📊 Found ${result.rows.length} CTO holders on ${network}:`, result.rows.map(r => ({ 
      wallet: r.wallet_address.substring(0, 12) + '...', 
      granted: r.granted_at 
    })))
    
    return result.rows.map(row => row.wallet_address)
  } catch (error) {
    console.error('❌ Error getting CTO holders:', error)
    return []
  }
}

/**
 * Get last activity for wallet on token
 */
async function getLastActivity(tokenHash, walletAddress) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    // Check CTO activity table first
    const ctoResult = await query(
      'SELECT last_activity FROM cto_access WHERE token_hash = $1 AND wallet_address = $2',
      [cleanHash, walletAddress.toLowerCase()]
    )
    
    if (ctoResult.rows.length > 0) {
      return ctoResult.rows[0].last_activity
    }
    
    // Check most recent story upload
    const storyResult = await query(
      'SELECT created_at FROM stories WHERE token_hash = $1 AND user_wallet = $2 ORDER BY created_at DESC LIMIT 1',
      [tokenHash, walletAddress]
    )
    
    return storyResult.rows.length > 0 ? storyResult.rows[0].created_at : null
  } catch (error) {
    console.error('❌ Error getting last activity:', error)
    return null
  }
}

/**
 * Check if wallet is inactive (90+ days)
 */
async function isInactive(tokenHash, walletAddress) {
  // Note: getLastActivity already normalizes the hash
  const lastActivity = await getLastActivity(tokenHash, walletAddress)
  
  console.log(`⏰ isInactive check:`, { 
    wallet: walletAddress.substring(0, 12) + '...', 
    lastActivity,
    hasActivity: !!lastActivity
  })
  
  // 🆕 No activity = NEW token or NEW CTO holder = ACTIVE by default
  // Only mark as inactive if they HAD activity but stopped for 90+ days
  if (!lastActivity) {
    console.log(`✅ No activity = ACTIVE (new holder)`)
    return false  // ✅ No history = considered ACTIVE
  }
  
  const daysSinceActivity = (Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
  const inactive = daysSinceActivity >= CTO_INACTIVITY_DAYS
  
  console.log(`📊 Activity check:`, { 
    daysSinceActivity: daysSinceActivity.toFixed(2), 
    threshold: CTO_INACTIVITY_DAYS,
    inactive
  })
  
  return inactive
}

/**
 * Revoke CTO access
 */
async function revokeCTOAccess(tokenHash, walletAddress) {
  try {
    // Normalize token hash (remove hash- prefix for consistency)
    const cleanHash = tokenHash?.replace(/^hash-/, '') || tokenHash
    
    await query(
      'DELETE FROM cto_access WHERE token_hash = $1 AND wallet_address = $2',
      [cleanHash, walletAddress.toLowerCase()]
    )
    console.log(`❌ CTO access revoked for ${walletAddress.substring(0, 10)}... (inactivity)`)
  } catch (error) {
    console.error('❌ Error revoking CTO access:', error)
  }
}

/**
 * Check if wallet can upload stories
 */
async function canUploadStories(tokenHash, walletAddress, tokenOwner, network = 'mainnet') {
  console.log(`🔐 canUploadStories:`, { 
    tokenHash: tokenHash.substring(0, 12) + '...', 
    wallet: walletAddress.substring(0, 12) + '...',
    owner: tokenOwner?.substring(0, 12) + '...',
    network
  })
  
  // Note: hasCTOAccess, getCTOHolders, isInactive already normalize the hash
  const isOwner = walletAddress.toLowerCase() === tokenOwner?.toLowerCase()
  const hasCTO = await hasCTOAccess(tokenHash, walletAddress, network)
  
  console.log(`📊 Upload check:`, { isOwner, hasCTO })
  
  // Check if there's an ACTIVE CTO holder (someone claimed control)
  const ctoHolders = await getCTOHolders(tokenHash, network)
  let hasActiveCTOHolder = false
  let activeCTOWallet = null
  
  for (const holder of ctoHolders) {
    const inactive = await isInactive(tokenHash, holder)
    console.log(`👤 CTO holder ${holder.substring(0, 12)}...: inactive=${inactive}`)
    if (!inactive) {
      hasActiveCTOHolder = true
      activeCTOWallet = holder
      break
    }
  }
  
  console.log(`✅ Has active CTO holder: ${hasActiveCTOHolder}`, activeCTOWallet?.substring(0, 12) + '...')
  
  // 🔥 CRITICAL: If user HAS CTO access, they can ALWAYS upload (even if inactive!)
  // Inactivity only allows OTHERS to reclaim, but doesn't block YOUR uploads
  if (hasCTO) {
    console.log(`✅ GRANTED: User has CTO access - can upload regardless of inactivity`)
    return {
      canUpload: true,
      reason: 'cto-holder',
      canReclaim: false
    }
  }
  
  // 🔥 If there's an ACTIVE CTO holder and user is NOT the holder, DENY
  if (hasActiveCTOHolder && !hasCTO) {
    console.log(`🚫 DENIED: Active CTO holder exists, user doesn't have CTO`)
    return {
      canUpload: false,
      reason: 'cto-claimed',
      canReclaim: false,
      message: 'Control transferred to CTO holder. Owner lost access.'
    }
  }
  
  // Owner has access ONLY if no CTO holder exists (active or inactive)
  if (isOwner && ctoHolders.length === 0) {
    console.log(`✅ GRANTED: User is owner and no CTO holder exists`)
    return {
      canUpload: true,
      reason: 'owner',
      canReclaim: false
    }
  }
  
  // If there's an INACTIVE CTO holder and user is owner
  if (isOwner && ctoHolders.length > 0 && !hasActiveCTOHolder) {
    console.log(`🚫 DENIED: Owner but there's an INACTIVE CTO holder - must wait for reclaim`)
    return {
      canUpload: false,
      reason: 'inactive-cto-exists',
      canReclaim: true,
      message: 'CTO holder is inactive but still holds access. Wait for someone to reclaim it.'
    }
  }
  
  // Default: no access
  console.log(`🚫 DENIED: No valid access found`)
  return {
    canUpload: false,
    reason: 'no-access',
    canReclaim: false
  }
}

/**
 * Check if CTO can be reclaimed
 */
async function canReclaimCTO(tokenHash, tokenOwner) {
  // Note: isInactive, getCTOHolders, getLastActivity already normalize the hash
  const holders = await getCTOHolders(tokenHash)
  
  // If there are NO CTO holders, ANYONE can claim (token is available)
  if (holders.length === 0) {
    const lastActivity = await getLastActivity(tokenHash, tokenOwner)
    const daysSinceActivity = lastActivity 
      ? Math.floor((Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
      : null
    
    return {
      canReclaim: true,  // ✅ No CTO holders = available for claim
      reason: 'no-cto-holder',
      currentController: tokenOwner,
      daysSinceActivity
    }
  }
  
  // If there ARE CTO holders, check their inactivity
  const ownerInactive = tokenOwner && await isInactive(tokenHash, tokenOwner)
  let ctoHolderInactive = false
  let currentController = tokenOwner
  
  for (const holder of holders) {
    if (!await isInactive(tokenHash, holder)) {
      currentController = holder
      break
    } else {
      ctoHolderInactive = true
    }
  }
  
  const lastActivity = await getLastActivity(tokenHash, currentController)
  const daysSinceActivity = lastActivity 
    ? Math.floor((Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
    : null
  
  return {
    canReclaim: ownerInactive || ctoHolderInactive,
    reason: ownerInactive ? 'owner-inactive' : ctoHolderInactive ? 'cto-holder-inactive' : 'active',
    currentController,
    daysSinceActivity
  }
}

/**
 * Get top stories from last 24h (eligible for rewards)
 * Returns stories sorted by score
 */
async function getTopStoriesForRewards(limit = 10) {
  try {
    const result = await query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM likes WHERE story_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE story_id = s.id) as comments_count,
        (SELECT COUNT(*) FROM views WHERE story_id = s.id) as views_count
       FROM stories s
       WHERE s.is_eligible_reward = false  -- Just expired in last 24h
       AND s.created_at >= NOW() - INTERVAL '48 hours'  -- But not older than 48h
       AND s.created_at < NOW() - INTERVAL '24 hours'   -- Older than 24h
       ORDER BY s.score DESC
       LIMIT $1`,
      [limit]
    )
    
    return result.rows.map(formatStory)
  } catch (error) {
    console.error('❌ Error getting top stories for rewards:', error)
    throw error
  }
}

/**
 * Mark stories as rewarded
 */
async function markStoriesAsRewarded(storyIds) {
  try {
    if (storyIds.length === 0) return
    
    await query(
      `UPDATE stories 
       SET is_eligible_reward = false 
       WHERE id = ANY($1::int[])`,
      [storyIds]
    )
    
    console.log(`✅ Marked ${storyIds.length} stories as rewarded`)
  } catch (error) {
    console.error('❌ Error marking stories as rewarded:', error)
    throw error
  }
}

/**
 * Report a story
 */
async function reportStory(data) {
  try {
    const result = await query(
      `INSERT INTO reports (story_id, reporter_wallet, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.storyId, data.reporterWallet, data.reason, data.description || '']
    )
    
    console.log(`🚨 Story ${data.storyId} reported by ${data.reporterWallet.substring(0, 10)}... (${data.reason})`)
    return result.rows[0]
  } catch (error) {
    console.error('❌ Error reporting story:', error)
    throw error
  }
}

/**
 * Get all reports (admin)
 */
async function getAllReports(status = null) {
  try {
    let queryText = `
      SELECT r.*, s.caption, s.video_url, s.media_type, s.token_hash, s.user_wallet as story_owner
      FROM reports r
      JOIN stories s ON r.story_id = s.id
    `
    const params = []
    
    if (status) {
      queryText += ` WHERE r.status = $1`
      params.push(status)
    }
    
    queryText += ` ORDER BY r.created_at DESC`
    
    const result = await query(queryText, params)
    return result.rows
  } catch (error) {
    console.error('❌ Error getting reports:', error)
    throw error
  }
}

/**
 * Resolve a report
 */
async function resolveReport(reportId, resolvedBy, action) {
  try {
    const result = await query(
      `UPDATE reports 
       SET status = $1, resolved_by = $2, resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [action, resolvedBy, reportId]
    )
    
    console.log(`✅ Report ${reportId} resolved: ${action} by ${resolvedBy.substring(0, 10)}...`)
    return result.rows[0]
  } catch (error) {
    console.error('❌ Error resolving report:', error)
    throw error
  }
}

/**
 * Check if user has access to update token (owner or CTO)
 */
async function checkAccess(tokenHash, walletAddress, tokenOwner = null) {
  try {
    // Check if user is the token owner
    if (tokenOwner && walletAddress.toLowerCase() === tokenOwner.toLowerCase()) {
      console.log('✅ Access granted: User is token owner')
      return true
    }
    
    // Check if user has CTO access
    const hasCTO = await hasCTOAccess(tokenHash, walletAddress)
    if (hasCTO) {
      console.log('✅ Access granted: User has CTO access')
      return true
    }
    
    console.log('❌ Access denied: User is not owner or CTO')
    return false
  } catch (error) {
    console.error('❌ Error checking access:', error)
    return false
  }
}

export {
  createStory,
  getAllStories,
  getStoriesByToken,
  getStoriesByUser,
  getStoryById,
  incrementViews,
  toggleLike,
  hasUserLiked,
  addComment,
  getComments,
  deleteStory,
  incrementShares,
  getProfile,
  updateProfile,
  updateCTOActivity,
  grantCTOAccess,
  hasCTOAccess,
  getCTOHolders,
  getLastActivity,
  isInactive,
  revokeCTOAccess,
  canUploadStories,
  canReclaimCTO,
  getTopStoriesForRewards,
  markStoriesAsRewarded,
  reportStory,
  getAllReports,
  resolveReport,
  checkAccess,
  query, // Export query for admin endpoints
  // Admin functions
  getAllStoriesAdmin,
  deleteStoriesAdmin,
  deleteStoriesByUserAdmin,
  deleteStoriesByTokenAdmin
}
