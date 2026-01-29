const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const { customAlphabet } = require("nanoid");

const app = express();
const PORT = process.env.PORT || 8080;

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

// Start the HTTP server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// WebSocket server setup
const wss = new WebSocket.Server({ server });

// Party state management
const parties = new Map(); // code -> { host, members: [{ ws, id, name, isPro, isHost }] }
const clients = new Map(); // ws -> { id, party }
let nextClientId = 1;

// Generate party codes (6 chars, uppercase letters/numbers)
const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

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
  
  const code = generateCode();
  const member = {
    ws,
    id: client.id,
    name: msg.name || "Host",
    isPro: !!msg.isPro,
    isHost: true,
    source: msg.source || "local"
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
  
  const member = {
    ws,
    id: client.id,
    name: msg.name || "Guest",
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
  if (!party || party.host !== ws) return; // Only host can kick
  
  const targetMember = party.members.find(m => m.id === msg.targetId);
  if (!targetMember || targetMember.isHost) return; // Can't kick host
  
  targetMember.ws.send(JSON.stringify({ t: "KICKED" }));
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
      if (m.ws !== ws) {
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
