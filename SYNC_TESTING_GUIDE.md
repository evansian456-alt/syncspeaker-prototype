# Sync Testing Guide - Host-Driven Scheduled Playback

This document outlines how to manually test the new host-driven scheduled sync implementation.

## Overview

The new sync system uses:
- **Server-time anchoring** via TIME_PING/PONG for clock synchronization
- **Scheduled playback** with PREPARE_PLAY → PLAY_AT protocol
- **Drift correction** using server-synced time calculations
- **Late join recovery** for mid-track joins and tab resumes

## Prerequisites

1. **Server running** on localhost:3000 (or configured port)
2. **Multiple devices/browsers** for host and guest testing
3. **Audio files** ready for upload (MP3, WAV, M4A)
4. **Network conditions**: Test on both local network and varying latencies

## Test Scenarios

### Test 1: Basic Scheduled Start (200-400ms sync)

**Goal**: Verify guests start within 200-400ms of host press

**Steps**:
1. Open browser tab #1 → Create party as "Host"
2. Upload an audio track
3. Open browser tab #2 → Join party as "Guest 1"
4. Open browser tab #3 → Join party as "Guest 2"
5. Host presses Play
6. **Observe**: 
   - Console shows `[Prepare Play]` message on all clients
   - 1200ms later, `[Play At]` message arrives
   - Guests show "Tap to Sync" overlay (autoplay block)
7. Guest taps "Tap to Sync" button
8. **Verify**:
   - Audio starts at correct position (accounting for elapsed time)
   - Console shows drift correction starting
   - All guests playing same position within ~200-400ms

**Expected Console Output**:
```
[Time Sync] Sending TIME_PING 1
[Time Sync] RTT: 23.4 ms, New offset: 5.2 ms, Smoothed: 1.0 ms
[Prepare Play] Preparing track: Song Title
[Prepare Play] Will start at serverMs: 1707139234567 position: 0
[Play At] Starting scheduled playback for: Song Title
[Play At] Computed expectedSec: 1.23
[Guest Audio] Playing from position: 1.23 s
[Drift Correction] Started with multi-threshold approach
[Drift Correction] Current: 1.24 Ideal: 1.23 Drift: 0.010 s
```

### Test 2: Drift Stays < 0.3s (2-3 minutes)

**Goal**: Verify drift correction keeps audio in sync over extended playback

**Steps**:
1. Continue from Test 1 with all guests playing
2. Let track play for 2-3 minutes
3. **Observe** drift correction logs every 2 seconds:
   - Most drift values should be < 0.2s (ignored)
   - Occasional soft corrections (0.2-0.8s)
   - Rare hard resyncs (>1.0s)

**Expected Behavior**:
- Drift stays below 0.3s for majority of playback
- Sync quality badge shows "Excellent" or "Good" (green/cyan)
- Resync button remains hidden

**Console Pattern**:
```
[Drift Correction] Current: 45.23 Ideal: 45.22 Drift: 0.015 s
[Drift Correction] Current: 47.35 Ideal: 47.23 Drift: 0.120 s
[Drift Correction] Current: 49.56 Ideal: 49.50 Drift: 0.065 s
```

### Test 3: Mid-Track Join (Late Join)

**Goal**: Verify guests joining mid-track sync to correct position

**Steps**:
1. Host playing track at ~60 seconds position
2. Open new browser tab → Join party as "Guest Late"
3. **Observe**:
   - `[Mid-Track Join]` log shows host is playing
   - TIME_PING sent immediately for clock sync
   - handlePlayAt called with current track position
   - Guest sees "Host is already playing" in tap overlay
4. Guest taps "Tap to Sync"
5. **Verify**:
   - Audio starts at ~60 seconds (not from beginning)
   - Drift is minimal (< 0.5s on first sync)

**Expected Console Output**:
```
[Time Sync] Sending TIME_PING 1
[Mid-Track Join] Host is playing: {startAtServerMs: ..., startPositionSec: 0}
[Play At] Computed expectedSec: 61.45
[Guest Audio] Playing from position: 61.45 s
[Drift Correction] Current: 61.46 Ideal: 61.45 Drift: 0.012 s
```

### Test 4: Tab Resume Recovery

**Goal**: Verify backgrounded tabs resync on return

**Steps**:
1. Guest playing synced audio
2. Switch to different browser tab for 10-15 seconds
3. Switch back to party tab
4. **Observe**:
   - `[Tab Resume]` log appears
   - TIME_PING sent to resync clock
   - Party state refetched
   - handlePlayAt re-syncs audio

**Expected Console Output**:
```
[Tab Resume] Tab became visible
[Tab Resume] Syncing after tab resume
[Time Sync] Sending TIME_PING 2
[Tab Resume] Re-syncing to playing track
[Play At] Computed expectedSec: 75.89
```

### Test 5: Resync Button Visibility

**Goal**: Verify resync button appears/hides at correct thresholds

**Steps**:
1. Simulate high drift by pausing browser execution (DevTools debugger)
2. Wait 3-5 seconds while paused
3. Resume execution
4. **Observe**:
   - Drift jumps to > 1.5s
   - Resync button appears
   - Drift correction attempts hard resync
5. Let drift correction work
6. **Verify**:
   - When drift drops < 0.8s, resync button hides
   - Button doesn't flicker on/off

**Expected Behavior**:
- Button shows: `absDrift > 1.5s` OR `driftCheckFailures > 3`
- Button hides: `absDrift < 0.8s`
- Log shows: `[Drift Correction] Re-sync button shown/hidden`

### Test 6: Autoplay Handling

**Goal**: Verify graceful handling of browser autoplay policies

**Steps**:
1. Fresh browser with strict autoplay policy
2. Join party as guest while host is playing
3. **Observe**:
   - PLAY_AT triggers audio.play()
   - Play promise rejects (autoplay blocked)
   - "Tap to Sync" overlay remains visible
   - `pendingExpectedSec` stored in audio dataset
4. User taps play button
5. **Verify**:
   - Audio plays from stored pendingExpectedSec
   - No additional seek operations
   - Drift correction starts immediately

**Expected Console Output**:
```
[Play At] Autoplay blocked: NotAllowedError
[Guest Audio] Using pending expected position: 12.34 s
[Guest Audio] Playing from position: 12.34 s
```

## Time Sync Verification

### Clock Offset Monitoring

Open browser console and watch TIME_PING/PONG cycles:

```javascript
// In console, track offset over time
setInterval(() => {
  console.log('Server offset:', state.serverOffsetMs.toFixed(2), 'ms');
}, 5000);
```

**Expected**:
- Offset stabilizes within 3-4 PING cycles
- Variation < 20ms on stable network
- High RTT samples (>800ms) ignored

### Drift Quality Indicators

Check sync quality badge on guest screen:
- **Excellent** (< 0.2s drift): Green
- **Good** (0.2-0.5s drift): Cyan  
- **Medium** (0.5-1.0s drift): Yellow
- **Poor** (> 1.0s drift): Red

## Network Condition Testing

### Low Latency (< 50ms)
- Sync within 100-200ms
- Minimal drift corrections needed
- TIME_PONG samples mostly accepted

### Medium Latency (50-200ms)
- Sync within 200-400ms
- Occasional soft corrections
- Most TIME_PONG samples accepted

### High Latency (> 200ms)
- Sync within 400-600ms
- More frequent corrections
- Some TIME_PONG samples rejected (RTT > 800ms)

## Debugging Tips

### Enable Verbose Logging

Add to console:
```javascript
// Watch all sync events
window.addEventListener('message', (e) => {
  if (e.data.type === 'TIME_PONG' || e.data.type === 'PREPARE_PLAY' || e.data.type === 'PLAY_AT') {
    console.table(e.data);
  }
});
```

### Monitor Drift in Real-Time

```javascript
// Track drift continuously
setInterval(() => {
  if (state.guestAudioElement && !state.guestAudioElement.paused) {
    const startMs = parseFloat(state.guestAudioElement.dataset.startAtServerMs);
    const startPos = parseFloat(state.guestAudioElement.dataset.startPositionSec);
    const ideal = startPos + (nowServerMs() - startMs) / 1000;
    const current = state.guestAudioElement.currentTime;
    console.log('Drift:', (current - ideal).toFixed(3), 's');
  }
}, 1000);
```

## Known Limitations

1. **First playback requires user tap** due to browser autoplay policies
2. **Network jitter** can cause temporary drift spikes (self-correcting)
3. **Redis fallback mode** currently has HTTP party creation issue (use WebSocket CREATE instead)
4. **Mobile Safari** may need additional testing for metadata loading

## Success Criteria

✅ Guests start within 200-400ms of host play command
✅ Drift stays < 0.3s for majority of playback duration  
✅ Mid-track join syncs to correct position (< 0.5s error)
✅ Tab resume recovers sync within 500ms
✅ Resync button appears only when needed and hides correctly
✅ Autoplay restrictions handled gracefully
✅ No console errors during normal operation

## Reporting Issues

When reporting sync issues, include:
1. Console logs showing TIME_PING/PONG cycles
2. Drift correction logs over 30+ seconds
3. Network conditions (latency, packet loss if known)
4. Browser and OS versions
5. Whether Redis is configured or fallback mode
6. Track position where issue occurred
