# Railway Deployment Notes: Track Upload & Storage

## Storage Limitations on Railway

### Ephemeral Filesystem
Railway provides an **ephemeral filesystem** for containerized applications:

- **Not persistent**: Files are lost on:
  - Application redeployment
  - Container restart
  - Instance scaling/migration
  
- **Local to instance**: In multi-instance deployments, each instance has its own filesystem

### Impact on Track Uploads

1. **File Lifecycle**:
   - Tracks uploaded to `/uploads` directory
   - Stored only in memory/container filesystem
   - **2-hour TTL** enforced by cleanup job
   - Files deleted on server restart/redeploy

2. **Multi-Instance Considerations**:
   - If Railway scales to multiple instances, each has separate uploads
   - Guest might not access track if routed to different instance
   - **Solution**: Railway uses sticky sessions for WebSocket connections

## Current Implementation

### Track Storage
```javascript
// Location: uploads/ directory (created automatically)
const uploadDir = path.join(__dirname, 'uploads');
```

### TTL Cleanup
```javascript
// Runs every 5 minutes, removes tracks older than 2 hours
const TRACK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
```

### Streaming Endpoint
```http
GET /api/track/:trackId
```
- Supports HTTP Range requests (206 Partial Content)
- Required for:
  - Seeking in audio
  - Mobile browser playback
  - Resumable downloads

## Production Recommendations

### For Railway Deployment

#### Option 1: Accept Limitations (Current)
**Pros**:
- ✅ Simple implementation
- ✅ No external dependencies
- ✅ Works for prototype/testing

**Cons**:
- ❌ Tracks lost on redeploy
- ❌ Not suitable for production
- ❌ Issues with multi-instance scaling

**Best for**: Prototype, demo, short-lived parties

#### Option 2: Use Railway Volumes
**Not recommended** - Railway volumes are meant for databases, not file storage

#### Option 3: External Storage (Recommended for Production)
Use cloud storage service:
- **AWS S3**
- **Cloudflare R2** (S3-compatible, no egress fees)
- **Google Cloud Storage**
- **Azure Blob Storage**

**Implementation Changes**:
```javascript
// Instead of local storage:
const storage = multer.memoryStorage();

// Upload to S3 after receiving:
await s3.putObject({
  Bucket: 'syncspeaker-tracks',
  Key: trackId,
  Body: fileBuffer,
  ContentType: contentType
});

// Return S3 URL:
const trackUrl = `https://cdn.syncspeaker.com/tracks/${trackId}`;
```

**Benefits**:
- ✅ Persistent storage
- ✅ CDN-friendly
- ✅ Scales with multiple instances
- ✅ Better performance for guests

**Costs**:
- Storage: ~$0.023/GB/month (S3)
- Transfer: Free (Cloudflare R2) or ~$0.09/GB (S3)
- For 100 parties/day, 5MB avg track: ~$3-5/month

#### Option 4: Hybrid Approach
- Short-term cache on local filesystem (< 1 hour)
- Background upload to S3 for persistence
- Serve from local cache if available, S3 otherwise

## Current Setup for Testing

### Development (localhost)
```bash
npm start
# Files stored in: ./uploads/
# Persistent across restarts (local dev)
```

### Railway (staging/production)
```bash
# Automatic on push to main
# Files stored in: /app/uploads/ (ephemeral)
# Lost on redeploy
```

### Environment Variables
```env
# Railway automatically sets:
PORT=8080 (or dynamic)
RAILWAY_ENVIRONMENT=production
REDIS_URL=rediss://... (for multi-device sync)

# No additional config needed for file uploads (current implementation)
```

## Testing on Railway

### Single Upload Test
1. Deploy to Railway
2. Upload a track
3. Start playback
4. **Verify**: Guest can stream audio
5. **Verify**: Range requests work (seek in audio)

### Persistence Test
1. Upload a track
2. Trigger a redeployment:
   ```bash
   git commit --allow-empty -m "test redeploy"
   git push
   ```
3. **Expected**: Track no longer accessible
4. **Verify**: System handles missing track gracefully

### Multi-Guest Test
1. Upload track
2. Join with 3-5 guests
3. **Verify**: All guests can stream
4. **Check**: Railway metrics for bandwidth usage

## Monitoring

### What to Monitor on Railway

1. **Storage Usage**:
   ```bash
   railway run du -sh uploads/
   ```
   - Expected: < 100MB for prototype
   - Alert if: > 500MB (possible cleanup failure)

2. **Bandwidth**:
   - Each 5MB track streamed = 5MB egress
   - 100 guests × 5MB = 500MB
   - Railway includes 100GB/month free

3. **Instance Logs**:
   ```
   [Cleanup] Removing N expired tracks
   [Upload] Track uploaded: trackId
   [HTTP] Streaming track with range: X-Y/Z
   ```

### Alerts to Set Up
- ❌ Cleanup job fails
- ❌ Upload directory > 1GB
- ❌ Bandwidth > 80% of limit
- ❌ Track file not found errors

## Migration Path to Production

### Phase 1: Prototype (Current)
- ✅ Local filesystem storage
- ✅ 2-hour TTL
- ✅ Single instance only
- ✅ Best for: Testing, demo, < 20 concurrent users

### Phase 2: Staging (Recommended Next)
- 🔄 Add Cloudflare R2 or S3
- 🔄 Keep local cache for performance
- 🔄 Extend TTL to 24 hours
- 🔄 Best for: Beta testing, < 100 concurrent users

### Phase 3: Production
- 🔄 Full cloud storage (S3/R2)
- 🔄 CDN for global distribution
- 🔄 Database tracking of uploads
- 🔄 User quotas and limits
- 🔄 Best for: Production, unlimited scale

## Cost Estimates

### Current Setup (Ephemeral Storage)
- **Railway**: $5/month (Hobby plan)
- **Storage**: $0 (ephemeral)
- **Bandwidth**: Included (100GB/month)
- **Total**: $5/month

### With S3 Storage
- **Railway**: $5/month
- **S3 Storage**: $1-2/month (estimate: 50GB)
- **S3 Transfer**: $0.09/GB (or $0 with R2)
- **Total**: $6-10/month (S3) or $6-7/month (R2)

### Break-Even Analysis
- Current setup: Free bandwidth for 100GB/month
- Each 5MB track streamed to 10 guests = 50MB
- 2000 streams/month = 100GB
- **Recommendation**: Start with ephemeral, migrate to S3 when exceeding limits

## Security Considerations

### Current Implementation
- ✅ File type validation (audio/* only)
- ✅ File size limits (50MB)
- ✅ Unique file names (nanoid)
- ✅ No directory traversal (safe paths)

### For Production
- 🔄 Add user authentication
- 🔄 Implement upload quotas per user
- 🔄 Scan files for malware
- 🔄 Rate limit upload endpoint
- 🔄 Add CORS restrictions
- 🔄 Implement CDN signing (private URLs)

## Troubleshooting on Railway

### "Track not found" errors
**Cause**: Track deleted due to TTL or redeploy
**Solution**: Re-upload track, or extend TTL if needed

### "No space left on device"
**Cause**: Cleanup job not running or too many uploads
**Solution**: Check cleanup logs, restart instance

### Guests can't stream
**Cause**: Multi-instance routing issue
**Solution**: Verify WebSocket sticky sessions enabled in Railway

### High bandwidth usage
**Cause**: Many concurrent streams or large files
**Solution**: Monitor usage, consider CDN or file size limits

## Conclusion

The current implementation is **suitable for prototype and testing** on Railway with these caveats:

- ✅ Works for short-lived parties (< 2 hours)
- ✅ Good for demos and testing
- ❌ Not suitable for production without cloud storage
- ❌ Files lost on redeploy
- ❌ Limited to single-instance deployments

For production, **migrate to cloud storage (S3/R2)** before public launch.
