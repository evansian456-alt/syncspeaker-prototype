/**
 * Database Connection and Query Interface
 * Handles PostgreSQL connection pooling and common database operations
 */

const { Pool } = require('pg');

// Parse DATABASE_URL or use individual config values
let poolConfig;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL for production/Railway
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
} else {
  // Use individual config for local development
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'syncspeaker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  };
}

const pool = new Pool(poolConfig);

// Test connection on startup
pool.on('connect', () => {
  console.log('[Database] PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client', err);
});

/**
 * Query database
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[Database] Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('[Database] Query error', { text: text.substring(0, 50), error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  return await pool.getClient();
}

/**
 * Initialize database schema
 */
async function initializeSchema() {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await query(schema);
    console.log('[Database] Schema initialized successfully');
    return true;
  } catch (error) {
    console.error('[Database] Schema initialization error:', error.message);
    return false;
  }
}

/**
 * Check database health
 */
async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as time');
    return { healthy: true, time: result.rows[0].time };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

module.exports = {
  query,
  getClient,
  pool,
  initializeSchema,
  healthCheck
};
