# Railway Redis Connection Fix - Implementation Summary

## Problem Statement

Guests were unable to join parties on mobile/production Railway deployment with errors:
- **HTTP 404**: Party not found (cross-instance discovery issue)
- **HTTP 503**: Server not ready (Redis connection failures)
- **UI Message**: "Server is starting up – Redis connecting. Please wait..."

The root cause was that Railway Redis uses TLS (`rediss://` URLs), but the server wasn't configured to handle TLS connections properly.

## Solution Implemented

### 1. Redis TLS Auto-Detection and Configuration

**File**: `server.js` (lines 18-106)

**Changes**:
- Detect `rediss://` URLs and automatically configure TLS
- Add explicit TLS options with `rejectUnauthorized: false` for Railway self-signed certificates
- Log sanitized Redis URL (hide passwords)
- Support both URL-based and host/port-based Redis configuration

**Code**:
```javascript
if (process.env.REDIS_URL) {
  const redisUrl = process.env.REDIS_URL;
  const usesTls = redisUrl.startsWith('rediss://');
  
  if (usesTls) {
    redisConfig = {
      tls: { rejectUnauthorized: false }, // Railway compatibility
      retryStrategy(times) { /* ... */ },
      connectTimeout: 10000,
    };
    redis = new Redis(redisUrl, redisConfig);
  }
}
```

### 2. Enhanced Error Logging

**File**: `server.js` (lines 112-158)

**Changes**:
- Redis error handler now checks `err.code` in addition to `err.message`
- Provides actionable error messages for common issues:
  - `ECONNREFUSED`: "Redis server not reachable. Check REDIS_URL or REDIS_HOST."
  - `ETIMEDOUT`: "Connection timeout. Check network/firewall settings."
  - `ENOTFOUND`: "Redis host not found. Verify REDIS_URL hostname."
  - Auth failures: "Authentication failed. Check Redis password."
  - TLS errors: "TLS/SSL error. Ensure rediss:// URL is used."
- Added `reconnecting` event handler to log reconnection attempts

**Example Log Output**:
```
[Startup] Redis config: Using REDIS_URL with TLS (rediss://)
[Startup] Redis URL (sanitized): rediss://default:***@red-xyz.railway.internal:6379
✅ Redis READY (instance: server-abc123, source: REDIS_URL)
   → Multi-device party sync enabled
```

### 3. Enhanced Health Endpoints

**File**: `server.js` (lines 229-293)

**Changes**:
- `/health` now includes:
  - `configSource`: Shows where Redis config came from (REDIS_URL, REDIS_HOST, etc.)
  - `redisErrorType`: Categorizes error types (connection_refused, timeout, etc.)
- `/api/health` now includes:
  - Detailed `redis` object with `connected`, `status`, `mode`, `configSource`
  - `errorType` field for easy error classification
  - Proper HTTP 503 status when server not ready in production

**Example Response**:
```json
{
  "ok": true,
  "instanceId": "server-abc123",
  "redis": {
    "connected": true,
    "status": "ready",
    "mode": "required",
    "configSource": "REDIS_URL"
  },
  "timestamp": "2026-02-02T09:45:00.000Z",
  "version": "0.1.0-party-fix",
  "environment": "production"
}
```

### 4. Improved Client Error Handling

**File**: `app.js` (lines 83-135, 1952-1969)

**Changes**:
- `checkServerHealth()` now interprets error types and provides user-friendly messages
- Enhanced 503 error handling with specific retry guidance:
  - "⏳ Party service is starting up. Server is connecting to party database. Please wait 10-30 seconds and try again."
- Error messages are more actionable based on the specific error type returned from server

### 5. Documentation Updates

**Files**: `.env.example`, `TEST_PLAN.md`

**Changes**:

#### `.env.example`:
- Added notes about `rediss://` for TLS connections
- Explained Railway automatic TLS configuration
- Added guidance on checking server logs for diagnostics

#### `TEST_PLAN.md`:
- New section: "Debugging Guide: Production Issues"
- Step-by-step Redis connection troubleshooting
- Health endpoint interpretation guide
- Common error messages and solutions
- Railway Redis plugin configuration steps

## Testing Performed

### Automated Tests
- ✅ All 100 existing tests pass
- ✅ No regressions introduced

### Manual Testing
- ✅ Server startup with Redis unavailable shows actionable errors
- ✅ TLS URL detection works correctly (`rediss://` vs `redis://`)
- ✅ Error logging shows proper error types and suggestions
- ✅ Fallback mode activates when Redis unavailable in development

### Tested Configurations
1. **No Redis**: Server starts in fallback mode
2. **Redis unavailable (localhost:6379)**: Shows ECONNREFUSED with helpful message
3. **Fake rediss:// URL**: Shows ENOTFOUND with hostname verification suggestion
4. **Test mode**: Uses mock Redis successfully

## Deployment Instructions for Railway

### 1. Ensure Redis Plugin is Installed
1. Go to Railway dashboard → Your project
2. Click "Plugins" → "New Plugin" → Select "Redis"
3. Railway automatically adds `REDIS_URL` environment variable to your service

### 2. Verify Environment Variables
In your service's "Variables" tab, you should see:
- `REDIS_URL=rediss://default:[password]@red-[id].railway.internal:6379`
  - **Important**: URL must start with `rediss://` (double 's' for TLS)

### 3. Deploy
```bash
git push origin main
# Railway auto-deploys on push
```

### 4. Verify Health
Navigate to: `https://[your-app].railway.app/api/health`

Expected response:
```json
{
  "ok": true,
  "redis": {
    "connected": true,
    "status": "ready"
  }
}
```

### 5. Test Party Join
1. Phone A: Create party → Get code
2. Phone B: Join with code → Should succeed within 5 seconds
3. Both phones on different networks/hotspots should work

## Troubleshooting

If guests still can't join:

1. **Check `/api/health`**:
   - If `ok: false`, check `redis.errorType` and `redis.status`
   - See TEST_PLAN.md "Debugging Guide" section for specific solutions

2. **Check Railway Logs**:
   - Look for startup messages about Redis connection
   - Should see: "✅ Redis READY (instance: server-xxx, source: REDIS_URL)"

3. **Verify REDIS_URL**:
   - Must start with `rediss://` (TLS)
   - Railway Redis plugin sets this automatically

4. **Test with debug endpoint**:
   - Create party on Phone A
   - Check: `https://[app].railway.app/api/party/[CODE]/debug`
   - Should return `exists: true, redisConnected: true`

## Files Modified

1. `server.js` - Redis TLS config, error handling, health endpoints
2. `app.js` - Enhanced client error handling
3. `.env.example` - TLS documentation
4. `TEST_PLAN.md` - Comprehensive debugging guide

## Key Takeaways

✅ **Railway Redis uses TLS** - Server now auto-detects and configures TLS

✅ **Better diagnostics** - Actionable error messages in logs and health endpoints

✅ **Graceful fallback** - Server boots even if Redis fails (with warnings)

✅ **Production-ready** - Proper HTTP 503 responses when Redis required but unavailable

✅ **Well-documented** - TEST_PLAN.md has full debugging guide
