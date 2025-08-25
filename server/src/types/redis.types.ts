export interface UserPresence {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  joinedAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

export interface ConversationFocus {
  userId: string;
  conversationId: string;
  focusedAt: Date;
  lastActivityAt: Date;
}

export interface NodeLock {
  nodeId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  lockedAt: Date;
  expiresAt: Date;
  sessionId: string;
}

export interface CursorPosition {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  x: number;
  y: number;
  updatedAt: Date;
}

export interface TypingIndicator {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  nodeId: string;
  startedAt: Date;
  lastActivityAt: Date;
}

// Canvas presence aggregated view
export interface CanvasPresence {
  canvasId: string;
  users: UserPresence[];
  conversationFocus: Record<string, ConversationFocus[]>; // conversationId -> users focusing
  nodeLocks: Record<string, NodeLock>; // nodeId -> lock info
  cursors: Record<string, CursorPosition>; // userId -> cursor position
  typingIndicators: Record<string, TypingIndicator[]>; // nodeId -> typing users
  lastUpdated: Date;
}

// Redis key patterns
export const REDIS_KEYS = {
  // Canvas level: canvas:{canvasId}:presence:{userId}
  CANVAS_PRESENCE: (canvasId: string, userId: string) =>
    `canvas:${canvasId}:presence:${userId}`,
  CANVAS_PRESENCE_SET: (canvasId: string) => `canvas:${canvasId}:presence`,

  // Conversation focus: canvas:{canvasId}:conversation:{conversationId}:focus:{userId}
  CONVERSATION_FOCUS: (
    canvasId: string,
    conversationId: string,
    userId: string,
  ) => `canvas:${canvasId}:conversation:${conversationId}:focus:${userId}`,
  CONVERSATION_FOCUS_SET: (canvasId: string, conversationId: string) =>
    `canvas:${canvasId}:conversation:${conversationId}:focus`,

  // Node locks: canvas:{canvasId}:conversation:{conversationId}:node:{nodeId}:lock
  NODE_LOCK: (canvasId: string, conversationId: string, nodeId: string) =>
    `canvas:${canvasId}:conversation:${conversationId}:node:${nodeId}:lock`,

  // Cursor positions: canvas:{canvasId}:cursor:{userId}
  CURSOR_POSITION: (canvasId: string, userId: string) =>
    `canvas:${canvasId}:cursor:${userId}`,
  CURSOR_POSITIONS_SET: (canvasId: string) => `canvas:${canvasId}:cursors`,

  // Typing indicators: canvas:{canvasId}:node:{nodeId}:typing:{userId}
  TYPING_INDICATOR: (canvasId: string, nodeId: string, userId: string) =>
    `canvas:${canvasId}:node:${nodeId}:typing:${userId}`,
  TYPING_INDICATORS_SET: (canvasId: string, nodeId: string) =>
    `canvas:${canvasId}:node:${nodeId}:typing`,

  // Activity heartbeats: canvas:{canvasId}:activity:{userId}
  ACTIVITY_HEARTBEAT: (canvasId: string, userId: string) =>
    `canvas:${canvasId}:activity:${userId}`,

  // Throttling keys for cursor updates: throttle:cursor:{userId}
  CURSOR_THROTTLE: (userId: string) => `throttle:cursor:${userId}`,
} as const;

// TTL constants (in seconds)
export const REDIS_TTL = {
  PRESENCE: 300, // 5 minutes
  CONVERSATION_FOCUS: 300, // 5 minutes
  NODE_LOCK: 30, // 30 seconds
  CURSOR_POSITION: 60, // 1 minute
  TYPING_INDICATOR: 10, // 10 seconds
  ACTIVITY_HEARTBEAT: 30, // 30 seconds
  CURSOR_THROTTLE: 1, // 1 second
} as const;

// Redis operation DTOs
export interface JoinCanvasDto {
  canvasId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface LeaveCanvasDto {
  canvasId: string;
  userId: string;
}

export interface FocusConversationDto {
  canvasId: string;
  conversationId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface LockNodeDto {
  canvasId: string;
  conversationId: string;
  nodeId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  sessionId: string;
  lockDurationSeconds?: number; // defaults to 30
}

export interface UnlockNodeDto {
  canvasId: string;
  conversationId: string;
  nodeId: string;
  userId: string;
}

export interface UpdateCursorDto {
  canvasId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  x: number;
  y: number;
}

export interface UpdateTypingDto {
  canvasId: string;
  nodeId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  isTyping: boolean;
}

export interface GetCanvasPresenceDto {
  canvasId: string;
}

export interface GetNodeLockDto {
  canvasId: string;
  conversationId: string;
  nodeId: string;
}

export interface ClearStaleLocksDto {
  canvasId: string;
}

// WebSocket event types
export const SOCKET_EVENTS = {
  // Inbound events from client
  JOIN_CANVAS: 'join_canvas',
  LEAVE_CANVAS: 'leave_canvas',
  FOCUS_CONVERSATION: 'focus_conversation',
  LOCK_NODE: 'lock_node',
  UNLOCK_NODE: 'unlock_node',
  UPDATE_CURSOR: 'update_cursor',
  START_TYPING: 'start_typing',
  STOP_TYPING: 'stop_typing',
  HEARTBEAT: 'heartbeat',

  // Outbound events to client
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  CONVERSATION_FOCUSED: 'conversation_focused',
  NODE_LOCKED: 'node_locked',
  NODE_UNLOCKED: 'node_unlocked',
  CURSOR_UPDATED: 'cursor_updated',
  TYPING_STARTED: 'typing_started',
  TYPING_STOPPED: 'typing_stopped',
  PRESENCE_UPDATE: 'presence_update',
  LOCK_EXPIRED: 'lock_expired',
  FORCE_UNLOCK: 'force_unlock',
} as const;

// Error types
export class RedisCollaborationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'RedisCollaborationError';
  }
}

export const ERROR_CODES = {
  LOCK_ALREADY_HELD: 'LOCK_ALREADY_HELD',
  LOCK_NOT_FOUND: 'LOCK_NOT_FOUND',
  LOCK_NOT_OWNED: 'LOCK_NOT_OWNED',
  USER_NOT_PRESENT: 'USER_NOT_PRESENT',
  THROTTLE_LIMIT_EXCEEDED: 'THROTTLE_LIMIT_EXCEEDED',
  REDIS_CONNECTION_ERROR: 'REDIS_CONNECTION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;
