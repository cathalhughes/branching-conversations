# Testing Redis Connection Fix

## The Problem
The error `TypeError: Cannot read properties of undefined (reading 'psubscribe')` was occurring because:

1. Redis connection setup was not properly waiting for all connections to be ready
2. The subscriber could be undefined when `setupRedisSubscriptions()` was called
3. No graceful fallback handling when Redis is not available

## The Fix
1. **Improved connection handling**: Made Redis properties optional (`Redis | undefined`)
2. **Better connection waiting**: Fixed Promise.all setup for connection readiness
3. **Safe publishing**: Created `safePublish()` method that checks if publisher exists
4. **Graceful fallback**: WebSocket gateway now handles missing Redis gracefully
5. **Non-null assertions**: Added `!` operator where we know Redis is connected

## Testing Without Redis (Graceful Fallback)

1. **Start the server without Redis running**:
```bash
cd /Users/cathal.hughes/Projects/branching-conversations/server
npm run start:dev
```

Expected behavior:
- Server should start successfully 
- Logs should show: "Redis subscriber not available - real-time events will be limited"
- MongoDB-only collaboration features should work
- WebSocket connections should work (but without Redis pub/sub)

## Testing With Redis (Full Functionality)

1. **Start Redis**:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

2. **Set environment**:
```bash
export REDIS_URL=redis://localhost:6379
```

3. **Start the server**:
```bash
cd /Users/cathal.hughes/Projects/branching-conversations/server
npm run start:dev
```

Expected logs:
```
[RedisService] Redis main connection established
[RedisService] Redis publisher connection established  
[RedisService] Redis subscriber connection established
[RedisService] Redis service initialized successfully
[CollaborationGateway] Subscribed to Redis canvas events
[CollaborationGateway] Collaboration WebSocket Gateway initialized
```

4. **Test basic functionality**:
```bash
# Health check
curl http://localhost:3000/collaboration/health

# Should return:
{
  "success": true,
  "data": {
    "redis": true,
    "timestamp": "2024-01-15T10:00:00.000Z"
  }
}
```

## Key Improvements

### Before (Problematic)
```typescript
// Could be undefined
private subscriber: Redis;

// Direct access without checks
const subscriber = this.redisService.getSubscriber();
await subscriber.psubscribe('canvas:*:events'); // ERROR!
```

### After (Fixed)
```typescript
// Explicitly optional
private subscriber: Redis | undefined;

// Safe access with checks
const subscriber = this.redisService.getSubscriber();
if (!subscriber) {
  this.logger.warn('Redis subscriber not available');
  return;
}
await subscriber.psubscribe('canvas:*:events'); // SAFE!
```

## Architecture Benefits

1. **Resilient**: Works with or without Redis
2. **Production Ready**: Graceful handling of Redis failures
3. **TypeScript Safe**: Proper null checking eliminates runtime errors
4. **Observable**: Clear logging for debugging connection issues
5. **Fallback**: MongoDB collaboration still works without Redis

The system now provides a robust Redis integration that doesn't break your application when Redis is unavailable, while providing full real-time capabilities when it is available.