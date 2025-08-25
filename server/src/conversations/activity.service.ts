import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ActivityDocument } from '../schemas/activity.schema';
import { 
  ActivityEvent, 
  ActivityFilter, 
  ActivityBatch, 
  ActivityType,
  ActivityPriority 
} from '../types/activity.types';
import { CollaborationGateway } from './collaboration.gateway';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private batchingQueue: Map<string, ActivityEvent[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_DELAY = 2000; // 2 seconds
  private readonly MAX_BATCH_SIZE = 10;

  constructor(
    @InjectModel('Activity') private readonly activityModel: Model<ActivityDocument>,
    @Inject(forwardRef(() => CollaborationGateway))
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  async logActivity(event: ActivityEvent): Promise<void> {
    try {
      // Check if this should be batched
      if (this.shouldBatchActivity(event.activityType)) {
        await this.addToBatch(event);
        return;
      }

      // Log immediately for important events
      const activity = await this.createActivity(event);
      
      // Broadcast to connected clients
      this.collaborationGateway.broadcastActivity(event.canvasId, {
        id: activity._id,
        ...event,
        timestamp: activity.timestamp,
      });

      this.logger.log(`Activity logged: ${event.activityType} by ${event.userName}`);
    } catch (error) {
      this.logger.error(`Failed to log activity: ${error.message}`, error.stack);
    }
  }

  async getActivities(filter: ActivityFilter): Promise<ActivityDocument[]> {
    const query: any = {};
    
    if (filter.canvasId) query.canvasId = filter.canvasId;
    if (filter.conversationId) query.conversationId = filter.conversationId;
    if (filter.userId) query.userId = filter.userId;
    if (filter.activityTypes?.length) {
      query.activityType = { $in: filter.activityTypes };
    }
    if (filter.startDate || filter.endDate) {
      query.timestamp = {};
      if (filter.startDate) query.timestamp.$gte = filter.startDate;
      if (filter.endDate) query.timestamp.$lte = filter.endDate;
    }

    return this.activityModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(filter.limit || 50)
      .skip(filter.offset || 0)
      .exec();
  }

  async getActivitySummary(canvasId: string, hours: number = 24): Promise<any> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const summary = await this.activityModel.aggregate([
      {
        $match: {
          canvasId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          users: { $addToSet: '$userName' },
          latestActivity: { $max: '$timestamp' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const totalActivities = await this.activityModel.countDocuments({
      canvasId,
      timestamp: { $gte: startDate }
    });

    return {
      totalActivities,
      timeRange: `${hours} hours`,
      activityBreakdown: summary,
      mostActiveUsers: await this.getMostActiveUsers(canvasId, startDate)
    };
  }

  async cleanupOldActivities(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await this.activityModel.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    this.logger.log(`Cleaned up ${result.deletedCount} old activities`);
    return result.deletedCount;
  }

  private async createActivity(event: ActivityEvent): Promise<ActivityDocument> {
    return this.activityModel.create({
      canvasId: event.canvasId,
      conversationId: event.conversationId,
      nodeId: event.nodeId,
      userId: event.userId,
      userName: event.userName,
      activityType: event.activityType,
      description: event.description,
      metadata: event.metadata,
      batchId: event.batchId,
    });
  }

  private shouldBatchActivity(activityType: ActivityType): boolean {
    const batchableTypes = [
      ActivityType.NODE_EDITED,
      ActivityType.CONVERSATION_MOVED,
      ActivityType.NODE_LOCKED,
      ActivityType.NODE_UNLOCKED,
    ];
    
    return batchableTypes.includes(activityType);
  }

  private async addToBatch(event: ActivityEvent): Promise<void> {
    const batchKey = `${event.canvasId}_${event.userId}_${event.activityType}`;
    
    if (!this.batchingQueue.has(batchKey)) {
      this.batchingQueue.set(batchKey, []);
    }
    
    const batch = this.batchingQueue.get(batchKey) as any;
    batch.push(event);

    // Clear existing timer
    if (this.batchTimers.has(batchKey)) {
      clearTimeout(this.batchTimers.get(batchKey));
    }

    // Set new timer or process immediately if batch is full
    if (batch.length >= this.MAX_BATCH_SIZE) {
      await this.processBatch(batchKey);
    } else {
      const timer = setTimeout(() => this.processBatch(batchKey), this.BATCH_DELAY);
      this.batchTimers.set(batchKey, timer);
    }
  }

  private async processBatch(batchKey: string): Promise<void> {
    const batch = this.batchingQueue.get(batchKey);
    if (!batch || batch.length === 0) return;

    const batchId = uuidv4();
    const summary = this.createBatchSummary(batch);

    try {
      // Create batched activity
      const batchedEvent = {
        ...batch[0],
        activityType: batch[0].activityType,
        description: summary,
        metadata: {
          batchCount: batch.length,
          activities: batch.map(a => ({
            description: a.description,
            metadata: a.metadata,
            timestamp: new Date()
          }))
        },
        batchId,
      };

      const activity = await this.createActivity(batchedEvent);

      // Broadcast batched activity
      this.collaborationGateway.broadcastActivity(batch[0].canvasId, {
        id: activity._id,
        ...batchedEvent,
        timestamp: activity.timestamp,
      });

      this.logger.log(`Processed batch: ${batch.length} ${batch[0].activityType} activities`);
    } catch (error) {
      this.logger.error(`Failed to process batch: ${error.message}`);
    } finally {
      // Cleanup
      this.batchingQueue.delete(batchKey);
      if (this.batchTimers.has(batchKey)) {
        clearTimeout(this.batchTimers.get(batchKey));
        this.batchTimers.delete(batchKey);
      }
    }
  }

  private createBatchSummary(activities: ActivityEvent[]): string {
    if (activities.length === 1) {
      return activities[0].description;
    }

    const activityType = activities[0].activityType;
    const userName = activities[0].userName;
    
    switch (activityType) {
      case ActivityType.NODE_EDITED:
        return `${userName} made ${activities.length} edits`;
      case ActivityType.CONVERSATION_MOVED:
        return `${userName} moved ${activities.length} conversations`;
      case ActivityType.NODE_LOCKED:
        return `${userName} locked ${activities.length} nodes`;
      default:
        return `${userName} performed ${activities.length} ${activityType} actions`;
    }
  }

  private async getMostActiveUsers(canvasId: string, since: Date): Promise<any[]> {
    return this.activityModel.aggregate([
      {
        $match: {
          canvasId,
          timestamp: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$userId',
          userName: { $first: '$userName' },
          activityCount: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      },
      {
        $sort: { activityCount: -1 }
      },
      {
        $limit: 10
      }
    ]);
  }

  // Utility methods for specific activity types
  async logConversationCreated(canvasId: string, conversationId: string, userId: string, userName: string): Promise<void> {
    await this.logActivity({
      canvasId,
      conversationId,
      userId,
      userName,
      activityType: ActivityType.CONVERSATION_CREATED,
      description: `${userName} created a new conversation`,
      priority: ActivityPriority.MEDIUM,
    });
  }

  async logNodeEdited(canvasId: string, conversationId: string, nodeId: string, userId: string, userName: string, editType: string): Promise<void> {
    await this.logActivity({
      canvasId,
      conversationId,
      nodeId,
      userId,
      userName,
      activityType: ActivityType.NODE_EDITED,
      description: `${userName} ${editType} a node`,
      metadata: { editType },
      priority: ActivityPriority.LOW,
    });
  }

  async logUserJoined(canvasId: string, userId: string, userName: string): Promise<void> {
    await this.logActivity({
      canvasId,
      userId,
      userName,
      activityType: ActivityType.USER_JOINED_CANVAS,
      description: `${userName} joined the canvas`,
      priority: ActivityPriority.MEDIUM,
    });
  }

  async logBranchCreated(canvasId: string, conversationId: string, nodeId: string, userId: string, userName: string): Promise<void> {
    await this.logActivity({
      canvasId,
      conversationId,
      nodeId,
      userId,
      userName,
      activityType: ActivityType.BRANCH_CREATED,
      description: `${userName} created a branch`,
      priority: ActivityPriority.HIGH,
    });
  }
}