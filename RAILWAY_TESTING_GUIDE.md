# Railway Production Testing Guide

This guide provides step-by-step instructions for testing the party join fix on Railway production environment.

## Prerequisites

- Two devices (Phone A and Phone B) OR two browser windows in incognito mode
- Railway deployment URL
- Redis add-on configured on Railway

## Test Scenarios

### Test 1: Same Wi-Fi Network Join

**Goal**: Verify that guests can join parties when both devices are on the same Wi-Fi network.

**Steps**:
1. **Phone A (Host)**:
   - Open Railway app URL in browser
   - Click "Create Party"
   - Note the 6-character party code displayed
   - Wait for confirmation that party is created

2. **Phone B (Guest)**:
   - Open Railway app URL in browser
   - Enter the party code from Phone A
   - Click "Join Party"
   - Should see "Connecting to party..." message
   - Should successfully join within 5 seconds

**Expected Result**: Guest joins successfully, no 404 or 503 errors.

---

### Test 2: Mobile Hotspot Join

**Goal**: Verify that guests can join parties when on different networks.

**Steps**:
1. **Phone A (Host)**:
   - Connect to Wi-Fi network
   - Open Railway app URL
   - Click "Create Party"
   - Note the party code

2. **Phone B (Guest)**:
   - Connect to mobile hotspot (different network)
   - Open Railway app URL
   - Enter the party code
   - Click "Join Party"

**Expected Result**: Guest joins successfully despite being on different network.

---

### Test 3: Debug Endpoint Verification

**Goal**: Verify that the debug endpoint can be used to diagnose issues.

**Steps**:
1. Create a party (note the code, e.g., `ABC123`)
2. Open browser developer tools (F12)
3. In console, run:
   ```javascript
   fetch('/api/party/ABC123/debug')
     .then(r => r.json())
     .then(console.log)
   ```

**Expected Response**:
```json
{
  "exists": true,
  "ttlSeconds": 7199,
  "redisConnected": true,
  "instanceId": "server-xxxxx"
}
```

---

### Test 4: Cross-Instance Reliability

**Goal**: Verify that parties work across multiple Railway instances.

**Steps**:
1. **Phone A**: Create party, note code
2. **Phone B**: Immediately try to join
3. **Repeat 10 times** with different parties
4. **Track success rate**

**Expected Result**: 100% success rate (10/10 joins work)

---

### Test 5: Error Handling

**Goal**: Verify that error messages are user-friendly.

**Steps**:
1. Try to join with invalid code `NOEXST`
2. Observe error message

**Expected Error**: "Party expired or server still syncing. Ask host to restart party."

---

### Test 6: Party Code Normalization

**Goal**: Verify that party codes work with different casings and whitespace.

**Steps**:
1. Create party (code: `ABC123`)
2. Try joining with:
   - ` abc123 ` (lowercase with spaces)
   - `ABC123` (uppercase)
   - `  ABC123  ` (with whitespace)

**Expected Result**: All variations should work.

---

## Debugging Failed Tests

If any test fails, collect this information:

1. **Check Redis Connection**:
   ```
   GET https://your-app.railway.app/health
   ```
   Should show `"redis": "ready"`

2. **Check Party in Redis** (use debug endpoint):
   ```
   GET https://your-app.railway.app/api/party/PARTYCODE/debug
   ```

3. **Check Browser Console**:
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for error messages

4. **Check Railway Logs**:
   - Go to Railway dashboard
   - Click on your service
   - Check "Deployments" → "Logs"
   - Look for `[HTTP] POST /api/create-party` and `[HTTP] POST /api/join-party` entries

## Success Criteria

✅ **All 6 tests pass**
✅ **No 404 errors when joining valid parties**
✅ **No 503 errors (except when Redis is actually down)**
✅ **Debug endpoint shows `redisConnected: true`**
✅ **Party codes work regardless of casing or whitespace**

## Common Issues

### Issue: "Server not ready - Redis unavailable"
**Solution**: Check that Redis add-on is properly configured on Railway. Verify `REDIS_URL` environment variable is set.

### Issue: "Party not found or expired" immediately after creation
**Solution**: This indicates the party creation did not complete successfully. Check Railway logs for Redis write errors.

### Issue: Intermittent 404s
**Solution**: If this still occurs, it may indicate:
- Redis network latency issues
- Need to increase retry attempts or backoff timing
- Check Railway logs for specific instance IDs to see if routing is an issue

## Rollback Plan

If the fix doesn't work:
1. Revert to previous deployment in Railway
2. Check if the issue was present before this fix
3. Gather logs and error messages for further debugging
