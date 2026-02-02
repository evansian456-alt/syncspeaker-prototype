# Deployment Verification Guide

## Post-Deployment Checklist for Railway

After deploying this PR to Railway, follow these steps to verify the fixes are working correctly.

---

## Step 1: Verify Server Health

### Check the /api/health Endpoint

Open your browser or use curl to check:

```bash
curl https://[your-railway-url]/api/health
```

**Expected Response (Production with Redis):**
```json
{
  "ok": true,
  "instanceId": "server-xxxxxxx",
  "redis": {
    "connected": true,
    "status": "ready",
    "mode": "required"
  },
  "timestamp": "2026-02-02T08:15:00.000Z",
  "version": "0.1.0-party-fix",
  "environment": "production"
}
```

**Key Checks:**
- ✅ `ok: true` - Server is ready to accept requests
- ✅ `redis.connected: true` - Redis is properly connected
- ✅ `redis.mode: "required"` - Server knows it's in production
- ✅ `environment: "production"` - Running in production mode
- ✅ HTTP status: `200`

**If Health Check Shows Issues:**

If `ok: false` or `redis.connected: false`:
```json
{
  "ok": false,
  "redis": {
    "connected": false,
    "status": "missing"
  }
}
```

**Actions:**
1. Check Railway Redis service is deployed and running
2. Verify `REDIS_URL` environment variable is set in Railway
3. Check Railway logs for Redis connection errors
4. Server will return HTTP 503 for create/join operations until Redis is ready

---

## Step 2: Test Party Creation (Host)

### Using Browser (Recommended)
1. Open `https://[your-railway-url]` on Phone A
2. Click "Start a Party"
3. Note the 6-character party code (e.g., `ABC123`)

### Using curl
```bash
curl -X POST https://[your-railway-url]/api/create-party \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "partyCode": "ABC123",
  "hostId": 1
}
```

**If You Get 503 Error:**
```json
{
  "error": "Server not ready - Redis unavailable",
  "details": "Multi-device party sync requires Redis. Please try again in a moment.",
  "instanceId": "server-xxxxxxx"
}
```

This means Redis is not connected. Wait 30-60 seconds for Redis to initialize and try again.

---

## Step 3: Verify Party Persistence

### Check Debug Endpoint
```bash
curl https://[your-railway-url]/api/debug/parties
```

**Expected Response:**
```json
{
  "totalParties": 1,
  "parties": [
    {
      "code": "ABC123",
      "ageMs": 5432,
      "ageMinutes": 0,
      "createdAt": 1770019941037,
      "hostId": 1,
      "guestCount": 0,
      "chatMode": "OPEN",
      "source": "redis"  // ← CRITICAL: Must be "redis", not "fallback"
    }
  ],
  "instanceId": "server-xxxxxxx",
  "redisReady": true,
  "timestamp": 1770019946469
}
```

**Critical Check:**
- ✅ `source: "redis"` or `source: "redis_only"` - Party is stored in Redis
- ❌ `source: "fallback"` - Party is only in local memory, cross-instance join will FAIL

If you see `source: "fallback"` in production, Redis is not working correctly.

---

## Step 4: Test Party Join (Guest)

### Using Browser (Real Device Test)
1. Open `https://[your-railway-url]` on Phone B (different device)
2. Enter the party code from Step 2
3. Click "Join Party"

**Expected:**
- ✅ "Joining party..." status appears
- ✅ Successfully joins within 2-5 seconds
- ✅ No errors shown

### Using curl
```bash
curl -X POST https://[your-railway-url]/api/join-party \
  -H "Content-Type: application/json" \
  -d '{"partyCode": "ABC123"}'
```

**Expected Response:**
```json
{
  "ok": true
}
```

**Common Errors and Meanings:**

**404 - Party Not Found:**
```json
{
  "error": "Party not found or expired"
}
```
- Party code is wrong, or
- Party has expired (2-hour TTL), or
- Party was created in fallback mode on different instance

**503 - Server Not Ready:**
```json
{
  "error": "Server not ready - Redis unavailable",
  "details": "Multi-device party sync requires Redis. Please try again in a moment.",
  "instanceId": "server-xxxxxxx"
}
```
- Redis is not connected
- Wait and retry

**400 - Invalid Code:**
```json
{
  "error": "Party code must be 6 characters"
}
```
- Code format is incorrect

---

## Step 5: Multi-Instance Verification (Railway Specific)

Railway may run multiple server instances. This test verifies parties are shared across instances.

### Create Multiple Parties
```bash
# Create 3 parties
for i in {1..3}; do
  curl -X POST https://[your-railway-url]/api/create-party \
    -H "Content-Type: application/json"
  sleep 1
done
```

### Check Instance Distribution
```bash
curl https://[your-railway-url]/api/debug/parties | jq '.parties[] | {code, source}'
```

**Expected:**
- All parties show `source: "redis"`
- Parties may have been created by different `instanceId` values
- All parties should be joinable regardless of instance

### Test Cross-Instance Join
1. Create party on one request (may hit instance A)
2. Join from different device/request (may hit instance B)
3. Join should succeed - proves Redis is working

---

## Step 6: Error Message Validation

### Test Invalid Code
```bash
curl -X POST https://[your-railway-url]/api/join-party \
  -H "Content-Type: application/json" \
  -d '{"partyCode": "ZZZZZ9"}'
```

**Expected:**
```json
{
  "error": "Party not found or expired"
}
```

**In Browser:**
Should show: "❌ Party not found. Check the code or ask the host to create a new party."

### Test Code Normalization
Lowercase code should work:
```bash
curl -X POST https://[your-railway-url]/api/join-party \
  -H "Content-Type: application/json" \
  -d '{"partyCode": "abc123"}'  # lowercase
```

Should automatically normalize to `ABC123` and join successfully.

---

## Step 7: Real-Device Testing (Critical)

### Same Wi-Fi Network
1. Phone A (Host): Create party
2. Phone B (Guest): Join using code
3. Verify: Join succeeds, both phones show same party code

### Mobile Hotspot
1. Phone A: Enable hotspot OR use cellular
2. Phone A: Create party
3. Phone B: Connect to Phone A's hotspot OR use different cellular
4. Phone B: Join party
5. Verify: Join succeeds (proves Redis is working, not local-only)

### Different Networks
1. Phone A: Create party on Wi-Fi
2. Phone B: Join using cellular data
3. Verify: Join succeeds

**All three scenarios MUST succeed for production readiness.**

---

## Troubleshooting

### Issue: All joins return 404

**Symptoms:**
- Party appears in `/api/debug/parties` with `source: "fallback"`
- Health check shows `redis.connected: false`

**Fix:**
1. Check Railway Redis service is deployed
2. Verify `REDIS_URL` environment variable
3. Check Railway logs for connection errors
4. Restart service if needed

### Issue: Health check returns 503

**Symptoms:**
- `/api/health` returns HTTP 503
- `ok: false` in response

**Fix:**
- Server is correctly detecting Redis is unavailable
- Wait for Redis to connect (check Railway Redis logs)
- Do NOT proceed with party creation/join until health shows `ok: true`

### Issue: Parties expire too quickly

**Symptoms:**
- Parties disappear from `/api/debug/parties` quickly

**Check:**
- Default TTL is 7200 seconds (2 hours)
- Check party `ageMs` in debug endpoint
- If expiring early, may indicate Redis issue

### Issue: "endpoint is not defined" errors

This should be FIXED by this PR. If you still see it:
1. Clear browser cache
2. Hard reload (Cmd+Shift+R or Ctrl+Shift+R)
3. Check browser console for actual error
4. Verify server is running latest code

---

## Success Criteria

✅ All checks passed if:
1. Health endpoint returns `ok: true, redis.connected: true`
2. Parties show `source: "redis"` in debug endpoint
3. Guest can join from different device
4. Guest can join from different network (hotspot/cellular)
5. Error messages are clear and helpful
6. No 503 errors during normal operation
7. No 404 errors for valid party codes

---

## Environment Variables Required

Ensure these are set in Railway:

```bash
# Required for production
REDIS_URL=redis://...  # Automatically set by Railway Redis

# Optional (auto-detected)
NODE_ENV=production    # Auto-detected if REDIS_URL or RAILWAY_ENVIRONMENT present
```

---

## Monitoring

After deployment, monitor:
- Railway logs for any Redis connection errors
- `/api/health` endpoint for readiness status
- `/api/debug/parties` for party source (should be "redis")
- User reports of join failures

---

## Rollback Plan

If issues occur:
1. Previous version used in-memory storage with fallback
2. Rollback will restore functionality but lose cross-instance sync
3. Users on same instance can still party together
4. Fix Redis configuration and redeploy
