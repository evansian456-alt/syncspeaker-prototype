# Redis Setup for Phone Party

This guide explains how to set up Redis for the Phone Party prototype to enable shared party discovery across multiple server instances.

## Why Redis?

Redis is used as a shared persistence layer to fix the "Party not found" (HTTP 404) bug that occurred when:
- Multiple server instances run behind a load balancer
- The app restarts between party creation and guest join
- Host and guest requests hit different server instances

## Installation

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y redis-server
```

### macOS
```bash
brew install redis
```

### Docker
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

## Configuration

### Local Development
By default, the app connects to Redis at `localhost:6379` with no password.

### Production Environment
Set these environment variables:
```bash
export REDIS_HOST=your-redis-host
export REDIS_PORT=6379
export REDIS_PASSWORD=your-password  # Optional
```

## Running Redis

### Ubuntu/Debian (systemd)
```bash
# Start Redis
sudo systemctl start redis-server

# Check status
sudo systemctl status redis-server

# Enable on boot
sudo systemctl enable redis-server
```

### macOS
```bash
# Start Redis
brew services start redis

# Stop Redis
brew services stop redis
```

### Docker
```bash
# Start Redis
docker run -d --name syncspeaker-redis -p 6379:6379 redis:7-alpine

# Stop Redis
docker stop syncspeaker-redis
```

## Testing Redis Connection

### Using redis-cli
```bash
# Connect to Redis
redis-cli

# Test connection
127.0.0.1:6379> PING
PONG

# List all party keys
127.0.0.1:6379> KEYS party:*

# Get a specific party
127.0.0.1:6379> GET party:ABC123

# Check TTL
127.0.0.1:6379> TTL party:ABC123
```

### Using the App
```bash
# Check health endpoint
curl http://localhost:8080/health

# Expected response:
{
  "status": "ok",
  "instanceId": "server-xxxxx",
  "redis": "connected",
  "version": "0.1.0-party-fix"
}
```

## How It Works

### Party Storage
- **Key Format**: `party:${CODE}` (e.g., `party:ABC123`)
- **TTL**: 2 hours (7200 seconds)
- **Data Structure**: JSON string with party metadata

### Party Lifecycle
1. **Create**: Party is written to Redis with 2-hour TTL
2. **Join**: Guest reads party from Redis to verify it exists
3. **Expire**: Redis automatically deletes party after 2 hours
4. **Delete**: Party deleted from Redis when host leaves

### Multi-Instance Support
- Each server instance has a unique `instanceId`
- Parties created on instance 1 are immediately visible on instance 2
- Guests can join parties regardless of which instance they hit

## Monitoring

### Check Active Parties
```bash
# Count parties
redis-cli KEYS "party:*" | wc -l

# List all party codes
redis-cli KEYS "party:*"
```

### Check Redis Memory
```bash
redis-cli INFO memory
```

### Check Party Details
```bash
# Using debug endpoint
curl http://localhost:8080/api/party/ABC123

# Expected response:
{
  "exists": true,
  "code": "ABC123",
  "createdAt": "2026-01-31T08:00:00.000Z",
  "hostConnected": true,
  "guestCount": 2,
  "instanceId": "server-xxxxx"
}
```

## Troubleshooting

### Redis Not Connecting
**Symptom**: Health endpoint shows `"redis": "connecting"` or `"redis": "unknown"`

**Solutions**:
1. Check if Redis is running: `redis-cli PING`
2. Check Redis logs: `sudo journalctl -u redis-server -f`
3. Verify connection settings in environment variables

### Parties Not Persisting
**Symptom**: Parties disappear immediately

**Solutions**:
1. Check Redis TTL: `redis-cli TTL party:ABC123`
2. Check for Redis memory issues: `redis-cli INFO memory`
3. Verify `maxmemory-policy` is not `volatile-lru`

### Cross-Instance Issues
**Symptom**: Party created on instance 1 not visible on instance 2

**Solutions**:
1. Verify both instances connect to the same Redis: Check `REDIS_HOST`
2. Check network connectivity between instances and Redis
3. Verify no firewall blocking Redis port 6379

## Production Recommendations

### Redis Configuration
```bash
# /etc/redis/redis.conf

# Enable persistence
appendonly yes
appendfsync everysec

# Set memory limit (adjust based on needs)
maxmemory 256mb
maxmemory-policy allkeys-lru

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

### Security
- Use a strong password (`requirepass` in redis.conf)
- Bind to specific IP addresses, not 0.0.0.0
- Use Redis ACLs for fine-grained access control
- Enable TLS for production deployments

### High Availability
- Use Redis Sentinel for automatic failover
- Or use Redis Cluster for horizontal scaling
- Consider managed Redis services (AWS ElastiCache, Redis Cloud, etc.)

## Development Without Redis

For testing purposes, the app uses `ioredis-mock` in tests, so Redis doesn't need to be installed for running `npm test`.

However, for manual testing and development, you should have Redis running to ensure realistic behavior.

## Further Reading

- [Redis Documentation](https://redis.io/docs/)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
