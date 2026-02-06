# Manual Test Checklist for Party Join Regression Fixes

## Pre-Test Setup
1. Start server: `npm run dev`
2. Open browser to `http://localhost:3000` (or appropriate port)
3. Open DevTools Console to monitor WebSocket messages

## Test 1: WebSocket Connection on App Start
**Expected**: WebSocket connects automatically when app loads

### Steps:
1. Load the app in browser
2. Check DevTools Console

### Pass Criteria:
- [ ] Console shows: `[WS] Connecting to: ws://localhost:XXXX`
- [ ] Console shows: `[WS] Connected successfully`
- [ ] No WebSocket connection errors

---

## Test 2: Host Creates Party and Joins via WebSocket
**Expected**: Host creates party and automatically joins via WebSocket

### Steps:
1. Enter DJ name (e.g., "DJ Test")
2. Click "Start Party" or equivalent
3. Check DevTools Console
4. Check UI shows party code and host view

### Pass Criteria:
- [ ] Party created successfully (see party code)
- [ ] Console shows WebSocket JOIN message sent: `[WS] Sending message: {t: "JOIN", code: "XXXXX", ...}`
- [ ] Console shows JOINED response: `[WS] Received message: {"t":"JOINED","code":"XXXXX"}`
- [ ] Console shows ROOM message with host in members: `[WS] Received message: {"t":"ROOM",...}`
- [ ] Host UI displays correctly (shows party code, DJ controls, etc.)

---

## Test 3: Guest Joins → Appears on Host Screen
**Expected**: Guest joins party and appears in host's member list

### Steps:
1. Keep host browser open from Test 2
2. Open new browser tab/window (incognito recommended)
3. Enter guest name (e.g., "Guest1")
4. Enter party code from host
5. Click "Join Party"
6. Check both host and guest DevTools Consoles

### Pass Criteria on Guest:
- [ ] Guest successfully joins (HTTP response OK)
- [ ] Console shows WebSocket JOIN sent
- [ ] Console shows JOINED response
- [ ] Guest view shows "Connected" or party UI

### Pass Criteria on Host:
- [ ] Console shows ROOM update with new guest
- [ ] Host UI updates to show guest in members list
- [ ] Guest name "Guest1" appears on host screen
- [ ] Member count updates (e.g., "2 members")

---

## Test 4: Guest Cannot Play Independently (DJ Authority)
**Expected**: Only DJ can start playback; guest play button is disabled/hidden

### Steps:
1. With guest still connected from Test 3
2. On guest browser, try to locate a "Play" button
3. If Play button exists, try clicking it

### Pass Criteria:
- [ ] Guest does NOT have a working Play button, OR
- [ ] Guest Play button is disabled, OR
- [ ] Guest Play button shows "Waiting for DJ to sync"
- [ ] Guest audio does NOT start playing independently

---

## Test 5: DJ Plays → Guest Receives Sync
**Expected**: DJ presses Play, guest receives sync messages and plays audio

### Prerequisites:
- Host has music file loaded (upload a music file if needed)
- Guest is connected

### Steps:
1. On host browser, upload a music file (or ensure one is loaded)
2. On host browser, click "Play" button
3. Check both DevTools Consoles
4. Check guest audio playback status

### Pass Criteria on Host:
- [ ] Console shows HOST_PLAY message sent
- [ ] Host audio starts playing

### Pass Criteria on Guest:
- [ ] Console shows PREPARE_PLAY received: `{"t":"PREPARE_PLAY",...}`
- [ ] Console shows PLAY_AT received: `{"t":"PLAY_AT",...}`
- [ ] Guest audio starts playing (synchronized with host)
- [ ] Guest UI updates to show "Playing" or similar status
- [ ] No "Waiting for DJ to sync" message stuck on screen

---

## Test 6: Sync Quality Check
**Expected**: Guest audio is synchronized within ~1 second of host

### Steps:
1. While both host and guest are playing from Test 5
2. Listen to audio on both devices (if possible) or compare timestamps
3. Check if guest is in sync with host

### Pass Criteria:
- [ ] Guest plays within 1 second of host starting
- [ ] Guest position stays synchronized during playback
- [ ] No persistent drift or desync issues

---

## Test 7: FREE Tier Functionality (2 Phone Limit)
**Expected**: FREE tier supports basic join and sync, limited to 2 phones

### Steps:
1. Create new party with FREE tier settings
2. First guest joins successfully
3. Try to add a second guest

### Pass Criteria:
- [ ] Host can create party on FREE tier
- [ ] First guest can join successfully
- [ ] Join and sync work normally for first guest
- [ ] Second guest is BLOCKED with capacity message ("Free parties are limited to 2 phones")

---

## Test 8: PARTY_PASS Tier Functionality
**Expected**: PARTY_PASS tier supports messaging features

### Steps:
1. Create party with PARTY_PASS tier enabled
2. Guest joins
3. Try sending messages/emojis

### Pass Criteria:
- [ ] Host can create PARTY_PASS party
- [ ] Guest can join successfully
- [ ] Messaging UI is visible/enabled
- [ ] Messages/emojis can be sent (if implemented)
- [ ] Party supports up to 4 phones (if you have 4 devices available)

---

## Test 9: PRO Tier Functionality
**Expected**: PRO tier supports advanced features

### Steps:
1. Create party with PRO tier enabled
2. Guest joins
3. Check available features

### Pass Criteria:
- [ ] Host can create PRO party
- [ ] Guest can join successfully
- [ ] Advanced features are visible (if implemented)
- [ ] Party supports more than 2 phones (up to 10)

---

## Test 10: WebSocket Reconnection
**Expected**: WebSocket reconnects if connection is lost

### Steps:
1. With active party (host + guest)
2. Simulate network interruption (disable network briefly or close DevTools Network tab)
3. Re-enable network
4. Check if WebSocket reconnects

### Pass Criteria:
- [ ] Console shows reconnection attempt
- [ ] WebSocket reconnects successfully
- [ ] Party state is restored (members still visible)
- [ ] Sync functionality still works after reconnection

---

## Summary

### Tests Passed: ____ / 10

### Critical Issues Found:
- (List any blocking issues)

### Minor Issues Found:
- (List any non-blocking issues)

### Notes:
- (Any additional observations)

---

## Automated Test Results
```
npm test
```

**Expected**: 240 passed, 4 failed (auth.test.js only)

**Note**: The 4 auth.test.js failures are expected because JWT_SECRET is not set in test environment, putting auth system in AUTH_DISABLED mode. These failures are NOT related to party join/sync functionality and represent a known testing environment limitation.

Actual: ________________

---

## Sign-Off

**Tester**: _______________  
**Date**: _______________  
**Result**: ☐ PASS  ☐ FAIL  ☐ PARTIAL
