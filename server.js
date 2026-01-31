const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const { customAlphabet } = require("nanoid");
const Redis = require("ioredis");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "0.1.0-party-fix"; // Version identifier for debugging and version display

// Generate unique instance ID for this server instance
const INSTANCE_ID = `server-${Math.random().toString(36).substring(2, 9)}`;

// Redis client setup
const redis = new Redis({
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
});

redis.on("connect", () => {
  console.log(`[Redis] Connected to Redis server (instance: ${INSTANCE_ID})`);
});

redis.on("error", (err) => {
  console.error(`[Redis] Error (instance: ${INSTANCE_ID}):`, err.message);
});

redis.on("ready", () => {
  console.log(`[Redis] Ready to accept commands (instance: ${INSTANCE_ID})`);
});

// Parse JSON bodies
app.use(express.json());

// Add version header to all responses
app.use((req, res, next) => {
  res.setHeader("X-App-Version", APP_VERSION);
  next();
});

// Serve static files from the repo root
app.use(express.static(__dirname));

// Route for serving index.html at root "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check endpoint
app.get("/health", async (req, res) => {
  const redisStatus = redis && redis.status ? (redis.status === "ready" ? "connected" : redis.status) : "unknown";
  res.json({ 
    status: "ok", 
    instanceId: INSTANCE_ID,
    redis: redisStatus,
    version: APP_VERSION
  });
});

// Simple ping endpoint for testing client->server
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong", timestamp: Date.now() });
});

// Generate party codes (6 chars, uppercase letters/numbers)
const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

// Party TTL configuration
const PARTY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (as per requirement)
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

// Redis party storage helpers
async function getPartyFromRedis(code) {
  try {
    const data = await redis.get(`${PARTY_KEY_PREFIX}${code}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.error(`[Redis] Error getting party ${code}:`, err.message);
    return null;
  }
}

async function setPartyInRedis(code, partyData) {
  try {
    const data = JSON.stringify(partyData);
    await redis.setex(`${PARTY_KEY_PREFIX}${code}`, PARTY_TTL_SECONDS, data);
    return true;
  } catch (err) {
    console.error(`[Redis] Error setting party ${code}:`, err.message);
    return false;
  }
}

async function deletePartyFromRedis(code) {
  try {
    await redis.del(`${PARTY_KEY_PREFIX}${code}`);
    return true;
  } catch (err) {
    console.error(`[Redis] Error deleting party ${code}:`, err.message);
    return false;
  }
}

// POST /api/create-party - Create a new party
app.post("/api/create-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/create-party at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  try {
    // Generate unique party code
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      const existing = await getPartyFromRedis(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);
    
    if (attempts >= 10) {
      console.error(`[HTTP] Failed to generate unique party code after 10 attempts, instanceId: ${INSTANCE_ID}`);
      return res.status(500).json({ error: "Failed to generate unique party code" });
    }
    
    const hostId = nextHostId++;
    const createdAt = Date.now();
    
    // Create party data for Redis (only serializable data)
    const partyData = {
      chatMode: "OPEN",
      createdAt,
      hostId,
      hostConnected: false,
      guestCount: 0
    };
    
    // Write to Redis first - only return success if write succeeds
    const storeWriteOk = await setPartyInRedis(code, partyData);
    
    if (!storeWriteOk) {
      console.error(`[HTTP] Failed to write party to Redis: ${code}, hostId: ${hostId}, instanceId: ${INSTANCE_ID}, timestamp: ${timestamp}`);
      return res.status(500).json({ error: "Failed to create party in shared store" });
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
    console.log(`[HTTP] Party created: ${code}, hostId: ${hostId}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, createdAt: ${createdAt}, storeWriteOk: ${storeWriteOk}, totalParties: ${totalParties}`);
    
    res.json({
      partyCode: code,
      hostId: hostId
    });
  } catch (error) {
    console.error(`[HTTP] Error creating party, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ error: "Failed to create party" });
  }
});

// POST /api/join-party - Join an existing party
app.post("/api/join-party", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP] POST /api/join-party at ${timestamp}, instanceId: ${INSTANCE_ID}`, req.body);
  
  try {
    const { partyCode } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: "Party code is required" });
    }
    
    const code = partyCode.toUpperCase().trim();
    
    // Read from Redis - this is the source of truth
    const partyData = await getPartyFromRedis(code);
    const storeReadResult = partyData ? "found" : "not_found";
    
    if (!partyData) {
      const totalParties = parties.size;
      console.log(`[HTTP] Party not found in Redis: ${code}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, storeReadResult: ${storeReadResult}, localParties: ${totalParties}`);
      return res.status(404).json({ error: "Party not found" });
    }
    
    // Also check local memory for WebSocket-created parties
    const localParty = parties.get(code);
    
    const partyAge = Date.now() - partyData.createdAt;
    const guestCount = partyData.guestCount || 0;
    const totalParties = parties.size;
    console.log(`[HTTP] Party joined: ${code}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, storeReadResult: ${storeReadResult}, partyAge: ${partyAge}ms, guestCount: ${guestCount}, totalParties: ${totalParties}`);
    
    res.json({ ok: true });
  } catch (error) {
    console.error(`[HTTP] Error joining party, instanceId: ${INSTANCE_ID}:`, error);
    res.status(500).json({ error: "Failed to join party" });
  }
});

// GET /api/party/:code - Debug endpoint to check if a party exists
app.get("/api/party/:code", async (req, res) => {
  const timestamp = new Date().toISOString();
  const code = req.params.code.toUpperCase().trim();
  
  console.log(`[HTTP] GET /api/party/${code} at ${timestamp}, instanceId: ${INSTANCE_ID}`);
  
  // Read from Redis - source of truth
  const partyData = await getPartyFromRedis(code);
  
  if (!partyData) {
    const totalParties = parties.size;
    console.log(`[HTTP] Debug query - Party not found in Redis: ${code}, instanceId: ${INSTANCE_ID}, localParties: ${totalParties}`);
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
  
  console.log(`[HTTP] Debug query - Party found in Redis: ${code}, instanceId: ${INSTANCE_ID}, hostConnected: ${hostConnected}, guestCount: ${guestCount}`);
  
  res.json({
    exists: true,
    code: code,
    createdAt: new Date(partyData.createdAt).toISOString(),
    hostConnected: hostConnected,
    guestCount: guestCount,
    instanceId: INSTANCE_ID
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

function startServer() {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Instance ID: ${INSTANCE_ID}`);
    console.log(`Redis: ${redis.status}`);
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

function handleCreate(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  // Remove from current party if already in one
  if (client.party) {
    handleDisconnect(ws);
  }
  
  // Generate unique party code (async now, but we handle it synchronously for simplicity)
  let code;
  do {
    code = generateCode();
  } while (parties.has(code));
  
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
  
  // Store in local memory for WebSocket connections
  parties.set(code, {
    host: ws,
    members: [member],
    chatMode: "OPEN", // Default chat mode
    createdAt,
    hostId
  });
  
  client.party = code;
  
  // Also write to Redis for cross-instance discovery
  const partyData = {
    chatMode: "OPEN",
    createdAt,
    hostId,
    hostConnected: true,
    guestCount: 0
  };
  
  setPartyInRedis(code, partyData).then(storeWriteOk => {
    const totalParties = parties.size;
    console.log(`[WS] Party created: ${code}, clientId: ${client.id}, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, createdAt: ${createdAt}, storeWriteOk: ${storeWriteOk}, totalParties: ${totalParties}`);
  }).catch(err => {
    console.error(`[WS] Error writing party to Redis: ${code}, instanceId: ${INSTANCE_ID}:`, err.message);
  });
  
  ws.send(JSON.stringify({ t: "CREATED", code }));
  broadcastRoomState(code);
}

async function handleJoin(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  const code = msg.code?.toUpperCase();
  
  // First check Redis for party existence
  const partyData = await getPartyFromRedis(code);
  const storeReadResult = partyData ? "found" : "not_found";
  
  // Then check local memory
  let party = parties.get(code);
  
  // If party exists in Redis but not locally, create local entry
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
    console.log(`[WS] Join failed - party ${code} not found, timestamp: ${timestamp}, instanceId: ${INSTANCE_ID}, storeReadResult: ${storeReadResult}, localParties: ${totalParties}`);
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
  
  // Update Redis with new guest count
  if (partyData) {
    partyData.guestCount = guestCount;
    setPartyInRedis(code, partyData).catch(err => {
      console.error(`[WS] Error updating guest count in Redis for ${code}:`, err.message);
    });
  }
  
  console.log(`[WS] Client ${client.id} joined party ${code}, instanceId: ${INSTANCE_ID}, storeReadResult: ${storeReadResult}, guestCount: ${guestCount}, totalParties: ${totalParties}`);
  
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
  INSTANCE_ID
};
