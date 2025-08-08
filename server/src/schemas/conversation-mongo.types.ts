import { Document, Types } from 'mongoose';

// Base interfaces for MongoDB documents
export interface BaseDocument extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number; // For optimistic locking
  isDeleted: boolean; // For soft delete
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
}

// User reference interface
export interface UserReference {
  id: Types.ObjectId;
  name: string;
  email: string;
}

// Activity tracking
export interface ActivityInfo {
  lastEditedBy?: UserReference;
  lastEditedAt?: Date;
  isBeingEdited: boolean;
  currentEditors: UserReference[];
}

// Position interface (React Flow compatible)
export interface Position {
  x: number;
  y: number;
}

// Node interface with MongoDB support
export interface ConversationNodeDocument extends BaseDocument {
  prompt: string;
  response?: string;
  aiModel?: string; // Renamed to avoid conflict with Mongoose 'model'
  parentId?: Types.ObjectId;
  conversationId: Types.ObjectId; // Reference to parent conversation
  canvasId: Types.ObjectId; // Reference to parent canvas
  isGenerating?: boolean;
  position: Position;
  
  // Branching support
  childCount: number;
  depth: number; // Distance from root
  branchIndex: number; // Index among siblings
  
  // Activity tracking
  activity: ActivityInfo;
  
  // React Flow compatibility
  reactFlowId: string; // For client-side React Flow
  
  // Metadata
  tokenCount?: number;
  processingTime?: number;
  errorMessage?: string;
}

// Conversation Tree interface with MongoDB support
export interface ConversationDocument extends BaseDocument {
  name: string;
  description?: string;
  canvasId: Types.ObjectId; // Reference to parent canvas
  
  // Root node reference
  rootNodeId: Types.ObjectId;
  
  // Position on canvas
  position: Position;
  
  // Tree structure
  nodeCount: number;
  maxDepth: number;
  
  // Activity tracking
  activity: ActivityInfo;
  
  // React Flow compatibility - nodes and edges stored as computed fields
  // Actual nodes are stored in separate collection
  
  // Collaboration
  participants: UserReference[];
  
  // Settings
  defaultModel?: string;
  allowBranching: boolean;
  maxNodes?: number;
  
  // Statistics
  totalTokens?: number;
  avgResponseTime?: number;
}

// Canvas interface with MongoDB support
export interface CanvasDocument extends BaseDocument {
  name: string;
  description?: string;
  
  // Owner and permissions
  ownerId: Types.ObjectId;
  collaborators: {
    userId: Types.ObjectId;
    permissions: 'read' | 'write' | 'admin';
    joinedAt: Date;
  }[];
  
  // Visibility settings
  isPublic: boolean;
  shareToken?: string;
  
  // Layout settings
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  
  // Activity tracking
  activity: ActivityInfo;
  
  // Statistics
  totalConversations: number;
  totalNodes: number;
  lastActivityAt: Date;
  
  // Settings
  settings: {
    allowGuestEditing: boolean;
    maxConversations?: number;
    autoSave: boolean;
    theme: 'light' | 'dark';
  };
}

// React Flow specific interfaces
export interface ReactFlowNode {
  id: string;
  type: string;
  position: Position;
  data: {
    nodeId: string;
    conversationId: string;
    prompt: string;
    response?: string;
    model?: string;
    isGenerating?: boolean;
    isBeingEdited: boolean;
    currentEditor?: UserReference;
    childCount: number;
    depth: number;
  };
  draggable: boolean;
  selectable: boolean;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated: boolean;
  style?: any;
}

// Canvas with populated data for client
export interface CanvasWithData {
  canvas: CanvasDocument;
  conversations: ConversationDocument[];
  nodes: ConversationNodeDocument[];
  reactFlowNodes: ReactFlowNode[];
  reactFlowEdges: ReactFlowEdge[];
}

// Session tracking for real-time collaboration
export interface EditingSession extends Document {
  userId: Types.ObjectId;
  user: UserReference;
  canvasId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  nodeId?: Types.ObjectId;
  
  sessionId: string;
  startedAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  
  // What they're editing
  editingType: 'canvas' | 'conversation' | 'node';
  editingTarget: Types.ObjectId;
  
  // Lock information
  hasLock: boolean;
  lockExpiry?: Date;
}

// Database operation results
export interface CreateCanvasDto {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
  settings?: Partial<CanvasDocument['settings']>;
}

export interface CreateConversationDto {
  name: string;
  description?: string;
  canvasId: Types.ObjectId;
  position: Position;
  userId: Types.ObjectId;
}

export interface CreateNodeDto {
  prompt: string;
  model?: string;
  parentId?: Types.ObjectId;
  conversationId: Types.ObjectId;
  canvasId: Types.ObjectId;
  position: Position;
  userId: Types.ObjectId;
}

export interface UpdateNodeDto {
  prompt?: string;
  response?: string;
  position?: Position;
  userId: Types.ObjectId;
  version: number; // For optimistic locking
}

// Query interfaces
export interface GetCanvasQuery {
  includeDeleted?: boolean;
  includeNodes?: boolean;
  userId?: Types.ObjectId;
}

export interface NodeSearchQuery {
  canvasId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  parentId?: Types.ObjectId;
  searchText?: string;
  includeDeleted?: boolean;
  limit?: number;
  skip?: number;
}

// Event types for real-time updates
export interface RealtimeEvent {
  type: 'node_update' | 'node_create' | 'node_delete' | 'conversation_update' | 'canvas_update' | 'user_join' | 'user_leave' | 'lock_acquired' | 'lock_released';
  canvasId: string;
  conversationId?: string;
  nodeId?: string;
  userId: string;
  timestamp: Date;
  data: any;
}