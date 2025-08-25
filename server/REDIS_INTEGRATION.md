# Redis Real-time Collaboration Integration

This document describes the comprehensive Redis-based real-time collaboration system for the multi-conversation canvas application.

## Overview

The Redis integration provides real-time collaboration features including:

- **Canvas-level presence tracking** - Who's viewing which canvas
- **Conversation-level focus** - Which conversation someone is viewing/editing  
- **Node-level locking** - Which specific node someone is editing
- **User cursor positions** - Real-time cursor tracking on canvas
- **Typing indicators** - Show when users are typing in specific nodes
- **Activity heartbeats** - Track user activity with automatic cleanup

## Architecture

### Hybrid Approach
The system uses a hybrid approach combining:
- **MongoDB** - Persistent session storage and historical data
- **Redis** - Real-time state and fast lookups with TTL-based cleanup
- **WebSocket (Socket.IO)** - Real-time event broadcasting to clients

### Key Components

1. **RedisService** (`src/conversations/redis.service.ts`)
   - Core Redis operations and connection management
   - Key naming strategy and TTL management
   - Real-time presence and locking logic

2. **CollaborationService** (`src/conversations/collaboration.service.ts`) 
   - Hybrid methods combining MongoDB persistence with Redis real-time features
   - Fallback mechanisms when Redis is unavailable
   - Automated cleanup and maintenance

3. **CollaborationGateway** (`src/conversations/collaboration.gateway.ts`)
   - WebSocket gateway for real-time client communication
   - Event handling and broadcasting
   - Client connection management

4. **CollaborationController** (`src/conversations/collaboration.controller.ts`)
   - REST API endpoints for collaboration features
   - HTTP interface for testing and integration

## Redis Key Structure

The system uses a hierarchical key naming strategy:

```
# Canvas presence
canvas:{canvasId}:presence:{userId}
canvas:{canvasId}:presence (set of userIds)

# Conversation focus  
canvas:{canvasId}:conversation:{conversationId}:focus:{userId}
canvas:{canvasId}:conversation:{conversationId}:focus (set of userIds)

# Node locks
canvas:{canvasId}:conversation:{conversationId}:node:{nodeId}:lock

# Cursor positions
canvas:{canvasId}:cursor:{userId}
canvas:{canvasId}:cursors (set of userIds)

# Typing indicators
canvas:{canvasId}:node:{nodeId}:typing:{userId}  
canvas:{canvasId}:node:{nodeId}:typing (set of userIds)

# Activity heartbeats
canvas:{canvasId}:activity:{userId}

# Throttling
throttle:cursor:{userId}
```

## TTL Configuration

All Redis keys have appropriate TTL values for automatic cleanup:

```typescript
export const REDIS_TTL = {
  PRESENCE: 300,          // 5 minutes
  CONVERSATION_FOCUS: 300, // 5 minutes  
  NODE_LOCK: 30,          // 30 seconds
  CURSOR_POSITION: 60,    // 1 minute
  TYPING_INDICATOR: 10,   // 10 seconds
  ACTIVITY_HEARTBEAT: 30, // 30 seconds
  CURSOR_THROTTLE: 1,     // 1 second
} as const;
```

## Setup and Configuration

### 1. Environment Variables

Set the Redis connection URL in your `.env` file:

```bash
REDIS_URL=redis://localhost:6379
# Or for production:
# REDIS_URL=redis://username:password@redis-host:6379
```

### 2. Docker Setup (Development)

Add Redis to your `docker-compose.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    
volumes:
  redis_data:
```

### 3. Production Setup

For production, use a managed Redis service like:
- AWS ElastiCache
- Google Cloud Memorystore  
- Redis Cloud
- Azure Cache for Redis

## API Usage

### WebSocket Connection

Connect to the collaboration namespace:

```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000/collaboration', {
  query: {
    userId: 'user123',
    userName: 'John Doe', 
    userEmail: 'john@example.com'
  }
});

// Join a canvas
socket.emit('join_canvas', { canvasId: 'canvas123' });

// Listen for real-time events
socket.on('user_joined', (data) => {
  console.log('User joined:', data);
});

socket.on('node_locked', (data) => {
  console.log('Node locked:', data);
});
```

### REST API Examples

#### Join Canvas
```bash
POST /collaboration/canvas/join
Content-Type: application/json

{
  "canvasId": "64abc123def456789012345",
  "userId": "64xyz789abc123def456012", 
  "user": {
    "id": "64xyz789abc123def456012",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Lock Node
```bash
POST /collaboration/node/lock  
Content-Type: application/json

{
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
}
```

#### Get Canvas Presence
```bash
GET /collaboration/canvas/64abc123def456789012345/presence
```

Response:
```json
{
  "success": true,
  "data": {
    "canvasId": "64abc123def456789012345",
    "users": [
      {
        "userId": "64xyz789abc123def456012",
        "user": {
          "id": "64xyz789abc123def456012",
          "name": "John Doe", 
          "email": "john@example.com"
        },
        "joinedAt": "2024-01-15T10:30:00.000Z",
        "lastActivityAt": "2024-01-15T10:35:00.000Z",
        "isActive": true
      }
    ],
    "conversationFocus": {
      "64def456789012345abc123": [
        {
          "userId": "64xyz789abc123def456012",
          "conversationId": "64def456789012345abc123",
          "focusedAt": "2024-01-15T10:32:00.000Z"
        }
      ]
    },
    "nodeLocks": {
      "64ghi789012345def456abc": {
        "nodeId": "64ghi789012345def456abc",
        "userId": "64xyz789abc123def456012", 
        "user": {
          "id": "64xyz789abc123def456012",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "lockedAt": "2024-01-15T10:33:00.000Z",
        "expiresAt": "2024-01-15T10:33:30.000Z",
        "sessionId": "ws-1234567890-abcdef123"
      }
    },
    "cursors": {
      "64xyz789abc123def456012": {
        "userId": "64xyz789abc123def456012",
        "user": {
          "id": "64xyz789abc123def456012", 
          "name": "John Doe",
          "email": "john@example.com"
        },
        "x": 450,
        "y": 320,
        "updatedAt": "2024-01-15T10:34:45.000Z"
      }
    },
    "typingIndicators": {
      "64ghi789012345def456abc": [
        {
          "userId": "64xyz789abc123def456012",
          "user": {
            "id": "64xyz789abc123def456012",
            "name": "John Doe", 
            "email": "john@example.com"
          },
          "nodeId": "64ghi789012345def456abc",
          "startedAt": "2024-01-15T10:34:50.000Z"
        }
      ]
    },
    "lastUpdated": "2024-01-15T10:35:00.000Z"
  }
}
```

## Features

### Canvas Presence Tracking
- Track which users are currently viewing a canvas
- Automatic cleanup of inactive users
- Real-time join/leave notifications

### Conversation Focus
- Track which conversation a user is currently focused on
- Only one conversation focus per user per canvas
- Automatic cleanup when switching conversations

### Node Locking
- Prevent concurrent editing of the same node
- 30-second auto-expiry with extension capability
- Real-time lock/unlock notifications  
- Conflict detection and error handling

### Cursor Positioning
- Real-time cursor position updates
- Throttling to prevent spam (1 update/second per user)
- Automatic cleanup of stale positions

### Typing Indicators
- Show when users are typing in specific nodes
- 10-second auto-expiry requiring renewal
- Start/stop typing events

### Activity Heartbeats
- Track user activity with 30-second heartbeats
- Automatic cleanup of inactive users
- Batch update support for efficiency

## Error Handling

The system includes comprehensive error handling:

### Redis Connection Errors
- Graceful fallback to MongoDB-only mode
- Connection retry logic with exponential backoff
- Health check endpoints

### Lock Conflicts
- Clear error messages when locks are held by others
- Lock holder information in error responses
- Automatic lock expiry and cleanup

### Throttling
- Cursor update throttling to prevent spam
- Clear throttling error responses
- Per-user throttle keys

## Monitoring and Maintenance

### Health Checks
```bash
GET /collaboration/health
```

### Manual Cleanup
```bash
# Clear stale locks for a canvas
POST /collaboration/cleanup/canvas/{canvasId}/stale-locks

# Clean up stale presence  
POST /collaboration/cleanup/canvas/{canvasId}/stale-presence

# Run full hybrid cleanup
POST /collaboration/cleanup/hybrid
```

### Scheduled Cleanup
- MongoDB sessions cleaned every 5 minutes
- Redis locks cleaned every minute  
- Hybrid cleanup runs every 5 minutes

## Performance Considerations

### Key Design Decisions
- **TTL-based cleanup** - Automatic expiry prevents memory leaks
- **Set-based tracking** - Fast O(1) membership checks
- **Pipeline operations** - Batch Redis operations for efficiency
- **Throttling** - Prevent cursor update spam
- **Pub/Sub** - Efficient event broadcasting

### Scalability
- Redis can handle thousands of concurrent users
- WebSocket connections scale with server instances
- MongoDB provides durable persistence layer
- Horizontal scaling with Redis Cluster support

## Integration with Existing Code

The new Redis system integrates seamlessly:

### Backward Compatibility
- All existing MongoDB session methods still work
- New hybrid methods provide enhanced functionality
- Graceful degradation when Redis is unavailable

### Migration Strategy
1. Deploy Redis service
2. Update application with Redis integration
3. Gradually migrate clients to WebSocket connections
4. Monitor performance and adjust TTL values as needed

## Testing

### Unit Tests
- Redis service methods
- Collaboration service hybrid methods  
- WebSocket event handlers

### Integration Tests
- End-to-end collaboration workflows
- Error handling and fallback scenarios
- Performance under load

### Manual Testing
Use the provided REST endpoints and WebSocket events to test:
- Multiple users joining same canvas
- Concurrent node locking attempts
- Real-time cursor and typing updates
- Automatic cleanup and expiry

## Security Considerations

### Authentication
- WebSocket authentication via query parameters (development)
- Production should use JWT tokens or session cookies
- User context validation on all operations

### Authorization  
- Canvas access control (implement per requirements)
- Node-level permissions (implement per requirements)
- Rate limiting on API endpoints

### Data Privacy
- No sensitive data stored in Redis
- User information limited to name/email
- Automatic cleanup prevents data retention issues

## Troubleshooting

### Common Issues

**Redis Connection Failed**
- Check `REDIS_URL` environment variable
- Verify Redis server is running
- Check network connectivity and firewall rules

**WebSocket Connection Issues**  
- Verify CORS configuration
- Check client authentication parameters
- Monitor browser console for errors

**Locks Not Expiring**
- Check Redis TTL values
- Verify cleanup cron jobs are running
- Monitor Redis memory usage

**Performance Issues**
- Monitor Redis operations with `redis-cli monitor`
- Check for excessive cursor updates (throttling)  
- Review cleanup job frequency

### Debugging

Enable debug logging:
```bash
DEBUG=redis:* npm run start:dev
```

Monitor Redis operations:
```bash
redis-cli monitor
```

Check Redis memory usage:
```bash
redis-cli info memory
```

## Future Enhancements

Potential improvements:
- **Redis Streams** - Event sourcing for audit trails
- **Geo-distributed Redis** - Multi-region support
- **Advanced locking** - Hierarchical locks (conversation > node)
- **Conflict resolution** - Merge strategies for concurrent edits
- **Analytics** - User behavior tracking and metrics
- **Load balancing** - WebSocket sticky sessions for scaling