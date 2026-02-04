# Phone Party Two-Phone Testing Guide

This guide walks you through testing all features between two mobile devices (host phone + guest phone).

## Prerequisites

### Option A: Local Network Testing
- Computer running the server (`npm start`)
- Get your computer's local IP address:
  - **Windows**: `ipconfig` → look for "IPv4 Address"
  - **Mac/Linux**: `ifconfig` or `ip addr` → look for "inet" address (usually 192.168.x.x)
- Two phones on the same Wi-Fi network
- Server URL: `http://[your-ip]:8080` (e.g., `http://192.168.1.100:8080`)

### Option B: Cloud Deployment (Railway)
- App deployed to Railway with Redis enabled
- Server URL: `https://your-app.railway.app`
- Two phones with internet access (can be on different networks)

## Test Setup

1. **Open server in browser on both phones**
   - Phone 1 (Host): Navigate to server URL
   - Phone 2 (Guest): Navigate to server URL

2. **Open debug panel (recommended)**
   - Tap the 🛠️ button in the bottom-right corner
   - Keep panel open during testing to monitor state

## Acceptance Criteria Tests

### ✅ Test 1: Guest Join Flow

**Steps:**

1. **Phone 1 (Host)**:
   - Tap "Start party"
   - Note the 6-character party code (e.g., ABC123)
   - Verify you see "Waiting for guests..."

2. **Phone 2 (Guest)**:
   - Tap "Join party"
   - Enter the party code
   - Optionally enter a nickname
   - Tap "Join party" button

**Expected Results:**
- ✅ Guest phone transitions to "Joined Party" screen
- ✅ Guest sees party code displayed
- ✅ Host phone updates to show "1 guest joined" within 1-3 seconds
- ✅ Both phones show time remaining countdown
- ✅ Debug panel shows:
  - Guest: Mode = "Guest", WebSocket = "Connected"
  - Host: Guest Count = 1

**Debug Logs to Check:**
- Host: "Guest count changed: 0 → 1"
- Guest: "Joined party: ABC123"

---

### ✅ Test 2: Track Start Notification

**Steps:**

1. **Phone 1 (Host)**:
   - Tap "Choose music file"
   - Select any audio file from phone
   - **IMPORTANT**: Enter a public HTTPS URL in the "Track URL" field
     - Example: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`
     - Or use a Dropbox/Google Drive public link
   - Tap "Start party" (if not already started)
   - Wait for guest to join
   - Tap ▶️ Play button

2. **Phone 2 (Guest)**:
   - Watch for notifications

**Expected Results:**
- ✅ Guest receives notification: "Track started: [filename]"
- ✅ Guest sees "Tap to Play Audio" overlay appear
- ✅ Overlay shows track name
- ✅ Debug panel shows:
  - Guest: Track = "[filename]", Last Event = "PLAY"

**Debug Logs to Check:**
- Guest: "Track started: [filename]"
- Guest: "New track detected: [filename]" (from polling fallback)

**Note**: If no Track URL provided, guest will see: "Host is playing locally - no audio sync available"

---

### ✅ Test 3: Guest Audio Playback

**Prerequisites**: Test 2 completed with public track URL

**Steps:**

1. **Phone 2 (Guest)**:
   - Tap "Tap to Play Audio" button on overlay

**Expected Results:**
- ✅ Overlay disappears
- ✅ Audio starts playing on guest phone
- ✅ Toast message: "🎵 Audio synced and playing!"
- ✅ Audio is synchronized with host (±1 second)
- ✅ Playback state badge shows "▶️ Playing by Host"
- ✅ Equalizer visualizer animates
- ✅ Debug panel shows:
  - Audio Ready = "Yes"

**Debug Logs to Check:**
- Guest: "[Guest Audio] Playing from position: X.XX s"

**Troubleshooting:**
- If audio fails to play:
  - Check browser console for errors
  - Verify track URL is accessible (open in new tab)
  - Ensure URL is HTTPS (not HTTP) for cross-origin access
  - Try a different public audio URL

---

### ✅ Test 4: Emoji Reactions

**Steps:**

1. **Phone 2 (Guest)**:
   - Scroll to "Send Reactions" section
   - Tap any emoji button (e.g., 🔥, 🎉, 💯)

2. **Phone 1 (Host)**:
   - Watch for reaction display

**Expected Results:**
- ✅ Guest sees toast: "Sent: [emoji]"
- ✅ Host receives and displays emoji with animation
- ✅ Emoji appears in DJ screen messages area
- ✅ Crowd energy increases on host screen
- ✅ Both phones still playing audio in sync

**Debug Logs to Check:**
- Host: "Guest message received"

---

### ✅ Test 5: Guest Comments

**Steps:**

1. **Phone 2 (Guest)**:
   - Scroll to "Quick Messages" section
   - Tap any message button (e.g., "Love this track!", "Turn it up!")

2. **Phone 1 (Host)**:
   - Watch for message display

**Expected Results:**
- ✅ Guest sees toast: "Sent: [message]"
- ✅ Host receives and displays message
- ✅ Message appears in DJ screen with guest name
- ✅ Crowd energy increases more than emoji (8 vs 5 points)

---

### ✅ Test 6: Synced Visuals

**Steps:**

1. **Phone 1 (Host)**:
   - Play a track (if not already playing)
   - Pause the track

2. **Phone 2 (Guest)**:
   - Watch for visual changes

**Expected Results:**
- ✅ When host plays: Guest equalizer starts animating
- ✅ When host pauses: Guest equalizer stops animating
- ✅ Playback state badge updates in sync
- ✅ Visual mode changes reflected (playing → paused → playing)
- ✅ Debug panel shows:
  - Last Event updates to "PAUSE" then "PLAY"

---

### ✅ Test 7: DJ Auto-Messages

**Watch for these messages during the test:**

**On Party Start (Host only):**
- ✅ "🎧 Party started! Share your code with friends."

**On Guest Join:**
- ✅ Both phones: "👋 [Guest Name] joined the party!"
- ✅ If first guest: "💬 Drop an emoji or message!" (after 5 seconds)

**Before Party Expires:**
- ✅ Both phones (90 minutes in): "⏰ Party ending in 30 minutes!"

**Expected Results:**
- ✅ Messages appear as toast notifications
- ✅ Messages display in overlay at bottom of screen
- ✅ Messages auto-dismiss after 10 seconds
- ✅ Different message types have different styling (system/prompt/warning)

---

### ✅ Test 8: Party End Flow

**Steps:**

1. **Phone 1 (Host)**:
   - Tap "Leave" button
   - Confirm party end (if prompted)

2. **Phone 2 (Guest)**:
   - Watch for notifications

**Expected Results:**
- ✅ Host shows party recap screen
- ✅ Guest receives "Party has ended" message
- ✅ Guest audio stops playing
- ✅ Both phones return to landing page after 3 seconds
- ✅ Party cannot be rejoined
- ✅ Debug panel shows:
  - Party Status = "ended"

---

## Additional Tests

### Polling Fallback Test

**Purpose**: Verify guests receive updates even without WebSocket

**Steps:**

1. **Phone 2 (Guest)**:
   - Open browser developer tools (if available)
   - Navigate to Network tab
   - Join party as usual

2. **Observe Network Requests**:
   - Look for `/api/party-state?code=XXX` requests every 2 seconds
   - Verify status 200 responses

**Expected Results:**
- ✅ Polling requests sent every 2 seconds
- ✅ Guest receives track updates via polling
- ✅ DJ messages delivered via polling
- ✅ Debug panel shows: Polling = "Active"

---

### Multi-Guest Test

**Steps:**

1. Add a third device as Guest 2
2. Repeat guest join flow
3. Send emojis from both guests simultaneously

**Expected Results:**
- ✅ Host sees both guests in guest count
- ✅ All devices receive DJ message: "👋 Guest 2 joined! 2 guests in the party."
- ✅ Host receives emojis from both guests
- ✅ Crowd energy increases from both sources

---

### Party Timeout Test

**Purpose**: Verify party expires after 2 hours

**Note**: This test takes 2 hours. For quick verification:

1. Check party state includes `expiresAt` timestamp
2. Verify time remaining counts down
3. Verify warning appears at 90 minutes

**For full test**:
1. Create party and wait 2 hours
2. Verify both phones receive "expired" status
3. Verify party cannot be rejoined

---

## Troubleshooting

### Guest doesn't receive track notification
- ✅ Check WebSocket status in debug panel
- ✅ Verify polling is active (should fallback automatically)
- ✅ Check browser console for errors
- ✅ Verify both phones on same network (local testing)
- ✅ Verify Redis is connected on server (`/health` endpoint)

### Guest audio won't play
- ✅ Verify track URL is public and accessible
- ✅ Verify URL is HTTPS (not HTTP)
- ✅ Try opening track URL in phone browser
- ✅ Check audio format is supported (MP3, M4A recommended)
- ✅ Verify guest tapped "Play" button (browser requirement)

### Emoji/Comments not appearing on host
- ✅ Verify WebSocket connected (debug panel)
- ✅ Check host is on party screen (not DJ screen - messages show there)
- ✅ Verify chat mode not locked
- ✅ Check browser console for errors

### DJ messages not appearing
- ✅ Verify polling is working (debug panel)
- ✅ Check server logs for message broadcast
- ✅ Verify messages container is visible
- ✅ Try refreshing guest page

---

## Debug Panel Reference

**Connection Section:**
- **Mode**: Host or Guest
- **WebSocket**: Connected/Disconnected/Not initialized
- **Polling**: Active/Inactive

**Party State Section:**
- **Code**: Current party code
- **Status**: active/ended/expired
- **Guests**: Number of guests in party

**Playback Section (Guest):**
- **Track**: Current track filename
- **Audio Ready**: Whether audio element is loaded
- **Last Event**: Last playback event (PLAY/PAUSE/TRACK_SELECTED)

**Recent Logs:**
- Shows last 20 events
- Timestamps included
- Auto-scrolls to latest

---

## Expected Success Criteria

All 8 tests must pass:
1. ✅ Guest joins → host sees guest joined
2. ✅ Host presses play → guest receives "Track started"
3. ✅ Guest taps play → audio plays on guest
4. ✅ Emoji sent from guest → appears on host
5. ✅ Comment from guest → appears on host
6. ✅ Host changes playback state → guest updates
7. ✅ DJ messages appear on both devices
8. ✅ Party ends → both phones show ended state and stop audio

---

## Next Steps After Testing

1. Document any issues found
2. Test with different browsers (Chrome, Safari, Firefox)
3. Test with poor network conditions
4. Test with multiple guests (3-5 devices)
5. Verify behavior on different screen sizes
6. Check battery usage during extended sessions

---

## Support

If issues persist:
1. Check server logs for errors
2. Verify Redis is running and connected
3. Check browser compatibility
4. Review browser console for JavaScript errors
5. Test with a different public audio URL
6. Try restarting both server and phones
