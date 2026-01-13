// Fix CTO payment amounts in database
// This script updates all CTO records that have paid_amount = 10
// and changes them to the correct amount: 1000 CSPR

import pg from 'pg'
const { Pool } = pg

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'screenerfun',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
})

async function fixCTOAmounts() {
  try {
    console.log('🔧 Connecting to database...')
    
    // First, show which records will be updated
    console.log('\n📊 Checking records with paid_amount = 10...')
    const checkQuery = `
      SELECT 
        token_hash, 
        wallet_address, 
        paid_amount,
        transaction_hash,
        network,
        granted_at
      FROM cto_access
      WHERE paid_amount = 10
      ORDER BY granted_at DESC
    `
    const checkResult = await pool.query(checkQuery)
    
    if (checkResult.rows.length === 0) {
      console.log('✅ No records found with paid_amount = 10. Database is already correct!')
      await pool.end()
      return
    }
    
    console.log(`\n⚠️ Found ${checkResult.rows.length} record(s) to update:`)
    checkResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. Token: ${row.token_hash.substring(0, 20)}...`)
      console.log(`   Wallet: ${row.wallet_address.substring(0, 20)}...`)
      console.log(`   Current Amount: ${row.paid_amount} CSPR`)
      console.log(`   New Amount: 1000 CSPR`)
      console.log(`   Network: ${row.network}`)
      console.log(`   TX Hash: ${row.transaction_hash}`)
      console.log(`   Granted At: ${row.granted_at}`)
    })
    
    // Ask for confirmation (in production, you might want to skip this)
    console.log('\n🔄 Updating records...')
    
    // Update all records with paid_amount = 10 to 1000
    const updateQuery = `
      UPDATE cto_access
      SET paid_amount = 1000
      WHERE paid_amount = 10
      RETURNING *
    `
    const updateResult = await pool.query(updateQuery)
    
    console.log(`\n✅ Successfully updated ${updateResult.rows.length} record(s)!`)
    
    // Verify the update
    console.log('\n📋 Updated records:')
    updateResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. Token: ${row.token_hash.substring(0, 20)}...`)
      console.log(`   Wallet: ${row.wallet_address.substring(0, 20)}...`)
      console.log(`   Amount: ${row.paid_amount} CSPR ✅`)
      console.log(`   Network: ${row.network}`)
    })
    
    console.log('\n✅ Database fix completed successfully!')
    
    // Close connection
    await pool.end()
    
  } catch (error) {
    console.error('❌ Error fixing CTO amounts:', error)
    process.exit(1)
  }
}

// Run the fix
fixCTOAmounts()
