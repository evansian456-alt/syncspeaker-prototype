const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const { customAlphabet } = require("nanoid");

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON bodies
app.use(express.json());

// Serve static files from the repo root
app.use(express.static(__dirname));

// Route for serving index.html at root "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Simple ping endpoint for testing client->server
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong", timestamp: Date.now() });
});

// Generate party codes (6 chars, uppercase letters/numbers)
const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

// Party TTL configuration
const PARTY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory party storage for HTTP API
const httpParties = new Map(); // code -> { hostId, createdAt, members: [] }
let nextHostId = 1;

// POST /api/create-party - Create a new party
app.post("/api/create-party", (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] POST /api/create-party at ${timestamp}`);
  
  try {
    // Generate unique party code
    let code;
    do {
      code = generateCode();
    } while (httpParties.has(code));
    
    const hostId = nextHostId++;
    const createdAt = Date.now();
    
    httpParties.set(code, {
      hostId,
      createdAt,
      members: []
    });
    
    console.log(`[API] Party created: ${code}, hostId: ${hostId}, timestamp: ${timestamp}, createdAt: ${createdAt}`);
    
    res.json({
      partyCode: code,
      hostId: hostId
    });
  } catch (error) {
    console.error("[API] Error creating party:", error);
    res.status(500).json({ error: "Failed to create party" });
  }
});

// POST /api/join-party - Join an existing party
app.post("/api/join-party", (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] POST /api/join-party at ${timestamp}`, req.body);
  
  try {
    const { partyCode } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: "Party code is required" });
    }
    
    const code = partyCode.toUpperCase().trim();
    
    // Check httpParties first
    let party = httpParties.get(code);
    
    // If not found in httpParties, check WebSocket parties and sync
    if (!party) {
      const wsParty = parties.get(code);
      if (wsParty) {
        // Sync WebSocket party to HTTP storage
        party = {
          hostId: wsParty.members.find(m => m.isHost)?.id || 0,
          createdAt: Date.now(), // Approximate creation time
          members: []
        };
        httpParties.set(code, party);
        console.log(`[API] Synced WebSocket party ${code} to HTTP storage`);
      }
    }
    
    if (!party) {
      console.log(`[API] Party not found: ${code}, timestamp: ${timestamp}, available parties: ${Array.from(httpParties.keys()).join(', ') || 'none'}`);
      return res.status(404).json({ error: "Party not found" });
    }
    
    console.log(`[API] Party joined: ${code}, timestamp: ${timestamp}, party age: ${Date.now() - party.createdAt}ms`);
    
    res.json({ ok: true });
  } catch (error) {
    console.error("[API] Error joining party:", error);
    res.status(500).json({ error: "Failed to join party" });
  }
});

// Cleanup expired parties
function cleanupExpiredParties() {
  const now = Date.now();
  const expiredCodes = [];
  
  // Clean up HTTP parties
  for (const [code, party] of httpParties.entries()) {
    if (now - party.createdAt > PARTY_TTL_MS) {
      expiredCodes.push(code);
    }
  }
  
  if (expiredCodes.length > 0) {
    console.log(`[Cleanup] Removing ${expiredCodes.length} expired parties: ${expiredCodes.join(', ')}`);
    expiredCodes.forEach(code => {
      httpParties.delete(code);
      // Also remove from WebSocket parties if present
      parties.delete(code);
    });
  }
}

// Start cleanup interval
let cleanupInterval;

// Party state management
const parties = new Map(); // code -> { host, members: [{ ws, id, name, isPro, isHost }], chatMode: "OPEN", createdAt }
const clients = new Map(); // ws -> { id, party }
let nextClientId = 1;

// Start the HTTP server only if not imported as a module
let server;
let wss;

function startServer() {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
  
  // Start cleanup interval
  cleanupInterval = setInterval(cleanupExpiredParties, CLEANUP_INTERVAL_MS);
  console.log(`[Server] Party cleanup job started (runs every ${CLEANUP_INTERVAL_MS / 1000}s, TTL: ${PARTY_TTL_MS / 1000}s)`);
  
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
  
  // Generate unique party code (check for collisions in both storage systems)
  let code;
  do {
    code = generateCode();
  } while (parties.has(code) || httpParties.has(code));
  
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
  
  parties.set(code, {
    host: ws,
    members: [member],
    chatMode: "OPEN", // Default chat mode
    createdAt
  });
  
  // Sync to HTTP party storage for cross-protocol access
  httpParties.set(code, {
    hostId: client.id,
    createdAt,
    members: []
  });
  
  client.party = code;
  
  console.log(`[Party] Created party ${code} by client ${client.id}, timestamp: ${timestamp}, createdAt: ${createdAt}`);
  
  ws.send(JSON.stringify({ t: "CREATED", code }));
  broadcastRoomState(code);
}

function handleJoin(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  const code = msg.code?.toUpperCase();
  let party = parties.get(code);
  
  // If not found in WebSocket parties, check HTTP parties and sync
  if (!party) {
    const httpParty = httpParties.get(code);
    if (httpParty) {
      console.log(`[Party] HTTP party ${code} exists but not in WebSocket storage - party may have been created via HTTP API`);
      // Party exists in HTTP but not WebSocket - this can happen if created via HTTP API
      // Guest should wait for host to connect via WebSocket first
    }
    
    const timestamp = new Date().toISOString();
    console.log(`[Party] Join failed - party ${code} not found in WebSocket storage, timestamp: ${timestamp}`);
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
  
  console.log(`[Party] Client ${client.id} joined party ${code}`);
  
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
    console.log(`[Party] Host left, ending party ${client.party}`);
    party.members.forEach(m => {
      if (m.ws !== ws && m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(JSON.stringify({ t: "ENDED" }));
      }
      const c = clients.get(m.ws);
      if (c) c.party = null;
    });
    parties.delete(client.party);
  } else {
    // Regular member left
    party.members = party.members.filter(m => m.ws !== ws);
    console.log(`[Party] Client ${client.id} left party ${client.party}`);
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
  httpParties,
  startServer
};
