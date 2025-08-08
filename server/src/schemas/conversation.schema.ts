import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ConversationDocument, UserReference, ActivityInfo, Position } from './conversation-mongo.types';

@Schema({ _id: false })
export class ConversationPosition {
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
  collection: 'conversations',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class Conversation {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  // Parent canvas reference
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  canvasId: Types.ObjectId;

  // Root node reference
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  rootNodeId: Types.ObjectId;

  // Position on canvas
  @Prop({ type: ConversationPosition, required: true })
  position: Position;

  // Tree structure statistics
  @Prop({ default: 0, min: 0 })
  nodeCount: number;

  @Prop({ default: 0, min: 0 })
  maxDepth: number;

  // Activity tracking
  @Prop({ type: Activity, default: () => ({}) })
  activity: ActivityInfo;

  // Participants who have contributed to this conversation
  @Prop({ type: [UserRef], default: [] })
  participants: UserReference[];

  // Settings
  @Prop({ trim: true, maxlength: 50 })
  defaultModel?: string;

  @Prop({ default: true })
  allowBranching: boolean;

  @Prop({ min: 1 })
  maxNodes?: number;

  // Statistics
  @Prop({ default: 0, min: 0 })
  totalTokens?: number;

  @Prop({ default: 0, min: 0 })
  avgResponseTime?: number;

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

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes for performance
ConversationSchema.index({ canvasId: 1, isDeleted: 1 });
ConversationSchema.index({ canvasId: 1, createdAt: -1, isDeleted: 1 });
ConversationSchema.index({ rootNodeId: 1 });
ConversationSchema.index({ 'participants.id': 1 });
ConversationSchema.index({ 'activity.isBeingEdited': 1 });
ConversationSchema.index({ 'activity.lastEditedAt': -1 });

// Compound indexes
ConversationSchema.index({ canvasId: 1, 'activity.lastEditedAt': -1, isDeleted: 1 });
ConversationSchema.index({ canvasId: 1, nodeCount: -1, isDeleted: 1 });

// Text search index for name and description
ConversationSchema.index({ 
  name: 'text', 
  description: 'text' 
}, {
  weights: { name: 10, description: 5 }
});

// Pre-save middleware for optimistic locking
ConversationSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate() as any;
  if (update && !update.$setOnInsert) {
    update.$inc = { ...update.$inc, version: 1 };
    update.updatedAt = new Date();
    
    // Update activity timestamp
    if (!update['activity.lastEditedAt']) {
      update['activity.lastEditedAt'] = new Date();
    }
  }
});

ConversationSchema.pre('save', function(next) {
  if (this.isNew) {
    this.version = 1;
  } else {
    this.version = (this.version || 1) + 1;
  }
  
  // Update activity timestamp
  this.activity.lastEditedAt = new Date();
  next();
});

// Methods
ConversationSchema.methods.softDelete = function(deletedBy: Types.ObjectId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.version += 1;
  return this.save();
};

ConversationSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.version += 1;
  return this.save();
};

ConversationSchema.methods.addParticipant = function(user: UserReference) {
  const existingParticipant = this.participants.find(p => p.id.equals(user.id));
  if (!existingParticipant) {
    this.participants.push(user);
    this.version += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

ConversationSchema.methods.updateStats = function(nodeCount: number, maxDepth: number, totalTokens?: number) {
  this.nodeCount = nodeCount;
  this.maxDepth = maxDepth;
  if (totalTokens !== undefined) {
    this.totalTokens = totalTokens;
  }
  this.version += 1;
  return this.save();
};

ConversationSchema.methods.startEdit = function(user: UserReference) {
  if (!this.activity.currentEditors) {
    this.activity.currentEditors = [];
  }
  
  const existingEditor = this.activity.currentEditors.find(e => e.id.equals(user.id));
  if (!existingEditor) {
    this.activity.currentEditors.push(user);
    this.activity.isBeingEdited = true;
    this.activity.lastEditedBy = user;
    this.activity.lastEditedAt = new Date();
    this.version += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

ConversationSchema.methods.endEdit = function(userId: Types.ObjectId) {
  if (this.activity.currentEditors) {
    this.activity.currentEditors = this.activity.currentEditors.filter(e => !e.id.equals(userId));
    this.activity.isBeingEdited = this.activity.currentEditors.length > 0;
    this.version += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

// Static methods
ConversationSchema.statics.findByCanvas = function(canvasId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { canvasId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ 'activity.lastEditedAt': -1 });
};

ConversationSchema.statics.findByParticipant = function(userId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { 'participants.id': userId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ 'activity.lastEditedAt': -1 });
};

ConversationSchema.statics.searchInCanvas = function(canvasId: Types.ObjectId, searchText: string, includeDeleted = false) {
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

// Virtual population for nodes
ConversationSchema.virtual('nodes', {
  ref: 'ConversationNode',
  localField: '_id',
  foreignField: 'conversationId',
  match: { isDeleted: { $ne: true } },
  options: { sort: { createdAt: 1 } }
});

// JSON transformation handled in service layer

export type ConversationModel = Conversation & Document;