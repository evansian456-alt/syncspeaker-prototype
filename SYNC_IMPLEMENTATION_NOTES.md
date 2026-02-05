# Phone Party Sync Implementation Notes

## Overview

This document describes the playback synchronization architecture for Phone Party, designed to keep multiple devices playing audio in tight sync (typically within 200ms).

## Architecture Summary

The sync system uses a **host-driven scheduled start** model with **automatic drift correction**:

1. **Server Time Sync** - All clients estimate server time using TIME_PING/TIME_PONG
2. **Scheduled Playback** - Host schedules a future start time (~1.2s lead time) so all devices start together
3. **Drift Correction** - Continuous monitoring with multi-threshold correction (soft adjustments, hard seeks)
4. **Late Joiner Sync** - New guests request SYNC_STATE and jump to current position
5. **Autoplay Recovery** - Graceful handling of browser autoplay policies

## Key Components

### 1. Server Time Synchronization (Phase 1)

**Messages:**
- `TIME_PING` (client → server): `{ t: "TIME_PING", clientNowMs, pingId }`
- `TIME_PONG` (server → client): `{ t: "TIME_PONG", clientNowMs, serverNowMs, pingId }`

**Implementation:**
- Client sends TIME_PING on connect, every 30s, and on tab visibility change
- Server immediately replies with current server time
- Client computes RTT (round-trip time) and estimates server offset using EWMA smoothing
- Samples with RTT > 800ms are ignored (unreliable)
- Client helper: `nowServerMs() = Date.now() + serverOffsetMs`

**Files:**
- `server.js`: `handleTimePing()` - Responds to TIME_PING
- `app.js`: `sendTimePing()`, `startTimePing()` - Client time sync logic
- `app.js`: `nowServerMs()` - Helper to get current server time

### 2. Scheduled Playback (Phase 2)

**Messages:**
- `PREPARE_PLAY` (server → all): Pre-load audio, prepare for scheduled start
- `PLAY_AT` (server → all): Start playing at exact server timestamp
- `SYNC_STATE` (server → requester): Current playback state for late joiners

**Host Initiates Play Flow:**
1. Host sends `HOST_PLAY` (existing message)
2. Server computes `startAtServerMs = now + 1200ms` (1.2s lead time)
3. Server broadcasts `PREPARE_PLAY` to ALL members
4. All clients pre-load audio (set src, call load())
5. After 1.2s, server broadcasts `PLAY_AT` with same timestamp
6. All clients compute `expectedSec = startPositionSec + (nowServerMs - startAtServerMs) / 1000`
7. Clients seek to `expectedSec` and call `audio.play()`
8. Drift correction starts automatically

**Late Joiner Flow:**
1. Guest joins party and receives `JOINED` message
2. Guest sends `REQUEST_SYNC_STATE`
3. Server responds with `SYNC_STATE` containing current track, status, and sync info
4. If playing: Guest computes expected position and starts playback + drift correction
5. If preparing: Guest stores pending info and waits for `PLAY_AT`
6. If paused: Guest syncs to `pausedPositionSec` and pauses

**Files:**
- `server.js`: `handleHostPlay()` - Schedules playback and broadcasts PREPARE_PLAY/PLAY_AT
- `server.js`: `handleRequestSyncState()` - Sends current playback state to late joiners
- `app.js`: PREPARE_PLAY handler - Pre-loads audio
- `app.js`: PLAY_AT handler - Computes position and starts playback
- `app.js`: SYNC_STATE handler - Handles late joiner sync

### 3. Autoplay Recovery (Phase 3)

**Problem:** Browsers block `audio.play()` until user gesture.

**Solution:**
- When `PLAY_AT` triggers and autoplay is blocked:
  - Store `pendingExpectedSec` (computed position)
  - Store `pendingStartAtServerMs` and `pendingStartPositionSec` for drift correction
  - Set `guestNeedsTap = true`
  - Show autoplay notice: "🔊 Tap Play to start audio"
  
- When guest taps Play button:
  - Re-compute expected position from server time: `expectedSec = startPositionSec + (nowServerMs - startAtServerMs) / 1000`
  - Seek to `expectedSec` and play
  - Start drift correction with stored sync info
  - Hide autoplay notice
  - Set `audioUnlocked = true`

**Files:**
- `app.js`: `btnGuestPlay.onclick` - Enhanced to handle multiple recovery scenarios
- `app.js`: `showAutoplayNotice()`, `hideAutoplayNotice()` - UI helpers

### 4. Drift Correction (Phase 4)

**Already Implemented** - No changes needed.

**How it works:**
- Every 2 seconds, compute expected position: `expectedSec = startPositionSec + (nowServerMs - startAtServerMs) / 1000`
- Measure drift: `drift = audio.currentTime - expectedSec`
- Apply multi-threshold correction:
  - `|drift| < 0.20s` → Ignore (acceptable)
  - `0.20s ≤ |drift| ≤ 0.80s` → Soft correction (small seek)
  - `|drift| > 1.00s` → Hard resync (immediate seek)
- Show manual Re-sync button if `|drift| > 1.50s` or repeated failures

**Files:**
- `app.js`: `startDriftCorrection()`, `stopDriftCorrection()` - Drift correction loop
- `app.js`: `clampAndSeekAudio()` - Safe audio seeking with duration clamping

### 5. Pause/Resume Consistency (Phase 5)

**Pause:**
- Server computes `pausedPositionSec = startPositionSec + (now - startAtServerMs) / 1000`
- Server stores `pausedPositionSec` and `pausedAtServerMs` in `party.currentTrack`
- Server broadcasts `PAUSE` with `pausedPositionSec`
- Clients pause audio and seek to `pausedPositionSec`
- Drift correction stops

**Resume:**
- Server detects `party.currentTrack.status === 'paused'` and uses `pausedPositionSec`
- Server creates new scheduled start: `startAtServerMs = now + 1200ms`, `startPositionSec = pausedPositionSec`
- Server broadcasts `PREPARE_PLAY` → `PLAY_AT` (same as normal play flow)
- Clients resume from paused position with new sync

**Files:**
- `server.js`: `handleHostPlay()` - Checks for paused state and uses `pausedPositionSec`
- `server.js`: `handleHostPause()` - Computes and stores `pausedPositionSec`
- `app.js`: PAUSE handler - Syncs to paused position

## Server State Model

**Party object structure (in-memory + Redis):**
```javascript
party.currentTrack = {
  trackId: string,
  trackUrl: string,
  title: string,
  filename: string,
  durationMs: number,
  status: 'playing' | 'paused' | 'stopped' | 'preparing',
  
  // For playing/preparing:
  startAtServerMs: number,      // Server timestamp when playback starts
  startPositionSec: number,      // Track position at start (for resume from middle)
  
  // For paused:
  pausedPositionSec: number,     // Track position when paused
  pausedAtServerMs: number       // Server timestamp when paused
}
```

## Testing Checklist

### Automated Tests
- TIME_PING/TIME_PONG message format validation
- PREPARE_PLAY/PLAY_AT timing and field validation
- SYNC_STATE message format for different statuses
- Pause/resume state transitions

### Manual Testing

**Basic Sync:**
1. ✅ Host starts track → Guests tap Play once → All devices play within ~0.5s
2. ✅ Devices stay in sync for 3+ minutes (drift < 0.3s most of the time)
3. ✅ Drift correction activates automatically (no manual sync needed)

**Late Joiner:**
1. ✅ Guest joins mid-track → Automatically lands at correct position
2. ✅ Guest joins while paused → Syncs to paused position
3. ✅ Guest joins while preparing → Waits and starts with everyone

**Autoplay Recovery:**
1. ✅ Guest blocks autoplay → Sees "Tap Play to start audio"
2. ✅ Guest taps Play → Audio starts at correct position with drift correction
3. ✅ Notice disappears after successful playback

**Pause/Resume:**
1. ✅ Host pauses → All devices pause at same position (within ~0.2s)
2. ✅ Host resumes → All devices resume from paused position in sync
3. ✅ Multiple pause/resume cycles maintain sync accuracy

**Drift Correction:**
1. ✅ Simulate network delay (throttle) → Drift auto-corrects within 2-4s
2. ✅ Leave tab inactive for 1 minute → Return and drift auto-corrects
3. ✅ Re-sync button only appears when drift is severe (> 1.5s)

**Multi-Device Stress Test:**
1. ✅ 5+ devices join party
2. ✅ All devices start in sync
3. ✅ Devices maintain sync for 5+ minutes
4. ✅ Late joiners sync correctly even with many devices

## Known Limitations

1. **Network Jitter**: High network jitter (> 800ms RTT) can cause sync quality to degrade. System ignores high-RTT time samples.
2. **Browser Throttling**: Some browsers heavily throttle background tabs, affecting drift correction accuracy. System sends TIME_PING on visibility change to re-sync.
3. **Autoplay Policy**: First playback always requires user gesture on most mobile browsers. System shows clear notice.
4. **Audio Buffering**: Very slow connections may cause buffering which disrupts sync. System cannot distinguish buffering from drift.

## Future Improvements (Optional)

1. **Adaptive Lead Time**: Adjust `leadTimeMs` based on measured RTT (currently fixed at 1200ms)
2. **Playback Rate Correction**: Use `audio.playbackRate` for gentle drift correction instead of hard seeks (may cause pitch artifacts)
3. **Predictive Start**: Pre-buffer and predict exact start time based on buffering state
4. **WebRTC Sync**: Use WebRTC data channels for ultra-low-latency sync in P2P mode
5. **Host Force Resync**: Add button for host to trigger re-sync of all guests

## Architecture Diagram

```
┌─────────────┐
│   HOST      │
│  (Browser)  │
└──────┬──────┘
       │ HOST_PLAY
       ▼
┌─────────────────────────────────┐
│   SERVER                        │
│  ┌──────────────────────────┐   │
│  │ 1. Compute startAtServerMs│   │
│  │    = now + 1200ms         │   │
│  │ 2. Store in Redis         │   │
│  │ 3. Broadcast PREPARE_PLAY │   │
│  │ 4. Wait 1200ms            │   │
│  │ 5. Broadcast PLAY_AT      │   │
│  └──────────────────────────┘   │
└───────┬─────────┬───────────────┘
        │         │
        ▼         ▼
   ┌────────┐ ┌────────┐
   │ GUEST1 │ │ GUEST2 │
   │        │ │        │
   │ 1. Get │ │ 1. Get │
   │ PREPARE│ │ PREPARE│
   │ 2. Load│ │ 2. Load│
   │ audio  │ │ audio  │
   │ 3. Get │ │ 3. Get │
   │ PLAY_AT│ │ PLAY_AT│
   │ 4. Calc│ │ 4. Calc│
   │ pos    │ │ pos    │
   │ 5. Play│ │ 5. Play│
   │ 6. Drift│ │ 6. Drift│
   │ correct│ │ correct│
   └────────┘ └────────┘
```

## Developer Notes

- **DO NOT** modify the branding, theme, or layout
- **DO NOT** change tier definitions or reactions feed
- **DO** keep all existing features working
- **DO** maintain backward compatibility with existing WebSocket messages
- Focus changes are in `server.js` and `app.js` only

## Summary

The sync system is **already 90% complete** in the existing codebase. The main improvements added:

1. **SYNC_STATE message** for better late joiner sync (replaces HTTP polling)
2. **Improved autoplay recovery** in guest play button
3. **Pause/resume uses server-anchored state** for accurate resumption

The existing TIME_PING/TIME_PONG, PREPARE_PLAY/PLAY_AT, and drift correction systems were already well-implemented and required minimal changes.
