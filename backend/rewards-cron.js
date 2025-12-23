import cron from 'node-cron'
import { distributeStoryRewards } from './story-rewards-distributor.js'

/**
 * Cron job pour distribuer les rewards stories automatiquement
 * Tourne tous les jours à 00:00 (minuit)
 */
export function startRewardsCronJob() {
  console.log('⏰ Starting story rewards cron job...')
  console.log('📅 Schedule: Every day at 00:00 UTC')
  
  // Cron expression: "0 0 * * *" = At 00:00 every day
  // For testing: "*/5 * * * *" = Every 5 minutes
  const schedule = process.env.REWARDS_CRON_SCHEDULE || '0 0 * * *'
  
  cron.schedule(schedule, async () => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🎁 DAILY STORY REWARDS DISTRIBUTION - ${new Date().toISOString()}`)
    console.log('='.repeat(60))
    
    try {
      const result = await distributeStoryRewards()
      
      if (result.success) {
        console.log(`✅ Distributed ${result.distributed} rewards (${result.totalAmount?.toFixed(2)} CSPR total)`)
      } else {
        console.error(`❌ Distribution failed: ${result.error}`)
      }
    } catch (error) {
      console.error('❌ Cron job error:', error)
    }
    
    console.log('='.repeat(60) + '\n')
  })
  
  console.log('✅ Rewards cron job started successfully!')
  
  // For testing: run once on startup (comment out for production)
  if (process.env.RUN_REWARDS_ON_STARTUP === 'true') {
    console.log('🧪 Running rewards distribution on startup (TEST MODE)...')
    setTimeout(async () => {
      await distributeStoryRewards()
    }, 5000) // Wait 5s after startup
  }
}
