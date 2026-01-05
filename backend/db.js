import pkg from 'pg'
const { Pool } = pkg
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Database connection configuration
const pool = new Pool({
  user: 'screenerfun',
  host: 'localhost',
  database: 'screenerfun',
  password: process.env.DATABASE_PASSWORD || 'testpass123',
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Connection error handling
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err)
})

// Test connection and initialize schema
const initDatabase = async () => {
  const client = await pool.connect()
  try {
    console.log('🔌 Testing PostgreSQL connection...')
    const result = await client.query('SELECT NOW()')
    console.log('✅ PostgreSQL connected:', result.rows[0].now)

    // Read and execute schema
    console.log('📋 Initializing database schema...')
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    await client.query(schemaSQL)
    console.log('✅ Database schema initialized')

    return true
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message)
    throw error
  } finally {
    client.release()
  }
}

// Query helper with error handling
const query = async (text, params) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    if (duration > 100) {
      console.log('⚠️ Slow query:', { text, duration, rows: res.rowCount })
    }
    return res
  } catch (error) {
    console.error('❌ Query error:', error.message)
    console.error('Query:', text)
    console.error('Params:', params)
    throw error
  }
}

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Graceful shutdown
const closePool = async () => {
  console.log('🔌 Closing database connections...')
  await pool.end()
  console.log('✅ Database connections closed')
}

process.on('SIGINT', async () => {
  await closePool()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await closePool()
  process.exit(0)
})

export {
  query,
  transaction,
  pool,
  initDatabase,
  closePool
}
