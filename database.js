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

/**
 * Get or create guest profile
 */
async function getOrCreateGuestProfile(guestIdentifier, nickname = null) {
  try {
    // Try to get existing profile
    let result = await query(
      'SELECT * FROM guest_profiles WHERE guest_identifier = $1',
      [guestIdentifier]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new profile
    result = await query(
      `INSERT INTO guest_profiles (guest_identifier, nickname) 
       VALUES ($1, $2) 
       RETURNING *`,
      [guestIdentifier, nickname]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[Database] Error in getOrCreateGuestProfile:', error.message);
    throw error;
  }
}

/**
 * Update guest profile stats
 */
async function updateGuestProfile(guestIdentifier, updates) {
  try {
    const { contributionPoints, reactionsCount, messagesCount } = updates;
    
    const result = await query(
      `UPDATE guest_profiles 
       SET total_contribution_points = total_contribution_points + $2,
           total_reactions_sent = total_reactions_sent + $3,
           total_messages_sent = total_messages_sent + $4,
           parties_joined = parties_joined + 1,
           updated_at = NOW()
       WHERE guest_identifier = $1
       RETURNING *`,
      [guestIdentifier, contributionPoints || 0, reactionsCount || 0, messagesCount || 0]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[Database] Error in updateGuestProfile:', error.message);
    throw error;
  }
}

/**
 * Update DJ profile score
 */
async function updateDjProfileScore(userId, sessionScore) {
  try {
    const result = await query(
      `INSERT INTO dj_profiles (user_id, dj_score, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         dj_score = dj_profiles.dj_score + $2,
         updated_at = NOW()
       RETURNING *`,
      [userId, sessionScore]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[Database] Error in updateDjProfileScore:', error.message);
    throw error;
  }
}

/**
 * Save party scoreboard session
 */
async function savePartyScoreboard(scoreboardData) {
  try {
    const {
      partyCode,
      hostUserId,
      hostIdentifier,
      djSessionScore,
      guestScores,
      partyDurationMinutes,
      totalReactions,
      totalMessages,
      peakCrowdEnergy
    } = scoreboardData;
    
    const result = await query(
      `INSERT INTO party_scoreboard_sessions 
       (party_code, host_user_id, host_identifier, dj_session_score, guest_scores, 
        party_duration_minutes, total_reactions, total_messages, peak_crowd_energy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        partyCode,
        hostUserId,
        hostIdentifier,
        djSessionScore,
        JSON.stringify(guestScores),
        partyDurationMinutes,
        totalReactions,
        totalMessages,
        peakCrowdEnergy
      ]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[Database] Error in savePartyScoreboard:', error.message);
    throw error;
  }
}

/**
 * Get party scoreboard by code
 */
async function getPartyScoreboard(partyCode) {
  try {
    const result = await query(
      'SELECT * FROM party_scoreboard_sessions WHERE party_code = $1 ORDER BY created_at DESC LIMIT 1',
      [partyCode]
    );
    
    if (result.rows.length > 0) {
      // Parse guest_scores JSON
      const scoreboard = result.rows[0];
      scoreboard.guest_scores = JSON.parse(scoreboard.guest_scores);
      return scoreboard;
    }
    
    return null;
  } catch (error) {
    console.error('[Database] Error in getPartyScoreboard:', error.message);
    throw error;
  }
}

/**
 * Get top DJs by score
 */
async function getTopDjs(limit = 10) {
  try {
    const result = await query(
      `SELECT u.dj_name, dp.dj_score, dp.dj_rank, dp.verified_badge
       FROM dj_profiles dp
       JOIN users u ON dp.user_id = u.id
       ORDER BY dp.dj_score DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[Database] Error in getTopDjs:', error.message);
    throw error;
  }
}

/**
 * Get top guests by contribution points
 */
async function getTopGuests(limit = 10) {
  try {
    const result = await query(
      `SELECT nickname, total_contribution_points, guest_rank, parties_joined
       FROM guest_profiles
       ORDER BY total_contribution_points DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[Database] Error in getTopGuests:', error.message);
    throw error;
  }
}

module.exports = {
  query,
  getClient,
  pool,
  initializeSchema,
  healthCheck,
  getOrCreateGuestProfile,
  updateGuestProfile,
  updateDjProfileScore,
  savePartyScoreboard,
  getPartyScoreboard,
  getTopDjs,
  getTopGuests
};
