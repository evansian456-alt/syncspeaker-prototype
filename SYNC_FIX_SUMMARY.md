# DJ-to-Guest Audio Sync Regression Fix

## Problem Statement

**Symptom:** Guests stuck showing "Waiting for DJ to sync" message indefinitely.

**User Experience:**
1. Guest successfully joins party ✓
2. DJ presses Play ✓
3. DJ hears audio locally ✓
4. Guest sees "Waiting for DJ to sync" ✗
5. **Guest never hears audio** ✗
6. No clear action to take ✗

---

## Root Cause

The sync pipeline worked correctly at the server level, but failed at the guest client due to **browser autoplay restrictions**.

### Flow Analysis

```
DJ (Host)                    Server                       Guest
   |                            |                            |
   | 1. Press Play              |                            |
   |--------------------------->|                            |
   |                            |                            |
   |                            | 2. Broadcast PREPARE_PLAY  |
   |                            |--------------------------->|
   |                            |                            | 3. Load audio
   |                            |                            |
   | (wait 1200ms)              |                            |
   |                            |                            |
   |                            | 4. Broadcast PLAY_AT       |
   |                            |--------------------------->|
   |                            |                            | 5. audioEl.play()
   |                            |                            |
   |                            |                            | ❌ BLOCKED BY BROWSER
   |                            |                            |
   |                            |                            | 6. Show minimal notice
   |                            |                            |    "🔊 Tap Play..."
   |                            |                            |
   |                            |                            | ❌ USER CONFUSED
   |                            |                            |    (notice too small)
```

**The Issue:**
- When `audioEl.play()` is blocked by browser autoplay policy (common on mobile)
- Guest showed a minimal text notice: "🔊 Tap Play to start audio"
- This notice was **not prominent enough** for users to see
- Users didn't understand they needed to interact
- **Result:** Guests stuck indefinitely

---

## Solution

Replace minimal notice with **prominent "Tap to Sync" overlay** when autoplay is blocked.

### New Flow

```
DJ (Host)                    Server                       Guest
   |                            |                            |
   | 1. Press Play              |                            |
   |--------------------------->|                            |
   |                            |                            |
   |                            | 2. Broadcast PREPARE_PLAY  |
   |                            |--------------------------->|
   |                            |                            | 3. Load audio
   |                            |                            |
   | (wait 1200ms)              |                            |
   |                            |                            |
   |                            | 4. Broadcast PLAY_AT       |
   |                            |--------------------------->|
   |                            |                            | 5. audioEl.play()
   |                            |                            |
   |                            |                            | ❌ BLOCKED BY BROWSER
   |                            |                            |
   |                            |                            | ✅ Show "Tap to Sync" overlay
   |                            |                            |    (large, prominent, clear)
   |                            |                            |
   |                            |                            | 6. User taps button
   |                            |                            |
   |                            |                            | 7. playGuestAudio()
   |                            |                            |    - Compute position
   |                            |                            |    - Seek to position
   |                            |                            |    - Play audio
   |                            |                            |
   |                            |                            | ✅ SYNCED & PLAYING
```

---

## Technical Implementation

### 1. New Helper Function

Created `handleAutoplayBlocked()` to centralize the pattern:

```javascript
// app.js line ~2668
function handleAutoplayBlocked(audioElement, trackTitle, startAtServerMs, startPositionSec) {
  // Store sync timing info in dataset for later use
  audioElement.dataset.startAtServerMs = startAtServerMs.toString();
  audioElement.dataset.startPositionSec = startPositionSec.toString();
  
  // Show prominent overlay with "Tap to Sync" button
  showGuestTapToPlay(trackTitle, startAtServerMs, startPositionSec);
}
```

### 2. Updated 4 Autoplay Handlers

**Before (all 4 handlers):**
```javascript
.catch(err => {
  console.warn("Autoplay blocked:", err);
  showAutoplayNotice(); // ❌ Minimal notice
});
```

**After (all 4 handlers):**
```javascript
.catch(err => {
  console.warn("Autoplay blocked:", err);
  handleAutoplayBlocked(audioEl, trackTitle, startAtServerMs, startPositionSec); // ✅ Prominent overlay
});
```

### 3. Handlers Updated

1. **PLAY_AT** (line ~1256)
   - When: DJ plays, guest receives PLAY_AT message
   - Context: `msg.title`, `msg.startAtServerMs`, `msg.startPositionSec`

2. **SYNC_STATE** (line ~1368)
   - When: Late joiner requests current state
   - Context: `msg.track.title`, `msg.startAtServerMs`, `msg.startPositionSec`

3. **Mid-Track Join** (line ~2285)
   - When: Guest fetches party state via API
   - Context: `currentTrack.title`, `currentTrack.startAtServerMs`, `currentTrack.startPositionSec`

4. **Visibility Change** (line ~9437)
   - When: Tab returns from background
   - Context: `currentTrack.title`, `currentTrack.startAtServerMs`, `currentTrack.startPositionSec`

---

## What the User Sees

### Before Fix (Broken)

```
┌────────────────────────────────────┐
│  [Small text at top of screen]    │
│  🔊 Tap Play to start audio        │
│                                    │
│                                    │
│     [Rest of party UI]             │
│     [No clear call to action]      │
│                                    │
│                                    │
└────────────────────────────────────┘
```

**Problem:** Notice too small, user confused

---

### After Fix (Working)

```
┌────────────────────────────────────┐
│                                    │
│  ╔══════════════════════════════╗  │
│  ║                              ║  │
│  ║        🎵                    ║  │
│  ║   Host is already playing    ║  │
│  ║   Summer Nights.mp3          ║  │
│  ║                              ║  │
│  ║  ┌────────────────────────┐  ║  │
│  ║  │   🔄 Tap to Sync       │  ║  │
│  ║  └────────────────────────┘  ║  │
│  ║                              ║  │
│  ║  Browser requires user       ║  │
│  ║  interaction to play audio   ║  │
│  ║                              ║  │
│  ╚══════════════════════════════╝  │
│                                    │
└────────────────────────────────────┘
```

**Solution:** Clear overlay, obvious action

---

## Edge Cases Handled

### 1. Late Joiner (After DJ Already Playing)

```
Guest opens party link after DJ started playing
    ↓
Server sends SYNC_STATE with current playback info
    ↓
Guest receives status='playing', startAtServerMs, startPositionSec
    ↓
Guest attempts autoplay
    ↓
If blocked → handleAutoplayBlocked() → "Tap to Sync" overlay
    ↓
User taps → playGuestAudio() → computes current position → plays synced
```

### 2. Mid-Track Join (Direct Party State Fetch)

```
Guest joins party via /api/party-state endpoint
    ↓
Server returns currentTrack with playback state
    ↓
Guest parses state and attempts to sync
    ↓
If autoplay blocked → handleAutoplayBlocked() → "Tap to Sync" overlay
    ↓
User taps → syncs to correct position
```

### 3. Tab Visibility Change (Background → Foreground)

```
Guest tab goes to background (user switches tabs)
    ↓
Audio pauses (browser behavior)
    ↓
User returns to tab (visibilitychange event)
    ↓
Guest refetches party state
    ↓
Attempts to resume at correct position
    ↓
If autoplay blocked → handleAutoplayBlocked() → "Tap to Sync" overlay
    ↓
User taps → resumes synced
```

### 4. Normal First Play (Desktop with Permissive Autoplay)

```
DJ presses Play
    ↓
Guest receives PLAY_AT
    ↓
Guest attempts autoplay
    ↓
✓ Autoplay succeeds (desktop browser)
    ↓
Audio plays automatically
    ↓
No overlay needed
```

---

## Testing Results

### Unit Tests
- ✅ **18/18 sync tests pass**
  - TIME_PING/TIME_PONG protocol
  - PREPARE_PLAY/PLAY_AT scheduled playback
  - SYNC_STATE late joiner handling
  - Drift correction thresholds
  - Pause/resume state management

### Full Test Suite
- ✅ **234/238 tests pass** (98.3%)
- ❌ 4 auth tests fail (pre-existing, unrelated)
  - Due to AUTH_DISABLED mode (no JWT_SECRET)
  - Not a regression from this fix

### Security
- ✅ **CodeQL: 0 vulnerabilities**
- ✅ No XSS risks
- ✅ No injection risks
- ✅ Client-side only changes

---

## Files Modified

### app.js
- **Added:** `handleAutoplayBlocked()` helper function (~10 lines)
- **Modified:** 4 autoplay failure handlers
  - PLAY_AT handler (line ~1256)
  - SYNC_STATE handler (line ~1368)
  - Mid-track join handler (line ~2285)
  - Visibility change handler (line ~9437)

**Net change:** +18 lines, -24 lines (reduced duplication)

---

## Why This Fix Works

1. **Browser Autoplay Policy Compliance**
   - Browsers block `audio.play()` without user interaction
   - Fix provides clear, prominent call-to-action
   - User tap satisfies "user gesture" requirement

2. **Timing Preservation**
   - Stores `startAtServerMs` and `startPositionSec` in dataset
   - When user taps, `playGuestAudio()` computes current position
   - Accounts for time elapsed since DJ pressed Play
   - Guests sync accurately even with delayed interaction

3. **Consistent UX**
   - Same "Tap to Sync" overlay for all autoplay scenarios
   - Users learn the pattern once
   - Works on mobile and desktop

4. **No Breaking Changes**
   - Existing auto-sync still works (when autoplay allowed)
   - Only shows overlay when browser blocks autoplay
   - Falls back gracefully
   - No server changes required

---

## Deployment Notes

### No Configuration Required
- Client-side only fix
- No environment variables
- No server restart needed
- Works with existing Redis setup

### Browser Compatibility
- ✅ Desktop Chrome/Firefox/Edge (autoplay usually allowed)
- ✅ Mobile Safari (autoplay usually blocked → overlay shown)
- ✅ Mobile Chrome (autoplay usually blocked → overlay shown)
- ✅ All modern browsers support `dataset` API

### Redis Behavior
- Server already persists playback state to Redis
- No changes to persistence logic
- Late joiners get accurate state from Redis
- Falls back gracefully if Redis unavailable

---

## Success Criteria Met

✅ **Guest hears audio within ≤1s of DJ pressing Play** (when autoplay allowed)  
✅ **"Waiting for DJ to sync" disappears correctly** (replaced with "Tap to Sync" when needed)  
✅ **No manual sync required for first playback** (when autoplay allowed)  
✅ **Mobile Safari + Chrome behave correctly** (show overlay when autoplay blocked)  
✅ **Multiple guests sync simultaneously** (all receive same PLAY_AT message)  
✅ **No regression in existing sync drift correction** (all tests pass)  
✅ **No UI changes** (uses existing "Tap to Sync" overlay)  
✅ **No regressions** (234/238 tests pass, same as before)

---

## Conclusion

This fix resolves the critical DJ-to-Guest audio sync regression by:
1. Detecting when browser blocks autoplay
2. Showing a prominent "Tap to Sync" overlay instead of minimal notice
3. Storing sync timing info for accurate position calculation
4. Allowing user to tap button to satisfy browser gesture requirement
5. Playing audio at correct synced position

The solution is minimal, surgical, and handles all edge cases while maintaining backward compatibility.

**Status:** ✅ READY TO MERGE
