import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ConversationNodeDocument, UserReference, ActivityInfo, Position } from './conversation-mongo.types';

@Schema({ _id: false })
export class NodePosition {
  @Prop({ type: Number, required: true })
  x: number;

  @Prop({ type: Number, required: true })
  y: number;
}

@Schema({ _id: false })
export class UserRef {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;
}

@Schema({ _id: false })
export class Activity {
  @Prop({ type: UserRef })
  lastEditedBy?: UserReference;

  @Prop({ type: Date })
  lastEditedAt?: Date;

  @Prop({ default: false })
  isBeingEdited: boolean;

  @Prop({ type: [UserRef], default: [] })
  currentEditors: UserReference[];
}

@Schema({ 
  timestamps: true,
  collection: 'conversation_nodes',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class ConversationNode {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 10000 })
  prompt: string;

  @Prop({ trim: true, maxlength: 50000 })
  response?: string;

  @Prop({ trim: true, maxlength: 50 })
  aiModel?: string;

  // Tree structure
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  canvasId: Types.ObjectId;

  // Generation state
  @Prop({ default: false, index: true })
  isGenerating?: boolean;

  // Position
  @Prop({ type: NodePosition, required: true })
  position: Position;

  // Branching support
  @Prop({ default: 0, min: 0 })
  childCount: number;

  @Prop({ default: 0, min: 0 })
  depth: number;

  @Prop({ default: 0, min: 0 })
  branchIndex: number;

  // Activity tracking
  @Prop({ type: Activity, default: () => ({}) })
  activity: ActivityInfo;

  // React Flow compatibility
  @Prop({ required: true, index: true })
  reactFlowId: string;

  // Metadata
  @Prop({ min: 0 })
  tokenCount?: number;

  @Prop({ min: 0 })
  processingTime?: number;

  @Prop({ trim: true, maxlength: 1000 })
  errorMessage?: string;

  // Soft delete
  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  deletedBy?: Types.ObjectId;

  // Optimistic locking
  @Prop({ default: 1, min: 1 })
  version: number;

  // Timestamps (handled by mongoose timestamps: true)
  createdAt: Date;
  updatedAt: Date;
}

export const ConversationNodeSchema = SchemaFactory.createForClass(ConversationNode);

// Indexes for performance
ConversationNodeSchema.index({ conversationId: 1, isDeleted: 1 });
ConversationNodeSchema.index({ canvasId: 1, isDeleted: 1 });
ConversationNodeSchema.index({ parentId: 1, isDeleted: 1 });
ConversationNodeSchema.index({ reactFlowId: 1 }, { unique: true });
ConversationNodeSchema.index({ isGenerating: 1 });
ConversationNodeSchema.index({ 'activity.isBeingEdited': 1 });
ConversationNodeSchema.index({ createdAt: -1 });
ConversationNodeSchema.index({ depth: 1, branchIndex: 1 });

// Compound indexes for tree traversal
ConversationNodeSchema.index({ conversationId: 1, parentId: 1, branchIndex: 1, isDeleted: 1 });
ConversationNodeSchema.index({ conversationId: 1, depth: 1, isDeleted: 1 });
ConversationNodeSchema.index({ canvasId: 1, conversationId: 1, createdAt: -1, isDeleted: 1 });

// Text search index for prompt and response
ConversationNodeSchema.index({ 
  prompt: 'text', 
  response: 'text' 
}, {
  weights: { prompt: 10, response: 5 }
});

// Geospatial index for position-based queries (finding nearby nodes)
ConversationNodeSchema.index({ 
  'position.x': 1, 
  'position.y': 1 
});

// Pre-save middleware for optimistic locking and tree management
ConversationNodeSchema.pre('save', function(next) {
  if (this.isNew) {
    this.version = 1;
    
    // Generate unique ReactFlow ID if not provided
    if (!this.reactFlowId) {
      this.reactFlowId = `node-${this._id.toString()}`;
    }
  } else {
    this.version = (this.version || 1) + 1;
  }
  
  // Update activity timestamp
  this.activity.lastEditedAt = new Date();
  next();
});

ConversationNodeSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate() as any;
  if (update && !update.$setOnInsert) {
    update.$inc = { ...update.$inc, version: 1 };
    update.updatedAt = new Date();
    update['activity.lastEditedAt'] = new Date();
  }
});

// Note: Post-save middleware for updating counts is handled in the service layer
// to avoid TypeScript issues with Mongoose method signatures

// Instance methods are handled in the service layer to avoid TypeScript complexity

// Static methods
ConversationNodeSchema.statics.findByConversation = function(conversationId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { conversationId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ depth: 1, branchIndex: 1 });
};

ConversationNodeSchema.statics.findChildren = function(parentId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { parentId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ branchIndex: 1 });
};

ConversationNodeSchema.statics.findByCanvas = function(canvasId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { canvasId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ createdAt: -1 });
};

ConversationNodeSchema.statics.findRoot = function(conversationId: Types.ObjectId) {
  return this.findOne({ 
    conversationId, 
    parentId: { $exists: false },
    isDeleted: { $ne: true }
  });
};

// getConversationPath method moved to service layer

ConversationNodeSchema.statics.searchInCanvas = function(canvasId: Types.ObjectId, searchText: string, includeDeleted = false) {
  const filter: any = { 
    canvasId,
    $text: { $search: searchText }
  };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

ConversationNodeSchema.statics.findNearby = function(
  canvasId: Types.ObjectId, 
  centerX: number, 
  centerY: number, 
  radius: number,
  includeDeleted = false
) {
  const filter: any = { 
    canvasId,
    'position.x': { $gte: centerX - radius, $lte: centerX + radius },
    'position.y': { $gte: centerY - radius, $lte: centerY + radius }
  };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter);
};

// Virtual for checking if node is root
ConversationNodeSchema.virtual('isRoot').get(function() {
  return !this.parentId;
});

// Virtual for checking if node is leaf
ConversationNodeSchema.virtual('isLeaf').get(function() {
  return this.childCount === 0;
});

// JSON transformation handled in service layer

export type ConversationNodeModel = ConversationNode & Document;