# Technical Implementation: Host-Driven Scheduled Sync

## Architecture Overview

The new sync system implements a **scheduled playback model** with **server-time anchoring** to eliminate drift and provide precise synchronization across multiple devices.

### Key Components

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│    Host     │         │   Server    │         │   Guest     │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  HOST_PLAY            │                       │
       ├──────────────────────>│                       │
       │                       │  PREPARE_PLAY         │
       │<──────────────────────┼──────────────────────>│
       │                       │  (t = now + 1200ms)   │
       │                       │                       │
       │                       │  ... 1200ms wait ...  │
       │                       │                       │
       │                       │  PLAY_AT              │
       │<──────────────────────┼──────────────────────>│
       │                       │  (t = scheduled time) │
       │                       │                       │
       │                       │                       │
       │  TIME_PING            │                       │
       ├──────────────────────>│                       │
       │  TIME_PONG            │                       │
       │<──────────────────────┤                       │
       │  (offset calc)        │                       │
```

## Protocol Specification

### TIME_PING / TIME_PONG

**Purpose**: Synchronize client and server clocks

**Client → Server (TIME_PING)**:
```javascript
{
  t: "TIME_PING",
  clientNowMs: <Date.now()>,
  pingId: <incrementing counter>
}
```

**Server → Client (TIME_PONG)**:
```javascript
{
  t: "TIME_PONG",
  clientNowMs: <echoed from request>,
  serverNowMs: <Date.now() on server>,
  pingId: <echoed from request>
}
```

**Client Processing**:
1. Calculate RTT: `nowMs - clientNowMs`
2. Filter if RTT > 800ms (unreliable)
3. Estimate server time: `serverNowMs + (RTT / 2)`
4. Compute offset: `estimatedServerTime - nowMs`
5. Apply EWMA smoothing: `offset = 0.8 × oldOffset + 0.2 × newOffset`

**Timing**:
- Sent on WebSocket connect
- Repeat every 30 seconds
- Additional sends on tab resume

### PREPARE_PLAY

**Purpose**: Pre-load audio and prepare for scheduled start

**Server → All Members**:
```javascript
{
  t: "PREPARE_PLAY",
  trackUrl: <string>,
  title: <string>,
  filename: <string>,
  startAtServerMs: <timestamp>,
  startPositionSec: <number>
}
```

**Client Actions**:
1. Create/reuse audio element
2. Set `audio.src = trackUrl`
3. Call `audio.load()` to pre-buffer
4. Store pending start info:
   - `startAtServerMs`
   - `startPositionSec`
   - `trackUrl`
   - `title`
5. Update UI to "preparing" state
6. Wait for PLAY_AT message

**Timing**: Sent 1200ms before playback

### PLAY_AT

**Purpose**: Trigger synchronized playback at scheduled time

**Server → All Members**:
```javascript
{
  t: "PLAY_AT",
  trackUrl: <string>,
  title: <string>,
  filename: <string>,
  startAtServerMs: <timestamp>,
  startPositionSec: <number>
}
```

**Client Actions**:
1. Compute expected position using server time:
   ```javascript
   const expectedSec = startPositionSec + (nowServerMs() - startAtServerMs) / 1000
   ```
2. Clamp to valid range: `[0, duration - 0.25]`
3. Set `audio.currentTime = expectedSec`
4. Call `audio.play()`
5. Handle autoplay rejection:
   - Store `pendingExpectedSec`
   - Show "Tap to start" overlay
   - Wait for user interaction
6. Start drift correction loop
7. Update UI to "playing" state

**Timing**: Sent at `startAtServerMs` (after 1200ms lead time)

## Server Implementation Details

### handleHostPlay() Flow

```javascript
function handleHostPlay(ws, msg) {
  // 1. Validate host permission
  if (party.host !== ws) return error;
  
  // 2. Compute scheduled start time
  const leadTimeMs = SCHEDULED_PLAY_LEAD_TIME_MS; // 1200ms
  const startAtServerMs = Date.now() + leadTimeMs;
  
  // 3. Update party state to "preparing"
  party.currentTrack = {
    trackUrl,
    title,
    startAtServerMs,
    startPositionSec,
    status: 'preparing'
  };
  
  // 4. Broadcast PREPARE_PLAY to all members
  broadcastToAll({ t: "PREPARE_PLAY", ... });
  
  // 5. Schedule PLAY_AT after lead time
  setTimeout(() => {
    party.currentTrack.status = 'playing';
    broadcastToAll({ t: "PLAY_AT", ... });
  }, leadTimeMs);
}
```

### handleTimePing() Flow

```javascript
function handleTimePing(ws, msg) {
  // Respond immediately with server timestamp
  const response = {
    t: "TIME_PONG",
    clientNowMs: msg.clientNowMs,  // Echo back
    serverNowMs: Date.now(),        // Server's clock
    pingId: msg.pingId              // Echo back
  };
  safeSend(ws, JSON.stringify(response));
}
```

## Client Implementation Details

### Server Time Calculation

```javascript
// Global offset in milliseconds
let serverOffsetMs = 0;

// Get current server time
function nowServerMs() {
  return Date.now() + serverOffsetMs;
}

// On TIME_PONG received
const rttMs = Date.now() - msg.clientNowMs;
if (rttMs <= TIME_PING_MAX_RTT_MS) {
  const estimatedServerNow = msg.serverNowMs + (rttMs / 2);
  const newOffset = estimatedServerNow - Date.now();
  
  // EWMA smoothing to reduce jitter
  serverOffsetMs = serverOffsetMs * 0.8 + newOffset * 0.2;
}
```

### Drift Correction Algorithm

**Runs every 2 seconds while playing**:

```javascript
function driftCorrectionLoop() {
  // 1. Calculate ideal position using server time
  const elapsedSec = (nowServerMs() - startAtServerMs) / 1000;
  const idealSec = startPositionSec + elapsedSec;
  
  // 2. Measure drift
  const currentSec = audio.currentTime;
  const drift = currentSec - idealSec;
  const absDrift = Math.abs(drift);
  
  // 3. Apply correction based on threshold
  if (absDrift < 0.20) {
    // Ignore - within acceptable range
    hideResyncButton();
  } else if (absDrift < 0.80) {
    // Soft correction - small seek
    audio.currentTime = idealSec;
  } else if (absDrift < 1.00) {
    // Moderate drift - aggressive seek
    audio.currentTime = idealSec;
  } else {
    // Hard resync - large drift
    audio.currentTime = idealSec;
    if (absDrift > 1.50) {
      showResyncButton();
    }
  }
}
```

### Late Join Recovery

```javascript
async function checkForMidTrackJoin(code) {
  // 1. Sync clock first
  sendTimePing();
  await sleep(100); // Allow TIME_PONG to arrive
  
  // 2. Fetch current party state
  const data = await fetch(`/api/party-state?code=${code}`);
  
  // 3. If host is playing, sync immediately
  if (data.currentTrack && data.currentTrack.status === 'playing') {
    handlePlayAt({
      trackUrl: data.currentTrack.url,
      title: data.currentTrack.title,
      startAtServerMs: data.currentTrack.startAtServerMs,
      startPositionSec: data.currentTrack.startPositionSec
    });
  }
}
```

### Tab Resume Recovery

```javascript
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !state.isHost) {
    // 1. Resync clock
    sendTimePing();
    await sleep(100);
    
    // 2. Refetch party state
    const data = await fetch(`/api/party-state?code=${state.code}`);
    
    // 3. Resync if still playing
    if (data.currentTrack?.status === 'playing') {
      handlePlayAt(data.currentTrack);
    }
  }
});
```

## Configuration Constants

### Server (server.js)

```javascript
const SCHEDULED_PLAY_LEAD_TIME_MS = 1200;  // Lead time before playback (800-1500ms range)
```

### Client (app.js)

```javascript
// Drift correction thresholds
const DRIFT_CORRECTION_THRESHOLD_SEC = 0.20;           // Ignore below this
const DRIFT_SOFT_CORRECTION_THRESHOLD_SEC = 0.80;      // Soft seek range
const DRIFT_HARD_RESYNC_THRESHOLD_SEC = 1.00;          // Hard resync trigger
const DRIFT_SHOW_RESYNC_THRESHOLD_SEC = 1.50;          // Show button
const DRIFT_RESYNC_BUTTON_HIDE_THRESHOLD_SEC = 0.80;   // Hide button
const DRIFT_CORRECTION_INTERVAL_MS = 2000;             // Check frequency

// Time sync parameters
const TIME_PING_INTERVAL_MS = 30000;                   // Ping frequency
const TIME_PING_MAX_RTT_MS = 800;                      // RTT filter
const TIME_SYNC_EWMA_OLD_WEIGHT = 0.8;                 // Smoothing weight
const TIME_SYNC_EWMA_NEW_WEIGHT = 0.2;                 // Smoothing weight
const TIME_SYNC_RESPONSE_DELAY_MS = 100;               // Wait for PONG
```

## Error Handling

### Autoplay Rejection

```javascript
audio.play()
  .then(() => {
    // Success - start drift correction
    startDriftCorrection(startAtServerMs, startPositionSec);
  })
  .catch((error) => {
    // Autoplay blocked - store position for later
    audio.dataset.pendingExpectedSec = expectedSec.toString();
    showTapToPlayOverlay();
  });
```

### Metadata Loading

```javascript
// Always wait for metadata before seeking
if (audio.readyState >= 1) {
  // Metadata ready - safe to seek
  audio.currentTime = expectedSec;
  audio.play();
} else {
  // Wait for metadata
  audio.onloadedmetadata = () => {
    audio.currentTime = expectedSec;
    audio.play();
  };
}
```

### Network Disconnection

- TIME_PING stops automatically on WebSocket close
- Drift correction continues with last known offset
- On reconnect, TIME_PING resumes immediately
- Party state refetched after reconnection

## Performance Considerations

### Bandwidth Usage

- TIME_PING: ~50 bytes every 30 seconds
- PREPARE_PLAY: ~200 bytes per track
- PLAY_AT: ~200 bytes per track
- **Total added overhead**: < 0.1 KB/min per client

### CPU Usage

- Drift correction: Every 2 seconds (negligible)
- EWMA calculation: Simple arithmetic (< 1ms)
- No continuous polling required

### Memory Usage

- Server offset: 1 float per client
- Pending start info: 4 fields × track count
- **Total added memory**: < 1 KB per client

## Backward Compatibility

### Old Clients

- Ignore unknown message types (TIME_PING, PREPARE_PLAY, PLAY_AT)
- Fall back to existing PLAY message handling
- No breaking changes to existing flow

### New Clients with Old Server

- TIME_PING gracefully ignored if not implemented
- Fall back to Date.now() if nowServerMs() has zero offset
- Existing sync mechanisms still functional

## Future Enhancements

### Possible Improvements

1. **Adaptive lead time** based on network conditions
2. **Playback rate adjustment** for sub-threshold drift (0.05-0.15s)
3. **Predictive sync** using network latency trends
4. **Multi-server time sync** for distributed deployments
5. **WebRTC data channel** for lower latency (experimental)

### Tuning Recommendations

**For Low-Latency Networks (< 50ms)**:
- Reduce `SCHEDULED_PLAY_LEAD_TIME_MS` to 800ms
- Tighten drift thresholds (0.15 / 0.60 / 0.80)

**For High-Latency Networks (> 200ms)**:
- Increase `SCHEDULED_PLAY_LEAD_TIME_MS` to 1500ms
- Loosen drift thresholds (0.30 / 1.00 / 1.20)
- Increase `TIME_PING_MAX_RTT_MS` to 1200ms

**For Mobile Networks**:
- More frequent TIME_PING (15s intervals)
- Stronger EWMA smoothing (0.9 / 0.1)
- Shorter metadata wait timeout

## Debugging Tools

### Console Commands

```javascript
// Check current server offset
console.log('Server offset:', state.serverOffsetMs, 'ms');

// Force TIME_PING
sendTimePing();

// Monitor drift live
setInterval(() => {
  const audio = state.guestAudioElement;
  if (audio && !audio.paused) {
    const startMs = parseFloat(audio.dataset.startAtServerMs);
    const startPos = parseFloat(audio.dataset.startPositionSec);
    const ideal = startPos + (nowServerMs() - startMs) / 1000;
    console.log('Drift:', (audio.currentTime - ideal).toFixed(3), 's');
  }
}, 1000);

// Check pending start info
console.log('Pending start:', state.pendingStartInfo);
```

### Server Logs

```
[Time Sync] TIME_PING received from client abc123
[Party] Track scheduled to start in 1200ms: Song Title, position: 0s
[Party] Broadcasting PLAY_AT for Song Title
```

### Client Logs

```
[Time Sync] RTT: 23.4 ms, New offset: 5.2 ms, Smoothed: 1.0 ms
[Prepare Play] Audio source set and loading
[Play At] Computed expectedSec: 1.23
[Drift Correction] Current: 45.23 Ideal: 45.22 Drift: 0.015 s
```

## Security Considerations

### Time Sync

- No sensitive data in TIME_PING/PONG
- RTT filtering prevents timing attacks
- Offset bounds checking prevents overflow

### Scheduled Start

- Server is authoritative for all timestamps
- Clients cannot manipulate startAtServerMs
- Lead time prevents race conditions

### Resource Limits

- TIME_PING rate limited to 1 per second max
- PREPARE_PLAY only from authenticated host
- Audio elements cleaned up on disconnect

## References

- EWMA Smoothing: https://en.wikipedia.org/wiki/EWMA_chart
- NTP Clock Sync: https://tools.ietf.org/html/rfc5905
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- Autoplay Policy: https://developer.chrome.com/blog/autoplay/
