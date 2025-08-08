import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { CanvasDocument, UserReference, ActivityInfo, Position } from './conversation-mongo.types';

// Sub-schemas
@Schema({ _id: false })
export class CollaboratorInfo {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['read', 'write', 'admin'], default: 'write' })
  permissions: 'read' | 'write' | 'admin';

  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;
}

@Schema({ _id: false })
export class CanvasSettings {
  @Prop({ default: false })
  allowGuestEditing: boolean;

  @Prop()
  maxConversations?: number;

  @Prop({ default: true })
  autoSave: boolean;

  @Prop({ enum: ['light', 'dark'], default: 'light' })
  theme: 'light' | 'dark';
}

@Schema({ _id: false })
export class Viewport {
  @Prop({ type: Number, default: 0 })
  x: number;

  @Prop({ type: Number, default: 0 })
  y: number;

  @Prop({ type: Number, default: 1 })
  zoom: number;
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
  collection: 'canvases',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class Canvas {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  // Owner and permissions
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: [CollaboratorInfo], default: [] })
  collaborators: CollaboratorInfo[];

  // Visibility
  @Prop({ default: false, index: true })
  isPublic: boolean;

  @Prop({ unique: true, sparse: true })
  shareToken?: string;

  // Layout
  @Prop({ type: Viewport, default: () => ({ x: 0, y: 0, zoom: 1 }) })
  viewport: Viewport;

  // Activity tracking
  @Prop({ type: Activity, default: () => ({}) })
  activity: ActivityInfo;

  // Statistics
  @Prop({ default: 0, min: 0 })
  totalConversations: number;

  @Prop({ default: 0, min: 0 })
  totalNodes: number;

  @Prop({ type: Date, default: Date.now, index: true })
  lastActivityAt: Date;

  // Settings
  @Prop({ type: CanvasSettings, default: () => ({}) })
  settings: CanvasSettings;

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

export const CanvasSchema = SchemaFactory.createForClass(Canvas);

// Indexes for performance
CanvasSchema.index({ ownerId: 1, isDeleted: 1 });
CanvasSchema.index({ 'collaborators.userId': 1, isDeleted: 1 });
CanvasSchema.index({ isPublic: 1, isDeleted: 1 });
CanvasSchema.index({ shareToken: 1 }, { unique: true, sparse: true });
CanvasSchema.index({ lastActivityAt: -1 });
CanvasSchema.index({ createdAt: -1 });
CanvasSchema.index({ 'activity.isBeingEdited': 1 });

// Compound indexes
CanvasSchema.index({ ownerId: 1, lastActivityAt: -1, isDeleted: 1 });
CanvasSchema.index({ 'collaborators.userId': 1, lastActivityAt: -1, isDeleted: 1 });

// Pre-save middleware to update version for optimistic locking
CanvasSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate() as any;
  if (update) {
    update.$inc = { ...update.$inc, version: 1 };
    update.updatedAt = new Date();
  }
});

// Pre-save middleware for new documents
CanvasSchema.pre('save', function(next) {
  if (this.isNew) {
    this.version = 1;
  } else {
    this.version = (this.version || 1) + 1;
  }
  next();
});

// Soft delete methods
CanvasSchema.methods.softDelete = function(deletedBy: Types.ObjectId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.version += 1;
  return this.save();
};

CanvasSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.version += 1;
  return this.save();
};

// Static methods for common queries
CanvasSchema.statics.findByOwner = function(ownerId: Types.ObjectId, includeDeleted = false) {
  const filter: any = { ownerId };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ lastActivityAt: -1 });
};

CanvasSchema.statics.findByCollaborator = function(userId: Types.ObjectId, includeDeleted = false) {
  const filter: any = {
    $or: [
      { ownerId: userId },
      { 'collaborators.userId': userId }
    ]
  };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ lastActivityAt: -1 });
};

CanvasSchema.statics.findPublic = function(includeDeleted = false) {
  const filter: any = { isPublic: true };
  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }
  return this.find(filter).sort({ lastActivityAt: -1 });
};

// Virtual for checking if user has access
CanvasSchema.virtual('userAccess').get(function(userId: Types.ObjectId) {
  if (!userId) return null;
  
  if (this.ownerId.equals(userId)) {
    return { role: 'owner', permissions: 'admin' };
  }
  
  const collaborator = this.collaborators.find(c => c.userId.equals(userId));
  if (collaborator) {
    return { role: 'collaborator', permissions: collaborator.permissions };
  }
  
  if (this.isPublic) {
    return { role: 'public', permissions: 'read' };
  }
  
  return null;
});

// JSON transformation handled in service layer

export type CanvasModel = Canvas & Document;