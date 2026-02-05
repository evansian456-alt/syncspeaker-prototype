# Redis Connection Diagnosis Checklist

This guide helps diagnose and fix Redis connection issues in production (Railway or similar platforms).

## Symptoms
- HTTP 503 errors with message "Server not ready - Redis unavailable"
- `/api/create-party` and `/api/join-party` endpoints failing
- Party sync not working across multiple devices

## Quick Diagnosis Steps

### 1. Check Health Endpoints

**Basic health check:**
```bash
curl https://your-app.railway.app/api/health
```

**Detailed Redis diagnostics:**
```bash
curl https://your-app.railway.app/api/debug/redis
```

Look for:
- `ok: false` in `/api/health` means server not ready
- `redis.connected: false` means Redis connection failed
- `redis.errorType` shows what type of error occurred
- `redis.lastError` shows the actual error message

### 2. Common Error Types and Solutions

#### `connection_refused` (ECONNREFUSED)
**Cause:** Redis server not reachable
**Fix:**
1. Verify Redis service is running on Railway
2. Check REDIS_URL is set correctly
3. Restart Redis service in Railway dashboard

#### `timeout` (ETIMEDOUT)
**Cause:** Connection timeout, network/firewall issue
**Fix:**
1. Check network connectivity
2. Verify firewall settings allow connection
3. Check Redis service health in Railway

#### `host_not_found` (ENOTFOUND)
**Cause:** Redis hostname not found
**Fix:**
1. Verify REDIS_URL hostname is correct
2. Check DNS resolution
3. Ensure Redis service exists in Railway project

#### `auth_failed` (NOAUTH/authentication)
**Cause:** Authentication failed
**Fix:**
1. Verify password in REDIS_URL is correct
2. Check Redis service credentials in Railway
3. Regenerate REDIS_URL if needed

#### `tls_error` (TLS/SSL)
**Cause:** TLS configuration mismatch
**Fix:**
1. Ensure REDIS_URL uses `rediss://` (not `redis://`) for TLS
2. Verify TLS is required by your Redis service
3. Check `REDIS_TLS_REJECT_UNAUTHORIZED` setting

#### `not_configured`
**Cause:** REDIS_URL not set
**Fix:**
1. Add Redis plugin in Railway
2. Verify REDIS_URL variable is set
3. Restart the service

## Environment Variables Checklist

### Required
- ✅ `REDIS_URL` - Full Redis connection URL
  - Format: `rediss://default:password@host:port` (note the double 's' for TLS)
  - Source: Railway Redis plugin (automatic) or manually set

### Optional
- `REDIS_TLS_REJECT_UNAUTHORIZED` - TLS certificate verification (default: `false`)
  - Set to `true` only if using verified certificates (not self-signed)
  - Railway Redis uses self-signed certs, keep default `false`

- `ALLOW_FALLBACK_IN_PRODUCTION` - Emergency fallback mode (default: `false`)
  - Set to `true` ONLY for emergency single-instance operation
  - **WARNING:** Parties will not sync across instances

## Railway-Specific Steps

### 1. Verify Redis Plugin is Active
1. Go to Railway project dashboard
2. Check Redis service is present and running
3. Verify it's linked to your application

### 2. Check REDIS_URL Variable
1. Open your service settings
2. Go to Variables tab
3. Confirm `REDIS_URL` is present and looks like: `rediss://default:xxx@xxx.railway.internal:6379`

### 3. Restart Services
If Redis URL is correct but connection still fails:
1. **Restart Redis service first:**
   - Go to Redis service in Railway
   - Click "⋮" menu → "Restart"
   - Wait 30 seconds

2. **Then restart your application:**
   - Go to your app service
   - Click "⋮" menu → "Restart"
   - Monitor logs for successful connection

### 4. Check Logs
1. View application logs in Railway
2. Look for startup messages:
   ```
   ✅ Redis READY (instance: server-xxx, source: REDIS_URL)
   ```
3. If you see errors, note the error type and refer to "Common Error Types" above

## Verify Connection Success

After fixing, verify with:

```bash
# Check health endpoint
curl https://your-app.railway.app/api/health

# Should return:
{
  "ok": true,
  "redis": {
    "connected": true,
    "status": "ready",
    "mode": "required"
  }
}
```

## Emergency Fallback Mode

⚠️ **Use only in emergencies** - this allows single-instance operation without Redis.

### Enable Fallback Mode
1. Set environment variable: `ALLOW_FALLBACK_IN_PRODUCTION=true`
2. Restart service
3. Party creation/joining will work but with warning:
   ```json
   {
     "partyCode": "ABC123",
     "warning": "fallback_mode_single_instance"
   }
   ```

### Limitations
- Parties stored in memory only
- Lost on server restart
- No multi-instance sync
- Not recommended for production use

### Disable Fallback Mode
1. Fix Redis connection issue
2. Remove or set `ALLOW_FALLBACK_IN_PRODUCTION=false`
3. Restart service

## Monitoring and Alerts

### Health Check Endpoints
- **Basic:** `GET /health` - Quick status check
- **Detailed:** `GET /api/health` - Full health with Redis status (returns 503 if not ready)
- **Debug:** `GET /api/debug/redis` - Detailed Redis diagnostics

### Set Up Monitoring
Consider setting up automated checks:
1. Ping `/api/health` every 1-5 minutes
2. Alert if status code is 503
3. Alert if `redis.connected` is false

## Still Having Issues?

1. Check all items in this checklist
2. Review `/api/debug/redis` output
3. Check Railway service logs for detailed errors
4. Verify Redis service health in Railway dashboard
5. Try restarting both Redis and app services
6. Check Railway status page for platform issues

## Contact Information

For Railway-specific issues, check:
- Railway documentation: https://docs.railway.app
- Railway status: https://status.railway.app
- Railway community: https://discord.gg/railway
