import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:3523@localhost:5432/screenerfun'
});

async function cleanCTO() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Delete GLOBAL_CTO_ACCESS entry
    const result1 = await client.query(
      `DELETE FROM cto_access WHERE token_hash = 'GLOBAL_CTO_ACCESS'`
    );
    console.log(`🗑️ Deleted ${result1.rowCount} GLOBAL_CTO_ACCESS entries`);
    
    // Delete entries WITHOUT transaction_hash (fake/test entries)
    const result2 = await client.query(
      `DELETE FROM cto_access WHERE transaction_hash IS NULL`
    );
    console.log(`🗑️ Deleted ${result2.rowCount} entries without transaction hash`);
    
    // Show what's left
    const remaining = await client.query(
      'SELECT token_hash, wallet_address, paid_amount, transaction_hash FROM cto_access'
    );
    
    console.log(`\n✅ Remaining entries: ${remaining.rows.length}`);
    remaining.rows.forEach((row, i) => {
      console.log(`\n${i+1}.`);
      console.log(`   Token: ${row.token_hash.substring(0, 20)}...`);
      console.log(`   Wallet: ${row.wallet_address.substring(0, 20)}...`);
      console.log(`   Amount: ${row.paid_amount} CSPR`);
      console.log(`   Deploy: ${row.transaction_hash?.substring(0, 20) || 'null'}...`);
    });
    
    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
  }
}

cleanCTO();
