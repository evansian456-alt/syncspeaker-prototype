# Phone Party: Host-Driven Scheduled Sync Implementation

## Summary

Successfully implemented a robust host-driven sync model to fix sync drift issues in the Phone Party web prototype. The implementation uses server-time anchoring, scheduled playback start, and automatic drift correction to maintain tight synchronization between host and guest devices.

## Problem Statement

The original implementation had several sync reliability issues:
- Host/guest play worked but sync drifted over time
- "Sync" buttons were unreliable
- Reactions sometimes not aligned with playback
- No recovery mechanism for late joins or tab resume

## Solution Architecture

### 1. Server-Time Anchoring
- **TIME_PING/TIME_PONG Protocol**: Clients periodically ping server to estimate clock offset
- **EWMA Smoothing**: Uses exponentially weighted moving average (0.8 old + 0.2 new) to smooth offset estimates
- **RTT Filtering**: Ignores samples with round-trip time > 800ms for accuracy
- **Periodic Sync**: Sends TIME_PING on connect and every 30 seconds

### 2. Scheduled Playback Start
- **PREPARE_PLAY Message**: Sent 1.2 seconds before playback to all clients
  - Clients pre-load audio and prepare for sync
  - Stores pending state (startAtServerMs, startPositionSec)
  - Non-blocking audio loading
  
- **PLAY_AT Message**: Sent at scheduled start time
  - All clients compute expected position: `expectedSec = startPositionSec + (nowServerMs() - startAtServerMs) / 1000`
  - Synchronized start ensures all devices begin together
  - Accounts for network latency and processing time

### 3. Autoplay-Safe Behavior
- **Graceful Fallback**: Detects when browser blocks autoplay
- **User Interaction**: Shows "Tap to Start" notice when needed
- **Recovery**: Guest play button handles pending playback with correct position
- **State Tracking**: Maintains pendingExpectedSec for autoplay recovery

### 4. Automatic Drift Correction
Multi-threshold approach running every 2 seconds:

| Drift Range | Action | Description |
|-------------|--------|-------------|
| < 0.20s | Ignore | Within acceptable range |
| 0.20s - 0.80s | Soft Correction | Small seek to ideal position |
| 0.80s - 1.00s | Moderate Correction | Hard seek with failure tracking |
| > 1.00s | Hard Resync | Hard seek + show manual resync button if persistent |

- **Resync Button Logic**: Shows when drift > 1.5s or repeated failures, hides when drift < 0.8s
- **Server Clock Based**: Uses `nowServerMs()` instead of `Date.now()` for calculations

### 5. Recovery Mechanisms

**Late Join Recovery**:
- Fetches `/api/party-state` on join
- Computes expected position using server clock
- Syncs to current playback position
- Handles both "playing" and "preparing" states

**Tab Resume Recovery**:
- Listens to `visibilitychange` event
- Sends TIME_PING to resync clock when tab becomes visible
- Refetches party state and recomputes position
- Restarts drift correction

## Implementation Details

### Server Changes (server.js)

1. **TIME_PING Handler**:
```javascript
function handleTimePing(ws, msg) {
  const serverNowMs = Date.now();
  safeSend(ws, JSON.stringify({
    t: "TIME_PONG",
    clientNowMs: msg.clientNowMs,
    serverNowMs: serverNowMs,
    pingId: msg.pingId
  }));
}
```

2. **Scheduled Start in handleHostPlay**:
```javascript
const leadTimeMs = 1200;
const startAtServerMs = Date.now() + leadTimeMs;

// Broadcast PREPARE_PLAY
party.members.forEach(m => {
  safeSend(m.ws, JSON.stringify({ 
    t: "PREPARE_PLAY",
    trackUrl, title, startAtServerMs, startPositionSec
  }));
});

// After leadTimeMs, broadcast PLAY_AT
setTimeout(() => {
  party.members.forEach(m => {
    safeSend(m.ws, JSON.stringify({ 
      t: "PLAY_AT",
      trackUrl, title, startAtServerMs, startPositionSec
    }));
  });
}, leadTimeMs);
```

### Client Changes (app.js)

1. **Server Clock Offset Tracking**:
```javascript
let serverOffsetMs = 0;
let isFirstSync = false;

function nowServerMs() {
  return Date.now() + serverOffsetMs;
}

// On TIME_PONG
const estimatedServerNowMs = msg.serverNowMs + (rttMs / 2);
const newOffset = estimatedServerNowMs - clientReceiveMs;

if (!isFirstSync) {
  serverOffsetMs = newOffset;
  isFirstSync = true;
} else {
  serverOffsetMs = 0.8 * serverOffsetMs + 0.2 * newOffset;
}
```

2. **PREPARE_PLAY Handler**:
```javascript
if (msg.t === "PREPARE_PLAY") {
  state.pendingStartAtServerMs = msg.startAtServerMs;
  state.pendingStartPositionSec = msg.startPositionSec;
  
  if (!state.guestAudioElement) {
    state.guestAudioElement = new Audio();
  }
  state.guestAudioElement.src = msg.trackUrl;
  state.guestAudioElement.load();
}
```

3. **PLAY_AT Handler**:
```javascript
if (msg.t === "PLAY_AT") {
  const serverNow = nowServerMs();
  const elapsedSec = (serverNow - msg.startAtServerMs) / 1000;
  const expectedSec = Math.max(0, msg.startPositionSec + elapsedSec);
  
  clampAndSeekAudio(audioEl, expectedSec);
  audioEl.play()
    .then(() => {
      startDriftCorrection(msg.startAtServerMs, msg.startPositionSec);
    })
    .catch(err => {
      // Autoplay blocked - show notice
      state.pendingExpectedSec = expectedSec;
      showAutoplayNotice();
    });
}
```

4. **Updated Drift Correction**:
```javascript
function startDriftCorrection(startAtServerMs, startPositionSec) {
  setInterval(() => {
    const elapsedSec = (nowServerMs() - startAtServerMs) / 1000;
    const idealSec = startPositionSec + elapsedSec;
    const drift = audioEl.currentTime - idealSec;
    
    if (Math.abs(drift) < 0.20) {
      // Ignore - within acceptable range
    } else if (Math.abs(drift) < 0.80) {
      // Soft correction
      clampAndSeekAudio(audioEl, idealSec);
    } else {
      // Hard correction
      clampAndSeekAudio(audioEl, idealSec);
      // Show resync button if persistent
    }
  }, 2000);
}
```

## Testing Results

✅ **Server Startup**: Server starts successfully without errors
✅ **Security Scan**: CodeQL passed with 0 vulnerabilities
✅ **Unit Tests**: 180/184 tests passing (4 auth failures pre-existing)
✅ **API Health**: `/api/ping` endpoint responding correctly
✅ **Code Review**: All review issues addressed

## Backward Compatibility

- All changes maintain backward compatibility
- Legacy PLAY/PAUSE messages still work for older clients
- New clients automatically use PREPARE_PLAY/PLAY_AT for better sync
- Existing party state structure preserved

## Configuration

**Lead Time** (server.js):
```javascript
const leadTimeMs = 1200; // Configurable 800-1500ms
```

**Drift Thresholds** (app.js):
```javascript
const DRIFT_CORRECTION_THRESHOLD_SEC = 0.20;
const DRIFT_SOFT_CORRECTION_THRESHOLD_SEC = 0.80;
const DRIFT_HARD_RESYNC_THRESHOLD_SEC = 1.00;
const DRIFT_SHOW_RESYNC_THRESHOLD_SEC = 1.50;
```

**Time Sync** (app.js):
```javascript
const TIME_PING_INTERVAL = 30000; // 30 seconds
const MAX_RTT_MS = 800; // Filter samples above this
const EWMA_ALPHA = 0.2; // Smoothing factor (0.8 old + 0.2 new)
```

## Acceptance Criteria Status

| Criteria | Status | Notes |
|----------|--------|-------|
| Host presses Play → guests start within ~200-400ms | ✅ Ready | Scheduled start with 1.2s lead time |
| After 2-3 minutes, drift stays < 0.3s | ✅ Ready | Multi-threshold drift correction active |
| Refresh guest mid-track → snaps to correct position | ✅ Ready | Late join recovery implemented |
| Re-sync button appears only when needed | ✅ Ready | Shows at 1.5s, hides at 0.8s |

## Next Steps

### Manual Testing Checklist
1. Create party as host
2. Upload and play a track
3. Have guest join
4. Verify synchronized start (within 200-400ms)
5. Monitor drift over 2-3 minutes (should stay < 0.3s)
6. Test autoplay blocking and "Tap to Start" recovery
7. Test guest refresh mid-track (should sync to current position)
8. Test tab switching (should resync on return)
9. Verify resync button behavior (shows/hides correctly)

### Performance Monitoring
- Monitor TIME_PING/PONG RTT values
- Track drift values in console logs
- Observe resync button appearance frequency
- Check audio playback smoothness

## Files Modified

- `server.js`: Added TIME_PING/PONG handlers, scheduled start protocol
- `app.js`: Added clock sync, PREPARE_PLAY/PLAY_AT handlers, updated drift correction
- `index.html`: Added minimal autoplay notice element

## Commit History

1. Phase A: Add TIME_PING/PONG and scheduled start (PREPARE_PLAY/PLAY_AT)
2. Phase B: Implement client-side server clock offset with EWMA smoothing
3. Phase C: Handle PREPARE_PLAY/PLAY_AT and autoplay recovery
4. Phase D: Update drift correction to use server clock (nowServerMs)
5. Phase E: Add late join and tab resume recovery with server clock sync
6. Fix: Use isFirstSync flag and DRIFT_SOFT_CORRECTION_THRESHOLD_SEC constant

## Security Summary

No security vulnerabilities introduced. All changes:
- Use existing authentication/authorization
- Maintain input validation
- No new external dependencies
- CodeQL scan passed with 0 alerts

---

**Implementation Status**: ✅ COMPLETE
**Ready for**: Manual Testing & Validation
**Date**: 2026-02-05
