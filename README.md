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
| **Pro Monthly** | £9.99/month | • Up to 10 phones<br>• No ads<br>• Pro DJ mode with visualizers<br>• Guest reactions & messaging<br>• Up Next queue system<br>• Priority sync stability<br>• Quality override warnings<br>• Speaker support<br>• Cancel anytime |

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

#### Prerequisites
- Node.js (v14 or higher)
- Redis server (required for multi-instance party discovery)
- PostgreSQL 12+ (required for user accounts, subscriptions, and purchases)

#### Database Setup
See [db/README.md](db/README.md) for database schema setup instructions.

Quick start:
```bash
# Create database
createdb syncspeaker

# Apply schema
psql -d syncspeaker -f db/schema.sql
```

#### Redis Setup
See [REDIS_SETUP.md](REDIS_SETUP.md) for detailed installation and configuration instructions.

Quick start:
```bash
# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server

# macOS
brew install redis
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

#### Server Setup
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
- ✅ Cross-instance party discovery (via Redis)

#### Configuration
Copy `.env.example` to `.env` and customize if needed:
```bash
cp .env.example .env
```

Default configuration connects to Redis at `localhost:6379` and PostgreSQL at `localhost:5432`. See [REDIS_SETUP.md](REDIS_SETUP.md) and [db/README.md](db/README.md) for production configuration.

## Production Deployment (Railway)

SyncSpeaker requires Redis for multi-device party discovery and synchronization. Follow these steps to deploy on Railway:

### 1. Add Redis Plugin

1. Go to your Railway project dashboard
2. Click **"+ New"** → **"Database"** → **"Add Redis"**
3. Railway will automatically provision a Redis instance and set the `REDIS_URL` environment variable

### 2. Verify REDIS_URL

1. Go to your app service in Railway
2. Click on **"Variables"** tab
3. Confirm that `REDIS_URL` is set (it should be automatically linked from the Redis plugin)
4. The URL format should be: `redis://default:[password]@[host]:[port]`

### 3. Deploy Your App

Railway will automatically deploy your app with Redis connected. 

### 4. Health Check

After deployment, verify Redis connection:
```bash
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "instanceId": "server-abc123",
  "redis": "connected",
  "version": "0.1.0-party-fix"
}
```

**Important**: If `redis` shows `"missing"` or `"error"`, party creation will fail. Check your Railway Redis plugin configuration.

### Common Issues

- **Redis shows "missing"**: The `REDIS_URL` environment variable is not set. Add the Redis plugin in Railway.
- **Redis shows "error"**: Redis connection failed. Check Redis plugin status and network connectivity.
- **Party creation returns 503**: Redis is not ready. Wait a few seconds for Redis to connect, or check logs.

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
- **111 tests** covering:
  - HTTP endpoints (health check, ping, create party, join party, leave party, end party, party state)
  - Static file serving
  - Server-side utilities (party code generation)
  - Client-side utilities (HTML escaping, file size formatting, hashing)
  - Party management (guest join/leave, party end, expiry handling)
  - Multi-instance Redis sync

Tests are located in:
- `server.test.js` - HTTP endpoint tests (85 tests)
- `utils.test.js` - Utility function tests (26 tests)

## Manual Testing Checklist

Use this checklist to verify all features are working correctly before deployment or release.

### Browser-Only Mode Testing
- [ ] **Landing Page**
  - [ ] Page loads without errors
  - [ ] All buttons and UI elements are visible
  - [ ] Party Pass pricing information displays correctly
  
- [ ] **Create Party (Browser-Only)**
  - [ ] Click "Start Party" button
  - [ ] Party code is generated and displayed
  - [ ] Party interface loads correctly
  - [ ] Music file selection dialog opens
  
- [ ] **Music Playback (Single Device)**
  - [ ] Select a music file from local device
  - [ ] Music plays correctly
  - [ ] Playback controls (play/pause/skip) work
  - [ ] Volume controls function properly
  
- [ ] **Party Pass Activation (Simulated)**
  - [ ] Party Pass modal can be opened
  - [ ] Simulated activation completes successfully
  - [ ] Pro features are unlocked (if implemented)

### Multi-Device Sync Testing

#### Prerequisites
- [ ] Node.js server is running (`npm start`)
- [ ] Redis server is connected (verify with `/health` endpoint)
- [ ] At least 2 devices are available for testing

#### Party Creation and Join Flow
- [ ] **Host Device - Create Party**
  - [ ] Navigate to app URL
  - [ ] Click "Start Party"
  - [ ] Party code is displayed (6 characters)
  - [ ] "Waiting for guests..." message appears
  - [ ] Party code can be copied/shared
  
- [ ] **Guest Device - Join Party**
  - [ ] Navigate to app URL
  - [ ] Click "Join Party"
  - [ ] Enter party code
  - [ ] Optional: Enter nickname
  - [ ] Click "Join party" button
  - [ ] Transition to "Joined Party" screen (NOT stuck on "Joining...")
  - [ ] Party code is displayed
  - [ ] Guest count is shown
  - [ ] Time remaining countdown is visible
  
- [ ] **Host Device - Guest Joined**
  - [ ] Guest count updates from "Waiting for guests..." to "1 guest joined"
  - [ ] Update occurs within 1-3 seconds
  - [ ] Guest nickname appears in guest list (if provided)

#### Multi-Guest Testing
- [ ] **Add Second Guest**
  - [ ] Third device joins the same party
  - [ ] Both existing devices show updated guest count
  - [ ] All devices show correct time remaining
  
- [ ] **Polling Updates**
  - [ ] Guest count updates on all devices every 2 seconds
  - [ ] Time remaining counts down synchronously
  - [ ] No polling errors in browser console

#### Music Sync Testing
- [ ] **Host Plays Music**
  - [ ] Host selects and plays a music file
  - [ ] All guest devices receive playback notification
  - [ ] Music plays in sync across all devices
  - [ ] Playback position stays synchronized
  
- [ ] **Playback Controls**
  - [ ] Host pauses - all devices pause
  - [ ] Host resumes - all devices resume
  - [ ] Host skips track - all devices skip
  - [ ] Volume changes sync across devices

#### DJ Mode Testing
- [ ] **DJ Mode Activation**
  - [ ] Host activates DJ mode
  - [ ] Full-screen DJ interface appears
  - [ ] Visualizers are displayed and respond to music
  - [ ] DJ controls are accessible
  
- [ ] **Up Next Queue**
  - [ ] Queue interface is visible
  - [ ] Tracks can be added to queue
  - [ ] Queue updates across all devices
  - [ ] Track transitions happen smoothly

#### Guest Reactions Testing
- [ ] **Send Reaction**
  - [ ] Guest device can access reactions
  - [ ] Guest sends a reaction (emoji/message)
  - [ ] Host receives reaction in real-time
  - [ ] Reaction appears on DJ screen
  
- [ ] **Multiple Reactions**
  - [ ] Multiple guests can send reactions simultaneously
  - [ ] All reactions appear on host screen
  - [ ] Reactions don't cause performance issues

#### Leave and End Party Flow
- [ ] **Guest Leaves Party**
  - [ ] Guest clicks "Leave Party" button
  - [ ] Guest returns to landing page
  - [ ] Host sees guest count decrement within 1-3 seconds
  - [ ] Remaining guests see updated count
  
- [ ] **Host Ends Party**
  - [ ] Host clicks "End Party" or "Leave" button
  - [ ] All guests see "Party has ended" message
  - [ ] All guests return to landing page
  - [ ] Party cannot be rejoined after ending

#### Error Handling
- [ ] **Invalid Party Code**
  - [ ] Enter non-existent party code
  - [ ] Appropriate error message is displayed
  - [ ] User can retry with different code
  
- [ ] **Expired Party**
  - [ ] Join party that expired (after party TTL duration)
  - [ ] "Party not found or expired" error appears
  - [ ] User is redirected appropriately
  
- [ ] **Network Interruption**
  - [ ] Disable network mid-session
  - [ ] App shows connection lost indicator
  - [ ] Re-enable network
  - [ ] App reconnects and resumes

### Railway Deployment Testing

- [ ] **Health Check**
  - [ ] Navigate to `https://your-app.railway.app/health`
  - [ ] Response shows `"status": "ok"`
  - [ ] Response shows `"redis": "connected"`
  - [ ] Instance ID is present
  
- [ ] **Redis Connection**
  - [ ] REDIS_URL environment variable is set
  - [ ] Redis plugin is running in Railway dashboard
  - [ ] No Redis connection errors in logs
  
- [ ] **Create Party (Production)**
  - [ ] Create party on deployed app
  - [ ] Party code is generated
  - [ ] No 503 errors
  - [ ] Check Railway logs for successful creation
  
- [ ] **Join Party (Production)**
  - [ ] Guest joins party on deployed app
  - [ ] Join succeeds immediately
  - [ ] Check Railway logs for:
    - `POST /api/create-party` success
    - `POST /api/join-party` success
    - Correct party code in logs
  
- [ ] **Multi-Instance Testing** (if applicable)
  - [ ] Multiple Railway instances are running
  - [ ] Party created on instance A
  - [ ] Guest joins on instance B
  - [ ] Party state syncs via Redis
  - [ ] All features work across instances

### Performance Testing

- [ ] **Load Testing**
  - [ ] Test with maximum guests (per plan limit)
  - [ ] All guests receive updates
  - [ ] No significant lag or delays
  - [ ] Server remains responsive
  
- [ ] **Long Session Testing**
  - [ ] Party runs for extended period (30+ minutes)
  - [ ] No memory leaks
  - [ ] Polling continues reliably
  - [ ] Time remaining countdown is accurate

### Browser Compatibility

- [ ] **Desktop Browsers**
  - [ ] Chrome/Edge (latest)
  - [ ] Firefox (latest)
  - [ ] Safari (latest)
  
- [ ] **Mobile Browsers**
  - [ ] iOS Safari
  - [ ] Android Chrome
  - [ ] Responsive design works on all screen sizes

### Security Testing

- [ ] **Input Validation**
  - [ ] Party codes are validated (6 characters)
  - [ ] Nicknames are sanitized (HTML escaping)
  - [ ] Invalid inputs are rejected
  
- [ ] **Authorization**
  - [ ] Only host can end party
  - [ ] Only host can access DJ controls
  - [ ] Guests cannot perform host-only actions

## API Endpoints

### GET /health
Returns server health status and Redis connection state
```json
{
  "status": "ok",
  "instanceId": "server-abc123",
  "redis": "connected",
  "version": "0.1.0-party-fix"
}
```

Redis status values:
- `"connected"` - Redis is connected and ready
- `"missing"` - Redis configuration not found (REDIS_URL not set)
- `"error"` - Redis connection error (includes `redisError` field with details)

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
Request: { 
  "partyCode": "ABC123",
  "nickname": "Guest1" // optional
}
Response: { 
  "ok": true,
  "guestId": "guest-1",
  "nickname": "Guest1",
  "partyCode": "ABC123"
}
```

Error responses:
- `400` - Party code required or invalid length
- `404` - Party not found or expired
- `410` - Party has ended or expired
- `503` - Server not ready (Redis unavailable)

### GET /api/party
Get current party state with guests
```json
Request: GET /api/party?code=ABC123

Response: {
  "exists": true,
  "partyCode": "ABC123",
  "status": "active",
  "expiresAt": 1234567890000,
  "timeRemainingMs": 7200000,
  "guestCount": 2,
  "guests": [
    {
      "guestId": "guest-1",
      "nickname": "Guest1",
      "joinedAt": 1234567890000
    }
  ],
  "chatMode": "OPEN",
  "createdAt": 1234567890000
}
```

Query parameters:
- `code` - Party code (required)
- `t` - Cache buster timestamp (optional, recommended)

Status values:
- `"active"` - Party is active and accepting guests
- `"ended"` - Party was ended by host
- `"expired"` - Party TTL expired (2 hours)

### POST /api/leave-party
Remove guest from party
```json
Request: {
  "partyCode": "ABC123",
  "guestId": "guest-1"
}
Response: {
  "ok": true,
  "guestCount": 1
}
```

### POST /api/end-party
End party (host only)
```json
Request: { "partyCode": "ABC123" }
Response: { "ok": true }
```

After ending, the party status is set to "ended" and remains accessible for 5 minutes before being deleted.

## How to Test with Two Phones

This guide will help you verify that multi-device sync works correctly.

### Prerequisites
1. Both phones must be on the same network as the server, OR
2. Server must be deployed to Railway with a public URL

### Testing Steps

#### Option 1: Local Network (Development)
1. **Start the server** on your computer:
   ```bash
   npm start
   ```
   Note the local IP address (e.g., `http://192.168.1.100:8080`)

2. **Phone 1 (Host)**:
   - Open browser and navigate to `http://[your-ip]:8080`
   - Click "Start Party"
   - Note the 6-character party code displayed
   - You should see "Waiting for guests..."

3. **Phone 2 (Guest)**:
   - Open browser and navigate to `http://[your-ip]:8080`
   - Click "Join Party"
   - Enter the party code from Phone 1
   - Click "Join party"

4. **Verification**:
   - **Phone 2** should show "Joined Party" screen with party code and guest count
   - **Phone 1** should update within 1-3 seconds showing "1 guest joined"
   - Both phones should show time remaining countdown

#### Option 2: Railway Deployment (Production)
1. **Deploy to Railway** (see Production Deployment section above)
2. **Phone 1 (Host)**:
   - Open `https://your-app.railway.app`
   - Click "Start Party"
   - Note the party code

3. **Phone 2 (Guest)**:
   - Open `https://your-app.railway.app`
   - Click "Join Party"
   - Enter the party code
   - Click "Join party"

4. **Verification**:
   - Same as Option 1 above

### What Success Looks Like

✅ **Guest Join Flow**:
- Guest enters code → clicks Join → sees "Joined Party" screen (not stuck on "Joining...")
- Guest screen shows: party code, guest count, time remaining
- Host sees guest count update from "Waiting for guests..." to "1 guest joined" within 1-3 seconds

✅ **Polling Updates**:
- When a second guest joins, both phones update guest count
- Time remaining counts down on both phones
- Updates happen every 2 seconds

✅ **Leave/End Flow**:
- Guest clicks "Leave Party" → returns to landing page
- Host sees guest count decrement within 1-3 seconds
- Host clicks "Leave" → party ends for everyone
- All guests see "Party has ended" and return to landing page

### Viewing Railway Logs

To confirm joins are working on Railway:
1. Go to Railway dashboard → your app service
2. Click "Deployments" tab → Latest deployment → "View Logs"
3. Look for log entries like:
   ```
   [HTTP] POST /api/create-party at [timestamp]
   [HTTP] Party created: ABC123, hostId: 1
   [HTTP] POST /api/join-party at [timestamp]
   [HTTP] Party joined: ABC123, guestId: guest-1, guestCount: 1
   ```

### Troubleshooting

**Guest stuck on "Joining..."**:
- ✅ Fixed! Guest now transitions immediately to "Joined Party" screen
- Check browser console for errors

**Host doesn't see guest join**:
- Check if polling is working (should see GET /api/party requests in Network tab)
- Verify Redis is connected (check /health endpoint)
- Check Railway logs for join-party success

**"Party not found" error**:
- Party may have expired (2 hour TTL)
- Host may have ended the party
- Check party code is correct (case-insensitive, 6 characters)

## WebSocket API

The application also supports WebSocket connections for real-time party management.

WebSocket message types:
- `CREATE` - Create a new party
- `JOIN` - Join an existing party
- `KICK` - Kick a member (host only)
- `SET_PRO` - Set Pro status
- `ROOM` - Broadcast room state updates
- `ENDED` - Party ended notification

