export enum ActivityType {
  // Conversation activities
  CONVERSATION_CREATED = 'conversation_created',
  CONVERSATION_DELETED = 'conversation_deleted',
  CONVERSATION_MOVED = 'conversation_moved',
  CONVERSATION_RENAMED = 'conversation_renamed',
  
  // Node activities
  NODE_CREATED = 'node_created',
  NODE_EDITED = 'node_edited',
  NODE_DELETED = 'node_deleted',
  BRANCH_CREATED = 'branch_created',
  
  // File activities
  FILE_UPLOADED = 'file_uploaded',
  
  // Collaboration activities
  USER_JOINED_CANVAS = 'user_joined_canvas',
  USER_LEFT_CANVAS = 'user_left_canvas',
  NODE_LOCKED = 'node_locked',
  NODE_UNLOCKED = 'node_unlocked',
  
  // Bulk operations
  BULK_DELETE = 'bulk_delete',
  BULK_MOVE = 'bulk_move',
  CANVAS_REORGANIZED = 'canvas_reorganized',
  
  // System events
  CONFLICT_DETECTED = 'conflict_detected',
  ERROR_OCCURRED = 'error_occurred'
}

export enum ActivityPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ActivityEvent {
  canvasId: string;
  conversationId?: string;
  nodeId?: string;
  userId: string;
  userName: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, any>;
  priority?: ActivityPriority;
  batchId?: string;
}

export interface ActivityFilter {
  canvasId?: string;
  conversationId?: string;
  userId?: string;
  activityTypes?: ActivityType[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ActivityBatch {
  batchId: string;
  activities: ActivityEvent[];
  summary: string;
  timestamp: Date;
}