# Test Steps for Start Party Fix

## Overview
This PR fixes the "Start Party" button hang issue by:
- Calling the `/api/create-party` endpoint with 5-second timeout
- Adding visible status messages throughout the process
- Implementing proper error handling with AbortController
- Displaying the party code after successful creation

## Test Cases

### 1. Successful Party Creation (Happy Path)
**Steps:**
1. Open the app at `http://localhost:8080` or your Railway URL
2. Click "🎉 Start Party" button on the landing page
3. On the home screen, optionally change the host name
4. Click "Start party" button

**Expected Results:**
- Button text changes to "Creating party..."
- Status messages appear below the button in sequence:
  - "Start clicked"
  - "Calling server…"
  - "Server responded"
  - "Party created: [CODE]"
- Party screen appears with the party code displayed (e.g., "K60E88")
- Toast notification shows "Party created: [CODE]"
- No silent hang or freeze

**What to Look for in Railway Logs:**
```
[API] POST /api/create-party
[API] Party created: ABC123, hostId: 1
[WS] Client 1 sent: { t: 'CREATE', name: 'Host', isPro: false, source: 'local' }
[Party] Created party ABC123 by client 1
```

### 2. Invalid Party Code (Join Party Error Handling)
**Steps:**
1. Open the app
2. Click "🎵 Join Party" button on the landing page
3. Enter an invalid party code like "INVALID"
4. Click "Join party" button

**Expected Results:**
- Button text changes to "Joining..."
- Status messages appear:
  - "Joining party…"
  - "Calling server…"
  - "Server responded…"
  - "Party not found" (in red)
- Debug info shows: "Endpoint: POST /api/join-party"
- Button returns to "Join party" and is re-enabled
- Toast notification shows "Party not found"

**What to Look for in Railway Logs:**
```
[API] POST /api/join-party { partyCode: 'INVALID' }
(404 Not Found response)
```

### 3. Server Timeout Test (5-second timeout)
**Steps:**
1. Stop the server or block network access
2. Click "Start party" button

**Expected Results:**
- After 5 seconds maximum, timeout error appears
- Status message: "Server not responding. Try again."
- Button returns to "Start party" and is re-enabled
- No indefinite hang

### 4. Server Error Test
**Steps:**
1. Modify server to return 500 error (optional advanced test)
2. Click "Start party" button

**Expected Results:**
- Error message appears: "Server error: 500 - [error details]"
- Button returns to "Start party" and is re-enabled

### 5. Multiple Click Prevention
**Steps:**
1. Click "Start party" button
2. Immediately click it again multiple times while it's processing

**Expected Results:**
- Button is disabled after first click
- Additional clicks are ignored
- Console log shows: "Button already processing, ignoring click"

## Key Changes Made

### Frontend (app.js)
- **Added HTTP API health check**: Calls `/api/create-party` to verify server responsiveness before party creation
- **Implemented AbortController** for 5-second timeout on HTTP check
- **Added visible status messages**: "Start clicked", "Calling server…", "Server responded", "Server ready", "Creating party via WebSocket…"
- **Enhanced error handling** with detailed error messages
- **Proper button state management** (disabled/enabled)
- **Party creation via WebSocket**: Actual party is created via WebSocket CREATE message (preserves original architecture)

### Backend (server.js)
- Already had `/api/create-party` endpoint implemented
- Already had `/api/join-party` endpoint implemented
- Both endpoints are working correctly

## HTTP Request/Response Examples

### Create Party Request (Health Check)
```
POST /api/create-party
Content-Type: application/json
```

### Create Party Response (Health Check - Success)
```json
{
  "partyCode": "J1VQAN",
  "hostId": 1
}
```

Note: The HTTP API response is used to validate server responsiveness. The actual party creation happens via WebSocket CREATE message, which generates the final party code that users will see.

### Join Party Request
```
POST /api/join-party
Content-Type: application/json

{
  "partyCode": "J1VQAN"
}
```

### Join Party Response (Success)
```json
{
  "ok": true
}
```

### Join Party Response (Error - Party Not Found)
```json
{
  "error": "Party not found"
}
```

## Railway Deployment Notes

When deployed to Railway:
- The server listens on port 8080 by default
- WebSocket connections upgrade from HTTP
- All endpoints use relative URLs (no hardcoded localhost)
- Health check available at `/api/ping` for monitoring

## Success Criteria

✅ Button never hangs silently  
✅ Always shows either success or error within 5 seconds  
✅ Visible status messages appear during the process  
✅ Party code is displayed after successful creation  
✅ Error messages are clear and actionable  
✅ Button state is properly managed (disabled during processing)  
✅ Timeout protection prevents indefinite waiting  
