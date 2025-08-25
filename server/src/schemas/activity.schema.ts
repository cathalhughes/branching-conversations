import { Schema, Document } from 'mongoose';
import { ActivityType } from '../types/activity.types';

export interface ActivityDocument extends Document {
  _id: string;
  canvasId: string;
  conversationId?: string;
  nodeId?: string;
  userId: string;
  userName: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  batchId?: string;
}

export const ActivitySchema = new Schema<ActivityDocument>({
  canvasId: { 
    type: String, 
    required: true, 
    index: true 
  },
  conversationId: { 
    type: String, 
    index: true 
  },
  nodeId: { 
    type: String, 
    index: true 
  },
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  userName: { 
    type: String, 
    required: true 
  },
  activityType: { 
    type: String, 
    required: true, 
    enum: Object.values(ActivityType),
    index: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  metadata: { 
    type: Schema.Types.Mixed 
  },
  timestamp: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  batchId: { 
    type: String, 
    index: true 
  }
}, {
  timestamps: false,
  collection: 'activities'
});

ActivitySchema.index({ canvasId: 1, timestamp: -1 });
ActivitySchema.index({ conversationId: 1, timestamp: -1 });
ActivitySchema.index({ userId: 1, timestamp: -1 });
ActivitySchema.index({ activityType: 1, timestamp: -1 });