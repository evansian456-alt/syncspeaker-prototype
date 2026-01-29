# SyncSpeaker Test Plan

This document outlines the step-by-step manual test cases for the SyncSpeaker prototype.

## Prerequisites
- Two or more devices (phones/computers) on the same network
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Railway deployment URL or local server running

## Test Cases

### Test Case 1: Load Homepage
**Objective**: Verify the homepage loads correctly

**Steps**:
1. Navigate to the application URL
2. Wait for the page to load completely

**Expected Results**:
- Page loads without errors
- "SyncSpeaker" branding is visible in the header
- Two sections are visible: "Start a party (Host)" and "Join a party (Friend)"
- "Support mode (Pro)" checkbox is present at the bottom
- Free plan pill shows "Free · 2 phones"

**Pass/Fail**: ___

---

### Test Case 2: Start Party - Success Flow
**Objective**: Verify that starting a party works correctly

**Steps**:
1. Load the homepage
2. (Optional) Enter a custom name in "Your name" field (default: "Host")
3. (Optional) Select a different audio source (default: "On this phone (best)")
4. Click "Start party" button

**Expected Results**:
- Button text changes to "Starting..." and button is disabled during creation
- Success message appears: "Party started 🎉" with the party code
- UI automatically transitions to the party screen
- Party code is displayed prominently (6-character alphanumeric code)
- Party code section is scrolled into view and highlighted
- Host status is shown in party meta information
- Friends connected section is visible
- Console shows log: `[App] startParty() - Start party button clicked`
- Console shows log: `[App] Party created successfully: [CODE]`

**Pass/Fail**: ___

---

### Test Case 3: Refresh After Creating Party
**Objective**: Document expected behavior after page refresh

**Steps**:
1. Create a party (follow Test Case 2)
2. Note the party code
3. Refresh the browser page

**Expected Results**:
- ⚠️ **Current Behavior**: Session is not persisted
- User returns to the home screen
- Party state is lost (this is expected behavior in the current prototype)
- User needs to create a new party or join an existing one

**Note**: State persistence is intentionally not implemented in this prototype. Each browser session starts fresh.

**Pass/Fail**: ___

---

### Test Case 4: Join Party - Success Flow
**Objective**: Verify that joining a party works correctly

**Steps**:
1. On Device A: Create a party and note the party code
2. On Device B: Load the homepage
3. Enter the party code in the "Party code" field
4. (Optional) Enter a custom name in "Your name" field (default: "Guest")
5. Click "Join party" button

**Expected Results**:
- Button text changes to "Joining..." and button is disabled during join
- Success message appears: "Joined party 🎉" with the party code
- UI automatically transitions to the party screen
- Party code is displayed and scrolled into view
- Guest can see all party members including the host
- On Device A (host), the new guest appears in the friends list
- Console shows log: `[App] joinParty() - Join party button clicked`
- Console shows log: `[App] Joined party successfully: [CODE]`

**Pass/Fail**: ___

---

### Test Case 5: Join Party - Invalid Code Error
**Objective**: Verify error handling for invalid party codes

**Steps**:
1. Load the homepage
2. Enter an invalid/non-existent party code (e.g., "INVALID")
3. Click "Join party" button

**Expected Results**:
- Button shows "Joining..." briefly
- Error message appears on screen: "Party not found"
- User remains on the home screen
- Join button is re-enabled and shows "Join party" again
- Console shows error log: `[App] Error from server: Party not found`

**Pass/Fail**: ___

---

### Test Case 6: Join Party - Empty Code Error
**Objective**: Verify validation for empty party code

**Steps**:
1. Load the homepage
2. Leave the "Party code" field empty
3. Click "Join party" button

**Expected Results**:
- Error message appears: "Please enter a party code"
- User remains on the home screen
- No WebSocket message is sent
- Button remains enabled

**Pass/Fail**: ___

---

### Test Case 7: Network Offline Behavior - Connection Loss
**Objective**: Verify behavior when network connection is lost

**Steps**:
1. Create or join a party successfully
2. Simulate network disconnection (airplane mode or disable network)
3. Wait for WebSocket timeout

**Expected Results**:
- Toast notification appears: "Disconnected"
- User is automatically returned to home screen
- Party state is cleared
- Console shows: `[WS] Connection closed`

**Pass/Fail**: ___

---

### Test Case 8: Network Offline Behavior - Start While Offline
**Objective**: Verify behavior when attempting to start party while offline

**Steps**:
1. Disconnect from network (airplane mode or disable network)
2. Load the homepage (should load from cache)
3. Click "Start party" button

**Expected Results**:
- WebSocket connection fails to establish
- Error message appears: "Not connected. Please refresh the page."
- User remains on home screen
- Button is not disabled permanently
- Console shows error: `[App] startParty() - WebSocket not connected`

**Pass/Fail**: ___

---

### Test Case 9: Multiple Party Members
**Objective**: Verify that multiple guests can join the same party

**Steps**:
1. On Device A: Create a party and note the code
2. On Device B: Join the party with the code
3. On Device C: Join the same party with the same code
4. Verify all members appear on all devices

**Expected Results**:
- All devices show all party members (host + all guests)
- Member list updates in real-time on all devices
- Each member shows their name and Free/Pro status
- Connection strength indicator updates based on number of members

**Pass/Fail**: ___

---

### Test Case 10: Health Endpoint
**Objective**: Verify the health check endpoint

**Steps**:
1. Navigate to `/health` endpoint

**Expected Results**:
- HTTP 200 status code
- JSON response: `{"status":"ok"}`

**Pass/Fail**: ___

---

### Test Case 11: Static Assets
**Objective**: Verify all static files are served correctly

**Steps**:
1. Load the homepage
2. Check browser developer tools Network tab

**Expected Results**:
- `/` returns 200 and serves index.html
- `/app.js` returns 200
- `/styles.css` returns 200
- No 404 errors in console

**Pass/Fail**: ___

---

## Automated Test Coverage

The automated smoke test (`smoke-test.js`) covers:
- ✅ GET / returns 200 and includes "SyncSpeaker"
- ✅ GET /health returns 200 with JSON `{"status":"ok"}`

## Notes

- **State Persistence**: The current prototype does NOT persist state across page refreshes. This is intentional for simplicity.
- **WebSocket Connection**: The app automatically establishes WebSocket connection on page load
- **Error Handling**: All user-facing errors are now displayed on-screen (not just in console)
- **Loading States**: All async operations (create/join) show loading states

## Testing on Railway

When testing the Railway deployment:
1. Use the Railway-provided URL (e.g., `https://your-app.up.railway.app`)
2. Test with at least 2 devices on different networks
3. Verify WebSocket connections work over WSS (HTTPS)
4. Check Railway logs for server-side errors and request logging

## Known Limitations

1. No persistent storage - parties exist only in server memory
2. If server restarts, all parties are lost
3. No reconnection logic - if WebSocket drops, user must refresh
4. Maximum party limits enforced (based on Pro status)
