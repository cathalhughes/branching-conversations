# MongoDB Schema Implementation for Branching Conversations

This directory contains the complete MongoDB schema implementation for the multi-conversation canvas system.

## Overview

The system supports a hierarchical structure:
- **Canvas**: A workspace containing multiple conversation trees (like a Miro board)  
- **Conversations**: Independent conversation trees positioned on the canvas
- **Nodes**: Individual messages that can branch into multiple exploration paths
- **EditingSessions**: Real-time collaboration tracking

## Collections

### 1. Canvas Collection (`canvases`)
- **Purpose**: Top-level workspace containing multiple conversations
- **Key Features**:
  - Owner and collaborator management
  - Spatial positioning and viewport state
  - Activity tracking and statistics
  - Soft delete support
  - Version control for optimistic locking

### 2. Conversation Collection (`conversations`)  
- **Purpose**: Individual conversation trees with positioning on canvas
- **Key Features**:
  - Tree structure metadata (node count, max depth)
  - Participant tracking
  - Branching settings and limits
  - Activity and collaboration state
  - React Flow compatibility

### 3. ConversationNode Collection (`conversation_nodes`)
- **Purpose**: Individual messages with full branching support
- **Key Features**:
  - Parent-child relationships for tree structure
  - Spatial positioning within conversations
  - Generation state tracking (for AI responses)
  - Depth and branch indexing for tree traversal
  - React Flow node compatibility
  - Version control and collaboration tracking

### 4. EditingSession Collection (`editing_sessions`)
- **Purpose**: Real-time collaboration and conflict resolution
- **Key Features**:
  - User session tracking with TTL expiry
  - Exclusive locking mechanism
  - Activity heartbeats and timeout handling
  - Canvas, conversation, and node-level editing

## Key Features

### Optimistic Locking
- All documents include a `version` field that increments on each update
- Prevents concurrent modification conflicts
- UpdateNodeDto includes version for conflict detection

### Soft Delete
- All collections support soft delete with `isDeleted`, `deletedAt`, `deletedBy`
- Maintains referential integrity while allowing recovery
- Filtered queries exclude deleted documents by default

### Real-time Collaboration
- EditingSessions track who's editing what in real-time  
- Exclusive locks prevent conflicting edits
- Automatic cleanup of expired sessions and locks
- Activity tracking with configurable timeouts

### Performance Optimization
- Comprehensive indexing strategy for common query patterns
- Compound indexes for complex filtering (canvas + user + activity)
- Text search indexes for content discovery
- TTL indexes for automatic session cleanup

### React Flow Integration
- Nodes include `reactFlowId` for client-side compatibility
- Position tracking for spatial layout
- Parent-child relationships map to React Flow edges
- Automatic edge generation based on tree structure

## Indexes

### Canvas Indexes
```javascript
{ ownerId: 1, isDeleted: 1 }
{ 'collaborators.userId': 1, isDeleted: 1 }  
{ isPublic: 1, isDeleted: 1 }
{ shareToken: 1 } // unique, sparse
{ lastActivityAt: -1 }
{ ownerId: 1, lastActivityAt: -1, isDeleted: 1 } // compound
```

### Conversation Indexes  
```javascript
{ canvasId: 1, isDeleted: 1 }
{ canvasId: 1, createdAt: -1, isDeleted: 1 }
{ rootNodeId: 1 }
{ 'participants.id': 1 }
{ name: 'text', description: 'text' } // text search
```

### ConversationNode Indexes
```javascript
{ conversationId: 1, isDeleted: 1 }
{ canvasId: 1, isDeleted: 1 }
{ parentId: 1, isDeleted: 1 }  
{ reactFlowId: 1 } // unique
{ conversationId: 1, parentId: 1, branchIndex: 1, isDeleted: 1 } // tree traversal
{ prompt: 'text', response: 'text' } // content search
{ 'position.x': 1, 'position.y': 1 } // spatial queries
```

### EditingSession Indexes
```javascript
{ lastActivityAt: 1 } // TTL index, 24 hour expiry
{ userId: 1, isActive: 1 }
{ canvasId: 1, isActive: 1 }
{ editingTarget: 1, hasLock: 1, lockExpiry: 1 } // locking
{ sessionId: 1 } // unique
```

## Usage Examples

### Creating a Canvas
```typescript
const canvas = await canvasModel.create({
  name: 'My Workspace',
  ownerId: userId,
  collaborators: [{ userId: collaboratorId, permissions: 'write' }],
  settings: { allowGuestEditing: false, theme: 'dark' }
});
```

### Starting a Conversation
```typescript
const conversation = await conversationModel.create({
  name: 'AI Discussion',
  canvasId: canvas._id,
  position: { x: 100, y: 200 },
  allowBranching: true,
  maxNodes: 50
});
```

### Adding a Branching Node
```typescript
const childNode = await parentNode.createChild({
  prompt: 'What if we try a different approach?',
  position: { x: parentNode.position.x + 300, y: parentNode.position.y + 150 },
  userId: currentUser._id
});
```

### Real-time Collaboration
```typescript
// Start editing session
const session = await collaborationService.startSession({
  userId,
  user: { id: userId, name: 'John', email: 'john@example.com' },
  canvasId: canvas._id,
  nodeId: node._id,
  editingType: 'node',
  editingTarget: node._id
});

// Acquire exclusive lock
await collaborationService.acquireLock(session.sessionId, 30000);

// Make changes...

// Release lock
await collaborationService.releaseLock(session.sessionId);
```

### Querying with Relationships
```typescript
// Get conversation with all nodes
const conversation = await conversationModel
  .findById(conversationId)
  .populate('nodes');

// Get conversation path to specific node  
const path = await nodeModel.getConversationPath(nodeId);

// Find nearby nodes spatially
const nearbyNodes = await nodeModel.findNearby(
  canvasId, centerX, centerY, radius
);

// Search content across canvas
const results = await nodeModel.searchInCanvas(
  canvasId, 'machine learning'
);
```

## Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
MONGODB_URI=mongodb://localhost:27017/branching-conversations
ENABLE_COLLABORATION=true
SESSION_TIMEOUT_MINUTES=30
LOCK_TIMEOUT_SECONDS=30
```

## Migration from In-Memory Storage

The service maintains backward compatibility with the existing API while adding MongoDB persistence. All method signatures remain the same, but now return Promises and support real-time collaboration features.

Key changes:
- All service methods are now async
- Optimistic locking prevents concurrent modifications  
- Soft delete maintains data integrity
- Real-time sessions track editing state
- Comprehensive error handling for database operations

## Performance Considerations

1. **Connection Pooling**: Configured for 10 concurrent connections
2. **Query Optimization**: Indexes cover all common query patterns  
3. **Memory Usage**: Lean queries and virtuals reduce memory footprint
4. **Session Management**: TTL indexes auto-cleanup expired sessions
5. **Batch Operations**: Transactions ensure consistency for multi-document updates

## Monitoring and Maintenance

The system includes built-in monitoring:
- Session cleanup runs every 5 minutes
- Lock cleanup runs every minute  
- Canvas statistics track usage patterns
- Performance indexes support analytics queries

Use MongoDB Compass or similar tools to monitor:
- Index usage and performance
- Document growth and storage
- Query patterns and slow operations
- Session and lock statistics