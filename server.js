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

// In-memory party storage for HTTP API
const httpParties = new Map(); // code -> { hostId, createdAt, members: [] }
let nextHostId = 1;

// POST /api/create-party - Create a new party
app.post("/api/create-party", (req, res) => {
  console.log("[API] POST /api/create-party");
  
  try {
    // Generate unique party code
    let code;
    do {
      code = generateCode();
    } while (httpParties.has(code));
    
    const hostId = nextHostId++;
    
    httpParties.set(code, {
      hostId,
      createdAt: Date.now(),
      members: []
    });
    
    console.log(`[API] Party created: ${code}, hostId: ${hostId}`);
    
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
  console.log("[API] POST /api/join-party", req.body);
  
  try {
    const { partyCode } = req.body;
    
    if (!partyCode) {
      return res.status(400).json({ error: "Party code is required" });
    }
    
    const code = partyCode.toUpperCase().trim();
    const party = httpParties.get(code);
    
    if (!party) {
      return res.status(404).json({ error: "Party not found" });
    }
    
    console.log(`[API] Party joined: ${code}`);
    
    res.json({ ok: true });
  } catch (error) {
    console.error("[API] Error joining party:", error);
    res.status(500).json({ error: "Failed to join party" });
  }
});

// Party state management
const parties = new Map(); // code -> { host, members: [{ ws, id, name, isPro, isHost }] }
const clients = new Map(); // ws -> { id, party }
let nextClientId = 1;

// Start the HTTP server only if not imported as a module
let server;
let wss;

function startServer() {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
  
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
  
  // Generate unique party code (check for collisions)
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
  
  parties.set(code, {
    host: ws,
    members: [member]
  });
  
  client.party = code;
  
  console.log(`[Party] Created party ${code} by client ${client.id}`);
  
  ws.send(JSON.stringify({ t: "CREATED", code }));
  broadcastRoomState(code);
}

function handleJoin(ws, msg) {
  const client = clients.get(ws);
  if (!client) return;
  
  const code = msg.code?.toUpperCase();
  const party = parties.get(code);
  
  if (!party) {
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
    }))
  };
  
  const message = JSON.stringify({ t: "ROOM", snapshot });
  
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
