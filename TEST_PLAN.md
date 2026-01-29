# SyncSpeaker Prototype - Functional Test Plan

## Overview
This test plan covers all user flows for the SyncSpeaker browser prototype deployed on Railway.

## Prerequisites
- Railway deployment URL (e.g., `https://your-app.railway.app`)
- 2 mobile phones or devices on the same network
- Modern browser (Chrome, Safari, Firefox)

---

## Test Cases

### 1. Homepage Load Test
**Objective:** Verify the homepage loads correctly with all resources

**Steps:**
1. Open the Railway URL in a browser
2. Wait for page to fully load

**Expected Results:**
- ✅ Page loads without 404 errors
- ✅ Connection status shows "Connected" (green dot)
- ✅ "Free · up to 2 phones" pill is visible
- ✅ Both "Start party" and "Join party" sections are visible
- ✅ Debug button (🐛) is visible in bottom-right corner

**HTTP Logs to Check:**
- `GET /` → 200 OK
- `GET /app.js` → 200 OK
- `GET /styles.css` → 200 OK
- `WebSocket` connection → Established

---

### 2. Start Party (Host Flow)
**Objective:** Create a new party as host

**Steps:**
1. On Device 1, open Railway URL
2. Enter your name (e.g., "Alice")
3. Select audio source: "On this phone (best)"
4. Click "Start party" button

**Expected Results:**
- ✅ Toast message: "Party created: [CODE]"
- ✅ View switches to "Host party" screen
- ✅ 6-character party code is displayed (e.g., "QHVTFL")
- ✅ Connection strength shows score (e.g., 94/100)
- ✅ Host appears in "Friends connected" list
- ✅ "Copy" button is available

**Debug Console Should Show:**
```
Start party button clicked
Creating party: name=Alice, source=local, isPro=false
Sending: CREATE
Received: {"t":"CREATED","code":"XXXXXX"}
Party created with code: XXXXXX
Room update: 1 members
```

**HTTP Logs:**
- WebSocket message: `CREATE` → Response: `CREATED`
- WebSocket message: `ROOM` with 1 member

---

### 3. Join Party (Guest Flow)
**Objective:** Join an existing party from second device

**Steps:**
1. On Device 2, open Railway URL
2. In "Join a party" section, enter party code from Device 1
3. Enter your name (e.g., "Bob")
4. Click "Join party" button

**Expected Results:**
- ✅ Toast message: "Joined party [CODE]"
- ✅ View switches to "Guest party" screen
- ✅ Same party code is displayed
- ✅ Connection strength updates with 2 members
- ✅ Both Device 1 and Device 2 see both members in list
- ✅ Host can see "Remove" button next to guest

**Debug Console Should Show:**
```
Join party button clicked
Joining party: code=XXXXXX, name=Bob
Sending: JOIN
Received: {"t":"JOINED","code":"XXXXXX"}
Joined party XXXXXX
Room update: 2 members
```

**HTTP Logs:**
- WebSocket message: `JOIN` → Response: `JOINED`
- WebSocket message: `ROOM` with 2 members

---

### 4. Add Phone Until Free Limit
**Objective:** Test free user limit (2 phones)

**Steps:**
1. With 1 member in party, click "Add another phone"
2. Observe the message

**Expected Results:**
- ✅ Toast: "Open this link on another phone and tap Join"
- ✅ No paywall appears (within free limit)

**Steps (after 2nd member joins):**
3. With 2 members in party, click "Add another phone"

**Expected Results:**
- ✅ Paywall modal appears: "Support SyncSpeaker"
- ✅ Lists Pro features (No ads, 3+ phones, etc.)
- ✅ "Support mode (Pro)" and "Not now" buttons visible

---

### 5. Promo Code Flow
**Objective:** Unlock Pro features with promo code

**Steps:**
1. Click "Have a promo code?" button
2. Enter one of these valid codes:
   - `SS-PARTY-A9K2`
   - `SS-PARTY-QM7L`
   - `SS-PARTY-Z8P3`
3. Click "Unlock this party"

**Expected Results:**
- ✅ Toast: "🎉 Pro unlocked for this party!"
- ✅ Modal closes
- ✅ Pill changes to "Supporter · party unlocked"
- ✅ User badge changes from "Free" to "Pro"
- ✅ "Show ad (Free)" button becomes disabled
- ✅ Ad text changes to "No ads (Pro)"

**Debug Console Should Show:**
```
Sending: SET_PRO
Received: {"t":"ROOM","snapshot":{"members":[...isPro:true...]}}
Room update: 1 members
```

**Invalid Code Test:**
- Enter invalid code (e.g., "INVALID")
- Click "Unlock this party"
- ✅ Alert: "Invalid or expired promo code."

---

### 6. External Audio Source Selection
**Objective:** Test different audio source options

**Steps:**
1. On homepage, select "Another app (timing only)" from dropdown
2. Click "Start party"

**Expected Results:**
- ✅ Party created successfully
- ✅ Connection strength score is lower (penalty for external source)
- ✅ Recommended phones reduced (e.g., 4 instead of 6)
- ✅ Party metadata shows "Source: external"

**Repeat with "Mic (for talking)":**
- ✅ Party created
- ✅ "Show ad" button is disabled
- ✅ Ad text: "No ads in mic mode"
- ✅ Party metadata shows "Source: mic"

---

### 7. Speaker Connect Toggle
**Objective:** Test speaker feature (Pro only)

**Steps (without Pro):**
1. Create party as free user
2. Click "Use a speaker" button

**Expected Results:**
- ✅ Paywall modal appears

**Steps (with Pro):**
3. Enable Pro mode (promo code or toggle)
4. Click "Use a speaker" button

**Expected Results:**
- ✅ Speaker modal appears
- ✅ Message about Bluetooth/AUX connection
- ✅ "Got it" button closes modal

---

### 8. Playback Controls (Simulated)
**Objective:** Test demo playback controls

**Steps:**
1. In a party, click "Play" button

**Expected Results:**
- ✅ Toast: "Play (simulated)"
- ✅ Button remains enabled

**Steps:**
2. Click "Pause" button

**Expected Results:**
- ✅ Toast: "Pause (simulated)"

**Steps:**
3. As free user, click "Show ad (Free)" button

**Expected Results:**
- ✅ Toast: "Ad (20s) — supporters remove ads"
- ✅ "Play" and "Pause" buttons become disabled
- ✅ After 20 seconds:
  - Toast: "Ad finished"
  - Buttons re-enabled

---

### 9. Host Kick Member
**Objective:** Verify host can remove members

**Steps:**
1. Host has party with at least 1 guest
2. Host clicks "Remove" button next to guest

**Expected Results:**
- ✅ Guest is removed from members list on host
- ✅ Guest device shows toast: "Removed by host"
- ✅ Guest device returns to homepage
- ✅ Room updates on all remaining devices

**Debug Console (Guest) Should Show:**
```
Received: {"t":"KICKED"}
Kicked from party
```

---

### 10. Host Leave Party
**Objective:** Verify party ends when host leaves

**Steps:**
1. Host has party with guests
2. Host clicks "Leave" button

**Expected Results:**
- ✅ All guests see toast: "Party ended (host left)"
- ✅ All guests return to homepage
- ✅ Party is deleted from server

**Debug Console (Guest) Should Show:**
```
Received: {"t":"ENDED"}
Party ended by host
WebSocket connection closed
```

---

### 11. Copy Party Code
**Objective:** Test clipboard functionality

**Steps:**
1. In a party, click "Copy" button

**Expected Results:**
- ✅ Toast: "Copied code"
- ✅ Party code is in clipboard (paste to verify)

**If permission denied:**
- ✅ Toast: "Copy failed (permission)"

---

### 12. Debug Panel
**Objective:** Verify debug console works

**Steps:**
1. Click debug button (🐛) in bottom-right
2. Perform any action (e.g., start party)
3. Observe debug panel

**Expected Results:**
- ✅ Debug panel opens
- ✅ Shows timestamped logs in reverse chronological order
- ✅ Logs are color-coded:
  - Blue: Info
  - Green: Success
  - Orange: Warning
  - Red: Error
- ✅ Shows WebSocket messages
- ✅ Shows user actions
- ✅ "×" button closes panel

---

### 13. Connection Status Indicator
**Objective:** Verify connection status display

**Expected Results:**
- ✅ On load: "Connecting..." with pulsing yellow dot
- ✅ When connected: "Connected" with green dot
- ✅ If disconnected: "Disconnected" with red dot
- ✅ Status updates in real-time

---

### 14. API Endpoint Tests
**Objective:** Verify API endpoints respond correctly

**Health Check:**
```bash
curl https://your-app.railway.app/health
```
**Expected:** `{"status":"ok"}` with HTTP 200

**Ping Check:**
```bash
curl https://your-app.railway.app/api/ping
```
**Expected:** `{"message":"pong","timestamp":1234567890}` with HTTP 200

---

## Debug Checklist (If Issues Occur)

### Issue: "Nothing happens" when clicking buttons
**Check:**
- [ ] Open browser console (F12)
- [ ] Look for JavaScript errors
- [ ] Check Network tab for failed requests
- [ ] Verify WebSocket connection is established
- [ ] Open debug panel (🐛) to see app logs

### Issue: Connection status shows "Disconnected"
**Check:**
- [ ] Railway deployment is running
- [ ] No firewall blocking WebSocket connections
- [ ] Browser supports WebSocket
- [ ] Check Railway logs for server errors

### Issue: Party code doesn't work
**Check:**
- [ ] Code is entered correctly (uppercase, 6 characters)
- [ ] Party still exists (host didn't leave)
- [ ] Both devices connected to server
- [ ] Check debug panel for error messages

### Issue: Promo code doesn't work
**Check:**
- [ ] Code is exact match (case-sensitive)
- [ ] Using one of the valid codes:
  - SS-PARTY-A9K2
  - SS-PARTY-QM7L
  - SS-PARTY-Z8P3
- [ ] Code not already used in this party session

### Issue: UI looks broken/unstyled
**Check:**
- [ ] Network tab shows `styles.css` loaded (200 OK)
- [ ] Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
- [ ] Clear browser cache

### Issue: WebSocket won't connect
**Check:**
- [ ] Railway app is deployed and running
- [ ] Server logs show `Server running on http://0.0.0.0:[PORT]`
- [ ] No proxy/VPN blocking connections
- [ ] Try different network

---

## Railway Deployment Verification

### Server Configuration Checklist
- [x] Server listens on `process.env.PORT` ✓
- [x] Server binds to `0.0.0.0` ✓
- [x] CommonJS (`require`) used consistently ✓
- [x] Static files served at root (`/`) ✓
- [x] WebSocket upgrade handled ✓
- [x] Health endpoint (`/health`) responds ✓
- [x] Ping endpoint (`/api/ping`) responds ✓

### Expected Railway Logs
```
Server running on http://0.0.0.0:8080
[WS] Client 1 connected
[Party] Created party ABC123 by client 1
[WS] Client 2 connected
[Party] Client 2 joined party ABC123
```

---

## Browser Compatibility
✅ **Tested Browsers:**
- Chrome 90+ (Desktop & Mobile)
- Safari 14+ (Desktop & Mobile)
- Firefox 88+ (Desktop & Mobile)
- Edge 90+

⚠️ **Limitations:**
- WebSocket required (works on all modern browsers)
- Clipboard API may require HTTPS for copy function
- Audio playback is simulated (not actual audio sync)

---

## Performance Metrics
- Homepage load: < 2 seconds
- WebSocket connection: < 1 second
- Party creation: < 500ms
- Join party: < 500ms
- Room updates: < 200ms

---

## Security Notes
- Party codes are 6 characters (36^6 = 2.1 billion combinations)
- Codes generated server-side with collision detection
- No authentication required (prototype)
- Input sanitized (names limited to 50 characters)
- WebSocket messages validated

---

## Support Contact
If you encounter issues not covered in this test plan:
1. Check Railway logs
2. Review browser console
3. Use debug panel (🐛) to inspect app state
4. Document exact steps to reproduce
5. Note browser version and device type
