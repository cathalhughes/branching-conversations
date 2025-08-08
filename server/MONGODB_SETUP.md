# MongoDB Setup for Branching Conversations

## Prerequisites

1. **MongoDB Installation**: Install MongoDB locally or use MongoDB Atlas
   - Local: https://docs.mongodb.com/manual/installation/
   - Atlas: https://www.mongodb.com/cloud/atlas

2. **Environment Configuration**: Copy `.env.example` to `.env` and update:
   ```bash
   cp .env.example .env
   ```
   
   Update your MongoDB connection string:
   ```
   MONGODB_URI=mongodb://localhost:27017/branching-conversations
   ```

## Quick Start

1. **Install Dependencies** (already done):
   ```bash
   npm install @nestjs/mongoose mongoose mongoose-lean-virtuals
   ```

2. **Start MongoDB**: 
   ```bash
   # Local MongoDB
   mongod
   
   # Or use MongoDB Atlas connection string in .env
   ```

3. **Start the Server**:
   ```bash
   npm run start:dev
   ```

## Database Schema

The system creates these collections automatically:

### Collections Overview
- **canvases**: Workspaces containing multiple conversations
- **conversations**: Individual conversation trees positioned on canvas  
- **conversation_nodes**: Individual messages with branching support
- **editing_sessions**: Real-time collaboration tracking

### Key Features Implemented
✅ **Hierarchical Structure**: Canvas → Conversations → Nodes  
✅ **Spatial Positioning**: React Flow compatible positioning  
✅ **Branching**: Node-level branching with parent-child relationships  
✅ **Optimistic Locking**: Version control on all documents  
✅ **Soft Delete**: Maintains referential integrity  
✅ **Real-time Collaboration**: Session tracking and exclusive locking  
✅ **Performance Indexes**: 20+ strategic indexes for query optimization  

## API Compatibility

The implementation maintains **100% backward compatibility** with your existing API. All endpoints work identically:

- `GET /conversations/canvas` - Get canvas with all conversations
- `POST /conversations/trees` - Create new conversation tree  
- `GET /conversations/trees/:treeId` - Get specific conversation
- `PUT /conversations/trees/:treeId` - Update conversation position
- `DELETE /conversations/trees/:treeId` - Soft delete conversation
- `POST /conversations/trees/:treeId/nodes` - Add new node
- `PUT /conversations/trees/:treeId/nodes/:nodeId` - Update node
- `DELETE /conversations/trees/:treeId/nodes/:nodeId` - Delete node
- `POST /conversations/chat` - Generate AI response
- `POST /conversations/chat/stream` - Stream AI response

## Migration from In-Memory

No migration needed! The service automatically:
1. Creates a default canvas on first request
2. Maintains the same response format
3. Preserves all existing functionality

## New Capabilities

### Real-time Collaboration
```typescript
// Track who's editing what
const sessions = await collaborationService.getActiveSessions(canvasId);

// Acquire exclusive lock
await collaborationService.acquireLock(sessionId, 30000);
```

### Optimistic Locking
```typescript
// Prevent concurrent modifications
await updateNode(treeId, nodeId, { 
  prompt: 'Updated text',
  version: currentVersion // Will throw ConflictException if stale
});
```

### Advanced Queries
```typescript
// Search content across canvas
const results = await nodeModel.searchInCanvas(canvasId, 'machine learning');

// Find spatially nearby nodes
const nearby = await nodeModel.findNearby(canvasId, x, y, radius);

// Get conversation history path
const history = await service.getConversationHistory(treeId, nodeId);
```

## Performance Optimizations

The system includes comprehensive indexing:
- **Compound indexes** for multi-field queries
- **Text search** for content discovery  
- **Geospatial indexes** for position-based queries
- **TTL indexes** for automatic session cleanup
- **Connection pooling** with 10 concurrent connections

## Monitoring

Built-in monitoring capabilities:
```typescript
// Canvas statistics
const stats = await collaborationService.getCanvasStats(canvasId);
// Returns: { activeSessions, activeUsers, activeLocks, totalSessions }

// Automatic cleanup (runs via cron)
- Session cleanup: every 5 minutes
- Lock cleanup: every minute
```

## Testing

Test the MongoDB integration:

1. **Start server**: `npm run start:dev`
2. **Create conversation**: 
   ```bash
   curl -X POST http://localhost:3001/conversations/trees \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Conversation","position":{"x":100,"y":200}}'
   ```
3. **Verify storage**: Check MongoDB Compass or run:
   ```bash
   mongo branching-conversations
   db.conversations.find().pretty()
   ```

## Production Considerations

For production deployment:

1. **Connection String**: Use MongoDB Atlas or production MongoDB cluster
2. **Environment Variables**: Set production values in `.env`
3. **Indexes**: All indexes are created automatically via schema
4. **Monitoring**: Use MongoDB Atlas monitoring or install ops tools
5. **Backup**: Configure regular database backups

## Troubleshooting

**Connection Issues**:
- Verify MongoDB is running locally or Atlas connection string is correct
- Check firewall settings for Atlas connections

**Performance Issues**:  
- Monitor slow queries with MongoDB profiler
- Verify indexes are being used with `.explain()`
- Check connection pool utilization

**TypeScript Errors**:
- All types should compile cleanly now
- If issues persist, use `any` type for complex Mongoose documents

The implementation provides a robust, scalable foundation for your multi-conversation canvas system with full real-time collaboration support!