# Redis Real-time Collaboration - Quick Start Example

This is a simple example showing how to use the Redis-based real-time collaboration system.

## Setup

1. **Start Redis** (Docker):
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

2. **Set Environment Variable**:
```bash
export REDIS_URL=redis://localhost:6379
```

3. **Install Dependencies** (already done):
```bash
npm install ioredis @types/ioredis socket.io @nestjs/websockets @nestjs/platform-socket.io @nestjs/schedule
```

## Basic Usage

### 1. Join Canvas (REST API)
```bash
curl -X POST http://localhost:3000/collaboration/canvas/join \
  -H "Content-Type: application/json" \
  -d '{
    "canvasId": "64abc123def456789012345",
    "userId": "64xyz789abc123def456012",
    "user": {
      "id": "64xyz789abc123def456012",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }'
```

### 2. Lock a Node
```bash
curl -X POST http://localhost:3000/collaboration/node/lock \
  -H "Content-Type: application/json" \
  -d '{
    "canvasId": "64abc123def456789012345",
    "conversationId": "64def456789012345abc123",
    "nodeId": "64ghi789012345def456abc",
    "userId": "64xyz789abc123def456012",
    "user": {
      "id": "64xyz789abc123def456012",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "sessionId": "ws-1234567890-abcdef123",
    "lockDurationSeconds": 30
  }'
```

### 3. Get Canvas Presence
```bash
curl http://localhost:3000/collaboration/canvas/64abc123def456789012345/presence
```

### 4. WebSocket Connection (JavaScript Client)
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000/collaboration', {
  query: {
    userId: '64xyz789abc123def456012',
    userName: 'John Doe',
    userEmail: 'john@example.com'
  }
});

// Join a canvas
socket.emit('join_canvas', { 
  canvasId: '64abc123def456789012345' 
});

// Listen for events
socket.on('user_joined', (data) => {
  console.log('User joined:', data);
});

socket.on('node_locked', (data) => {
  console.log('Node locked:', data);
});

socket.on('cursor_updated', (data) => {
  console.log('Cursor moved:', data);
});

// Update cursor position
socket.emit('update_cursor', {
  canvasId: '64abc123def456789012345',
  x: 100,
  y: 200
});

// Start typing
socket.emit('start_typing', {
  canvasId: '64abc123def456789012345',
  nodeId: '64ghi789012345def456abc'
});
```

## Key Features Demonstrated

### Real-time Presence
- Users joining/leaving canvas
- Activity heartbeats
- Automatic cleanup of inactive users

### Node Locking
- 30-second auto-expiring locks
- Conflict detection
- Real-time lock/unlock notifications

### Cursor Tracking
- Real-time cursor position updates
- Throttling (1 update/second per user)
- Automatic cleanup

### Typing Indicators
- Show when users are typing in nodes
- 10-second auto-expiry

## Redis Data Structure

While running the example, you can inspect Redis:

```bash
redis-cli
> KEYS canvas:64abc123def456789012345:*
> HGET canvas:64abc123def456789012345:presence:64xyz789abc123def456012 data
> GET canvas:64abc123def456789012345:conversation:64def456789012345abc123:node:64ghi789012345def456abc:lock
```

## Error Handling

The system gracefully handles:

- **Redis Connection Issues**: Falls back to MongoDB-only mode
- **Lock Conflicts**: Clear error messages with current lock holder info
- **Throttling**: Cursor updates are throttled to prevent spam
- **Stale Data**: Automatic cleanup with TTL expiration

## Health Check

```bash
curl http://localhost:3000/collaboration/health
```

## Architecture Benefits

1. **Hybrid Approach**: MongoDB for persistence, Redis for real-time
2. **Automatic Cleanup**: TTL-based expiration prevents memory leaks
3. **Scalable**: Supports thousands of concurrent users
4. **Resilient**: Graceful fallback when Redis is unavailable
5. **Efficient**: Pipeline operations and batch updates

This example demonstrates a production-ready real-time collaboration system that can handle multiple users working simultaneously on the same canvas with different conversations and nodes.