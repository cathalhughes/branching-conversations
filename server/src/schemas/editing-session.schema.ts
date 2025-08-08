import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { EditingSession, UserReference } from './conversation-mongo.types';

@Schema({ _id: false })
export class UserRef {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;
}

@Schema({ 
  timestamps: true,
  collection: 'editing_sessions',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class EditingSessionModel {
  _id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: UserRef, required: true })
  user: UserReference;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  canvasId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  conversationId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  nodeId?: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ type: Date, default: Date.now, index: true })
  startedAt: Date;

  @Prop({ type: Date, default: Date.now, index: true })
  lastActivityAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ 
    enum: ['canvas', 'conversation', 'node'], 
    required: true,
    index: true 
  })
  editingType: 'canvas' | 'conversation' | 'node';

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  editingTarget: Types.ObjectId;

  @Prop({ default: false, index: true })
  hasLock: boolean;

  @Prop({ type: Date, index: true })
  lockExpiry?: Date;

  // Timestamps (handled by mongoose timestamps: true)
  createdAt: Date;
  updatedAt: Date;
}

export const EditingSessionSchema = SchemaFactory.createForClass(EditingSessionModel);

// TTL Index - automatically remove inactive sessions after 24 hours
EditingSessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

// Indexes for performance
EditingSessionSchema.index({ userId: 1, isActive: 1 });
EditingSessionSchema.index({ canvasId: 1, isActive: 1 });
EditingSessionSchema.index({ conversationId: 1, isActive: 1 });
EditingSessionSchema.index({ nodeId: 1, isActive: 1 });
EditingSessionSchema.index({ editingType: 1, editingTarget: 1, isActive: 1 });
EditingSessionSchema.index({ hasLock: 1, lockExpiry: 1 });
EditingSessionSchema.index({ sessionId: 1 }, { unique: true });

// Compound indexes
EditingSessionSchema.index({ canvasId: 1, userId: 1, isActive: 1 });
EditingSessionSchema.index({ editingTarget: 1, hasLock: 1, lockExpiry: 1 });

// Pre-save middleware to update activity timestamp
EditingSessionSchema.pre('save', function(next) {
  this.lastActivityAt = new Date();
  next();
});

EditingSessionSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate() as any;
  if (update) {
    update.lastActivityAt = new Date();
  }
});

// Instance methods
EditingSessionSchema.methods.updateActivity = function() {
  this.lastActivityAt = new Date();
  return this.save();
};

EditingSessionSchema.methods.acquireLock = function(lockDurationMs = 30000) {
  this.hasLock = true;
  this.lockExpiry = new Date(Date.now() + lockDurationMs);
  this.lastActivityAt = new Date();
  return this.save();
};

EditingSessionSchema.methods.releaseLock = function() {
  this.hasLock = false;
  this.lockExpiry = undefined;
  this.lastActivityAt = new Date();
  return this.save();
};

EditingSessionSchema.methods.extendLock = function(lockDurationMs = 30000) {
  if (this.hasLock) {
    this.lockExpiry = new Date(Date.now() + lockDurationMs);
    this.lastActivityAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

EditingSessionSchema.methods.deactivate = function() {
  this.isActive = false;
  this.hasLock = false;
  this.lockExpiry = undefined;
  this.lastActivityAt = new Date();
  return this.save();
};

// Static methods
EditingSessionSchema.statics.createSession = function(data: {
  userId: Types.ObjectId;
  user: UserReference;
  canvasId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  nodeId?: Types.ObjectId;
  sessionId: string;
  editingType: 'canvas' | 'conversation' | 'node';
  editingTarget: Types.ObjectId;
}) {
  return this.create({
    ...data,
    isActive: true,
    hasLock: false,
    startedAt: new Date(),
    lastActivityAt: new Date()
  });
};

EditingSessionSchema.statics.findActiveByCanvas = function(canvasId: Types.ObjectId) {
  return this.find({ 
    canvasId, 
    isActive: true,
    lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // Active in last 5 minutes
  }).sort({ lastActivityAt: -1 });
};

EditingSessionSchema.statics.findActiveByTarget = function(editingTarget: Types.ObjectId) {
  return this.find({ 
    editingTarget, 
    isActive: true,
    lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
  }).sort({ lastActivityAt: -1 });
};

EditingSessionSchema.statics.findByUser = function(userId: Types.ObjectId, isActive = true) {
  const filter: any = { userId };
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }
  return this.find(filter).sort({ lastActivityAt: -1 });
};

EditingSessionSchema.statics.hasActiveLock = async function(editingTarget: Types.ObjectId, excludeSessionId?: string) {
  const filter: any = { 
    editingTarget,
    hasLock: true,
    lockExpiry: { $gt: new Date() },
    isActive: true
  };
  
  if (excludeSessionId) {
    filter.sessionId = { $ne: excludeSessionId };
  }
  
  const session = await this.findOne(filter);
  return session !== null;
};

EditingSessionSchema.statics.cleanupExpiredSessions = function() {
  const now = new Date();
  return this.updateMany(
    {
      $or: [
        { lastActivityAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } }, // Inactive for 5+ minutes
        { hasLock: true, lockExpiry: { $lt: now } } // Expired locks
      ],
      isActive: true
    },
    {
      $set: {
        isActive: false,
        hasLock: false,
        lockExpiry: null,
        updatedAt: now
      }
    }
  );
};

EditingSessionSchema.statics.cleanupExpiredLocks = function() {
  return this.updateMany(
    {
      hasLock: true,
      lockExpiry: { $lt: new Date() }
    },
    {
      $set: {
        hasLock: false,
        lockExpiry: null,
        updatedAt: new Date()
      }
    }
  );
};

// Virtual to check if lock is expired
EditingSessionSchema.virtual('isLockExpired').get(function() {
  return this.hasLock && this.lockExpiry && this.lockExpiry < new Date();
});

// Virtual to check if session is recent
EditingSessionSchema.virtual('isRecentlyActive').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.lastActivityAt > fiveMinutesAgo;
});

// JSON transformation handled in service layer

export type EditingSessionDocument = EditingSessionModel & Document;