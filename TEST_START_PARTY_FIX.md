# Test Plan: Start Party Hang Fix

## Overview
This test plan validates the fixes for the "Start Party" hang issue, including timeout handling, fallback mechanism, and debug panel.

## Requirements Tested

### 1. Health Endpoint
- **Requirement**: GET /health returns 200 JSON {status:"ok"}
- **Test**: `curl http://localhost:8080/health`
- **Expected**: `{"status":"ok"}` with HTTP 200

### 2. Start Party Flow with Server Success
**Steps:**
1. Open app at http://localhost:8080
2. Click "🎉 Start Party" on landing page
3. Click "Start party" button

**Expected Results:**
- ✅ Button immediately shows "Creating party..."
- ✅ Button is disabled during processing
- ✅ Status messages appear in sequence:
  - "Creating party…"
  - "Calling server…"
  - "Server responded…"
  - "Server ready"
  - "Creating party via WebSocket…"
- ✅ Debug panel updates:
  - Last endpoint: "POST /api/create-party"
  - Last error: "None"
- ✅ Party screen appears with 6-character code (e.g., "EIUILZ")
- ✅ Toast notification: "Party created: [CODE]"
- ✅ Button re-enables and text resets to "Start party"
- ✅ **NEVER hangs silently**

### 3. Start Party with Server Timeout
**Steps:**
1. Stop the server: `kill [PID]`
2. Open app (if already open, it should show WebSocket disconnect)
3. Click "Start party" button

**Expected Results:**
- ✅ After 5 seconds maximum, timeout error appears
- ✅ Status message: "Server not responding. Try again."
- ✅ Debug panel shows:
  - Last endpoint: "POST /api/create-party"
  - Last error: "POST /api/create-party (timeout)"
- ✅ **FALLBACK ACTIVATES**: Party code generated client-side
- ✅ Party screen appears with offline warning
- ✅ Toast: "Offline mode: party created locally (some features may not sync)."
- ✅ Party meta shows: "⚠️ Offline mode: some features may not sync"
- ✅ Button always re-enables
- ✅ **NEVER hangs indefinitely**

### 4. Start Party with Server Error (500)
**Steps:**
1. Modify server.js to return 500 error (optional)
2. Click "Start party" button

**Expected Results:**
- ✅ Error message: "Server error: 500 - [error details]"
- ✅ Debug panel shows error
- ✅ **FALLBACK ACTIVATES**: Client-side party code
- ✅ Button re-enables
- ✅ Offline mode warning displayed

### 5. Join Party Flow with Server Success
**Steps:**
1. Create a party successfully (get party code)
2. Click "🎵 Join Party"
3. Enter valid party code
4. Click "Join party"

**Expected Results:**
- ✅ Button shows "Joining..."
- ✅ Button disabled during processing
- ✅ Status messages:
  - "Joining party…"
  - "Calling server…"
  - "Server responded…"
- ✅ Debug panel updates:
  - Last endpoint: "POST /api/join-party"
  - Last error: "None"
- ✅ Party screen appears
- ✅ Button always re-enables (via finally block)

### 6. Join Party with Invalid Code
**Steps:**
1. Click "Join party"
2. Enter "INVALID" as code
3. Click "Join party"

**Expected Results:**
- ✅ Error message: "Party not found" (red text)
- ✅ Debug panel shows:
  - Last endpoint: "POST /api/join-party"
  - Last error: "Party not found"
- ✅ Button re-enables
- ✅ Toast notification with error

### 7. Join Party with Timeout
**Steps:**
1. Stop server
2. Enter any code
3. Click "Join party"

**Expected Results:**
- ✅ After 5 seconds, timeout error
- ✅ Message: "Server not responding. Try again."
- ✅ Debug panel shows timeout
- ✅ Button re-enables

### 8. Multiple Click Prevention
**Steps:**
1. Click "Start party" button
2. Immediately click again multiple times

**Expected Results:**
- ✅ Button disabled after first click
- ✅ Additional clicks ignored
- ✅ Console log: "Button already processing, ignoring click"
- ✅ Only one API request sent

### 9. Debug Panel Visibility
**Steps:**
1. Navigate through app

**Expected Results:**
- ✅ Debug panel always visible in bottom-right
- ✅ Updates with each API call
- ✅ Shows last endpoint and error
- ✅ Has aria-hidden="true" for accessibility
- ✅ Mobile responsive (full width on small screens)

### 10. Offline Mode State Reset
**Steps:**
1. Create party in offline mode (server down)
2. Click "Leave" button
3. Try to join a real party

**Expected Results:**
- ✅ `state.offlineMode` is reset to false
- ✅ No lingering offline mode state
- ✅ Can join real parties normally

## API Endpoints Tested

### POST /api/create-party
```bash
curl -X POST http://localhost:8080/api/create-party \
  -H "Content-Type: application/json"
```
**Response (Success):**
```json
{
  "partyCode": "ABC123",
  "hostId": 1
}
```

### POST /api/join-party
```bash
curl -X POST http://localhost:8080/api/join-party \
  -H "Content-Type: application/json" \
  -d '{"partyCode":"ABC123"}'
```
**Response (Success):**
```json
{
  "ok": true
}
```
**Response (Not Found):**
```json
{
  "error": "Party not found"
}
```

### GET /health
```bash
curl http://localhost:8080/health
```
**Response:**
```json
{
  "status": "ok"
}
```

## Success Criteria

✅ **NEVER hangs silently** - button always re-enables within 5 seconds  
✅ Visible status messages at each step  
✅ 5-second timeout protection  
✅ Instant fallback to offline mode on failure  
✅ Clear error messages with actionable feedback  
✅ Debug panel tracks all API calls and errors  
✅ Button state properly managed (disabled/enabled)  
✅ /health endpoint returns 200 JSON  
✅ No XSS vulnerabilities  
✅ No memory leaks from state  
✅ Consistent error handling (Create and Join)  

## Browser Testing

Tested on:
- ✅ Chrome/Chromium (Playwright)
- ✅ Node.js server (Express)

Should also work on:
- Firefox
- Safari
- Edge
- Mobile browsers

## Known Limitations

1. **Offline mode**: WebSocket features won't work in offline fallback mode
2. **Party code collisions**: Client-side codes use Math.random() (acceptable for fallback)
3. **Debug panel**: Always visible in prototype (could be hidden in production)

## Regression Testing

Ensure existing features still work:
- ✅ Party creation via WebSocket
- ✅ Music file selection
- ✅ Party Pass functionality
- ✅ Member management
- ✅ Pro/Free tier features
