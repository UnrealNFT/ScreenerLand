// Simple in-memory database for stories (will move to MongoDB later)
// Structure: Map<storyId, Story>

export const storiesDB = new Map()
export const likesDB = new Map() // Map<storyId, Set<walletAddress>>
export const commentsDB = new Map() // Map<storyId, [comments]>
export const profilesDB = new Map() // Map<walletAddress, Profile>
export const dailyScoresDB = new Map() // Map<date, [{ storyId, score, reward }]>
export const ctoAccessDB = new Map() // Map<tokenHash, Set<walletAddress>> - CTO access tracking
export const ctoActivityDB = new Map() // Map<tokenHash+wallet, lastActivity> - Track last upload time

const CTO_INACTIVITY_DAYS = 90 // 90 days without upload = CTO can be reclaimed

let storyIdCounter = 1

// Create a new story
export function createStory(data) {
  const storyId = `story-${storyIdCounter++}`
  
  const story = {
    id: storyId,
    userWallet: data.userWallet,
    tokenHash: data.tokenHash,
    tokenSymbol: data.tokenSymbol,
    tokenLogo: data.tokenLogo || null,
    videoUrl: data.videoUrl, // Media file URL (video, image, or gif)
    mediaType: data.mediaType || 'video', // 'video' | 'image' | 'gif'
    musicUrl: data.musicUrl || null, // Optional background music
    caption: data.caption || '',
    overlayText: data.overlayText || '', // Text displayed on media
    duration: data.duration || 0,
    createdAt: new Date().toISOString(),
    viewsCount: 0,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    score: 0,
    isEligibleReward: true
  }
  
  storiesDB.set(storyId, story)
  
  // Initialize likes and comments
  likesDB.set(storyId, new Set())
  commentsDB.set(storyId, [])
  
  // Update activity timestamp for CTO tracking
  updateCTOActivity(data.tokenHash, data.userWallet)
  
  console.log(`✅ Story created: ${storyId} (${data.mediaType}) by ${data.userWallet.substring(0, 10)}...${data.musicUrl ? ' 🎵' : ''}`)
  
  return story
}

// Get all stories (sorted by most recent)
export function getAllStories(limit = 50, offset = 0) {
  const stories = Array.from(storiesDB.values())
    .map(story => {
      // Check if story is still eligible for rewards (< 24h old)
      const now = new Date()
      const created = new Date(story.createdAt)
      const ageHours = (now - created) / (1000 * 60 * 60)
      
      // Update eligibility if needed
      if (ageHours >= 24 && story.isEligibleReward) {
        story.isEligibleReward = false
        storiesDB.set(story.id, story)
        console.log(`⏰ Story ${story.id} is now expired (24h+)`)
      }
      
      return story
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit)
  
  return stories
}

// Get stories by token
export function getStoriesByToken(tokenHash, limit = 20) {
  const stories = Array.from(storiesDB.values())
    .filter(s => s.tokenHash === tokenHash)
    .map(story => {
      // Check if story is still eligible for rewards (< 24h old)
      const now = new Date()
      const created = new Date(story.createdAt)
      const ageHours = (now - created) / (1000 * 60 * 60)
      
      // Update eligibility if needed
      if (ageHours >= 24 && story.isEligibleReward) {
        story.isEligibleReward = false
        storiesDB.set(story.id, story)
        console.log(`⏰ Story ${story.id} is now expired (24h+)`)
      }
      
      return story
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
  
  return stories
}

// Get stories by user
export function getStoriesByUser(walletAddress, limit = 20) {
  const stories = Array.from(storiesDB.values())
    .filter(s => s.userWallet === walletAddress)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
  
  return stories
}

// Increment view count
export function incrementViews(storyId) {
  const story = storiesDB.get(storyId)
  if (story) {
    story.viewsCount++
    story.score = calculateScore(story)
    storiesDB.set(storyId, story)
    return story
  }
  return null
}

// Toggle like (add if not liked, remove if already liked)
export function toggleLike(storyId, walletAddress) {
  const story = storiesDB.get(storyId)
  const likes = likesDB.get(storyId)
  
  if (!story || !likes) return null
  
  const hadLiked = likes.has(walletAddress)
  
  if (hadLiked) {
    likes.delete(walletAddress)
    story.likesCount--
  } else {
    likes.add(walletAddress)
    story.likesCount++
  }
  
  story.score = calculateScore(story)
  storiesDB.set(storyId, story)
  
  console.log(`${hadLiked ? '💔' : '❤️'} ${walletAddress.substring(0, 10)}... ${hadLiked ? 'unliked' : 'liked'} ${storyId}`)
  
  return { story, liked: !hadLiked }
}

// Add comment
export function addComment(storyId, walletAddress, text, parentId = null) {
  const story = storiesDB.get(storyId)
  const comments = commentsDB.get(storyId)
  
  if (!story || !comments) return null
  
  const comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    storyId,
    userWallet: walletAddress,
    text,
    timestamp: new Date().toISOString(),
    parentId,
    likesCount: 0
  }
  
  comments.push(comment)
  story.commentsCount++
  story.score = calculateScore(story)
  
  storiesDB.set(storyId, story)
  
  console.log(`💬 Comment added to ${storyId} by ${walletAddress.substring(0, 10)}...`)
  
  return comment
}

// Get comments for a story
export function getComments(storyId) {
  return commentsDB.get(storyId) || []
}

// Increment share count
export function incrementShares(storyId) {
  const story = storiesDB.get(storyId)
  if (story) {
    story.sharesCount++
    story.score = calculateScore(story)
    storiesDB.set(storyId, story)
    return story
  }
  return null
}

// Calculate score: Views×1 + Likes×3 + Comments×5 + Shares×10
function calculateScore(story) {
  return (
    story.viewsCount * 1 +
    story.likesCount * 3 +
    story.commentsCount * 5 +
    story.sharesCount * 10
  )
}

// Get top stories by score
export function getTopStories(limit = 10, dateFilter = null) {
  let stories = Array.from(storiesDB.values())
  
  // Filter by date if provided (for daily leaderboard)
  if (dateFilter) {
    const startOfDay = new Date(dateFilter)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(dateFilter)
    endOfDay.setHours(23, 59, 59, 999)
    
    stories = stories.filter(s => {
      const createdDate = new Date(s.createdAt)
      return createdDate >= startOfDay && createdDate <= endOfDay
    })
  }
  
  return stories
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Get or create user profile
export function getProfile(walletAddress) {
  let profile = profilesDB.get(walletAddress)
  
  if (!profile) {
    profile = {
      walletAddress,
      username: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      twitter: null,
      telegram: null,
      website: null,
      totalViews: 0,
      totalLikes: 0,
      totalStories: 0,
      createdAt: new Date().toISOString()
    }
    profilesDB.set(walletAddress, profile)
  }
  
  // Calculate live stats
  const userStories = getStoriesByUser(walletAddress, 1000)
  profile.totalStories = userStories.length
  profile.totalViews = userStories.reduce((sum, s) => sum + s.viewsCount, 0)
  profile.totalLikes = userStories.reduce((sum, s) => sum + s.likesCount, 0)
  
  return profile
}

// Update user profile
export function updateProfile(walletAddress, updates) {
  const profile = getProfile(walletAddress)
  
  if (updates.username) profile.username = updates.username
  if (updates.avatarUrl) profile.avatarUrl = updates.avatarUrl
  if (updates.bannerUrl) profile.bannerUrl = updates.bannerUrl
  if (updates.bio) profile.bio = updates.bio
  if (updates.twitter) profile.twitter = updates.twitter
  if (updates.telegram) profile.telegram = updates.telegram
  if (updates.website) profile.website = updates.website
  
  profilesDB.set(walletAddress, profile)
  
  console.log(`✅ Profile updated for ${walletAddress.substring(0, 10)}...`)
  
  return profile
}

// Check if user has liked a story
export function hasUserLiked(storyId, walletAddress) {
  const likes = likesDB.get(storyId)
  return likes ? likes.has(walletAddress) : false
}

// ==================== CTO ACCESS MANAGEMENT ====================

// Update activity timestamp when user uploads a story
export function updateCTOActivity(tokenHash, walletAddress) {
  const key = `${tokenHash}:${walletAddress.toLowerCase()}`
  ctoActivityDB.set(key, new Date().toISOString())
  console.log(`⏰ Activity updated for ${walletAddress.substring(0, 10)}... on ${tokenHash.substring(0, 10)}...`)
}

// Get last activity timestamp
export function getLastActivity(tokenHash, walletAddress) {
  const key = `${tokenHash}:${walletAddress.toLowerCase()}`
  return ctoActivityDB.get(key)
}

// Check if current CTO/Owner is inactive (90+ days without upload)
export function isInactive(tokenHash, walletAddress) {
  const lastActivity = getLastActivity(tokenHash, walletAddress)
  
  if (!lastActivity) {
    // No activity recorded = check if they have any stories
    const stories = getStoriesByUser(walletAddress)
    const tokenStories = stories.filter(s => s.tokenHash === tokenHash)
    
    if (tokenStories.length === 0) {
      // Never uploaded for this token = considered inactive
      return true
    }
    
    // Use most recent story timestamp
    const mostRecent = tokenStories.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0]
    
    const daysSinceUpload = (Date.now() - new Date(mostRecent.createdAt)) / (1000 * 60 * 60 * 24)
    return daysSinceUpload >= CTO_INACTIVITY_DAYS
  }
  
  // Check days since last activity
  const daysSinceActivity = (Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
  return daysSinceActivity >= CTO_INACTIVITY_DAYS
}

// Get current active CTO holder (or null if inactive)
export function getActiveCTO(tokenHash) {
  const holders = getCTOHolders(tokenHash)
  
  for (const holder of holders) {
    if (!isInactive(tokenHash, holder)) {
      return {
        wallet: holder,
        lastActivity: getLastActivity(tokenHash, holder),
        isActive: true
      }
    }
  }
  
  return null
}

// Revoke CTO access (when someone reclaims)
export function revokeCTOAccess(tokenHash, walletAddress) {
  const accessSet = ctoAccessDB.get(tokenHash)
  if (accessSet) {
    accessSet.delete(walletAddress.toLowerCase())
    console.log(`❌ CTO access revoked for ${walletAddress.substring(0, 10)}... (inactivity)`)
  }
}

// Grant CTO access to a wallet for a specific token
export function grantCTOAccess(tokenHash, walletAddress, paymentAmount) {
  if (!ctoAccessDB.has(tokenHash)) {
    ctoAccessDB.set(tokenHash, new Set())
  }
  
  const accessSet = ctoAccessDB.get(tokenHash)
  accessSet.add(walletAddress.toLowerCase())
  
  // Set initial activity timestamp
  updateCTOActivity(tokenHash, walletAddress)
  
  console.log(`🔥 CTO access granted to ${walletAddress.substring(0, 10)}... for token ${tokenHash.substring(0, 10)}... (${paymentAmount} CSPR)`)
  
  return {
    tokenHash,
    walletAddress,
    grantedAt: new Date().toISOString(),
    paidAmount: paymentAmount
  }
}

// Check if wallet has CTO access for a token
export function hasCTOAccess(tokenHash, walletAddress) {
  const accessSet = ctoAccessDB.get(tokenHash)
  return accessSet ? accessSet.has(walletAddress.toLowerCase()) : false
}

// Get all CTO holders for a token
export function getCTOHolders(tokenHash) {
  const accessSet = ctoAccessDB.get(tokenHash)
  return accessSet ? Array.from(accessSet) : []
}

// Check if wallet can upload stories (either owner or CTO holder)
export function canUploadStories(tokenHash, walletAddress, tokenOwner) {
  const isOwner = walletAddress.toLowerCase() === tokenOwner?.toLowerCase()
  const hasCTO = hasCTOAccess(tokenHash, walletAddress)
  
  // Check if owner is inactive
  if (isOwner && isInactive(tokenHash, walletAddress)) {
    return {
      canUpload: false,
      reason: 'owner-inactive',
      canReclaim: true,
      inactiveDays: CTO_INACTIVITY_DAYS
    }
  }
  
  // Check if CTO holder is inactive
  if (hasCTO && isInactive(tokenHash, walletAddress)) {
    return {
      canUpload: false,
      reason: 'cto-holder-inactive',
      canReclaim: true,
      inactiveDays: CTO_INACTIVITY_DAYS
    }
  }
  
  return {
    canUpload: isOwner || hasCTO,
    reason: isOwner ? 'owner' : hasCTO ? 'cto-holder' : 'no-access',
    canReclaim: false
  }
}

// Check if CTO can be reclaimed (current owner or CTO holder is inactive)
export function canReclaimCTO(tokenHash, tokenOwner) {
  // Check if owner is inactive
  const ownerInactive = tokenOwner && isInactive(tokenHash, tokenOwner)
  
  // Check if current CTO holder is inactive
  const activeCTO = getActiveCTO(tokenHash)
  const ctoHolderInactive = !activeCTO && getCTOHolders(tokenHash).length > 0
  
  return {
    canReclaim: ownerInactive || ctoHolderInactive,
    reason: ownerInactive ? 'owner-inactive' : ctoHolderInactive ? 'cto-holder-inactive' : 'active',
    currentController: activeCTO?.wallet || tokenOwner, // The person who currently controls uploads
    daysSinceActivity: activeCTO?.lastActivity 
      ? Math.floor((Date.now() - new Date(activeCTO.lastActivity)) / (1000 * 60 * 60 * 24))
      : null
  }
}

// Delete a story
export function deleteStory(storyId, walletAddress) {
  const story = storiesDB.get(storyId)
  
  if (!story) {
    return { success: false, error: 'Story not found' }
  }
  
  // Only allow owner to delete
  if (story.userWallet !== walletAddress) {
    return { success: false, error: 'Only the story creator can delete it' }
  }
  
  // Delete from all databases
  storiesDB.delete(storyId)
  likesDB.delete(storyId)
  commentsDB.delete(storyId)
  
  console.log(`🗑️ Story deleted: ${storyId} by ${walletAddress.substring(0, 10)}...`)
  
  return { success: true }
}
