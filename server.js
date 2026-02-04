const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const { customAlphabet } = require("nanoid");
const Redis = require("ioredis");
const { URL } = require("url");
const multer = require("multer");
const fs = require("fs");
const { nanoid } = require('nanoid');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Import auth and database modules
const db = require('./database');
const authMiddleware = require('./auth-middleware');
const storeCatalog = require('./store-catalog');

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "0.1.0-party-fix"; // Version identifier for debugging and version display

// Generate unique instance ID for this server instance
const INSTANCE_ID = `server-${Math.random().toString(36).substring(2, 9)}`;

// Promo codes for party-wide Pro unlock (moved to top for visibility)
const PROMO_CODES = ["SS-PARTY-A9K2", "SS-PARTY-QM7L", "SS-PARTY-Z8P3"];

// Party capacity limits
const FREE_PARTY_LIMIT = 2; // Free parties limited to 2 phones
const FREE_DEFAULT_MAX_PHONES = 2; // Alias for clarity in new code
const MAX_PRO_PARTY_DEVICES = 100; // Practical limit for Pro parties

// Test mode flag - enables Pro checkbox, promo codes, demo ads in testing
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';

// Feature flags for phased rollout
const ENABLE_PUBSUB = process.env.ENABLE_PUBSUB !== 'false'; // Default ON
const ENABLE_REACTION_HISTORY = process.env.ENABLE_REACTION_HISTORY !== 'false'; // Default ON

// Helper function to classify Redis error types
function getRedisErrorType(errorMessage) {
  if (!errorMessage) return 'unknown';
  
  if (errorMessage.includes('ECONNREFUSED')) return 'connection_refused';
  if (errorMessage.includes('ETIMEDOUT')) return 'timeout';
  if (errorMessage.includes('ENOTFOUND')) return 'host_not_found';
  if (errorMessage.includes('authentication') || errorMessage.includes('NOAUTH')) return 'auth_failed';
  if (errorMessage.includes('TLS') || errorMessage.includes('SSL')) return 'tls_error';
  
  return 'unknown';
}

// Helper function to sanitize Redis URL (hide password)
function sanitizeRedisUrl(redisUrl) {
  try {
    const url = new URL(redisUrl);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch (err) {
    // If URL parsing fails, fall back to simple regex
    return redisUrl.replace(/:[^:@]+@/, ':***@');
  }
}

// Helper function to normalize party codes (trim and uppercase)
function normalizePartyCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

// Helper function to safely parse JSON with fallback
function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (err) {
    console.warn('[safeJsonParse] Failed to parse JSON:', err.message);
    return fallback;
  }
}

// Detect production mode - Railway sets NODE_ENV or we can detect by presence of RAILWAY_ENVIRONMENT
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT || !!process.env.REDIS_URL;
console.log(`[Startup] Running in ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'} mode, instanceId: ${INSTANCE_ID}`);

// Redis configuration check - REDIS_URL is REQUIRED in production
// This ensures we fail loudly if Redis is not properly configured
let redisConfig;
let redisConnectionError = null;
let redisConfigSource = null;
let usesTls = false; // Track if using TLS for later reference

if (process.env.REDIS_URL) {
  // Railway/production: Use REDIS_URL
  const redisUrl = process.env.REDIS_URL;
  redisConfigSource = 'REDIS_URL';
  
  // Check if URL uses TLS (rediss://)
  usesTls = redisUrl.startsWith('rediss://');
  
  if (usesTls) {
    // Parse URL to extract components for TLS configuration
    // ioredis can handle rediss:// URLs, but we need to ensure TLS is configured
    
    // Security Note: Railway Redis and many managed Redis services use self-signed certificates.
    // For production deployments, you can enable strict TLS verification by setting:
    // REDIS_TLS_REJECT_UNAUTHORIZED=true
    // Default is 'false' to work with Railway and similar services out-of-the-box.
    const rejectUnauthorized = process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'true';
    
    redisConfig = {
      // ioredis will parse the URL automatically
      // but we explicitly set TLS options for Railway compatibility
      tls: {
        rejectUnauthorized: rejectUnauthorized,
      },
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 10000,
    };
    console.log(`[Startup] Redis config: Using REDIS_URL with TLS (rediss://)`);
    console.log(`[Startup] TLS certificate verification: ${rejectUnauthorized ? 'ENABLED (strict)' : 'DISABLED (Railway-compatible)'}`);
  } else {
    // Standard redis:// URL
    redisConfig = redisUrl;
    console.log(`[Startup] Redis config: Using REDIS_URL without TLS (redis://)`);
  }
  
  // Log sanitized connection info (hide password)
  const sanitizedUrl = sanitizeRedisUrl(redisUrl);
  console.log(`[Startup] Redis URL (sanitized): ${sanitizedUrl}`);
} else if (process.env.REDIS_HOST || process.env.NODE_ENV === 'test') {
  // Development/test: Use individual Redis settings or test environment
  redisConfigSource = process.env.NODE_ENV === 'test' ? 'test_mode' : 'REDIS_HOST';
  redisConfig = {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false
  };
  console.log(`[Startup] Redis config: Using REDIS_HOST=${redisConfig.host}:${redisConfig.port}`);
} else {
  // No Redis configuration found - this is a critical error in production
  redisConfigSource = 'none';
  console.error("❌ CRITICAL: Redis configuration missing!");
  console.error("   Set REDIS_URL environment variable for production.");
  console.error("   For development, set REDIS_HOST (defaults to localhost).");
  redisConnectionError = "missing";
  
  if (IS_PRODUCTION) {
    console.error("❌ FATAL: Cannot run in production mode without Redis!");
    console.error("   Server will start but mark as NOT READY");
  }
}

// Redis client setup
let redis = null;
if (redisConfig) {
  try {
    // For rediss:// URLs with object config, we need to parse the URL
    if (typeof redisConfig === 'object' && usesTls) {
      redis = new Redis(process.env.REDIS_URL, redisConfig);
      console.log(`[Startup] Redis client created with TLS from URL + options`);
    } else {
      redis = new Redis(redisConfig);
      console.log(`[Startup] Redis client created from config (source: ${redisConfigSource})`);
    }
  } catch (err) {
    console.error(`[Startup] Failed to create Redis client:`, err.message);
    redisConnectionError = err.message;
  }
}

// Track Redis connection state
let redisReady = false;
let useFallbackMode = false;

if (redis) {
  redis.on("connect", () => {
    console.log(`[Redis] TCP connection established (instance: ${INSTANCE_ID}, source: ${redisConfigSource})`);
    redisConnectionError = null;
  });

  redis.on("error", (err) => {
    const errorType = err.code || err.name || 'unknown';
    console.error(`[Redis] Error [${errorType}] (instance: ${INSTANCE_ID}):`, err.message || '(no message)');
    
    // Provide actionable error messages for common issues - check err.code
    if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      console.error(`   → Redis server not reachable. Check REDIS_URL or REDIS_HOST.`);
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('ETIMEDOUT')) {
      console.error(`   → Connection timeout. Check network/firewall settings.`);
    } else if (err.code === 'ENOTFOUND' || err.message.includes('ENOTFOUND')) {
      console.error(`   → Redis host not found. Verify REDIS_URL hostname.`);
    } else if (err.message.includes('authentication') || err.message.includes('NOAUTH')) {
      console.error(`   → Authentication failed. Check Redis password in REDIS_URL.`);
    } else if (err.message.includes('TLS') || err.message.includes('SSL')) {
      console.error(`   → TLS/SSL error. Ensure rediss:// URL is used for TLS connections.`);
    }
    
    redisConnectionError = err.message || err.code || 'Unknown error';
    redisReady = false;
    if (!useFallbackMode) {
      console.warn(`⚠️  Redis unavailable — using fallback mode (instance: ${INSTANCE_ID})`);
      useFallbackMode = true;
    }
  });

  redis.on("ready", () => {
    console.log(`✅ Redis READY (instance: ${INSTANCE_ID}, source: ${redisConfigSource})`);
    console.log(`   → Multi-device party sync enabled`);
    redisReady = true;
    redisConnectionError = null;
    useFallbackMode = false;
  });
  
  redis.on("close", () => {
    console.warn(`⚠️  [Redis] Connection closed (instance: ${INSTANCE_ID})`);
    redisReady = false;
  });
  
  redis.on("reconnecting", (delay) => {
    console.log(`[Redis] Reconnecting in ${delay}ms (instance: ${INSTANCE_ID})...`);
  });
} else {
  console.warn("⚠️  Redis client not created — using fallback mode");
  console.warn(`   → Parties stored in memory only (single-instance mode)`);
  useFallbackMode = true;
}

// Redis Pub/Sub for multi-instance support (Phase 8)
let redisPub = null;
let redisSub = null;
const PUBSUB_CHANNEL = "party:broadcast";

if (ENABLE_PUBSUB && redisConfig) {
  try {
    // Create separate connections for pub and sub
    if (typeof redisConfig === 'object' && usesTls) {
      redisPub = new Redis(process.env.REDIS_URL, redisConfig);
      redisSub = new Redis(process.env.REDIS_URL, redisConfig);
    } else {
      redisPub = new Redis(redisConfig);
      redisSub = new Redis(redisConfig);
    }
    
    console.log(`[PubSub] Publisher and subscriber clients created (instance: ${INSTANCE_ID})`);
    
    // Subscribe to broadcast channel
    redisSub.subscribe(PUBSUB_CHANNEL, (err, count) => {
      if (err) {
        console.error(`[PubSub] Failed to subscribe to ${PUBSUB_CHANNEL}:`, err.message);
      } else {
        console.log(`[PubSub] Subscribed to ${PUBSUB_CHANNEL} (${count} active subscriptions)`);
      }
    });
    
    // Handle incoming messages from other instances
    redisSub.on('message', (channel, message) => {
      if (channel !== PUBSUB_CHANNEL) return;
      
      try {
        const data = safeJsonParse(message);
        if (!data || !data.code || !data.kind || !data.payload) {
          console.warn(`[PubSub] Invalid message format from ${channel}`);
          return;
        }
        
        // Don't forward messages from this instance
        if (data.instanceId === INSTANCE_ID) return;
        
        const { code, kind, payload } = data;
        const party = parties.get(code);
        
        if (!party) {
          // Party doesn't exist locally - that's OK, means no local clients
          return;
        }
        
        console.log(`[PubSub] Received ${kind} for party ${code} from instance ${data.instanceId}`);
        
        // Forward to all local members of this party
        const messageStr = JSON.stringify(payload);
        party.members.forEach(m => {
          if (m.ws.readyState === WebSocket.OPEN) {
            m.ws.send(messageStr);
          }
        });
      } catch (err) {
        console.error(`[PubSub] Error handling message:`, err.message);
      }
    });
    
    redisSub.on('error', (err) => {
      console.error(`[PubSub] Subscriber error:`, err.message);
    });
    
    redisPub.on('error', (err) => {
      console.error(`[PubSub] Publisher error:`, err.message);
    });
  } catch (err) {
    console.error(`[PubSub] Failed to create pub/sub clients:`, err.message);
  }
}

// Parse JSON bodies
app.use(express.json());

// Parse cookies for JWT authentication
app.use(cookieParser());

// Add version header to all responses
app.use((req, res, next) => {
  res.setHeader("X-App-Version", APP_VERSION);
  next();
});

// Serve static files from the repo root
app.use(express.static(__dirname));

// Serve uploaded files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename using nanoid for collision resistance
    const uniqueId = nanoid(12);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    // Format: originalname-uniqueid.ext
    cb(null, `${nameWithoutExt}-${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter: function (req, file, cb) {
    // Accept audio files only
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Helper function to extract registered routes from Express app
// Returns: Array of objects with {path: string, methods: string} properties
// Note: Uses Express internal _router property - may break in future Express versions
// Includes guard checks to gracefully handle API changes; returns empty array if unavailable
function getRegisteredRoutes() {
  const routes = [];
  
  // Guard check for Express internal API
  if (!app._router || !app._router.stack) {
    console.warn('[getRegisteredRoutes] Warning: Express _router not available');
    return routes;
  }
  
  // Extract routes from Express app
  app._router.stack.forEach((middleware) => {
    // Guard check for middleware existence
    if (!middleware) return;
    
    if (middleware.route) {
      // Routes registered directly on the app
      const methods = Object.keys(middleware.route.methods)
        .map(m => m.toUpperCase())
        .join(', ');
      routes.push({
        path: middleware.route.path,
        methods: methods
      });
    } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        // Guard check for handler existence
        if (!handler || !handler.route) return;
        
        const methods = Object.keys(handler.route.methods)
          .map(m => m.toUpperCase())
          .join(', ');
        routes.push({
          path: handler.route.path,
          methods: methods
        });
      });
    }
  });
  
  return routes;
}

// Route for serving index.html at root "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check endpoint with detailed Redis status
app.get("/health", async (req, res) => {
  let redisStatus;
  
  if (!redis || redisConnectionError || !redisReady) {
    redisStatus = "fallback";
  } else if (redis.status === "ready" && redisReady) {
    redisStatus = "ready";
  } else {
    redisStatus = "error";
  }
  
  const health = { 
    status: "ok", 
    instanceId: INSTANCE_ID,
    redis: redisStatus,
    version: APP_VERSION,
    configSource: redisConfigSource // Show where Redis config came from
  };
  
  // Include error details if Redis has issues
  if (redisConnectionError) {
    health.redisError = redisConnectionError;
    health.redisErrorType = getRedisErrorType(redisConnectionError);
  }
  
  res.json(health);
});

// API health endpoint with full spec - returns ok: true/false based on readiness
// In production mode, server is NOT ready if Redis is unavailable
// In development mode, server is always ready (uses fallback storage)
app.get("/api/health", async (req, res) => {
  const redisConnected = !!(redis && redisReady && !redisConnectionError);
  
  // In production, we require Redis to be ready
  // In development, we allow fallback mode
  const isReady = IS_PRODUCTION ? redisConnected : true;
  
  const health = {
    ok: isReady,
    instanceId: INSTANCE_ID,
    redis: {
      connected: redisConnected,
      status: redisConnected ? 'ready' : (redisConnectionError || 'not_connected'),
      mode: IS_PRODUCTION ? 'required' : 'optional',
      configSource: redisConfigSource
    },
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: IS_PRODUCTION ? 'production' : 'development'
  };
  
  // Add detailed error type if Redis has issues
  if (redisConnectionError) {
    health.redis.errorType = getRedisErrorType(redisConnectionError);
  }
  
  // Return 503 if not ready (production mode without Redis)
  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json(health);
});

// Simple ping endpoint for testing client->server
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong", timestamp: Date.now() });
});

// Debug endpoint to list all registered routes
// This endpoint helps verify which routes are registered at runtime
// Useful for production debugging when routes appear to be missing
// NOTE: This endpoint is intentionally enabled for production debugging and verification
// WARNING: Exposes application structure. Consider adding authentication in future versions
// if this becomes a security concern
app.get("/api/routes", (req, res) => {
  const routes = getRegisteredRoutes();
  
  res.json({
    instanceId: INSTANCE_ID,
    version: APP_VERSION,
    routes: routes,
    totalRoutes: routes.length
  });
});

// ============================================================================
// RATE LIMITERS
// ============================================================================

// Rate limiter for auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs (allows for typos)
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for purchase endpoints
const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute
  message: 'Too many purchase requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * POST /api/auth/signup
 * Create new user account
 */
app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, djName } = req.body;

    // Validate input
    if (!authMiddleware.isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!authMiddleware.isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!djName || djName.trim().length === 0) {
      return res.status(400).json({ error: 'DJ name is required' });
    }

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await authMiddleware.hashPassword(password);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, dj_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, dj_name, created_at`,
      [email.toLowerCase(), passwordHash, djName.trim()]
    );

    const user = result.rows[0];

    // Create DJ profile for user
    await db.query(
      `INSERT INTO dj_profiles (user_id, dj_score, dj_rank)
       VALUES ($1, 0, 'Bedroom DJ')`,
      [user.id]
    );

    // Generate JWT token
    const token = authMiddleware.generateToken({
      userId: user.id,
      email: user.email
    });

    // Set HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        djName: user.dj_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /api/auth/login
 * Log in existing user
 */
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!authMiddleware.isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Find user
    const result = await db.query(
      'SELECT id, email, password_hash, dj_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await authMiddleware.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = authMiddleware.generateToken({
      userId: user.id,
      email: user.email
    });

    // Set HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        djName: user.dj_name
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

/**
 * POST /api/auth/logout
 * Log out current user
 */
app.post("/api/auth/logout", apiLimiter, (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

/**
 * GET /api/me
 * Get current user info with tier and entitlements
 * TEMPORARY HOTFIX: Returns anonymous user when auth is disabled
 */
app.get("/api/me", apiLimiter, authMiddleware.requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // TEMPORARY: When auth is disabled, return anonymous user data
    if (userId && userId.startsWith('anonymous-')) {
      return res.json({
        user: {
          id: userId,
          email: 'anonymous@guest.local',
          djName: 'Guest DJ',
          createdAt: new Date().toISOString()
        },
        tier: 'FREE',
        profile: {
          djScore: 0,
          djRank: 'Guest DJ',
          activeVisualPack: null,
          activeTitle: null,
          verifiedBadge: false,
          crownEffect: false,
          animatedName: false,
          reactionTrail: false
        },
        entitlements: []
      });
    }

    // Get user basic info
    const userResult = await db.query(
      'SELECT id, email, dj_name, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get DJ profile
    const profileResult = await db.query(
      `SELECT dj_score, dj_rank, active_visual_pack, active_title,
              verified_badge, crown_effect, animated_name, reaction_trail
       FROM dj_profiles WHERE user_id = $1`,
      [userId]
    );

    const profile = profileResult.rows[0] || {
      dj_score: 0,
      dj_rank: 'Bedroom DJ',
      active_visual_pack: null,
      active_title: null,
      verified_badge: false,
      crown_effect: false,
      animated_name: false,
      reaction_trail: false
    };

    // Get active subscription
    const subResult = await db.query(
      `SELECT status, current_period_end
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY current_period_end DESC
       LIMIT 1`,
      [userId]
    );

    const hasProSubscription = subResult.rows.length > 0 &&
      new Date(subResult.rows[0].current_period_end) > new Date();

    // Get owned entitlements
    const entitlementsResult = await db.query(
      'SELECT item_type, item_key FROM entitlements WHERE user_id = $1 AND owned = true',
      [userId]
    );

    const entitlements = entitlementsResult.rows;

    // Determine tier (PRO if subscription active, else FREE for now)
    const tier = hasProSubscription ? 'PRO' : 'FREE';

    res.json({
      user: {
        id: user.id,
        email: user.email,
        djName: user.dj_name,
        createdAt: user.created_at
      },
      tier,
      profile: {
        djScore: profile.dj_score,
        djRank: profile.dj_rank,
        activeVisualPack: profile.active_visual_pack,
        activeTitle: profile.active_title,
        verifiedBadge: profile.verified_badge,
        crownEffect: profile.crown_effect,
        animatedName: profile.animated_name,
        reactionTrail: profile.reaction_trail
      },
      entitlements: entitlements.map(e => ({
        type: e.item_type,
        key: e.item_key
      }))
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================================================
// STORE ENDPOINTS
// ============================================================================

/**
 * GET /api/store
 * Get store catalog
 */
app.get("/api/store", authMiddleware.optionalAuth, (req, res) => {
  const catalog = storeCatalog.getStoreCatalog();
  res.json(catalog);
});

/**
 * POST /api/purchase
 * Process a purchase
 */
app.post("/api/purchase", purchaseLimiter, authMiddleware.requireAuth, async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { itemId, partyCode } = req.body;
    const userId = req.user.userId;

    // Get item from catalog
    const item = storeCatalog.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await client.query('BEGIN');

    // Record purchase
    const expiresAt = item.duration ?
      new Date(Date.now() + item.duration * 1000) : null;

    const purchaseKind = item.permanent ? 'permanent' :
      (item.type === storeCatalog.STORE_CATEGORIES.SUBSCRIPTIONS ? 'subscription' : 'party_temp');

    await client.query(
      `INSERT INTO purchases (user_id, purchase_kind, item_type, item_key, price_gbp, party_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, purchaseKind, item.type, item.id, item.price, partyCode || null, expiresAt]
    );

    // Grant entitlement for permanent items
    if (item.permanent) {
      await client.query(
        `INSERT INTO entitlements (user_id, item_type, item_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, item_type, item_key) DO NOTHING`,
        [userId, item.type, item.id]
      );
    }

    // Apply item effect based on type
    if (item.type === storeCatalog.STORE_CATEGORIES.VISUAL_PACKS) {
      // Replace active visual pack
      await client.query(
        'UPDATE dj_profiles SET active_visual_pack = $1, updated_at = NOW() WHERE user_id = $2',
        [item.id, userId]
      );
    } else if (item.type === storeCatalog.STORE_CATEGORIES.DJ_TITLES) {
      // Replace active title
      await client.query(
        'UPDATE dj_profiles SET active_title = $1, updated_at = NOW() WHERE user_id = $2',
        [item.id, userId]
      );
    } else if (item.type === storeCatalog.STORE_CATEGORIES.PROFILE_UPGRADES) {
      // Stack profile upgrades
      const updates = {};
      if (item.id === 'verified_badge') updates.verified_badge = true;
      if (item.id === 'crown_effect') updates.crown_effect = true;
      if (item.id === 'animated_name') updates.animated_name = true;
      if (item.id === 'reaction_trail') updates.reaction_trail = true;

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`).join(', ');
        const values = [...Object.values(updates), userId];
        await client.query(
          `UPDATE dj_profiles SET ${setClause}, updated_at = NOW() WHERE user_id = $${values.length}`,
          values
        );
      }
    } else if (item.type === storeCatalog.STORE_CATEGORIES.SUBSCRIPTIONS) {
      // Handle subscription
      if (item.id === 'party_pass') {
        // Party Pass is handled per-party - update the JSON party data in Redis
        if (partyCode && redis) {
          try {
            const partyData = await getPartyFromRedis(partyCode);
            if (partyData) {
              const partyPassExpires = Date.now() + item.duration * 1000;
              partyData.partyPassExpiresAt = partyPassExpires;
              partyData.maxPhones = item.maxPhones;
              await setPartyInRedis(partyCode, partyData);
              
              // Also update local party if it exists
              const localParty = parties.get(partyCode);
              if (localParty) {
                localParty.partyPassExpiresAt = partyPassExpires;
                localParty.maxPhones = item.maxPhones;
              }
            }
          } catch (err) {
            console.error(`[Purchase] Error updating party ${partyCode} with party pass:`, err.message);
          }
        }
      } else if (item.id === 'pro_monthly') {
        // Create/update Pro subscription
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        // Check if user already has an active subscription
        const existingSub = await client.query(
          'SELECT id FROM subscriptions WHERE user_id = $1 AND status = \'active\'',
          [userId]
        );
        
        if (existingSub.rows.length > 0) {
          // Update existing subscription
          await client.query(
            `UPDATE subscriptions SET
              current_period_start = NOW(),
              current_period_end = $1,
              updated_at = NOW()
             WHERE user_id = $2 AND status = 'active'`,
            [periodEnd, userId]
          );
        } else {
          // Create new subscription
          await client.query(
            `INSERT INTO subscriptions (user_id, status, current_period_start, current_period_end)
             VALUES ($1, 'active', NOW(), $2)`,
            [userId, periodEnd]
          );
        }
      }
    } else if (item.type === storeCatalog.STORE_CATEGORIES.PARTY_EXTENSIONS) {
      // Party extensions - apply to Redis party using JSON storage
      if (partyCode && redis) {
        try {
          const partyData = await getPartyFromRedis(partyCode);
          if (partyData) {
            if (item.id === 'add_30min') {
              const currentExpiry = partyData.partyPassExpiresAt || Date.now();
              partyData.partyPassExpiresAt = currentExpiry + 30 * 60 * 1000;
            } else if (item.id === 'add_5phones') {
              const currentMax = partyData.maxPhones || 2;
              partyData.maxPhones = currentMax + 5;
            }
            await setPartyInRedis(partyCode, partyData);
            
            // Also update local party if it exists
            const localParty = parties.get(partyCode);
            if (localParty) {
              if (item.id === 'add_30min') {
                localParty.partyPassExpiresAt = partyData.partyPassExpiresAt;
              } else if (item.id === 'add_5phones') {
                localParty.maxPhones = partyData.maxPhones;
              }
            }
          }
        } catch (err) {
          console.error(`[Purchase] Error updating party ${partyCode} with extension:`, err.message);
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Purchase successful',
      item: {
        id: item.id,
        name: item.name,
        type: item.type
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Store] Purchase error:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  } finally {
    client.release();
  }
});

// Track file registry for TTL cleanup
// Map of trackId -> { filename, originalName, uploadedAt, filepath, contentType, sizeBytes }
const uploadedTracks = new Map();
const TRACK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// POST /api/upload-track - Upload audio file from host
app.post("/api/upload-track", upload.single('audio'), async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/upload-track at ${timestamp}`);
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    // Generate unique track ID
    const trackId = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12)();
    
    // Get file info
    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const sizeBytes = req.file.size;
    const contentType = req.file.mimetype;
    
    // Construct URL for accessing the file via streaming endpoint
    const protocol = req.protocol;
    const host = req.get('host');
    const trackUrl = `${protocol}://${host}/api/track/${trackId}`;
    
    // Store track in registry for TTL cleanup
    const filepath = req.file.path;
    uploadedTracks.set(trackId, {
      filename,
      originalName,
      uploadedAt: Date.now(),
      filepath,
      contentType,
      sizeBytes
    });
    
    console.log(`[HTTP] Track uploaded: ${trackId}, file: ${originalName}, size: ${sizeBytes} bytes`);
    console.log(`[HTTP] Track will be accessible at: ${trackUrl}`);
    
    // For now, we can't easily get duration without audio processing library
    // We'll set it to null and let the client determine it
    const durationMs = null;
    
    res.json({
      ok: true,
      trackId,
      trackUrl,
      title: originalName,
      sizeBytes,
      contentType,
      durationMs,
      filename
    });
  } catch (error) {
    console.error(`[HTTP] Error uploading track:`, error);
    res.status(500).json({ 
      error: 'Failed to upload track',
      details: error.message 
    });
  }
});

// POST /api/set-party-track - Set current track for a party and broadcast to guests
app.post("/api/set-party-track", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/set-party-track at ${timestamp}`);
  
  try {
    const { partyCode, trackId, trackUrl, filename, sizeBytes, contentType } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: 'Party code is required' });
    }
    
    if (!trackUrl) {
      return res.status(400).json({ error: 'Track URL is required' });
    }
    
    // Find party in local memory
    const party = parties.get(partyCode);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }
    
    // Update party state with track info
    party.currentTrack = {
      trackId,
      trackUrl,
      filename,
      sizeBytes,
      contentType,
      setAt: Date.now()
    };
    
    console.log(`[HTTP] Track set for party ${partyCode}: ${filename}`);
    
    // Broadcast TRACK_READY to all party members
    const message = JSON.stringify({
      t: "TRACK_READY",
      track: {
        trackId,
        trackUrl,
        filename,
        sizeBytes,
        contentType
      }
    });
    
    let broadcastCount = 0;
    party.members.forEach(m => {
      if (m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(message);
        broadcastCount++;
      }
    });
    
    console.log(`[HTTP] TRACK_READY broadcast to ${broadcastCount} members in party ${partyCode}`);
    
    res.json({
      ok: true,
      broadcastCount
    });
  } catch (error) {
    console.error(`[HTTP] Error setting party track:`, error);
    res.status(500).json({
      error: 'Failed to set party track',
      details: error.message
    });
  }
});

// Endpoint to stream audio tracks with Range support (required for seeking and mobile playback)
app.get("/api/track/:trackId", async (req, res) => {
  const timestamp = new Date().toISOString();
  const trackId = req.params.trackId;
  console.log(`[HTTP] GET /api/track/${trackId} at ${timestamp}`);
  
  try {
    // Find track in registry
    const track = uploadedTracks.get(trackId);
    if (!track) {
      console.log(`[HTTP] Track not found: ${trackId}`);
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const filepath = track.filepath;
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.log(`[HTTP] Track file missing: ${filepath}`);
      uploadedTracks.delete(trackId);
      return res.status(404).json({ error: 'Track file not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const contentType = track.contentType || 'audio/mpeg';
    
    // Parse Range header
    const range = req.headers.range;
    
    if (range) {
      // Parse range header (e.g., "bytes=0-1023")
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filepath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      
      console.log(`[HTTP] Streaming track ${trackId} with range: ${start}-${end}/${fileSize}`);
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // No range header - send entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      };
      
      console.log(`[HTTP] Streaming entire track ${trackId}, size: ${fileSize}`);
      res.writeHead(200, head);
      fs.createReadStream(filepath).pipe(res);
    }
  } catch (error) {
    console.error(`[HTTP] Error streaming track ${trackId}:`, error);
    res.status(500).json({ 
      error: 'Failed to stream track',
      details: error.message 
    });
  }
});

// Debug endpoint to list active parties
// WARNING: This endpoint is for debugging purposes only and should be
// protected by authentication or disabled in production environments
// to prevent abuse and information disclosure
app.get("/api/debug/parties", async (req, res) => {
  try {
    const now = Date.now();
    const parties_list = [];
    
    // Collect from local memory
    for (const [code, party] of parties.entries()) {
      const ageMs = now - (party.createdAt || 0);
      const ageMinutes = Math.floor(ageMs / 60000);
      const memberCount = party.members ? party.members.length : 0;
      
      parties_list.push({
        code,
        ageMs,
        ageMinutes,
        createdAt: party.createdAt,
        hostId: party.hostId,
        memberCount,
        chatMode: party.chatMode,
        source: "local"
      });
    }
    
    // Also check Redis for parties not in local memory
    if (redis && redisReady) {
      try {
        const keys = await redis.keys(`${PARTY_KEY_PREFIX}*`);
        for (const key of keys) {
          const code = key.replace(PARTY_KEY_PREFIX, "");
          
          // Skip if already in local memory
          if (parties.has(code)) continue;
          
          const data = await redis.get(key);
          if (data) {
            const partyData = JSON.parse(data);
            const ageMs = now - (partyData.createdAt || 0);
            const ageMinutes = Math.floor(ageMs / 60000);
            
            parties_list.push({
              code,
              ageMs,
              ageMinutes,
              createdAt: partyData.createdAt,
              hostId: partyData.hostId,
              guestCount: partyData.guestCount,
              chatMode: partyData.chatMode,
              source: "redis_only"
            });
          }
        }
      } catch (err) {
        console.error("[debug/parties] Error fetching from Redis:", err.message);
      }
    }
    
    // Also include fallback storage
    for (const [code, party] of fallbackPartyStorage.entries()) {
      // Skip if already in parties list
      if (parties_list.some(p => p.code === code)) continue;
      
      const ageMs = now - (party.createdAt || 0);
      const ageMinutes = Math.floor(ageMs / 60000);
      
      parties_list.push({
        code,
        ageMs,
        ageMinutes,
        createdAt: party.createdAt,
        hostId: party.hostId,
        guestCount: party.guestCount,
        chatMode: party.chatMode,
        source: "fallback"
      });
    }
    
    // Sort by age (oldest first)
    parties_list.sort((a, b) => a.ageMs - b.ageMs);
    
    res.json({
      totalParties: parties_list.length,
      parties: parties_list,
      instanceId: INSTANCE_ID,
      redisReady,
      timestamp: now
    });
  } catch (error) {
    console.error("[debug/parties] Error:", error);
    res.status(500).json({ error: "Failed to list parties", details: error.message });
  }
});

// Debug endpoint to check a specific party's status
// GET /api/debug/party/:code - Returns party existence and status info
app.get("/api/debug/party/:code", async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const now = Date.now();
    
    // Get Redis status
    let redisStatus;
    if (!redis || redisConnectionError || !redisReady) {
      redisStatus = "unavailable";
    } else if (redis.status === "ready" && redisReady) {
      redisStatus = "ready";
    } else {
      redisStatus = "error";
    }
    
    // Check if party exists in Redis
    let existsInRedis = false;
    let redisData = null;
    if (redis && redisReady) {
      try {
        redisData = await getPartyFromRedis(code);
        existsInRedis = !!redisData;
      } catch (error) {
        console.error(`[debug/party] Redis error for ${code}:`, error.message);
      }
    }
    
    // Check local memory
    const existsLocally = parties.has(code);
    const localParty = parties.get(code);
    
    res.json({
      code,
      existsInRedis,
      existsLocally,
      redisStatus,
      instanceId: INSTANCE_ID,
      createdAt: redisData?.createdAt || localParty?.createdAt || null,
      ageMs: redisData?.createdAt ? now - redisData.createdAt : null,
      hostId: redisData?.hostId || localParty?.hostId || null,
      guestCount: redisData?.guestCount || 0,
      chatMode: redisData?.chatMode || localParty?.chatMode || null,
      timestamp: now
    });
  } catch (error) {
    console.error("[debug/party] Error:", error);
    res.status(500).json({ error: "Failed to get party info", details: error.message });
  }
});

// Generate party codes (6 chars, uppercase letters/numbers)
const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

// Party TTL configuration
// TTL set to 2 hours (minimum requirement is 30 minutes)
const PARTY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (7200000 ms)
const PARTY_TTL_SECONDS = Math.floor(PARTY_TTL_MS / 1000); // 7200 seconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Redis key prefixes
const PARTY_KEY_PREFIX = "party:";
const PARTY_META_KEY_PREFIX = "party_meta:";

// In-memory storage for WebSocket connections (cannot be stored in Redis)
// code -> { host, members: [{ ws, id, name, isPro, isHost }] }
const parties = new Map();
const clients = new Map(); // ws -> { id, party }

// Separate counters to avoid ID collisions between HTTP and WS
let nextWsClientId = 1;      // For WebSocket client IDs
let nextHttpGuestSeq = 1;    // For HTTP-generated guest IDs
let nextHostId = 1;

// Fallback storage for party metadata when Redis is unavailable
// code -> { chatMode, createdAt, hostId, hostConnected, guestCount }
const fallbackPartyStorage = new Map();

// Helper function to wrap promises with timeout
function promiseWithTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage || `Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Redis party storage helpers
async function getPartyFromRedis(code) {
  if (!redis) {
    throw new Error("Redis not configured. Set REDIS_URL environment variable for production or REDIS_HOST for development.");
  }
  try {
    const data = await redis.get(`${PARTY_KEY_PREFIX}${code}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.error(`[Redis] Error getting party ${code}:`, err.message);
    throw err;
  }
}

async function setPartyInRedis(code, partyData) {
  if (!redis) {
    throw new Error("Redis not configured. Set REDIS_URL environment variable for production or REDIS_HOST for development.");
  }
  try {
    const data = JSON.stringify(partyData);
    await redis.setex(`${PARTY_KEY_PREFIX}${code}`, PARTY_TTL_SECONDS, data);
    return true;
  } catch (err) {
    console.error(`[Redis] Error setting party ${code}:`, err.message);
    throw err;
  }
}

async function deletePartyFromRedis(code) {
  if (!redis) {
    throw new Error("Redis not configured. Set REDIS_URL environment variable for production or REDIS_HOST for development.");
  }
  try {
    await redis.del(`${PARTY_KEY_PREFIX}${code}`);
    return true;
  } catch (err) {
    console.error(`[Redis] Error deleting party ${code}:`, err.message);
    throw err;
  }
}

// Fallback storage helpers
function getPartyFromFallback(code) {
  return fallbackPartyStorage.get(code) || null;
}

function setPartyInFallback(code, partyData) {
  fallbackPartyStorage.set(code, partyData);
}

function deletePartyFromFallback(code) {
  return fallbackPartyStorage.delete(code);
}

// Helper function to persist reaction history to Redis (best-effort)
async function persistReactionHistoryToRedis(code, reactionHistory) {
  if (!ENABLE_REACTION_HISTORY || !redis || !redisReady) return;
  
  try {
    const partyData = await getPartyFromRedis(code);
    if (partyData) {
      partyData.reactionHistory = reactionHistory;
      await setPartyInRedis(code, partyData);
    }
  } catch (err) {
    // Best-effort - don't throw, just log
    console.warn(`[ReactionHistory] Failed to persist to Redis for ${code}:`, err.message);
  }
}

// Helper function to persist playback state to Redis (best-effort)
async function persistPlaybackToRedis(code, currentTrack, queue) {
  if (!redis || !redisReady) return;
  
  try {
    const partyData = await getPartyFromRedis(code);
    if (partyData) {
      partyData.currentTrack = currentTrack;
      partyData.queue = queue ? queue.slice(0, 5) : []; // Keep only first 5 queue items
      await setPartyInRedis(code, partyData);
    }
  } catch (err) {
    // Best-effort - don't throw, just log
    console.warn(`[Playback] Failed to persist to Redis for ${code}:`, err.message);
  }
}

// Helper function to publish events to other instances (Phase 8)
async function publishToOtherInstances(code, kind, payload) {
  if (!ENABLE_PUBSUB || !redisPub) return;
  
  try {
    const message = JSON.stringify({
      code,
      kind,
      payload,
      instanceId: INSTANCE_ID,
      ts: Date.now()
    });
    await redisPub.publish(PUBSUB_CHANNEL, message);
  } catch (err) {
    // Best-effort - don't throw, just log
    console.warn(`[PubSub] Failed to publish ${kind} for ${code}:`, err.message);
  }
}

// Helper function to normalize party data - ensures all required fields exist
// This prevents issues when parties are created via different paths or when Redis data is incomplete
function normalizePartyData(partyData) {
  if (!partyData) return null;
  
  return {
    partyCode: partyData.partyCode || partyData.code,
    djName: partyData.djName || "Host",
    source: partyData.source || "local",
    partyPro: partyData.partyPro || false,
    promoUsed: partyData.promoUsed || false,
    chatMode: partyData.chatMode || "OPEN",
    createdAt: partyData.createdAt || Date.now(),
    hostId: partyData.hostId,
    hostConnected: partyData.hostConnected !== undefined ? partyData.hostConnected : false,
    guestCount: partyData.guestCount || 0,
    guests: partyData.guests || [],
    status: partyData.status || "active",
    expiresAt: partyData.expiresAt || (Date.now() + PARTY_TTL_MS),
    // Optional fields from purchases
    partyPassExpiresAt: partyData.partyPassExpiresAt || null,
    maxPhones: partyData.maxPhones || null,
    // Reaction and playback history for late joiners
    reactionHistory: partyData.reactionHistory || [],
    currentTrack: partyData.currentTrack || null,
    queue: partyData.queue || []
  };
}

// Helper function to calculate max allowed phones/devices based on party state
async function getMaxAllowedPhones(code, partyData) {
  // If party is Pro, allow practical maximum
  if (partyData.partyPro) {
    return MAX_PRO_PARTY_DEVICES;
  }
  
  // Check if party pass is active and not expired
  if (partyData.partyPassExpiresAt && Date.now() < partyData.partyPassExpiresAt) {
    const maxPhones = parseInt(partyData.maxPhones);
    return isNaN(maxPhones) ? FREE_PARTY_LIMIT : maxPhones;
  }
  
  // Default free limit
  return FREE_DEFAULT_MAX_PHONES;
}

// Shared party creation function used by both HTTP and WS paths
// This ensures consistent party data structure across all creation methods
async function createPartyCommon({ djName, source, hostId, hostConnected }) {
  // Runtime guard: Check if Redis is available
  if (!redis || !redisReady) {
    throw new Error("Redis not ready");
  }
  
  // Generate unique party code
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    // Check both local and Redis for uniqueness
    const existsLocally = parties.has(code);
    const existsInRedis = await getPartyFromRedis(code);
    if (!existsLocally && !existsInRedis) break;
    attempts++;
  } while (attempts < 10);
  
  if (attempts >= 10) {
    throw new Error("Failed to generate unique party code after 10 attempts");
  }
  
  const createdAt = Date.now();
  
  // Create full party data with all required fields
  const partyData = {
    partyCode: code,
    djName: djName.trim().substring(0, 50),
    source: source || "local",
    partyPro: false,
    promoUsed: false,
    chatMode: "OPEN",
    createdAt,
    hostId,
    hostConnected,
    guestCount: 0,
    guests: [],
    status: "active",
    expiresAt: createdAt + PARTY_TTL_MS,
    // Optional fields (set by purchases later)
    partyPassExpiresAt: null,
    maxPhones: null,
    // History fields for late joiners
    reactionHistory: [],
    currentTrack: null,
    queue: []
  };
  
  // Write to Redis first (CRITICAL for multi-instance consistency)
  await setPartyInRedis(code, partyData);
  
  return { code, partyData };
}

// POST /api/create-party - Create a new party
app.post("/api/create-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/create-party at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
  
  // Extract DJ name and source from request body
  const { djName, source } = req.body;
  
  // Validate DJ name is provided
  if (!djName || !djName.trim()) {
    console.log("[HTTP] Party creation rejected: DJ name is required");
    return res.status(400).json({ error: "DJ name is required to create a party" });
  }
  
  // Validate and set source (default to "local" if not provided or invalid)
  const validSources = ["local", "external", "mic"];
  const partySource = validSources.includes(source) ? source : "local";
  
  // Determine storage backend: prefer Redis, fallback to local storage if Redis unavailable
  const useRedis = redis && redisReady;
  const storageBackend = useRedis ? 'redis' : 'fallback';
  
  // In production mode, Redis is required - return 503 if not available
  if (IS_PRODUCTION && !useRedis) {
    console.error(`[HTTP] Redis required in production but not available, instanceId: ${INSTANCE_ID}`);
    return res.status(503).json({ 
      error: "Server not ready - Redis unavailable",
      details: "Multi-device party sync requires Redis. Please try again in a moment.",
      instanceId: INSTANCE_ID
    });
  }
  
  if (!useRedis) {
    console.warn(`[HTTP] Redis not ready, using fallback storage for party creation, instanceId: ${INSTANCE_ID}`);
  }
  
  try {
    // Use shared party creation function
    const hostId = nextHostId++;
    const { code, partyData } = await createPartyCommon({
      djName: djName,
      source: partySource,
      hostId: hostId,
      hostConnected: false
    });
    
    console.log(`[HTTP] Party persisted to Redis: ${code}, storageBackend: redis`);
    
    // Also store in local memory for WebSocket connections
    parties.set(code, {
      host: null, // No WebSocket connection (HTTP-created party)
      members: [],
      chatMode: partyData.chatMode,
      createdAt: partyData.createdAt,
      hostId: partyData.hostId,
      source: partyData.source, // IMPORTANT: Store source in local memory
      partyPro: partyData.partyPro,
      promoUsed: partyData.promoUsed,
      djMessages: [],
      currentTrack: null,
      queue: [],
      timeoutWarningTimer: null,
      scoreState: {
        dj: {
          djUserId: null,
          djIdentifier: hostId,
          djName: partyData.djName,
          sessionScore: 0,
          lifetimeScore: 0
        },
        guests: {},
        totalReactions: 0,
        totalMessages: 0,
        peakCrowdEnergy: 0
      },
      reactionHistory: [] // For storing recent emoji/messages
    });
    
    const totalParties = parties.size;
    const timestamp = new Date().toISOString();
    console.log(`[HTTP] Party created: ${code}, hostId: ${hostId}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, createdAt: ${partyData.createdAt}, totalParties: ${totalParties}, storageBackend: ${storageBackend}`);
    
    res.json({
      partyCode: code,
      hostId: hostId
    });
  } catch (error) {
    console.error(`[HTTP] Error creating party, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ 
      error: "Failed to create party",
      details: error.message 
    });
  }
});

// POST /api/join-party - Join an existing party
app.post("/api/join-party", async (req, res) => {
  const startTime = Date.now();
  console.log("[join-party] start");
  
  try {
    const timestamp = new Date().toISOString();
    console.log(`[HTTP] POST /api/join-party at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
    
    const { partyCode, nickname } = req.body;
    
    if (!partyCode) {
      console.log("[join-party] end (missing party code)");
      return res.status(400).json({ error: "Party code is required" });
    }
    
    // Normalize party code: trim and uppercase
    const code = normalizePartyCode(partyCode);
    
    // Validate party code length
    if (code.length !== 6) {
      console.log(`[join-party] Invalid party code length: ${code.length}`);
      return res.status(400).json({ error: "Party code must be 6 characters" });
    }
    
    // Generate guest ID and use provided nickname or generate default
    // Use nanoid for HTTP guests to avoid collision with WS client IDs
    const guestId = `guest_${nanoid(10)}`;
    const guestNumber = nextHttpGuestSeq++;
    const guestNickname = nickname || `Guest ${guestNumber}`;
    
    console.log(`[join-party] Attempting to join party: ${code}, guestId: ${guestId}, nickname: ${guestNickname}, timestamp: ${timestamp}`);
    
    // Determine storage backend: prefer Redis, fallback to local storage if Redis unavailable
    const useRedis = redis && redisReady;
    const storageBackend = useRedis ? 'redis' : 'fallback';
    
    // In production mode, Redis is required - return 503 if not available
    if (IS_PRODUCTION && !useRedis) {
      console.error(`[join-party] Redis required in production but not available, instanceId: ${INSTANCE_ID}`);
      return res.status(503).json({ 
        error: "Server not ready - Redis unavailable",
        details: "Multi-device party sync requires Redis. Please try again in a moment.",
        instanceId: INSTANCE_ID
      });
    }
    
    if (!useRedis) {
      console.warn(`[join-party] Redis not ready, using fallback storage for party lookup, instanceId: ${INSTANCE_ID}`);
    }
    
    // Read from Redis or fallback storage
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[join-party] Redis error for party ${code}, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    const storeReadResult = partyData ? "found" : "not_found";
    
    if (!partyData) {
      const totalParties = parties.size;
      const localPartyExists = parties.has(code);
      const redisStatusMsg = redisReady ? "ready" : "not_ready";
      const rejectionReason = `Party ${code} not found in ${storageBackend}. Local parties count: ${totalParties}, exists locally: ${localPartyExists}, redisStatus: ${redisStatusMsg}`;
      console.log(`[HTTP] Party join rejected: ${code}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, exists: false, rejectionReason: ${rejectionReason}, storageBackend: ${storageBackend}, redisStatus: ${redisStatusMsg}`);
      console.log("[join-party] end (party not found)");
      return res.status(404).json({ error: "Party not found or expired" });
    }
    
    // Check if party has expired or ended
    if (partyData.status === "ended") {
      console.log(`[join-party] Party ${code} has ended`);
      return res.status(410).json({ error: "Party has ended" });
    }
    
    const now = Date.now();
    if (partyData.expiresAt && now > partyData.expiresAt) {
      console.log(`[join-party] Party ${code} has expired`);
      partyData.status = "expired";
      return res.status(410).json({ error: "Party has expired" });
    }
    
    // Normalize party data to ensure all fields exist
    const normalizedPartyData = normalizePartyData(partyData);
    
    // Enforce party capacity limits based on partyPro/partyPass
    const maxAllowed = await getMaxAllowedPhones(code, normalizedPartyData);
    const currentGuestCount = normalizedPartyData.guestCount || 0;
    
    // Count total devices (host + guests) - host counts as 1 device
    const totalDevices = 1 + currentGuestCount;
    
    if (totalDevices >= maxAllowed) {
      console.log(`[join-party] Party limit reached: ${code}, current: ${totalDevices}, max: ${maxAllowed}`);
      return res.status(403).json({ 
        error: `Party limit reached (${maxAllowed} ${maxAllowed === 2 ? 'phones' : 'devices'})`,
        details: maxAllowed === 2 ? "Free parties are limited to 2 phones" : undefined
      });
    }
    
    // Add guest to party
    if (!partyData.guests) {
      partyData.guests = [];
    }
    
    // Check if guest already exists (by guestId) and update, otherwise add new
    const existingGuestIndex = partyData.guests.findIndex(g => g.guestId === guestId);
    if (existingGuestIndex >= 0) {
      // Update existing guest
      partyData.guests[existingGuestIndex].nickname = guestNickname;
      partyData.guests[existingGuestIndex].joinedAt = now;
    } else {
      // Add new guest
      partyData.guests.push({
        guestId,
        nickname: guestNickname,
        joinedAt: now
      });
    }
    
    partyData.guestCount = partyData.guests.length;
    
    // Save updated party data
    if (useRedis) {
      try {
        await setPartyInRedis(code, partyData);
      } catch (error) {
        console.warn(`[join-party] Redis write failed for ${code}, using fallback: ${error.message}`);
        setPartyInFallback(code, partyData);
      }
    } else {
      setPartyInFallback(code, partyData);
    }
    
    // Get local party reference (non-blocking)
    const localParty = parties.get(code);
    
    const partyAge = Date.now() - partyData.createdAt;
    const guestCount = partyData.guestCount || 0;
    const totalParties = parties.size;
    const duration = Date.now() - startTime;
    
    console.log(`[HTTP] Party joined: ${code}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, guestId: ${guestId}, exists: true, storeReadResult: ${storeReadResult}, partyAge: ${partyAge}ms, guestCount: ${guestCount}, totalParties: ${totalParties}, duration: ${duration}ms, storageBackend: ${storageBackend}`);
    
    // Respond with success and guest info
    res.json({ 
      ok: true,
      guestId,
      nickname: guestNickname,
      partyCode: code,
      djName: partyData.djName || "DJ", // Fallback for backward compatibility with old parties
      chatMode: partyData.chatMode || "OPEN" // Include chat mode for initial setup
    });
    console.log("[join-party] end (success)");
    
    // Fire-and-forget: Update local state asynchronously (non-blocking)
    // This ensures HTTP response is sent immediately
    if (partyData && !localParty) {
      setImmediate(() => {
        try {
          // Re-check if party was created by another request in the meantime
          if (!parties.has(code)) {
            parties.set(code, {
              host: null,
              members: [],
              chatMode: partyData.chatMode || "OPEN",
              createdAt: partyData.createdAt,
              hostId: partyData.hostId
            });
          }
        } catch (err) {
          console.error(`[join-party] Async state update error:`, err);
        }
      });
    }
    
  } catch (error) {
    console.error(`[HTTP] Error joining party, instanceId: ${INSTANCE_ID}:`, error);
    console.log("[join-party] end (error)");
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to join party",
        details: error.message 
      });
    }
  }
});

// GET /api/party - Get party state (supports query parameter ?code=XXX)
app.get("/api/party", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.query.code ? req.query.code.trim().toUpperCase() : null;
  
  if (!code) {
    return res.status(400).json({ 
      error: "Party code is required",
      exists: false 
    });
  }
  
  // Validate party code length
  if (code.length !== 6) {
    return res.status(400).json({ 
      error: "Party code must be 6 characters",
      exists: false 
    });
  }
  
  console.log(`[HTTP] GET /api/party?code=${code} at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  // Determine storage backend
  const useRedis = redis && redisReady;
  const storageBackend = useRedis ? 'redis' : 'fallback';
  
  try {
    // Read from Redis or fallback storage
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[HTTP] Redis error for party ${code}, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    if (!partyData) {
      console.log(`[HTTP] Party not found: ${code}, storageBackend: ${storageBackend}`);
      return res.json({
        exists: false,
        status: "expired",
        partyCode: code
      });
    }
    
    // Check if party has expired
    const now = Date.now();
    let status = partyData.status || "active";
    let timeRemainingMs = 0;
    
    if (partyData.expiresAt) {
      timeRemainingMs = Math.max(0, partyData.expiresAt - now);
      if (timeRemainingMs === 0 && status === "active") {
        status = "expired";
        partyData.status = "expired";
        // Update status in storage
        if (useRedis) {
          try {
            await setPartyInRedis(code, partyData);
          } catch (err) {
            console.warn(`[HTTP] Failed to update expired status in Redis: ${err.message}`);
          }
        } else {
          setPartyInFallback(code, partyData);
        }
      }
    } else {
      // Legacy support for parties without expiresAt
      timeRemainingMs = Math.max(0, (partyData.createdAt + PARTY_TTL_MS) - now);
    }
    
    console.log(`[HTTP] Party found: ${code}, status: ${status}, guestCount: ${partyData.guestCount || 0}, timeRemainingMs: ${timeRemainingMs}`);
    
    // Return full party state
    res.json({
      exists: true,
      partyCode: code,
      status,
      expiresAt: partyData.expiresAt || (partyData.createdAt + PARTY_TTL_MS),
      timeRemainingMs,
      guestCount: partyData.guestCount || 0,
      guests: partyData.guests || [],
      chatMode: partyData.chatMode || "OPEN",
      createdAt: partyData.createdAt,
      partyPro: !!partyData.partyPro, // Party-wide Pro status
      source: partyData.source || "local" // Host-selected source
    });
    
  } catch (error) {
    console.error(`[HTTP] Error fetching party ${code}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch party state",
      details: error.message,
      exists: false
    });
  }
});

// GET /api/party-state - Enhanced party state endpoint with playback info for polling
app.get("/api/party-state", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.query.code ? req.query.code.trim().toUpperCase() : null;
  
  if (!code) {
    return res.status(400).json({ 
      error: "Party code is required",
      exists: false 
    });
  }
  
  // Validate party code length
  if (code.length !== 6) {
    return res.status(400).json({ 
      error: "Party code must be 6 characters",
      exists: false 
    });
  }
  
  console.log(`[HTTP] GET /api/party-state?code=${code} at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  // Determine storage backend
  const useRedis = redis && redisReady;
  const storageBackend = useRedis ? 'redis' : 'fallback';
  
  try {
    // Read from Redis or fallback storage
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[HTTP] Redis error for party ${code}, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    if (!partyData) {
      console.log(`[HTTP] Party not found: ${code}, storageBackend: ${storageBackend}`);
      return res.json({
        exists: false,
        status: "expired",
        partyCode: code
      });
    }
    
    // Check if party has expired
    const now = Date.now();
    let status = partyData.status || "active";
    let timeRemainingMs = 0;
    
    if (partyData.expiresAt) {
      timeRemainingMs = Math.max(0, partyData.expiresAt - now);
      if (timeRemainingMs === 0 && status === "active") {
        status = "expired";
      }
    } else {
      // Legacy support for parties without expiresAt
      timeRemainingMs = Math.max(0, (partyData.createdAt + PARTY_TTL_MS) - now);
    }
    
    // Get current track info from in-memory party state (if WebSocket connected)
    const party = parties.get(code);
    const currentTrack = party?.currentTrack || null;
    const djMessages = party?.djMessages || [];
    const queue = party?.queue || [];
    
    console.log(`[HTTP] Party state: ${code}, status: ${status}, track: ${currentTrack?.filename || 'none'}, queue length: ${queue.length}`);
    
    // Return enhanced party state with playback info
    res.json({
      exists: true,
      partyCode: code,
      status,
      expiresAt: partyData.expiresAt || (partyData.createdAt + PARTY_TTL_MS),
      timeRemainingMs,
      guestCount: partyData.guestCount || 0,
      guests: partyData.guests || [],
      chatMode: partyData.chatMode || "OPEN",
      createdAt: partyData.createdAt,
      serverTime: now,
      // Playback state
      currentTrack: currentTrack ? {
        trackId: currentTrack.trackId,
        url: currentTrack.url || currentTrack.trackUrl,
        filename: currentTrack.filename || currentTrack.title,
        title: currentTrack.title,
        durationMs: currentTrack.durationMs,
        startAtServerMs: currentTrack.startAtServerMs,
        startPosition: currentTrack.startPosition || currentTrack.startPositionSec,
        startPositionSec: currentTrack.startPositionSec || currentTrack.startPosition,
        status: currentTrack.status || 'playing'
      } : null,
      // Queue
      queue: queue,
      // DJ auto-messages
      djMessages: djMessages
    });
    
  } catch (error) {
    console.error(`[HTTP] Error fetching party state ${code}:`, error);
    res.status(500).json({ 
      error: "Failed to fetch party state",
      details: error.message,
      exists: false
    });
  }
});

// POST /api/leave-party - Remove guest from party
app.post("/api/leave-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/leave-party at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
  
  try {
    const { partyCode, guestId } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: "Party code is required" });
    }
    
    if (!guestId) {
      return res.status(400).json({ error: "Guest ID is required" });
    }
    
    // Normalize party code
    const code = partyCode.trim().toUpperCase();
    
    // Validate party code length
    if (code.length !== 6) {
      return res.status(400).json({ error: "Party code must be 6 characters" });
    }
    
    // Determine storage backend
    const useRedis = redis && redisReady;
    const storageBackend = useRedis ? 'redis' : 'fallback';
    
    // In production mode, Redis is required
    if (IS_PRODUCTION && !useRedis) {
      return res.status(503).json({ 
        error: "Server not ready - Redis unavailable",
        instanceId: INSTANCE_ID
      });
    }
    
    // Read party data
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[leave-party] Redis error for party ${code}, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    if (!partyData) {
      return res.status(404).json({ error: "Party not found or expired" });
    }
    
    // Remove guest from party
    if (partyData.guests) {
      const initialCount = partyData.guests.length;
      partyData.guests = partyData.guests.filter(g => g.guestId !== guestId);
      partyData.guestCount = partyData.guests.length;
      
      console.log(`[leave-party] Guest ${guestId} left party ${code}, count: ${initialCount} → ${partyData.guestCount}`);
    }
    
    // Save updated party data
    if (useRedis) {
      try {
        await setPartyInRedis(code, partyData);
      } catch (error) {
        console.warn(`[leave-party] Redis write failed for ${code}, using fallback: ${error.message}`);
        setPartyInFallback(code, partyData);
      }
    } else {
      setPartyInFallback(code, partyData);
    }
    
    res.json({ 
      ok: true, 
      guestCount: partyData.guestCount 
    });
    
  } catch (error) {
    console.error(`[HTTP] Error leaving party, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ 
      error: "Failed to leave party",
      details: error.message 
    });
  }
});

// POST /api/end-party - End party early (host only)
app.post("/api/end-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/end-party at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
  
  try {
    const { partyCode } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: "Party code is required" });
    }
    
    // Normalize party code
    const code = partyCode.trim().toUpperCase();
    
    // Validate party code length
    if (code.length !== 6) {
      return res.status(400).json({ error: "Party code must be 6 characters" });
    }
    
    // Determine storage backend
    const useRedis = redis && redisReady;
    const storageBackend = useRedis ? 'redis' : 'fallback';
    
    // In production mode, Redis is required
    if (IS_PRODUCTION && !useRedis) {
      return res.status(503).json({ 
        error: "Server not ready - Redis unavailable",
        instanceId: INSTANCE_ID
      });
    }
    
    // Read party data
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[end-party] Redis error for party ${code}, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    if (!partyData) {
      return res.status(404).json({ error: "Party not found or expired" });
    }
    
    // Mark party as ended
    partyData.status = "ended";
    partyData.endedAt = Date.now();
    
    console.log(`[end-party] Party ${code} ended by host`);
    
    // Save updated party data (or delete it)
    // Option 1: Mark as ended but keep in storage for a short time
    if (useRedis) {
      try {
        // Set shorter TTL for ended parties (e.g., 5 minutes)
        const data = JSON.stringify(partyData);
        await redis.setex(`${PARTY_KEY_PREFIX}${code}`, 300, data); // 5 minutes
      } catch (error) {
        console.warn(`[end-party] Redis write failed for ${code}, using fallback: ${error.message}`);
        setPartyInFallback(code, partyData);
      }
    } else {
      setPartyInFallback(code, partyData);
    }
    
    // Option 2: Delete immediately (uncomment if preferred)
    // if (useRedis) {
    //   try {
    //     await deletePartyFromRedis(code);
    //   } catch (error) {
    //     console.warn(`[end-party] Redis delete failed for ${code}: ${error.message}`);
    //   }
    // } else {
    //   deletePartyFromFallback(code);
    // }
    
    // Remove from local memory
    if (parties.has(code)) {
      parties.delete(code);
    }
    
    res.json({ ok: true });
    
  } catch (error) {
    console.error(`[HTTP] Error ending party, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ 
      error: "Failed to end party",
      details: error.message 
    });
  }
});

// POST /api/apply-promo - Apply promo code to unlock party-wide Pro
app.post("/api/apply-promo", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/apply-promo at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
  
  try {
    const { partyCode, promoCode } = req.body;
    
    if (!partyCode || !promoCode) {
      return res.status(400).json({ error: "Party code and promo code are required" });
    }
    
    // Normalize codes
    const code = partyCode.trim().toUpperCase();
    const promo = promoCode.trim().toUpperCase();
    
    // Validate party code length
    if (code.length !== 6) {
      return res.status(400).json({ error: "Party code must be 6 characters" });
    }
    
    // Determine storage backend
    const useRedis = redis && redisReady;
    
    // In production mode, Redis is required
    if (IS_PRODUCTION && !useRedis) {
      return res.status(503).json({ 
        error: "Server not ready - Redis unavailable",
        details: "Multi-device features require Redis"
      });
    }
    
    // Get party data
    let partyData;
    if (useRedis) {
      try {
        partyData = await getPartyFromRedis(code);
      } catch (error) {
        console.warn(`[HTTP] Redis error, trying fallback: ${error.message}`);
        partyData = getPartyFromFallback(code);
      }
    } else {
      partyData = getPartyFromFallback(code);
    }
    
    if (!partyData) {
      return res.status(404).json({ error: "Party not found" });
    }
    
    // Check if promo already used
    if (partyData.promoUsed) {
      console.log(`[Promo] Attempt to reuse promo in party ${code}`);
      return res.status(400).json({ error: "This party already used a promo code." });
    }
    
    // Validate promo code (using constant from top of file)
    if (!PROMO_CODES.includes(promo)) {
      console.log(`[Promo] Invalid promo code attempt: ${promo}, partyCode: ${code}`);
      return res.status(400).json({ error: "Invalid or expired promo code." });
    }
    
    // Valid and unused - unlock party-wide Pro
    partyData.promoUsed = true;
    partyData.partyPro = true;
    console.log(`[Promo] Party ${code} unlocked with promo code ${promo} via HTTP`);
    
    // Save updated party data
    if (useRedis) {
      try {
        await setPartyInRedis(code, partyData);
      } catch (error) {
        console.warn(`[HTTP] Redis write failed for ${code}, using fallback: ${error.message}`);
        setPartyInFallback(code, partyData);
      }
    } else {
      setPartyInFallback(code, partyData);
    }
    
    // Also update WebSocket party if it exists
    const wsParty = parties.get(code);
    if (wsParty) {
      wsParty.promoUsed = true;
      wsParty.partyPro = true;
      // Broadcast to all WebSocket members
      broadcastRoomState(code);
    }
    
    res.json({ 
      ok: true, 
      partyPro: true,
      message: "Pro unlocked for this party!"
    });
    
  } catch (error) {
    console.error(`[HTTP] Error applying promo, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ 
      error: "Failed to apply promo code",
      details: error.message 
    });
  }
});

// GET /api/party/:code/debug - Enhanced debug endpoint with Redis TTL info
app.get("/api/party/:code/debug", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code.toUpperCase().trim();
  
  // Validate party code length
  if (code.length !== 6) {
    return res.json({
      exists: false,
      ttlSeconds: -1,
      redisConnected: redis && redisReady,
      instanceId: INSTANCE_ID,
      error: "Invalid party code length"
    });
  }
  
  console.log(`[HTTP] GET /api/party/${code}/debug at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  let exists = false;
  let ttlSeconds = -1;
  const redisConnected = redis && redisReady;
  
  try {
    if (redisConnected) {
      // Check if party exists in Redis
      const partyData = await getPartyFromRedis(code);
      exists = !!partyData;
      
      // Get TTL from Redis
      if (exists) {
        ttlSeconds = await redis.ttl(`${PARTY_KEY_PREFIX}${code}`);
      }
    }
  } catch (error) {
    console.error(`[HTTP] Error in debug endpoint for ${code}:`, error.message);
  }
  
  res.json({
    exists,
    ttlSeconds,
    redisConnected,
    instanceId: INSTANCE_ID
  });
});

// GET /api/party/:code - Debug endpoint to check if a party exists
app.get("/api/party/:code", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code.toUpperCase().trim();
  
  console.log(`[HTTP] GET /api/party/${code} at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  // Read from Redis or fallback storage
  let partyData;
  const usingFallback = !redis || !redisReady;
  
  try {
    if (usingFallback) {
      partyData = getPartyFromFallback(code);
    } else {
      partyData = await getPartyFromRedis(code);
    }
  } catch (error) {
    console.warn(`[HTTP] Error reading party ${code}, trying fallback:`, error.message);
    partyData = getPartyFromFallback(code);
  }
  
  if (!partyData) {
    const totalParties = parties.size;
    console.log(`[HTTP] Debug query - Party not found: ${code}, instanceId: ${INSTANCE_ID}, localParties: ${totalParties}, usingFallback: ${usingFallback}`);
    return res.json({
      exists: false,
      code: code,
      instanceId: INSTANCE_ID
    });
  }
  
  // Check local memory for WebSocket connection status
  const localParty = parties.get(code);
  const hostConnected = localParty ? (localParty.host !== null && localParty.host !== undefined) : partyData.hostConnected || false;
  const guestCount = localParty ? localParty.members.filter(m => !m.isHost).length : partyData.guestCount || 0;
  
  console.log(`[HTTP] Debug query - Party found: ${code}, instanceId: ${INSTANCE_ID}, hostConnected: ${hostConnected}, guestCount: ${guestCount}, usingFallback: ${usingFallback}`);
  
  res.json({
    exists: true,
    code: code,
    createdAt: new Date(partyData.createdAt).toISOString(),
    hostConnected: hostConnected,
    guestCount: guestCount,
    instanceId: INSTANCE_ID
  });
});

// POST /api/party/:code/start-track - Start playing a track
app.post("/api/party/:code/start-track", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code ? req.params.code.toUpperCase() : null;
  const { trackId, startPositionSec, trackUrl, title, durationMs } = req.body;
  
  console.log(`[HTTP] POST /api/party/${code}/start-track at ${timestamp}`);
  
  if (!code || code.length !== 6) {
    return res.status(400).json({ error: 'Invalid party code' });
  }
  
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }
  
  try {
    // Get party from memory (for WebSocket)
    const party = parties.get(code);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }
    
    // Update currentTrack in party state
    party.currentTrack = {
      trackId,
      trackUrl: trackUrl || null,
      title: title || 'Unknown Track',
      durationMs: durationMs || null,
      startAtServerMs: Date.now(),
      startPositionSec: startPositionSec || 0,
      status: 'playing'
    };
    
    console.log(`[HTTP] Started track ${trackId} in party ${code}, position: ${startPositionSec}s`);
    
    // Broadcast TRACK_STARTED to all guests
    const message = JSON.stringify({
      t: 'TRACK_STARTED',
      trackId,
      trackUrl: trackUrl || null,
      title: title || 'Unknown Track',
      durationMs: durationMs || null,
      startAtServerMs: party.currentTrack.startAtServerMs,
      startPositionSec: party.currentTrack.startPositionSec
    });
    
    party.members.forEach(m => {
      if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(message);
      }
    });
    
    res.json({ 
      success: true,
      currentTrack: party.currentTrack
    });
  } catch (error) {
    console.error(`[HTTP] Error starting track:`, error);
    res.status(500).json({ 
      error: 'Failed to start track',
      details: error.message 
    });
  }
});

// POST /api/party/:code/queue-track - Add track to queue
app.post("/api/party/:code/queue-track", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code ? req.params.code.toUpperCase() : null;
  const { trackId, trackUrl, title, durationMs } = req.body;
  
  console.log(`[HTTP] POST /api/party/${code}/queue-track at ${timestamp}`);
  
  if (!code || code.length !== 6) {
    return res.status(400).json({ error: 'Invalid party code' });
  }
  
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }
  
  try {
    // Get party from memory
    const party = parties.get(code);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }
    
    // Initialize queue if it doesn't exist
    if (!party.queue) {
      party.queue = [];
    }
    
    // Check queue limit
    if (party.queue.length >= 5) {
      return res.status(400).json({ error: 'Queue is full (max 5 tracks)' });
    }
    
    // Add track to queue
    const queuedTrack = {
      trackId,
      trackUrl: trackUrl || null,
      title: title || 'Unknown Track',
      durationMs: durationMs || null
    };
    
    party.queue.push(queuedTrack);
    
    console.log(`[HTTP] Queued track ${trackId} in party ${code}, queue length: ${party.queue.length}`);
    
    // Broadcast QUEUE_UPDATED to all members
    const message = JSON.stringify({
      t: 'QUEUE_UPDATED',
      queue: party.queue
    });
    
    party.members.forEach(m => {
      if (m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(message);
      }
    });
    
    res.json({ 
      success: true,
      queue: party.queue
    });
  } catch (error) {
    console.error(`[HTTP] Error queueing track:`, error);
    res.status(500).json({ 
      error: 'Failed to queue track',
      details: error.message 
    });
  }
});

// POST /api/party/:code/play-next - Play next track from queue
app.post("/api/party/:code/play-next", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code ? req.params.code.toUpperCase() : null;
  
  console.log(`[HTTP] POST /api/party/${code}/play-next at ${timestamp}`);
  
  if (!code || code.length !== 6) {
    return res.status(400).json({ error: 'Invalid party code' });
  }
  
  try {
    // Get party from memory
    const party = parties.get(code);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }
    
    // Initialize queue if it doesn't exist
    if (!party.queue) {
      party.queue = [];
    }
    
    // Check if queue has tracks
    if (party.queue.length === 0) {
      return res.status(400).json({ error: 'Queue is empty' });
    }
    
    // Get first track from queue
    const nextTrack = party.queue.shift();
    
    // Set as currentTrack
    party.currentTrack = {
      trackId: nextTrack.trackId,
      trackUrl: nextTrack.trackUrl,
      title: nextTrack.title,
      durationMs: nextTrack.durationMs,
      startAtServerMs: Date.now(),
      startPositionSec: 0,
      status: 'playing'
    };
    
    console.log(`[HTTP] Playing next track ${nextTrack.trackId} in party ${code}`);
    
    // Broadcast TRACK_CHANGED to all members
    const message = JSON.stringify({
      t: 'TRACK_CHANGED',
      trackId: nextTrack.trackId,
      trackUrl: nextTrack.trackUrl,
      title: nextTrack.title,
      durationMs: nextTrack.durationMs,
      startAtServerMs: party.currentTrack.startAtServerMs,
      startPositionSec: 0,
      queue: party.queue
    });
    
    party.members.forEach(m => {
      if (m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(message);
      }
    });
    
    res.json({ 
      success: true,
      currentTrack: party.currentTrack,
      queue: party.queue
    });
  } catch (error) {
    console.error(`[HTTP] Error playing next track:`, error);
    res.status(500).json({ 
      error: 'Failed to play next track',
      details: error.message 
    });
  }
});

// GET /api/party/:code/members - Get party members for polling
app.get("/api/party/:code/members", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code.toUpperCase().trim();
  
  console.log(`[HTTP] GET /api/party/${code}/members at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  // Check local WebSocket party state first
  const localParty = parties.get(code);
  
  if (localParty) {
    // Return current members from WebSocket state
    const snapshot = {
      members: localParty.members.map(m => ({
        id: m.id,
        name: m.name,
        isPro: m.isPro || false,
        isHost: m.isHost
      })),
      chatMode: localParty.chatMode || "OPEN"
    };
    
    console.log(`[HTTP] Party members found locally: ${code}, memberCount: ${snapshot.members.length}`);
    return res.json({ exists: true, snapshot });
  }
  
  // If not in local state, check Redis/fallback
  const usingFallback = !redis || !redisReady;
  let partyData;
  
  try {
    if (usingFallback) {
      partyData = getPartyFromFallback(code);
    } else {
      partyData = await getPartyFromRedis(code);
    }
  } catch (error) {
    console.warn(`[HTTP] Error reading party ${code}, trying fallback:`, error.message);
    partyData = getPartyFromFallback(code);
  }
  
  if (!partyData) {
    console.log(`[HTTP] Party not found: ${code}`);
    return res.json({ exists: false });
  }
  
  // Party exists but no WebSocket connections yet - return empty members list
  console.log(`[HTTP] Party exists but no active connections: ${code}`);
  res.json({
    exists: true,
    snapshot: {
      members: [],
      chatMode: partyData.chatMode || "OPEN"
    }
  });
});

// Get party scoreboard (live or historical)
app.get("/api/party/:code/scoreboard", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code.toUpperCase().trim();
  
  console.log(`[HTTP] GET /api/party/${code}/scoreboard at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  try {
    // Check if party is currently active
    const localParty = parties.get(code);
    
    if (localParty && localParty.scoreState) {
      // Return live scoreboard
      const guestList = Object.values(localParty.scoreState.guests)
        .sort((a, b) => b.points - a.points)
        .map((guest, index) => ({
          ...guest,
          rank: index + 1
        }));
      
      return res.json({
        live: true,
        partyCode: code,
        dj: {
          djName: localParty.scoreState.dj.djName,
          sessionScore: localParty.scoreState.dj.sessionScore,
          lifetimeScore: localParty.scoreState.dj.lifetimeScore
        },
        guests: guestList.slice(0, 10),
        totalReactions: localParty.scoreState.totalReactions,
        totalMessages: localParty.scoreState.totalMessages,
        peakCrowdEnergy: localParty.scoreState.peakCrowdEnergy,
        partyDuration: localParty.createdAt 
          ? Math.floor((Date.now() - localParty.createdAt) / 60000)
          : 0
      });
    }
    
    // Party not active, check database for historical scoreboard
    const historicalScoreboard = await db.getPartyScoreboard(code);
    
    if (historicalScoreboard) {
      return res.json({
        live: false,
        partyCode: code,
        dj: {
          // DJ name stored in host_identifier - could look up from users/dj_profiles if needed
          djName: "DJ",
          sessionScore: historicalScoreboard.dj_session_score,
          lifetimeScore: 0
        },
        guests: historicalScoreboard.guest_scores,
        totalReactions: historicalScoreboard.total_reactions,
        totalMessages: historicalScoreboard.total_messages,
        peakCrowdEnergy: historicalScoreboard.peak_crowd_energy,
        partyDuration: historicalScoreboard.party_duration_minutes,
        createdAt: historicalScoreboard.created_at
      });
    }
    
    // No scoreboard found
    return res.status(404).json({ 
      error: "Scoreboard not found for this party code" 
    });
    
  } catch (error) {
    console.error(`[HTTP] Error getting scoreboard for party ${code}:`, error.message);
    return res.status(500).json({ 
      error: "Failed to retrieve scoreboard" 
    });
  }
});

// Get top DJs leaderboard
app.get("/api/leaderboard/djs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const topDjs = await db.getTopDjs(limit);
    
    return res.json({ 
      leaderboard: topDjs,
      count: topDjs.length
    });
  } catch (error) {
    console.error(`[HTTP] Error getting DJ leaderboard:`, error.message);
    return res.status(500).json({ 
      error: "Failed to retrieve DJ leaderboard" 
    });
  }
});

// Get top guests leaderboard
app.get("/api/leaderboard/guests", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const topGuests = await db.getTopGuests(limit);
    
    return res.json({ 
      leaderboard: topGuests,
      count: topGuests.length
    });
  } catch (error) {
    console.error(`[HTTP] Error getting guest leaderboard:`, error.message);
    return res.status(500).json({ 
      error: "Failed to retrieve guest leaderboard" 
    });
  }
});

// Cleanup expired parties (Redis TTL handles expiration automatically)
// This function now only cleans up local WebSocket state for expired parties
function cleanupExpiredParties() {
  const now = Date.now();
  const expiredCodes = [];
  
  // Clean up expired parties from local storage (WebSocket connections)
  for (const [code, party] of parties.entries()) {
    if (party.createdAt && now - party.createdAt > PARTY_TTL_MS) {
      expiredCodes.push(code);
    }
  }
  
  if (expiredCodes.length > 0) {
    console.log(`[Cleanup] Removing ${expiredCodes.length} expired local parties (instance ${INSTANCE_ID}): ${expiredCodes.join(', ')}`);
    expiredCodes.forEach(code => {
      parties.delete(code);
      // Redis TTL will handle cleanup in shared store automatically
    });
  }
}

// Cleanup expired uploaded tracks
function cleanupExpiredTracks() {
  const now = Date.now();
  const expiredTracks = [];
  
  for (const [trackId, track] of uploadedTracks.entries()) {
    if (track.uploadedAt && now - track.uploadedAt > TRACK_TTL_MS) {
      expiredTracks.push({ trackId, filepath: track.filepath });
    }
  }
  
  if (expiredTracks.length > 0) {
    console.log(`[Cleanup] Removing ${expiredTracks.length} expired tracks (instance ${INSTANCE_ID})`);
    
    expiredTracks.forEach(({ trackId, filepath }) => {
      // Delete file from disk
      try {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`[Cleanup] Deleted track file: ${filepath}`);
        }
      } catch (err) {
        console.error(`[Cleanup] Error deleting track file ${filepath}:`, err.message);
      }
      
      // Remove from registry
      uploadedTracks.delete(trackId);
    });
  }
}

// Persist party scoreboard to database
async function persistPartyScoreboard(partyCode, party) {
  if (!party || !party.scoreState) {
    console.log(`[Database] No scoreState for party ${partyCode}, skipping persistence`);
    return;
  }
  
  try {
    const partyDurationMinutes = party.createdAt 
      ? Math.floor((Date.now() - party.createdAt) / 60000) 
      : 0;
    
    // Prepare guest scores array
    const guestScores = Object.values(party.scoreState.guests).map(guest => ({
      guestId: guest.guestId,
      nickname: guest.nickname,
      points: guest.points,
      emojis: guest.emojis,
      messages: guest.messages,
      rank: guest.rank
    }));
    
    // Save party scoreboard session
    await db.savePartyScoreboard({
      partyCode,
      hostUserId: party.scoreState.dj.djUserId,
      hostIdentifier: party.scoreState.dj.djIdentifier,
      djSessionScore: party.scoreState.dj.sessionScore,
      guestScores,
      partyDurationMinutes,
      totalReactions: party.scoreState.totalReactions,
      totalMessages: party.scoreState.totalMessages,
      peakCrowdEnergy: party.scoreState.peakCrowdEnergy
    });
    
    console.log(`[Database] Saved scoreboard for party ${partyCode}`);
    
    // Update DJ profile if logged in
    if (party.scoreState.dj.djUserId) {
      await db.updateDjProfileScore(
        party.scoreState.dj.djUserId, 
        party.scoreState.dj.sessionScore
      );
      console.log(`[Database] Updated DJ score for user ${party.scoreState.dj.djUserId}`);
    }
    
    // Update guest profiles (UPSERT pattern creates if not exists)
    for (const guest of guestScores) {
      try {
        // Update guest stats (UPSERT)
        await db.updateGuestProfile(guest.guestId, {
          contributionPoints: guest.points,
          reactionsCount: guest.emojis,
          messagesCount: guest.messages
        });
        
        // Increment parties_joined counter (once per party)
        await db.incrementGuestPartiesJoined(guest.guestId);
      } catch (err) {
        console.error(`[Database] Error updating guest profile ${guest.guestId}:`, err.message);
      }
    }
    
    console.log(`[Database] Updated ${guestScores.length} guest profiles`);
    
  } catch (error) {
    console.error(`[Database] Error persisting scoreboard for party ${partyCode}:`, error.message);
    throw error;
  }
}

// Combined cleanup job for parties and tracks
function runCleanupJobs() {
  cleanupExpiredParties();
  cleanupExpiredTracks();
}

// Start cleanup interval
let cleanupInterval;

// Start the HTTP server only if not imported as a module
let server;
let wss;

async function startServer() {
  console.log("🚀 Server booting...");
  console.log(`   Instance ID: ${INSTANCE_ID}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Version: ${APP_VERSION}`);
  
  // Initialize database schema
  console.log("⏳ Initializing database...");
  try {
    const dbHealth = await db.healthCheck();
    if (dbHealth.healthy) {
      console.log("✅ Database connected successfully");
      await db.initializeSchema();
      console.log("✅ Database schema initialized");
    } else {
      console.warn(`⚠️  Database health check failed: ${dbHealth.error}`);
      console.warn("   Authentication features will not be available");
    }
  } catch (err) {
    console.warn(`⚠️  Database initialization error: ${err.message}`);
    console.warn("   Authentication features will not be available");
  }
  
  // Wait for Redis to be ready (with timeout)
  if (redis) {
    console.log("⏳ Waiting for Redis connection...");
    try {
      await waitForRedis(10000); // 10 second timeout
      console.log("✅ Redis connected and ready");
    } catch (err) {
      console.warn(`⚠️  Redis connection timeout: ${err.message}`);
      console.warn("   Server will continue in fallback mode - parties will be stored locally");
    }
  } else {
    console.warn("⚠️  Redis not configured - using fallback mode");
  }
  
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
    console.log(`   Instance ID: ${INSTANCE_ID}`);
    console.log(`   Redis status: ${redis ? redis.status : 'NOT CONFIGURED'}`);
    console.log(`   Redis ready: ${redisReady ? 'YES' : 'NO'}`);
    console.log("🎉 Server ready to accept connections");
    
    // Log registered routes for debugging
    console.log("\n📋 Registered HTTP Routes:");
    const routes = getRegisteredRoutes();
    
    // Print all routes with formatting
    routes.forEach(route => {
      console.log(`   ${route.methods} ${route.path}`);
    });
    
    // Explicitly confirm critical routes
    const criticalRoutes = [
      { method: 'POST', path: '/api/create-party' },
      { method: 'POST', path: '/api/join-party' }
    ];
    
    console.log("\n✓ Critical Routes Verified:");
    criticalRoutes.forEach(({ method, path }) => {
      const isRegistered = routes.some(r => {
        const methodList = r.methods.split(', ');
        return methodList.includes(method) && r.path === path;
      });
      console.log(`   ${isRegistered ? '✓' : '✗'} ${method} ${path}`);
    });
    console.log("");
  });
  
  // Start cleanup interval
  cleanupInterval = setInterval(runCleanupJobs, CLEANUP_INTERVAL_MS);
  console.log(`[Server] Party cleanup job started (runs every ${CLEANUP_INTERVAL_MS / 1000}s, TTL: ${PARTY_TTL_MS / 1000}s, instance: ${INSTANCE_ID})`);
  console.log(`[Server] Track cleanup job started (runs every ${CLEANUP_INTERVAL_MS / 1000}s, TTL: ${TRACK_TTL_MS / 1000}s, instance: ${INSTANCE_ID})`);
  
  // WebSocket server setup
  wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const clientId = nextWsClientId++;
    
    // Extract userId from session cookie if available
    let userId = null;
    const authMiddleware = require('./auth-middleware');
    const cookieParser = require('cookie-parser');
    
    // Parse cookies from the upgrade request
    if (req.headers.cookie) {
      const cookies = {};
      req.headers.cookie.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        cookies[parts[0].trim()] = parts[1];
      });
      
      const authToken = cookies.auth_token;
      if (authToken) {
        const decoded = authMiddleware.verifyToken(authToken);
        if (decoded && decoded.userId) {
          userId = decoded.userId;
        }
      }
    }
    
    clients.set(ws, { id: clientId, party: null, userId });
    
    console.log(`[WS] Client ${clientId} connected${userId ? ` (userId: ${userId})` : ' (anonymous)'}`);
    
    
    // Set up heartbeat for this connection
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Send welcome message
    safeSend(ws, JSON.stringify({ t: "WELCOME", clientId }));
    
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[WS] Client ${clientId} sent:`, msg);
        handleMessage(ws, msg);
      } catch (err) {
        console.error(`[WS] Error parsing message from client ${clientId}:`, err);
      }
    });
    
    ws.on("close", () => {
      console.log(`[WS] Client ${clientId} disconnected`);
      handleDisconnect(ws);
      clients.delete(ws);
    });
    
    ws.on("error", (err) => {
      console.error(`[WS] Client ${clientId} error:`, err);
    });
  });
  
  // WebSocket heartbeat interval - ping clients every 30 seconds
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        const client = clients.get(ws);
        if (client) {
          console.log(`[WS] Terminating dead connection for client ${client.id}`);
        }
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // Ping every 30 seconds
  
  // Cleanup heartbeat interval on server close
  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });
  
  return server;
}

// Helper function to safely send WebSocket messages
// Guards against sending to closed/closing sockets which can cause crashes
function safeSend(ws, data) {
  if (!ws) {
    console.warn('[WS] safeSend: WebSocket is null or undefined');
    return false;
  }
  
  if (ws.readyState !== WebSocket.OPEN) {
    console.warn(`[WS] safeSend: WebSocket not in OPEN state (readyState: ${ws.readyState})`);
    return false;
  }
  
  try {
    ws.send(data);
    return true;
  } catch (err) {
    console.error('[WS] safeSend: Error sending message:', err);
    return false;
  }
}

function handleMessage(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  switch (msg.t) {
    case "CREATE":
      handleCreate(ws, msg);
      break;
    case "JOIN":
      handleJoin(ws, msg);
      break;
    case "KICK":
      handleKick(ws, msg);
      break;
    case "SET_PRO":
      handleSetPro(ws, msg);
      break;
    case "APPLY_PROMO":
      handleApplyPromo(ws, msg);
      break;
    case "HOST_PLAY":
      handleHostPlay(ws, msg);
      break;
    case "HOST_PAUSE":
      handleHostPause(ws, msg);
      break;
    case "HOST_STOP":
      handleHostStop(ws, msg);
      break;
    case "HOST_TRACK_SELECTED":
      handleHostTrackSelected(ws, msg);
      break;
    case "HOST_NEXT_TRACK_QUEUED":
      handleHostNextTrackQueued(ws, msg);
      break;
    case "HOST_TRACK_CHANGED":
      handleHostTrackChanged(ws, msg);
      break;
    case "GUEST_MESSAGE":
      handleGuestMessage(ws, msg);
      break;
    case "GUEST_PLAY_REQUEST":
      handleGuestPlayRequest(ws, msg);
      break;
    case "GUEST_PAUSE_REQUEST":
      handleGuestPauseRequest(ws, msg);
      break;
    case "CHAT_MODE_SET":
      handleChatModeSet(ws, msg);
      break;
    case "HOST_BROADCAST_MESSAGE":
      handleHostBroadcastMessage(ws, msg);
      break;
    case "DJ_EMOJI":
      handleDjEmoji(ws, msg);
      break;
    case "DJ_QUICK_MESSAGE":
      handleDjQuickMessage(ws, msg);
      break;
    default:
      console.log(`[WS] Unknown message type: ${msg.t}`);
  }
}

// Helper function to add and broadcast DJ auto-generated messages
function addDjMessage(code, message, type = "system") {
  const party = parties.get(code);
  if (!party) return;
  
  const djMessage = {
    id: Date.now(),
    message,
    type, // "system", "prompt", "warning"
    timestamp: Date.now()
  };
  
  // Initialize djMessages array if not exists
  if (!party.djMessages) {
    party.djMessages = [];
  }
  
  party.djMessages.push(djMessage);
  
  // Keep only last 20 messages
  if (party.djMessages.length > 20) {
    party.djMessages = party.djMessages.slice(-20);
  }
  
  console.log(`[DJ Message] ${code}: ${message}`);
  
  // Broadcast to all party members
  const broadcastMsg = JSON.stringify({ 
    t: "DJ_MESSAGE", 
    message,
    type,
    timestamp: djMessage.timestamp
  });
  
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(broadcastMsg);
    }
  });
}

async function handleCreate(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  // Runtime guard: Check if Redis is available
  if (!redis || !redisReady) {
    console.error(`[WS] Party creation blocked - Redis not ready, instanceId: ${INSTANCE_ID}`);
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Server not ready. Please retry in a moment." 
    }));
    return;
  }
  
  // Remove from current party if already in one
  if (client.party) {
    handleDisconnect(ws);
  }
  
  // Validate and sanitize name
  const name = (msg.name || "Host").trim().substring(0, 50);
  
  // Capture and validate source from host
  const source = msg.source === "external" || msg.source === "mic" ? msg.source : "local";
  
  try {
    // Use shared party creation function
    const { code, partyData } = await createPartyCommon({
      djName: name,
      source: source,
      hostId: client.id,
      hostConnected: true
    });
    
    console.log(`[WS] Party created: ${code}, clientId: ${client.id}, instanceId: ${INSTANCE_ID}, createdAt: ${partyData.createdAt}, storageBackend: redis, totalParties: ${parties.size + 1}`);
    
    const member = {
      ws,
      id: client.id,
      name,
      isPro: !!msg.isPro,
      isHost: true
    };
    
    // Store in local memory for WebSocket connections AFTER Redis confirms
    parties.set(code, {
      host: ws,
      members: [member],
      chatMode: partyData.chatMode,
      createdAt: partyData.createdAt,
      hostId: partyData.hostId,
      source: partyData.source, // IMPORTANT: Store source in local memory
      partyPro: partyData.partyPro,
      promoUsed: partyData.promoUsed,
      djMessages: [],
      currentTrack: null,
      queue: [],
      timeoutWarningTimer: null,
      scoreState: {
        dj: {
          djUserId: null,
          djIdentifier: client.id,
          djName: name,
          sessionScore: 0,
          lifetimeScore: 0
        },
        guests: {},
        totalReactions: 0,
        totalMessages: 0,
        peakCrowdEnergy: 0
      },
      reactionHistory: [] // For storing recent emoji/messages
    });
    
    client.party = code;
    
    safeSend(ws, JSON.stringify({ t: "CREATED", code }));
    broadcastRoomState(code);
    
    // Send welcome DJ message to host
    addDjMessage(code, "🎧 Party started! Share your code with friends.", "system");
    
    // Schedule party timeout warning (30 minutes before expiry = 90 minutes after creation)
    const warningDelay = PARTY_TTL_MS - (30 * 60 * 1000); // 90 minutes
    const party = parties.get(code);
    if (party) {
      party.timeoutWarningTimer = setTimeout(() => {
        addDjMessage(code, "⏰ Party ending in 30 minutes!", "warning");
      }, warningDelay);
    }
  } catch (err) {
    console.error(`[WS] Error creating party, instanceId: ${INSTANCE_ID}:`, err.message);
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Failed to create party. Please try again." 
    }));
    return;
  }
}

async function handleJoin(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  const code = msg.code?.toUpperCase().trim();
  const timestamp = new Date().toISOString();
  
  console.log(`[WS] Attempting to join party: ${code}, clientId: ${client.id}, timestamp: ${timestamp}`);
  
  try {
    // First check Redis for party existence
    const partyData = await getPartyFromRedis(code);
    const storeReadResult = partyData ? "found" : "not_found";
    
    if (!partyData) {
      const totalParties = parties.size;
      const localPartyExists = parties.has(code);
      const rejectionReason = `Party ${code} not found. Checked Redis (${storeReadResult}) and local memory (${localPartyExists}). Total local parties: ${totalParties}`;
      console.log(`[WS] Join failed - party ${code} not found, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, exists: false, rejectionReason: ${rejectionReason}, storeReadResult: ${storeReadResult}, localParties: ${totalParties}, storageBackend: redis`);
      safeSend(ws, JSON.stringify({ t: "ERROR", message: "Party not found" }));
      return;
    }
    
    // Normalize party data to ensure all fields exist
    const normalizedPartyData = normalizePartyData(partyData);
    
    // Then check local memory
    let party = parties.get(code);
    
    // If party exists in Redis but not locally, create local entry
    if (!party) {
      parties.set(code, {
        host: null,
        members: [],
        chatMode: normalizedPartyData.chatMode,
        createdAt: normalizedPartyData.createdAt,
        hostId: normalizedPartyData.hostId,
        source: normalizedPartyData.source, // IMPORTANT: Load source from Redis
        partyPro: normalizedPartyData.partyPro, // IMPORTANT: Load partyPro from Redis
        promoUsed: normalizedPartyData.promoUsed,
        djMessages: [],
        currentTrack: null,
        queue: [],
        timeoutWarningTimer: null,
        scoreState: {
          dj: {
            djUserId: null,
            djIdentifier: normalizedPartyData.hostId,
            djName: normalizedPartyData.djName,
            sessionScore: 0,
            lifetimeScore: 0
          },
          guests: {},
          totalReactions: 0,
          totalMessages: 0,
          peakCrowdEnergy: 0
        },
        reactionHistory: []
      });
      party = parties.get(code);
    }
    
    // Remove from current party if already in one
    if (client.party) {
      handleDisconnect(ws);
    }
    
    // Check if already a member (prevent duplicates)
    if (party.members.some(m => m.id === client.id)) {
      safeSend(ws, JSON.stringify({ t: "ERROR", message: "Already in this party" }));
      return;
    }
    
    // Enforce party capacity limits based on partyPro/partyPass
    const maxAllowed = await getMaxAllowedPhones(code, normalizedPartyData);
    const currentMemberCount = party.members.length;
    
    if (currentMemberCount >= maxAllowed) {
      console.log(`[WS] Join blocked - Party limit reached, partyCode: ${code}, clientId: ${client.id}, current: ${currentMemberCount}, max: ${maxAllowed}`);
      safeSend(ws, JSON.stringify({ 
        t: "ERROR", 
        message: maxAllowed === 2 ? "Free parties are limited to 2 phones" : `Party limit reached (${maxAllowed} devices)`
      }));
      return;
    }
    
    // Validate and sanitize name
    const name = (msg.name || "Guest").trim().substring(0, 50);
    
    const member = {
      ws,
      id: client.id,
      name,
      isPro: !!msg.isPro,
      isHost: false
    };
    
    party.members.push(member);
    client.party = code;
    
    const guestCount = party.members.filter(m => !m.isHost).length;
    const totalParties = parties.size;
    
    // Update Redis with new guest count and hostConnected (fetch fresh to avoid race conditions)
    getPartyFromRedis(code).then(freshPartyData => {
      if (freshPartyData) {
        freshPartyData.guestCount = guestCount;
        freshPartyData.hostConnected = party.members.some(m => m.isHost);
        setPartyInRedis(code, freshPartyData).catch(err => {
          console.error(`[WS] Error updating guest count in Redis for ${code}:`, err.message);
        });
      }
    }).catch(err => {
      console.error(`[WS] Error fetching party for guest count update:`, err.message);
    });
    
    console.log(`[WS] Client ${client.id} joined party ${code}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, exists: true, storeReadResult: ${storeReadResult}, guestCount: ${guestCount}, totalParties: ${totalParties}, storageBackend: redis`);
    
    safeSend(ws, JSON.stringify({ t: "JOINED", code }));
    
    // Send reaction history to newly joined client
    if (party.reactionHistory && party.reactionHistory.length > 0) {
      safeSend(ws, JSON.stringify({ 
        t: "REACTION_HISTORY", 
        items: party.reactionHistory 
      }));
    }
    
    // Send playback state to newly joined client (Phase 7)
    if (party.currentTrack || (party.queue && party.queue.length > 0)) {
      safeSend(ws, JSON.stringify({ 
        t: "PLAYBACK_STATE",
        currentTrack: party.currentTrack,
        queue: party.queue || [],
        serverTime: Date.now()
      }));
    }
    
    broadcastRoomState(code);
    
    // Send welcome DJ message for first guest
    if (guestCount === 1) {
      addDjMessage(code, `👋 ${name} joined the party!`, "system");
      // Encourage interaction after a few seconds
      setTimeout(() => {
        addDjMessage(code, "💬 Drop an emoji or message!", "prompt");
      }, 5000);
    } else {
      addDjMessage(code, `👋 ${name} joined! ${guestCount} guests in the party.`, "system");
    }
  } catch (err) {
    console.error(`[WS] Error in handleJoin for ${code}:`, err.message);
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Server error. Please try again." 
    }));
  }
}

// Helper function to ensure guest exists in scoreboard
function ensureGuestInScoreboard(party, guestId, nickname) {
  if (!party.scoreState.guests[guestId]) {
    party.scoreState.guests[guestId] = {
      guestId,
      nickname: nickname || "Guest",
      points: 0,
      emojis: 0,
      messages: 0,
      rank: 1
    };
  }
  return party.scoreState.guests[guestId];
}

function handleKick(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can kick
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can kick members" }));
    return;
  }
  
  // Validate targetId
  if (!msg.targetId || typeof msg.targetId !== 'number') {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Invalid target ID" }));
    return;
  }
  
  const targetMember = party.members.find(m => m.id === msg.targetId);
  
  if (!targetMember) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Member not found" }));
    return;
  }
  
  if (targetMember.isHost) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Cannot kick host" }));
    return;
  }
  
  // Check WebSocket state before sending
  if (targetMember.ws.readyState === WebSocket.OPEN) {
    targetMember.ws.send(JSON.stringify({ t: "KICKED" }));
  }
  
  party.members = party.members.filter(m => m.id !== msg.targetId);
  
  const targetClient = clients.get(targetMember.ws);
  if (targetClient) targetClient.party = null;
  
  console.log(`[Party] Client ${msg.targetId} kicked from party ${client.party}`);
  
  broadcastRoomState(client.party);
}

function handleSetPro(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  const member = party.members.find(m => m.ws === ws);
  if (member) {
    member.isPro = !!msg.isPro;
    console.log(`[Party] Client ${client.id} set Pro to ${member.isPro}`);
    // Note: SET_PRO only affects member's badge, NOT party-wide Pro status
    broadcastRoomState(client.party);
  }
}

function handleApplyPromo(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) {
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Not in a party" 
    }));
    return;
  }
  
  const party = parties.get(client.party);
  if (!party) {
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Party not found" 
    }));
    return;
  }
  
  // Check if promo code already used
  if (party.promoUsed) {
    console.log(`[Promo] Attempt to reuse promo in party ${client.party}, clientId: ${client.id}`);
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "This party already used a promo code." 
    }));
    return;
  }
  
  // Validate promo code (case-insensitive, trim spaces)
  const code = (msg.code || "").trim().toUpperCase();
  if (!PROMO_CODES.includes(code)) {
    console.log(`[Promo] Invalid promo code attempt: ${code}, partyCode: ${client.party}, clientId: ${client.id}`);
    safeSend(ws, JSON.stringify({ 
      t: "ERROR", 
      message: "Invalid or expired promo code." 
    }));
    return;
  }
  
  // Valid and unused - unlock party-wide Pro
  party.promoUsed = true;
  party.partyPro = true;
  console.log(`[Promo] Party ${client.party} unlocked with promo code ${code}, clientId: ${client.id}`);
  
  // CRITICAL: Persist to Redis so promo state survives refresh and works cross-instance
  // Use async IIFE to properly handle promises
  (async () => {
    try {
      const partyData = await getPartyFromRedis(client.party);
      if (partyData) {
        const normalizedData = normalizePartyData(partyData);
        normalizedData.promoUsed = true;
        normalizedData.partyPro = true;
        await setPartyInRedis(client.party, normalizedData);
        console.log(`[Promo] Successfully persisted promo state to Redis for ${client.party}`);
      } else {
        console.warn(`[Promo] Party ${client.party} not found in Redis during promo persist`);
      }
    } catch (err) {
      console.error(`[Promo] Error persisting promo to Redis for ${client.party}:`, err.message);
    }
  })();
  
  // Broadcast updated room state to all members
  broadcastRoomState(client.party);
}

function handleDisconnect(ws) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  const member = party.members.find(m => m.ws === ws);
  
  if (member?.isHost) {
    // Host left, end the party
    console.log(`[Party] Host left, ending party ${client.party}, instanceId: ${INSTANCE_ID}`);
    
    // Persist scoreboard to database
    persistPartyScoreboard(client.party, party).catch(err => {
      console.error(`[Database] Error persisting scoreboard for party ${client.party}:`, err.message);
    });
    
    // Clear timeout warning timer
    if (party.timeoutWarningTimer) {
      clearTimeout(party.timeoutWarningTimer);
      party.timeoutWarningTimer = null;
    }
    
    party.members.forEach(m => {
      if (m.ws !== ws && m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(JSON.stringify({ t: "ENDED" }));
      }
      const c = clients.get(m.ws);
      if (c) c.party = null;
    });
    parties.delete(client.party);
    
    // Delete from Redis
    deletePartyFromRedis(client.party).catch(err => {
      console.error(`[Redis] Error deleting party ${client.party}:`, err.message);
    });
  } else {
    // Regular member left
    party.members = party.members.filter(m => m.ws !== ws);
    console.log(`[Party] Client ${client.id} left party ${client.party}, instanceId: ${INSTANCE_ID}`);
    
    // Update guest count in Redis
    const guestCount = party.members.filter(m => !m.isHost).length;
    getPartyFromRedis(client.party).then(partyData => {
      if (partyData) {
        partyData.guestCount = guestCount;
        setPartyInRedis(client.party, partyData).catch(err => {
          console.error(`[Redis] Error updating guest count after disconnect:`, err.message);
        });
      }
    }).catch(err => {
      console.error(`[Redis] Error reading party for disconnect update:`, err.message);
    });
    
    broadcastRoomState(client.party);
  }
  
  client.party = null;
}

function broadcastRoomState(code) {
  const party = parties.get(code);
  if (!party) return;
  
  const snapshot = {
    members: party.members.map(m => ({
      id: m.id,
      name: m.name,
      isPro: m.isPro,
      isHost: m.isHost
    })),
    chatMode: party.chatMode || "OPEN",
    partyPro: !!party.partyPro, // Party-wide Pro status
    source: party.source || "local" // Host-selected source
  };
  
  const message = JSON.stringify({ t: "ROOM", snapshot });
  
  // Broadcast to local members
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
  
  // Publish to other instances (Phase 8)
  publishToOtherInstances(code, "ROOM", { t: "ROOM", snapshot });
}

function broadcastScoreboard(code) {
  const party = parties.get(code);
  if (!party || !party.scoreState) return;
  
  // Calculate rankings for guests
  const guestList = Object.values(party.scoreState.guests)
    .sort((a, b) => b.points - a.points)
    .map((guest, index) => ({
      ...guest,
      rank: index + 1
    }));
  
  // Update ranks in scoreState
  guestList.forEach(guest => {
    if (party.scoreState.guests[guest.guestId]) {
      party.scoreState.guests[guest.guestId].rank = guest.rank;
    }
  });
  
  const scoreboardData = {
    dj: {
      djName: party.scoreState.dj.djName,
      sessionScore: party.scoreState.dj.sessionScore,
      lifetimeScore: party.scoreState.dj.lifetimeScore
    },
    guests: guestList.slice(0, 10), // Top 10 guests
    totalReactions: party.scoreState.totalReactions,
    totalMessages: party.scoreState.totalMessages,
    peakCrowdEnergy: party.scoreState.peakCrowdEnergy
  };
  
  const message = JSON.stringify({ 
    t: "SCOREBOARD_UPDATE", 
    scoreboard: scoreboardData
  });
  
  // Broadcast to local party members
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
  
  // Publish to other instances (Phase 8)
  publishToOtherInstances(code, "SCOREBOARD", { t: "SCOREBOARD_UPDATE", scoreboard: scoreboardData });
}

function handleHostPlay(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send play events
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can control playback" }));
    return;
  }
  
  console.log(`[Party] Host playing in party ${client.party}`);
  
  // Store track info in party state if provided
  const trackId = msg.trackId || party.currentTrack?.trackId || null;
  const trackUrl = msg.trackUrl || party.currentTrack?.trackUrl || null;
  const filename = msg.filename || party.currentTrack?.filename || "Unknown Track";
  const startPosition = msg.positionSec || 0;
  const serverTimestamp = Date.now();
  
  party.currentTrack = {
    trackId,
    trackUrl,
    filename,
    startAtServerMs: serverTimestamp,
    startPositionSec: startPosition,
    status: 'playing' // HOST_PLAY event always indicates playing state
  };
  
  console.log(`[Party] Track info: ${filename}, trackId: ${trackId}, position: ${startPosition}s`);
  
  // Persist playback state to Redis (best-effort, async)
  persistPlaybackToRedis(client.party, party.currentTrack, party.queue || []);
  
  // Broadcast to all guests (not host) with track info
  const message = JSON.stringify({ 
    t: "PLAY",
    trackId,
    trackUrl,
    filename,
    serverTimestamp,
    positionSec: startPosition
  });
  
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostPause(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send pause events
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can control playback" }));
    return;
  }
  
  console.log(`[Party] Host paused in party ${client.party}`);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "PAUSE" });
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostStop(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send stop events
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can control playback" }));
    return;
  }
  
  console.log(`[Party] Host stopped playback in party ${client.party}`);
  
  // Reset current track position
  if (party.currentTrack) {
    party.currentTrack.startPositionSec = 0;
  }
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "STOP" });
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostTrackSelected(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can select tracks
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can select tracks" }));
    return;
  }
  
  const trackId = msg.trackId || null;
  const trackUrl = msg.trackUrl || null;
  const filename = msg.filename || "Unknown Track";
  
  console.log(`[Party] Host selected track "${filename}" (trackId: ${trackId}) in party ${client.party}`);
  
  // Store in party state
  party.currentTrack = {
    trackId,
    trackUrl,
    filename
  };
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ 
    t: "TRACK_SELECTED", 
    trackId,
    trackUrl,
    filename 
  });
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostNextTrackQueued(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can queue tracks
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can queue tracks" }));
    return;
  }
  
  const filename = msg.filename || null;
  console.log(`[Party] Host queued next track "${filename}" in party ${client.party}`);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "NEXT_TRACK_QUEUED", filename });
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostTrackChanged(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can change tracks
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can change tracks" }));
    return;
  }
  
  const trackId = msg.trackId || null;
  const trackUrl = msg.trackUrl || null;
  const filename = msg.filename || "Unknown Track";
  const nextFilename = msg.nextFilename || null;
  const serverTimestamp = Date.now();
  const positionSec = msg.positionSec || 0;
  
  console.log(`[Party] Host changed to track "${filename}" (trackId: ${trackId}, next: "${nextFilename}") in party ${client.party}`);
  
  // Update party state
  party.currentTrack = {
    trackId,
    trackUrl,
    filename,
    startAtServerMs: serverTimestamp,
    startPositionSec: positionSec,
    status: 'playing' // TRACK_CHANGED event always indicates playing state
  };
  
  // Persist playback state to Redis (best-effort, async)
  persistPlaybackToRedis(client.party, party.currentTrack, party.queue || []);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ 
    t: "TRACK_CHANGED", 
    trackId,
    trackUrl,
    filename, 
    nextFilename,
    serverTimestamp,
    positionSec
  });
  party.members.forEach(m => {
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleGuestMessage(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only guests can send messages (not host)
  const member = party.members.find(m => m.ws === ws);
  if (!member || member.isHost) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only guests can send messages" }));
    return;
  }
  
  // Check chat mode restrictions
  const chatMode = party.chatMode || "OPEN";
  const messageText = (msg.message || "").trim().substring(0, 100);
  const isEmoji = msg.isEmoji || false;
  
  // LOCKED mode: no messages allowed
  if (chatMode === "LOCKED") {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Chat is locked by the DJ" }));
    return;
  }
  
  // EMOJI_ONLY mode: only emoji messages allowed
  if (chatMode === "EMOJI_ONLY" && !isEmoji) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only emoji reactions allowed" }));
    return;
  }
  
  const guestName = member.name || "Guest";
  
  console.log(`[Party] Guest "${guestName}" sent message "${messageText}" in party ${client.party}`);
  
  // Update scoreboard: award points for messages/emojis
  const guestScore = ensureGuestInScoreboard(party, member.id, guestName);
  
  if (isEmoji) {
    guestScore.emojis += 1;
    guestScore.points += 5; // 5 points per emoji
    party.scoreState.totalReactions += 1;
  } else {
    guestScore.messages += 1;
    guestScore.points += 10; // 10 points per text message
    party.scoreState.totalMessages += 1;
  }
  
  // Award points to DJ for engagement
  party.scoreState.dj.sessionScore += (isEmoji ? 2 : 3);
  
  // Add to reaction history (for refresh/late join support)
  if (!party.reactionHistory) {
    party.reactionHistory = [];
  }
  party.reactionHistory.push({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: isEmoji ? "emoji" : "text",
    message: messageText,
    guestName: guestName,
    guestId: member.id,
    ts: Date.now()
  });
  // Keep only last 30 items
  if (party.reactionHistory.length > 30) {
    party.reactionHistory = party.reactionHistory.slice(-30);
  }
  
  // Persist reaction history to Redis (best-effort, async)
  persistReactionHistoryToRedis(client.party, party.reactionHistory);
  
  // Broadcast updated scoreboard to all party members
  broadcastScoreboard(client.party);
  
  // Broadcast to all party members (including other guests)
  const message = JSON.stringify({ 
    t: "GUEST_MESSAGE", 
    message: messageText,
    guestName: guestName,
    guestId: member.id,
    isEmoji: isEmoji
  });
  
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleGuestPlayRequest(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only guests can send playback requests (not host)
  const member = party.members.find(m => m.ws === ws);
  if (!member || member.isHost) {
    return; // Silently ignore if host sends this
  }
  
  const guestName = member.name || "Guest";
  console.log(`[Party] Guest "${guestName}" requested to play music in party ${client.party}`);
  
  // Send notification to host
  const message = JSON.stringify({ 
    t: "GUEST_PLAY_REQUEST", 
    guestName: guestName,
    guestId: member.id
  });
  
  if (party.host && party.host.readyState === WebSocket.OPEN) {
    party.host.send(message);
  }
}

function handleGuestPauseRequest(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only guests can send playback requests (not host)
  const member = party.members.find(m => m.ws === ws);
  if (!member || member.isHost) {
    return; // Silently ignore if host sends this
  }
  
  const guestName = member.name || "Guest";
  console.log(`[Party] Guest "${guestName}" requested to pause music in party ${client.party}`);
  
  // Send notification to host
  const message = JSON.stringify({ 
    t: "GUEST_PAUSE_REQUEST", 
    guestName: guestName,
    guestId: member.id
  });
  
  if (party.host && party.host.readyState === WebSocket.OPEN) {
    party.host.send(message);
  }
}

function handleChatModeSet(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can set chat mode
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can set chat mode" }));
    return;
  }
  
  const mode = msg.mode;
  if (!["OPEN", "EMOJI_ONLY", "LOCKED"].includes(mode)) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Invalid chat mode" }));
    return;
  }
  
  party.chatMode = mode;
  console.log(`[Party] Chat mode set to ${mode} in party ${client.party}`);
  
  // Persist chat mode to Redis
  getPartyFromRedis(client.party).then(partyData => {
    if (partyData) {
      partyData.chatMode = mode;
      setPartyInRedis(client.party, partyData).catch(err => {
        console.error(`[ChatMode] Error persisting chat mode to Redis for ${client.party}:`, err.message);
      });
    }
  }).catch(err => {
    console.error(`[ChatMode] Error fetching party for chat mode update:`, err.message);
  });
  
  // Broadcast to all members
  const message = JSON.stringify({ t: "CHAT_MODE_SET", mode });
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostBroadcastMessage(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can broadcast messages
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only host can broadcast messages" }));
    return;
  }
  
  const messageText = (msg.message || "").trim().substring(0, 100);
  
  console.log(`[Party] Host broadcasting message "${messageText}" in party ${client.party}`);
  
  // Broadcast to all members (including guests only, not back to host)
  const broadcastMsg = JSON.stringify({ 
    t: "HOST_BROADCAST_MESSAGE", 
    message: messageText
  });
  
  party.members.forEach(m => {
    // Send to guests only (not to host)
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(broadcastMsg);
    }
  });
}

function handleDjEmoji(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send DJ emojis
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only DJ can send emojis" }));
    return;
  }
  
  const emoji = (msg.emoji || "").trim().substring(0, 10);
  
  console.log(`[Party] DJ sending emoji "${emoji}" in party ${client.party}`);
  
  // Award DJ points for engagement
  party.scoreState.dj.sessionScore += 5; // 5 points for DJ emoji interaction
  party.scoreState.totalReactions += 1;
  
  // Add to reaction history (for refresh/late join support)
  if (!party.reactionHistory) {
    party.reactionHistory = [];
  }
  party.reactionHistory.push({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: "dj",
    message: emoji,
    guestName: "DJ",
    guestId: "dj",
    ts: Date.now()
  });
  // Keep only last 30 items
  if (party.reactionHistory.length > 30) {
    party.reactionHistory = party.reactionHistory.slice(-30);
  }
  
  // Persist reaction history to Redis (best-effort, async)
  persistReactionHistoryToRedis(client.party, party.reactionHistory);
  
  // Broadcast updated scoreboard
  broadcastScoreboard(client.party);
  
  // Broadcast to all members (guests only, not back to host)
  const broadcastMsg = JSON.stringify({ 
    t: "GUEST_MESSAGE",
    message: emoji,
    guestName: "DJ",
    guestId: "dj",
    isEmoji: true
  });
  
  party.members.forEach(m => {
    // Send to guests only (not to host)
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(broadcastMsg);
    }
  });
}

/**
 * Helper function to check if a user has an active Pro Monthly subscription
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} - True if user has active Pro subscription
 */
async function isProMonthlyUser(userId) {
  // Anonymous users cannot have Pro subscriptions
  if (!userId || userId.startsWith('anonymous-')) {
    return false;
  }
  
  try {
    const result = await db.query(
      `SELECT status, current_period_end
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY current_period_end DESC
       LIMIT 1`,
      [userId]
    );
    
    // Check if subscription exists and is not expired
    if (result.rows.length > 0) {
      const subscription = result.rows[0];
      const isActive = new Date(subscription.current_period_end) > new Date();
      return isActive;
    }
    
    return false;
  } catch (error) {
    console.error('[isProMonthlyUser] Error checking subscription:', error.message);
    return false;
  }
}

/**
 * Rate limiting for DJ quick messages
 * Track last message timestamp per party host
 */
const djQuickMessageRateLimits = new Map(); // Map<userId, { lastMessageTime, messageCount, windowStart }>

/**
 * Check if DJ can send a quick message (rate limiting)
 * @param {string} userId - User ID
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
function checkDjQuickMessageRateLimit(userId) {
  const now = Date.now();
  const limits = djQuickMessageRateLimits.get(userId) || {
    lastMessageTime: 0,
    messageCount: 0,
    windowStart: now
  };
  
  // Check if 2 seconds have passed since last message
  if (now - limits.lastMessageTime < 2000) {
    return { allowed: false, reason: 'Please wait 2 seconds between messages' };
  }
  
  // Reset window if 60 seconds have passed
  if (now - limits.windowStart >= 60000) {
    limits.messageCount = 0;
    limits.windowStart = now;
  }
  
  // Check if under 10 messages per minute
  if (limits.messageCount >= 10) {
    return { allowed: false, reason: 'Maximum 10 messages per minute. Please slow down.' };
  }
  
  // Update limits
  limits.lastMessageTime = now;
  limits.messageCount += 1;
  djQuickMessageRateLimits.set(userId, limits);
  
  return { allowed: true };
}

/**
 * Handle DJ quick message (Pro Monthly feature)
 */
async function handleDjQuickMessage(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send DJ quick messages
  if (party.host !== ws) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Only the DJ/host can send quick messages" }));
    return;
  }
  
  // Check if host has a userId (must be authenticated)
  const userId = client.userId;
  if (!userId || userId.startsWith('anonymous-')) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Pro Monthly subscription required for DJ Quick Messages" }));
    return;
  }
  
  // Check if user has Pro Monthly subscription
  const isPro = await isProMonthlyUser(userId);
  if (!isPro) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Pro Monthly subscription required for DJ Quick Messages" }));
    return;
  }
  
  // Check rate limiting
  const rateLimitCheck = checkDjQuickMessageRateLimit(userId);
  if (!rateLimitCheck.allowed) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: rateLimitCheck.reason }));
    return;
  }
  
  // Validate message
  const messageText = (msg.message || "").trim();
  
  if (!messageText) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Message cannot be empty" }));
    return;
  }
  
  if (messageText.length > 50) {
    safeSend(ws, JSON.stringify({ t: "ERROR", message: "Message too long (max 50 characters)" }));
    return;
  }
  
  console.log(`[Party] DJ sending quick message "${messageText}" in party ${client.party}`);
  
  // Create reaction feed item with TTL
  const item = {
    id: `djmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ts: Date.now(),
    type: "dj_quick",
    message: messageText,
    guestName: "DJ",
    guestId: "dj",
    isEmoji: false,
    ttlMs: 12000 // 12 seconds TTL
  };
  
  // Add to reaction history (for refresh/late join support) with TTL flag
  if (!party.reactionHistory) {
    party.reactionHistory = [];
  }
  party.reactionHistory.push(item);
  
  // Keep only last 30 items
  if (party.reactionHistory.length > 30) {
    party.reactionHistory = party.reactionHistory.slice(-30);
  }
  
  // Persist reaction history to Redis (best-effort, async)
  persistReactionHistoryToRedis(client.party, party.reactionHistory);
  
  // Broadcast to all guests (not back to DJ)
  const broadcastMsg = JSON.stringify({ 
    t: "GUEST_MESSAGE",
    message: messageText,
    guestName: "DJ",
    guestId: "dj",
    isEmoji: false,
    ttlMs: 12000, // Include TTL so client can auto-remove
    kind: "dj_quick" // Mark as DJ quick message
  });
  
  party.members.forEach(m => {
    // Send to guests only (not to host)
    if (!m.isHost && m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(broadcastMsg);
    }
  });
}

// Helper function to wait for Redis to be ready (for tests)
function waitForRedis(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (redisReady) {
      resolve();
      return;
    }
    
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for Redis'));
    }, timeoutMs);
    
    if (redis) {
      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    } else {
      clearTimeout(timeout);
      reject(new Error('Redis not configured'));
    }
  });
}

// Helper to get Redis ready state (for tests)
function isRedisReady() {
  return redisReady;
}

// Process-level error handlers to prevent crashes
// These catch unhandled errors that could cause the server to exit
// NOTE: According to Node.js best practices, uncaughtException should trigger graceful shutdown.
// However, for Railway deployment where automatic restarts are handled by the platform,
// we log the error and continue to maintain visibility. In a production environment without
// platform-managed restarts, consider implementing graceful shutdown with process.exit(1).
process.on('uncaughtException', (err, origin) => {
  console.error(`❌ [CRITICAL] Uncaught Exception at ${origin}:`, err);
  console.error(`   Instance: ${INSTANCE_ID}, Version: ${APP_VERSION}`);
  console.error(`   Stack:`, err.stack);
  // Log the error for debugging. Railway/platform monitors will detect the error in logs.
  // For self-hosted deployments, consider adding graceful shutdown here:
  // setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`❌ [CRITICAL] Unhandled Rejection:`, reason);
  console.error(`   Instance: ${INSTANCE_ID}, Version: ${APP_VERSION}`);
  console.error(`   Promise:`, promise);
  if (reason instanceof Error) {
    console.error(`   Stack:`, reason.stack);
  }
  // Log but don't exit - let the application continue
});

// Start server if run directly (not imported as module)
if (require.main === module) {
  startServer();
}

// Export for testing
module.exports = {
  app,
  server,
  generateCode,
  parties,
  startServer,
  redis,
  getPartyFromRedis,
  setPartyInRedis,
  deletePartyFromRedis,
  getPartyFromFallback,
  setPartyInFallback,
  deletePartyFromFallback,
  fallbackPartyStorage,
  INSTANCE_ID,
  waitForRedis,
  isRedisReady
};
