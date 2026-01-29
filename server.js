import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = parseInt(process.env.PORT, 10) || 3000;

// In-memory room state (prototype)
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(code, obj) {
  for (const client of wss.clients) {
    if (client.readyState !== client.OPEN) continue;
    if (client._roomCode === code) safeSend(client, obj);
  }
}

function roomSnapshot(code) {
  const room = rooms.get(code);
  if (!room) return null;
  const members = [];
  for (const [id, m] of room.members.entries()) {
    members.push({ id, name: m.name, isPro: !!m.isPro, joinedAt: m.joinedAt, isHost: id === room.hostId });
  }
  members.sort((a, b) => (b.isHost - a.isHost) || (a.joinedAt - b.joinedAt));
  return { code, createdAt: room.createdAt, hostId: room.hostId, members };
}

wss.on("connection", (ws) => {
  ws._clientId = nanoid(10);
  ws._roomCode = null;

  safeSend(ws, { t: "WELCOME", clientId: ws._clientId });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch {
      console.error("Invalid message received:", raw);
      return;
    }
    const t = msg?.t;

    if (t === "CREATE") {
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      rooms.set(code, { hostId: ws._clientId, members: new Map(), createdAt: Date.now() });
      const room = rooms.get(code);
      room.members.set(ws._clientId, { name: msg.name || "Host", isPro: !!msg.isPro, joinedAt: Date.now() });
      ws._roomCode = code;
      safeSend(ws, { t: "CREATED", code });
      broadcast(code, { t: "ROOM", snapshot: roomSnapshot(code) });
      return;
    }

    if (t === "JOIN") {
      const code = (msg.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        safeSend(ws, { t: "ERROR", message: "Party code not found" });
        return;
      }
      room.members.set(ws._clientId, { name: msg.name || "Guest", isPro: !!msg.isPro, joinedAt: Date.now() });
      ws._roomCode = code;
      safeSend(ws, { t: "JOINED", code });
      broadcast(code, { t: "ROOM", snapshot: roomSnapshot(code) });
      return;
    }

    if (t === "SET_PRO") {
      const code = ws._roomCode;
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const m = room.members.get(ws._clientId);
      if (!m) return;
      m.isPro = !!msg.isPro;
      broadcast(code, { t: "ROOM", snapshot: roomSnapshot(code) });
      return;
    }

    if (t === "KICK") {
      const code = ws._roomCode;
      const room = rooms.get(code);
      if (!room) return;
      if (ws._clientId !== room.hostId) {
        safeSend(ws, { t: "ERROR", message: "Only host can remove people" });
        return;
      }
      const targetId = msg.targetId;
      if (!room.members.has(targetId)) return;
      room.members.delete(targetId);
      for (const client of wss.clients) {
        if (client.readyState !== client.OPEN) continue;
        if (client._clientId === targetId) {
          safeSend(client, { t: "KICKED" });
          client.close();
        }
      }
      broadcast(code, { t: "ROOM", snapshot: roomSnapshot(code) });
      return;
    }
  });

  ws.on("close", () => {
    const code = ws._roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.members.delete(ws._clientId);

    if (room.hostId === ws._clientId) {
      broadcast(code, { t: "ENDED" });
      rooms.delete(code);
      return;
    }
    broadcast(code, { t: "ROOM", snapshot: roomSnapshot(code) });
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });

// Serve static files safely
app.use("/static", express.static(path.resolve(__dirname, "../web")));
app.get("/", (_, res) => {
  res.sendFile(path.resolve(__dirname, "../web", "index.html"));
});

// Health check endpoint
app.get("/health", (_, res) => res.json({ ok: true }));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SyncSpeaker prototype running on http://0.0.0.0:${PORT}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("SIGTERM", () => {
  console.info("SIGTERM received. Closing server...");
  server.close(() => {
    console.info("Server closed.");
    process.exit(0);
  });
});
