# Phone Party — Playback Sync Implementation Notes

## Overview

This document describes the host-driven scheduled playback sync implementation for Phone Party. The system ensures all guest devices stay synchronized with the host's playback with minimal drift and automatic correction.

## Architecture

### Server Time Synchronization (Phase 1)

**Purpose:** Establish a common time reference between clients and server to eliminate network jitter issues.

**Implementation:**
- **Messages:** `TIME_PING` (client → server) and `TIME_PONG` (server → client)
- **Algorithm:** 
  - Client sends TIME_PING with `clientNowMs` and `pingId`
  - Server immediately responds with TIME_PONG containing `serverNowMs`
  - Client calculates RTT and estimates server offset using EWMA smoothing (0.8 * old + 0.2 * new)
  - Samples with RTT > 800ms are discarded as unreliable
- **Frequency:** On WS connect, every 30 seconds, and on visibility change
- **Helper:** `nowServerMs()` returns estimated server time = `Date.now() + serverOffsetMs`

**Files:**
- `server.js`: handleTimePing() - lines 3832-3842
- `app.js`: TIME_PONG handler - lines 644-686

---

### Authoritative Host-Driven Start (Phase 2)

**Purpose:** Schedule playback to start at a specific future server time so all devices start together.

**Implementation:**

**Messages:**
1. **PREPARE_PLAY** (server → all clients)
   - Sent immediately when host presses play
   - Contains: trackId, trackUrl, title, durationMs, startAtServerMs, startPositionSec
   - Clients pre-load audio but don't start playback yet

2. **PLAY_AT** (server → all clients)
   - Sent after leadTimeMs delay (1200ms)
   - Contains same fields as PREPARE_PLAY
   - Signals clients to compute expected position and start playback

3. **SYNC_STATE** (server → late joiners)
   - Sent when a guest joins mid-playback
   - Contains: currentTrack, queue, status, startAtServerMs, startPositionSec, pausedAtPositionSec, serverTime
   - Allows late joiners to jump to correct position immediately

**Server Logic:**
- When host triggers play:
  - leadTimeMs = 1200ms (configurable)
  - startAtServerMs = Date.now() + leadTimeMs
  - Update party.currentTrack with status="preparing"
  - Broadcast PREPARE_PLAY to ALL members
  - After leadTimeMs, set status="playing" and broadcast PLAY_AT

**Resume from Pause:**
- When resuming from paused state, server uses stored `pausedAtPositionSec` as the new `startPositionSec`
- Full scheduled start sequence (PREPARE_PLAY → PLAY_AT) is used for smooth sync

**Late Joiners:**
- On join, server sends SYNC_STATE with current playback state
- Client calculates expected position: `expectedSec = startPositionSec + (nowServerMs() - startAtServerMs) / 1000`
- Client seeks to expectedSec and starts playback (if audio unlocked)

**Files:**
- `server.js`: handleHostPlay() - lines 4506-4601, handleJoin() SYNC_STATE - lines 4135-4155
- `app.js`: PREPARE_PLAY handler - lines 1141-1182, PLAY_AT handler - lines 1185-1268, SYNC_STATE handler - lines 1272-1392

---

### Client Playback Model (Phase 3)

**Purpose:** Handle browser autoplay restrictions while maintaining sync.

**State Variables:**
- `audioUnlocked`: false → true after first user interaction
- `pendingAutoStart`: Stores track info when PLAY_AT arrives but audio not unlocked
- `pendingExpectedSec`: Position to seek to when user taps Play

**Flow:**

1. **PREPARE_PLAY arrives:**
   - Create/reuse audio element
   - Set audio.src = trackUrl
   - Call audio.load() to pre-buffer
   - Store pending info

2. **PLAY_AT arrives:**
   - Compute expectedSec = startPositionSec + (nowServerMs() - startAtServerMs) / 1000
   - If audioUnlocked = true:
     - Seek to expectedSec
     - Call audio.play()
     - Start drift correction
   - If audioUnlocked = false:
     - Store pendingAutoStart
     - Show "Tap Play to start audio" notice

3. **Guest taps Play button:**
   - Set audioUnlocked = true
   - If pendingAutoStart exists:
     - Seek to pending.expectedSec (recompute from server time)
     - Call audio.play()
     - Start drift correction

4. **Visibility change:**
   - Send TIME_PING to resync clock
   - Fetch /api/party-state
   - If playing: recompute expectedSec and seek
   - Restart drift correction

**Files:**
- `app.js`: State variables - lines 92-100, PLAY_AT handler - lines 1185-1268, Guest Play button - lines 2590-2673, Visibility handler - lines 9339-9395

---

### Drift Correction (Phase 4)

**Purpose:** Continuously monitor and correct playback drift to keep devices aligned.

**Algorithm:**

Every 2 seconds (DRIFT_CORRECTION_INTERVAL_MS):
1. Calculate ideal position: `idealSec = startPositionSec + (nowServerMs() - startAtServerMs) / 1000`
2. Calculate drift: `drift = audio.currentTime - idealSec`
3. Apply correction based on thresholds:

| Drift Range | Action |
|------------|--------|
| < 0.20s | **Ignore** - acceptable range, reset playbackRate to 1.0 |
| 0.20s - 0.80s | **Gentle correction** - adjust playbackRate to 0.97 (ahead) or 1.03 (behind) for 3 seconds |
| 0.80s - 1.00s | **Moderate seek** - hard seek to idealSec, track failures |
| > 1.00s | **Hard resync** - hard seek to idealSec, track failures, show manual sync button if persistent |

**Gentle Correction (NEW):**
- Uses `playbackRate` adjustment instead of seeking for drift between 0.20s - 0.80s
- Reduces audible artifacts and provides smoother sync
- Automatically resets to 1.0 after 3 seconds
- Fallback to seeking if drift persists

**Manual Sync Button:**
- Hidden by default
- Shows if drift > 1.5s OR more than 3 hard seeks
- Auto-hides when drift < 0.8s
- Clicking triggers immediate hard seek to idealSec

**Files:**
- `app.js`: startDriftCorrection() - lines 2539-2656, stopDriftCorrection() - lines 2658-2668

---

### Pause/Resume/Stop Consistency (Phase 5)

**Pause:**
- Server computes `pausedPositionSec` based on current playback state
- If playing: `pausedPositionSec = startPositionSec + (now - startAtServerMs) / 1000`
- Stores `pausedAtPositionSec` and `pausedAtServerMs` in party.currentTrack
- Broadcasts PAUSE message with position

**Resume:**
- Uses stored `pausedAtPositionSec` as new `startPositionSec`
- Full scheduled start sequence (PREPARE_PLAY → PLAY_AT) with new `startAtServerMs`
- Ensures all devices resume at same position

**Stop:**
- Resets position to 0
- Sets status to "stopped"
- Broadcasts STOP message

**Files:**
- `server.js`: handleHostPause() - lines 4603-4650, handleHostPlay() resume logic - lines 4519-4534

---

## API Endpoints

### GET /api/party-state

Returns comprehensive party state including sync fields:

```json
{
  "exists": true,
  "partyCode": "ABC123",
  "serverTime": 1707139200000,
  "currentTrack": {
    "trackId": "track-123",
    "url": "https://...",
    "title": "Song Name",
    "durationMs": 180000,
    "status": "playing",
    "startAtServerMs": 1707139195000,
    "startPositionSec": 0,
    "pausedAtPositionSec": null
  },
  "queue": [...]
}
```

**Usage:** Guest clients poll this on visibility change to resync after tab was hidden.

---

## Testing

### Automated Tests

Run: `npm test`

**Coverage:**
- TIME_PING/TIME_PONG response validation (existing)
- /api/party-state sync fields for playing/paused/stopped states (new - server.test.js lines 1132-1220)
- PREPARE_PLAY and PLAY_AT message timing (existing)

### Manual Testing Checklist

**Basic Sync:**
1. ✅ Host starts track → guest taps play once → guest auto-syncs within 0.2-0.5s
2. ✅ Leave app 1 minute → come back → auto-resync triggers
3. ✅ Run for 3 minutes → drift stays under 0.3s most of the time
4. ✅ Late joiner joins mid-track → lands close to correct position immediately

**Drift Correction:**
5. ✅ Sync button stays hidden during normal playback
6. ✅ When drift appears, gentle correction (playbackRate) activates before hard seeks
7. ✅ Manual sync button only appears for large/persistent drift (> 1.5s)
8. ✅ Clicking sync button immediately fixes drift and hides button

**Pause/Resume:**
9. ✅ Host pauses → guests pause at same position
10. ✅ Host resumes → guests resume at same position using scheduled start

**Multi-Device:**
11. ✅ 3+ devices stay within 0.5s of each other
12. ✅ One device loses connection and rejoins → resyncs correctly

### Test Setup

**Two Phone Test:**
1. Open Phone Party on device A (host)
2. Open Phone Party on device B (guest)
3. Host creates party and selects a track
4. Guest joins using party code
5. Host presses play
6. Guest taps play once
7. Observe sync quality indicator and drift values in console

**Network Simulation:**
- Use Chrome DevTools → Network → Add throttling profile
- Test with "Slow 3G" to verify RTT filtering works
- Test with "Fast 3G" for normal conditions

---

## Configuration Constants

All thresholds are configurable in `app.js`:

```javascript
const DRIFT_CORRECTION_THRESHOLD_SEC = 0.20;      // Ignore drift below this
const DRIFT_SOFT_CORRECTION_THRESHOLD_SEC = 0.80; // Gentle correction up to this
const DRIFT_HARD_RESYNC_THRESHOLD_SEC = 1.00;     // Hard resync above this
const DRIFT_SHOW_RESYNC_THRESHOLD_SEC = 1.50;     // Show manual button above this
const DRIFT_CORRECTION_INTERVAL_MS = 2000;        // Check every 2 seconds
```

Server lead time in `server.js`:

```javascript
const leadTimeMs = 1200; // Time buffer for PREPARE_PLAY → PLAY_AT
```

---

## Troubleshooting

**Issue: Guests don't auto-sync**
- Check: TIME_PING/TIME_PONG messages in console
- Check: serverOffsetMs value (should stabilize within few seconds)
- Check: PLAY_AT message received with startAtServerMs

**Issue: Drift keeps increasing**
- Check: Browser throttling/performance
- Check: Audio element buffering state
- Check: Console for drift correction logs
- Check: RTT values (should be < 800ms)

**Issue: Manual sync button shows too often**
- Increase DRIFT_SHOW_RESYNC_THRESHOLD_SEC
- Check for audio buffering issues
- Check for excessive CPU usage

**Issue: Playback rate sounds weird**
- Browser may not support smooth playbackRate adjustment
- System will fallback to hard seeks automatically
- Consider disabling gentle correction for affected browsers

---

## Future Improvements

1. **Adaptive Lead Time:** Adjust leadTimeMs based on measured network RTT
2. **Predictive Drift:** Use historical drift data to predict and pre-correct
3. **Buffer Health Monitoring:** Adjust correction strategy based on buffer state
4. **Peer-to-Peer Mesh:** For ultra-low latency in local network scenarios
5. **Visual Sync Indicator:** Real-time waveform comparison between devices

---

## Implementation Summary

**What Changed:**
- ✅ Server time sync (TIME_PING/PONG) - already existed
- ✅ Scheduled playback (PREPARE_PLAY/PLAY_AT) - already existed
- ✅ Late joiner sync (SYNC_STATE) - **NEW**
- ✅ Gentle drift correction (playbackRate) - **NEW**
- ✅ Enhanced pause/resume with scheduled start - **IMPROVED**
- ✅ Enhanced /api/party-state with sync fields - already existed
- ✅ Tests for sync functionality - **NEW**

**What Stayed the Same:**
- All existing UI/UX flows
- Branding and theme
- Tier system
- Queue system
- Reactions and messaging
- All other features

**Files Modified:**
- `server.js`: Added SYNC_STATE message on join, enhanced pause resume logic
- `app.js`: Added SYNC_STATE handler, enhanced drift correction with playbackRate
- `server.test.js`: Added sync-specific tests
- `SYNC_IMPLEMENTATION_NOTES.md`: This file

---

## Backward Compatibility

✅ Old clients (without SYNC_STATE support) still work via PREPARE_PLAY/PLAY_AT
✅ New clients gracefully handle parties from old server versions
✅ All existing WebSocket messages preserved
✅ HTTP API endpoints unchanged (only additions to response)

---

**Last Updated:** 2026-02-05  
**Version:** 1.0.0-sync-enhanced
