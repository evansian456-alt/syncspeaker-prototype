const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const { customAlphabet } = require("nanoid");
const Redis = require("ioredis");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "0.1.0-party-fix"; // Version identifier for debugging and version display

// Generate unique instance ID for this server instance
const INSTANCE_ID = `server-${Math.random().toString(36).substring(2, 9)}`;

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

// Parse JSON bodies
app.use(express.json());

// Add version header to all responses
app.use((req, res, next) => {
  res.setHeader("X-App-Version", APP_VERSION);
  next();
});

// Serve static files from the repo root
app.use(express.static(__dirname));

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
let nextClientId = 1;
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

// POST /api/create-party - Create a new party
app.post("/api/create-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/create-party at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
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
    // Generate unique party code
    let code;
    let attempts = 0;
    do {
      code = generateCode(); // Already generates 6-character uppercase code
      
      // Check for existing party in Redis or fallback storage
      let existing;
      if (useRedis) {
        try {
          existing = await getPartyFromRedis(code);
        } catch (err) {
          console.warn(`[HTTP] Redis check failed, using fallback: ${err.message}`);
          existing = getPartyFromFallback(code);
        }
      } else {
        existing = getPartyFromFallback(code);
      }
      
      if (!existing) break;
      attempts++;
    } while (attempts < 10);
    
    if (attempts >= 10) {
      console.error(`[HTTP] Failed to generate unique party code after 10 attempts, instanceId: ${INSTANCE_ID}`);
      return res.status(500).json({ error: "Failed to generate unique party code" });
    }
    
    const hostId = nextHostId++;
    const createdAt = Date.now();
    
    // Create party data for storage (only serializable data)
    const partyData = {
      chatMode: "OPEN",
      createdAt,
      hostId,
      hostConnected: false,
      guestCount: 0,
      guests: [], // Array of { guestId, nickname, joinedAt }
      status: "active", // "active", "ended", "expired"
      expiresAt: createdAt + PARTY_TTL_MS
    };
    
    // Write to storage backend (Redis or fallback)
    if (useRedis) {
      try {
        await setPartyInRedis(code, partyData);
        console.log(`[HTTP] Party persisted to Redis: ${code}, storageBackend: redis`);
        
        // Verify Redis write succeeded by reading back
        const verification = await getPartyFromRedis(code);
        if (!verification) {
          console.error(`[HTTP] Party write verification failed for ${code}, falling back to local storage`);
          setPartyInFallback(code, partyData);
        }
      } catch (error) {
        console.warn(`[HTTP] Redis write failed for ${code}, using fallback: ${error.message}`);
        setPartyInFallback(code, partyData);
      }
    } else {
      setPartyInFallback(code, partyData);
      console.log(`[HTTP] Party persisted to fallback: ${code}, storageBackend: fallback`);
    }
    
    // Also store in local memory for WebSocket connections
    parties.set(code, {
      host: null, // No WebSocket connection (HTTP-created party)
      members: [],
      chatMode: "OPEN",
      createdAt,
      hostId
    });
    
    const totalParties = parties.size;
    console.log(`[HTTP] Party created: ${code}, hostId: ${hostId}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, createdAt: ${createdAt}, totalParties: ${totalParties}, storageBackend: ${storageBackend}`);
    
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
    const code = partyCode.trim().toUpperCase();
    
    // Validate party code length
    if (code.length !== 6) {
      console.log(`[join-party] Invalid party code length: ${code.length}`);
      return res.status(400).json({ error: "Party code must be 6 characters" });
    }
    
    // Generate guest ID and use provided nickname or generate default
    const guestNumber = nextClientId;
    const guestId = `guest-${nextClientId}`;
    nextClientId++;
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
      partyCode: code
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
      createdAt: partyData.createdAt
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
  cleanupInterval = setInterval(cleanupExpiredParties, CLEANUP_INTERVAL_MS);
  console.log(`[Server] Party cleanup job started (runs every ${CLEANUP_INTERVAL_MS / 1000}s, TTL: ${PARTY_TTL_MS / 1000}s, instance: ${INSTANCE_ID})`);
  
  // WebSocket server setup
  wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    const clientId = nextClientId++;
    clients.set(ws, { id: clientId, party: null });
    
    console.log(`[WS] Client ${clientId} connected`);
    
    // Send welcome message
    ws.send(JSON.stringify({ t: "WELCOME", clientId }));
    
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
  
  return server;
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
    case "HOST_PLAY":
      handleHostPlay(ws, msg);
      break;
    case "HOST_PAUSE":
      handleHostPause(ws, msg);
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
    case "CHAT_MODE_SET":
      handleChatModeSet(ws, msg);
      break;
    default:
      console.log(`[WS] Unknown message type: ${msg.t}`);
  }
}

async function handleCreate(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  // Runtime guard: Check if Redis is available
  if (!redis || !redisReady) {
    console.error(`[WS] Party creation blocked - Redis not ready, instanceId: ${INSTANCE_ID}`);
    ws.send(JSON.stringify({ 
      t: "ERROR", 
      message: "Server not ready. Please retry in a moment." 
    }));
    return;
  }
  
  // Remove from current party if already in one
  if (client.party) {
    handleDisconnect(ws);
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
    console.error(`[WS] Failed to generate unique party code after 10 attempts, instanceId: ${INSTANCE_ID}`);
    ws.send(JSON.stringify({ 
      t: "ERROR", 
      message: "Failed to generate unique party code. Please try again." 
    }));
    return;
  }
  
  // Validate and sanitize name
  const name = (msg.name || "Host").trim().substring(0, 50);
  
  const member = {
    ws,
    id: client.id,
    name,
    isPro: !!msg.isPro,
    isHost: true,
    source: msg.source === "external" || msg.source === "mic" ? msg.source : "local"
  };
  
  const createdAt = Date.now();
  const timestamp = new Date().toISOString();
  const hostId = client.id; // Use client ID as host ID for WebSocket connections
  
  // Create party data for Redis
  const partyData = {
    chatMode: "OPEN",
    createdAt,
    hostId,
    hostConnected: true,
    guestCount: 0
  };
  
  // CRITICAL: Write to Redis FIRST before responding to client
  // This ensures party is persisted before guests try to join
  try {
    await setPartyInRedis(code, partyData);
    console.log(`[WS] Party created: ${code}, clientId: ${client.id}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, createdAt: ${createdAt}, storageBackend: redis, totalParties: ${parties.size + 1}`);
  } catch (err) {
    console.error(`[WS] Error writing party to Redis: ${code}, instanceId: ${INSTANCE_ID}:`, err.message);
    ws.send(JSON.stringify({ 
      t: "ERROR", 
      message: "Failed to create party. Please try again." 
    }));
    return;
  }
  
  // Store in local memory for WebSocket connections AFTER Redis confirms
  parties.set(code, {
    host: ws,
    members: [member],
    chatMode: "OPEN",
    createdAt,
    hostId
  });
  
  client.party = code;
  
  ws.send(JSON.stringify({ t: "CREATED", code }));
  broadcastRoomState(code);
}

async function handleJoin(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  const code = msg.code?.toUpperCase().trim();
  const timestamp = new Date().toISOString();
  
  console.log(`[WS] Attempting to join party: ${code}, clientId: ${client.id}, timestamp: ${timestamp}`);
  
  // First check Redis for party existence
  const partyData = await getPartyFromRedis(code);
  const storeReadResult = partyData ? "found" : "not_found";
  
  // Then check local memory
  let party = parties.get(code);
  
  // If party exists in Redis but not locally, create local entry
  // Note: guestCount and hostConnected are derived from members array in local state
  // and don't need to be initialized from Redis here
  if (partyData && !party) {
    parties.set(code, {
      host: null,
      members: [],
      chatMode: partyData.chatMode || "OPEN",
      createdAt: partyData.createdAt,
      hostId: partyData.hostId
    });
    party = parties.get(code);
  }
  
  if (!party) {
    const timestamp = new Date().toISOString();
    const totalParties = parties.size;
    const localPartyExists = parties.has(code);
    const rejectionReason = `Party ${code} not found. Checked Redis (${storeReadResult}) and local memory (${localPartyExists}). Total local parties: ${totalParties}`;
    console.log(`[WS] Join failed - party ${code} not found, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, exists: false, rejectionReason: ${rejectionReason}, storeReadResult: ${storeReadResult}, localParties: ${totalParties}, storageBackend: redis`);
    ws.send(JSON.stringify({ t: "ERROR", message: "Party not found" }));
    return;
  }
  
  // Remove from current party if already in one
  if (client.party) {
    handleDisconnect(ws);
  }
  
  // Check if already a member (prevent duplicates)
  if (party.members.some(m => m.id === client.id)) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Already in this party" }));
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
  
  // Update Redis with new guest count (fetch fresh to avoid race conditions)
  getPartyFromRedis(code).then(freshPartyData => {
    if (freshPartyData) {
      freshPartyData.guestCount = guestCount;
      setPartyInRedis(code, freshPartyData).catch(err => {
        console.error(`[WS] Error updating guest count in Redis for ${code}:`, err.message);
      });
    }
  }).catch(err => {
    console.error(`[WS] Error fetching party for guest count update:`, err.message);
  });
  
  console.log(`[WS] Client ${client.id} joined party ${code}, instanceId: ${INSTANCE_ID}, partyCode: ${code}, exists: true, storeReadResult: ${storeReadResult}, guestCount: ${guestCount}, totalParties: ${totalParties}, storageBackend: redis`);
  
  ws.send(JSON.stringify({ t: "JOINED", code }));
  broadcastRoomState(code);
}

function handleKick(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can kick
  if (party.host !== ws) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can kick members" }));
    return;
  }
  
  // Validate targetId
  if (!msg.targetId || typeof msg.targetId !== 'number') {
    ws.send(JSON.stringify({ t: "ERROR", message: "Invalid target ID" }));
    return;
  }
  
  const targetMember = party.members.find(m => m.id === msg.targetId);
  
  if (!targetMember) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Member not found" }));
    return;
  }
  
  if (targetMember.isHost) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Cannot kick host" }));
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
    broadcastRoomState(client.party);
  }
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
    chatMode: party.chatMode || "OPEN"
  };
  
  const message = JSON.stringify({ t: "ROOM", snapshot });
  
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
    }
  });
}

function handleHostPlay(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can send play events
  if (party.host !== ws) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can control playback" }));
    return;
  }
  
  console.log(`[Party] Host playing in party ${client.party}`);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "PLAY" });
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
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can control playback" }));
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

function handleHostTrackSelected(ws, msg) {
  const client = clients.get(ws);
  if (!client || !client.party) return;
  
  const party = parties.get(client.party);
  if (!party) return;
  
  // Only host can select tracks
  if (party.host !== ws) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can select tracks" }));
    return;
  }
  
  const filename = msg.filename || "Unknown Track";
  console.log(`[Party] Host selected track "${filename}" in party ${client.party}`);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "TRACK_SELECTED", filename });
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
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can queue tracks" }));
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
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can change tracks" }));
    return;
  }
  
  const filename = msg.filename || "Unknown Track";
  const nextFilename = msg.nextFilename || null;
  console.log(`[Party] Host changed to track "${filename}" (next: "${nextFilename}") in party ${client.party}`);
  
  // Broadcast to all guests (not host)
  const message = JSON.stringify({ t: "TRACK_CHANGED", filename, nextFilename });
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
    ws.send(JSON.stringify({ t: "ERROR", message: "Only guests can send messages" }));
    return;
  }
  
  // Check chat mode restrictions
  const chatMode = party.chatMode || "OPEN";
  const messageText = (msg.message || "").trim().substring(0, 100);
  const isEmoji = msg.isEmoji || false;
  
  // LOCKED mode: no messages allowed
  if (chatMode === "LOCKED") {
    ws.send(JSON.stringify({ t: "ERROR", message: "Chat is locked by the DJ" }));
    return;
  }
  
  // EMOJI_ONLY mode: only emoji messages allowed
  if (chatMode === "EMOJI_ONLY" && !isEmoji) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Only emoji reactions allowed" }));
    return;
  }
  
  const guestName = member.name || "Guest";
  
  console.log(`[Party] Guest "${guestName}" sent message "${messageText}" in party ${client.party}`);
  
  // Send to host only
  const message = JSON.stringify({ 
    t: "GUEST_MESSAGE", 
    message: messageText,
    guestName: guestName,
    guestId: member.id,
    isEmoji: isEmoji
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
    ws.send(JSON.stringify({ t: "ERROR", message: "Only host can set chat mode" }));
    return;
  }
  
  const mode = msg.mode;
  if (!["OPEN", "EMOJI_ONLY", "LOCKED"].includes(mode)) {
    ws.send(JSON.stringify({ t: "ERROR", message: "Invalid chat mode" }));
    return;
  }
  
  party.chatMode = mode;
  console.log(`[Party] Chat mode set to ${mode} in party ${client.party}`);
  
  // Broadcast to all members
  const message = JSON.stringify({ t: "CHAT_MODE_SET", mode });
  party.members.forEach(m => {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(message);
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
