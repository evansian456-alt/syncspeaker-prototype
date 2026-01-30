# SyncSpeaker

**Turn your phones into one massive speaker**

Browser prototype for SyncSpeaker — Connect multiple phones together and play music in perfect sync. Create an epic sound experience for parties, gatherings, or just hanging out with friends!

## 🎵 What is SyncSpeaker?

SyncSpeaker lets you connect multiple phones together to play music in perfect synchronization. Take control with DJ mode, queue your tracks, and get real-time reactions from your guests. Everything you need to be the ultimate party host.

## ✨ Key Features

- **🎧 DJ Mode**: Full-screen DJ interface with visualizers and controls. Professional visual effects and real-time feedback.
- **⏭️ Up Next Queue**: Queue your next track and see what's coming up. Seamless transitions keep the party flowing.
- **💬 Guest Reactions**: Friends can send reactions directly to the DJ's screen with real-time crowd feedback.
- **📱 Browser-Ready**: Test instantly in your browser or run with full multi-device sync. No app store required.
- **🎶 Multi-Device Sync**: Music plays in perfect sync across all connected devices.
- **👥 Party Management**: Host controls, guest management, and party codes for easy joining.

## 💎 Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Free Plan** | Free | • Up to 2 phones<br>• Basic features<br>• Includes ads |
| **Party Pass** 🎉 | £2.99 | • 2-hour session (single-use)<br>• Up to 10 phones<br>• No ads during playback<br>• Pro DJ mode with visualizers<br>• Guest reactions & messaging<br>• Up Next queue system<br>• Priority sync stability<br>• Party-wide unlock |
| **Pro Monthly** | £9.99/month | • Up to 10 phones<br>• No ads<br>• Quality override warnings<br>• Speaker support<br>• Cancel anytime |

**Note**: Party Pass is a single-use purchase that unlocks Pro features for all guests in one party for 2 hours.

## 📶 Important Information

- **Connection**: Hotspot or Wi-Fi recommended for best connection quality
- **Music Source**: You provide the music — this app syncs playback. Music files come from your device (local files, Spotify, YouTube, etc.)
- **Browser Compatibility**: Works in modern browsers with Web Audio API support

## 🔧 PR Conflict Resolution

**If you're here to resolve PR conflicts**, see **[QUICK_START.md](QUICK_START.md)** for simple instructions.

PR #28 and PR #26 had merge conflicts that have been resolved. The resolved files and instructions are in this repository.

---

## Getting Started

### Quick Start (Browser-Only Mode)

For **single-device testing** without installing dependencies:

1. Open `index.html` directly in your browser, or
2. Use Python's built-in HTTP server:
   ```bash
   python3 -m http.server 8080
   # Then open http://localhost:8080
   ```

**Browser-Only Features:**
- ✅ Landing page and UI testing
- ✅ Create party (local/offline mode)
- ✅ Music file selection and playback
- ✅ Party Pass activation (simulated)
- ✅ Single-device party experience

**Limitations in Browser-Only Mode:**
- ❌ Multi-device sync (requires server)
- ❌ Join party from other devices
- ❌ WebSocket real-time updates

### Full Installation (Multi-Device Mode)

For **multi-device testing** with real-time sync:

```bash
npm install
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:8080`

**Full Server Features:**
- ✅ All browser-only features
- ✅ Multi-device party sync
- ✅ Join party from other devices
- ✅ WebSocket real-time updates
- ✅ Party state management

## Testing

This project includes a comprehensive test suite for server-side functions and utilities.

### Running Tests

Run all tests:
```bash
npm test
```

Run tests in watch mode (auto-rerun on file changes):
```bash
npm run test:watch
```

Run tests with coverage report:
```bash
npm run test:coverage
```

### Test Coverage

Current test coverage:
- **56 tests** covering:
  - HTTP endpoints (health check, ping, create party, join party)
  - Static file serving
  - Server-side utilities (party code generation)
  - Client-side utilities (HTML escaping, file size formatting, hashing)

Tests are located in:
- `server.test.js` - HTTP endpoint tests (26 tests)
- `utils.test.js` - Utility function tests (30 tests)

## API Endpoints

### GET /health
Returns server health status
```json
{ "status": "ok" }
```

### GET /api/ping
Ping endpoint for testing connectivity
```json
{ "message": "pong", "timestamp": 1234567890 }
```

### POST /api/create-party
Creates a new party and returns a party code
```json
Response: { "partyCode": "ABC123", "hostId": 1 }
```

### POST /api/join-party
Join an existing party
```json
Request: { "partyCode": "ABC123" }
Response: { "ok": true }
```

## WebSocket API

The application also supports WebSocket connections for real-time party management.

WebSocket message types:
- `CREATE` - Create a new party
- `JOIN` - Join an existing party
- `KICK` - Kick a member (host only)
- `SET_PRO` - Set Pro status
- `ROOM` - Broadcast room state updates
- `ENDED` - Party ended notification

