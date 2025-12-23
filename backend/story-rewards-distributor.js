import * as storiesDB from './stories-db.js'
import dotenv from 'dotenv'

dotenv.config()

// Smart contract configuration
const CONTRACT_HASH = process.env.SCREENER_CONTRACT_HASH || 'hash-xxxxx'
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || 'account-hash-xxxxx'

// Reward distribution config
const TOP_STORIES_COUNT = 10 // Top 10 stories get rewards
const REWARD_DISTRIBUTION = {
  1: 0.30,  // 30% to #1
  2: 0.20,  // 20% to #2
  3: 0.15,  // 15% to #3
  4: 0.10,  // 10% to #4
  5: 0.08,  // 8% to #5
  6: 0.06,  // 6% to #6
  7: 0.04,  // 4% to #7
  8: 0.03,  // 3% to #8
  9: 0.02,  // 2% to #9
  10: 0.02  // 2% to #10
}

/**
 * Calculate rewards for top stories
 * @param {Array} topStories - Top stories sorted by score
 * @param {number} totalPoolCSPR - Total CSPR in reward pool
 * @returns {Array} Array of { wallet, amount, storyId, rank }
 */
function calculateRewards(topStories, totalPoolCSPR) {
  const rewards = []
  
  for (let i = 0; i < topStories.length && i < TOP_STORIES_COUNT; i++) {
    const story = topStories[i]
    const rank = i + 1
    const percentage = REWARD_DISTRIBUTION[rank] || 0
    const amountCSPR = totalPoolCSPR * percentage
    
    rewards.push({
      wallet: story.userWallet,
      amountCSPR,
      amountMotes: Math.floor(amountCSPR * 1_000_000_000), // Convert to motes
      storyId: story.id,
      rank,
      score: story.score,
      tokenHash: story.tokenHash
    })
  }
  
  return rewards
}

/**
 * Distribute rewards to story creators
 * This function should be called by a cron job every 24 hours
 */
async function distributeStoryRewards() {
  console.log('🎁 Starting daily story rewards distribution...')
  
  try {
    // 1. Get top stories from last 24h
    const topStories = await storiesDB.getTopStoriesForRewards(TOP_STORIES_COUNT)
    
    if (topStories.length === 0) {
      console.log('ℹ️ No eligible stories for rewards today')
      return { success: true, distributed: 0 }
    }
    
    console.log(`📊 Found ${topStories.length} eligible stories`)
    topStories.forEach((story, i) => {
      console.log(`  ${i + 1}. Story #${story.id} by ${story.userWallet.substring(0, 10)}... - Score: ${story.score}`)
    })
    
    // 2. Get available reward pool from smart contract
    // TODO: Call contract.get_stories_pool_balance()
    // For now, simulate with environment variable
    const totalPoolCSPR = parseFloat(process.env.STORY_REWARDS_POOL_CSPR || '100')
    console.log(`💰 Total reward pool: ${totalPoolCSPR} CSPR`)
    
    // 3. Calculate reward distribution
    const rewards = calculateRewards(topStories, totalPoolCSPR)
    
    console.log('💸 Reward distribution:')
    rewards.forEach(reward => {
      console.log(`  #${reward.rank}: ${reward.amountCSPR.toFixed(2)} CSPR → ${reward.wallet.substring(0, 10)}... (Story #${reward.storyId})`)
    })
    
    // 4. Send rewards via smart contract
    // TODO: For each reward, call contract.transfer_story_reward(wallet, amount)
    // This would require signing with platform wallet
    
    console.log('⚠️ Actual blockchain distribution not yet implemented')
    console.log('💡 For now, rewards are calculated and logged. Next step:')
    console.log('   - Implement smart contract call to transfer CSPR from stories_pool')
    console.log('   - Or send manually via casper-client')
    
    // 5. Mark stories as rewarded (so they don't get rewarded again)
    const storyIds = rewards.map(r => r.storyId)
    await storiesDB.markStoriesAsRewarded(storyIds)
    
    console.log('✅ Story rewards distribution complete!')
    
    return {
      success: true,
      distributed: rewards.length,
      totalAmount: rewards.reduce((sum, r) => sum + r.amountCSPR, 0),
      rewards
    }
    
  } catch (error) {
    console.error('❌ Error distributing story rewards:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Manual distribution for testing
 */
async function manualDistribute() {
  console.log('🧪 Manual story rewards distribution (TEST MODE)')
  const result = await distributeStoryRewards()
  console.log('\n📋 Result:', JSON.stringify(result, null, 2))
  process.exit(0)
}

// If run directly (not imported), do manual distribution
if (import.meta.url === `file://${process.argv[1]}`) {
  manualDistribute()
}

export { distributeStoryRewards, calculateRewards }
