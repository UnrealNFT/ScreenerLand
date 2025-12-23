import { query } from './db.js'

/**
 * Get user profile by wallet address
 */
async function getProfile(walletAddress) {
  try {
    const result = await query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    )
    
    console.log(`🔍 DB Query for ${walletAddress.substring(0, 8)}...: found ${result.rows.length} rows`, 
      result.rows[0] ? {
        name: result.rows[0].name,
        avatar_url: result.rows[0].avatar_url?.substring(0, 50) + '...',
        hasAvatar: !!result.rows[0].avatar_url
      } : 'NO DATA')
    
    if (result.rows.length === 0) {
      // Create user if doesn't exist
      await query(
        'INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING',
        [walletAddress]
      )
      
      return {
        walletAddress,
        name: null,
        bio: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
    
    return {
      walletAddress: result.rows[0].wallet_address,
      name: result.rows[0].name,
      bio: result.rows[0].bio,
      avatarUrl: result.rows[0].avatar_url,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    }
  } catch (error) {
    console.error('❌ Error getting profile:', error)
    throw error
  }
}

/**
 * Update user profile (creates if doesn't exist)
 */
async function updateProfile(walletAddress, updates) {
  try {
    const { name, bio, avatarUrl } = updates
    
    // Upsert (INSERT ... ON CONFLICT UPDATE)
    // Note: avatar_url is directly updated (not COALESCE) to allow updates
    const result = await query(
      `INSERT INTO users (wallet_address, name, bio, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet_address) 
       DO UPDATE SET 
         name = COALESCE($2, users.name),
         bio = COALESCE($3, users.bio),
         avatar_url = $4,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [walletAddress, name || null, bio || null, avatarUrl || null]
    )
    
    console.log(`✅ Profile updated for ${walletAddress}: ${name || 'No name'}`)
    
    return {
      walletAddress: result.rows[0].wallet_address,
      name: result.rows[0].name,
      bio: result.rows[0].bio,
      avatarUrl: result.rows[0].avatar_url,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    }
  } catch (error) {
    console.error('❌ Error updating profile:', error)
    throw error
  }
}

/**
 * Get multiple profiles (for batch operations)
 */
async function getProfiles(walletAddresses) {
  try {
    const result = await query(
      'SELECT * FROM users WHERE wallet_address = ANY($1)',
      [walletAddresses]
    )
    
    const profilesMap = {}
    result.rows.forEach(row => {
      profilesMap[row.wallet_address] = {
        walletAddress: row.wallet_address,
        name: row.name,
        bio: row.bio,
        avatarUrl: row.avatar_url
      }
    })
    
    return profilesMap
  } catch (error) {
    console.error('❌ Error getting profiles:', error)
    throw error
  }
}

export {
  getProfile,
  updateProfile,
  getProfiles,
  // Aliases for compatibility
  getProfile as getUserProfile,
  updateProfile as updateUserProfile
}
