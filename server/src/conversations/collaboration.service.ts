import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { ActivityService } from './activity.service';

import {
  EditingSessionModel,
  EditingSessionDocument,
} from '../schemas/editing-session.schema';
import { UserReference } from '../schemas/conversation-mongo.types';
import { RedisService } from './redis.service';
import {
  JoinCanvasDto,
  LeaveCanvasDto,
  FocusConversationDto,
  LockNodeDto,
  UnlockNodeDto,
  CanvasPresence,
  NodeLock,
} from '../types/redis.types';

export interface CreateSessionDto {
  userId: Types.ObjectId;
  user: UserReference;
  canvasId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  nodeId?: Types.ObjectId;
  editingType: 'canvas' | 'conversation' | 'node';
  editingTarget: Types.ObjectId;
}

export interface SessionInfo {
  sessionId: string;
  user: UserReference;
  startedAt: Date;
  lastActivityAt: Date;
  editingType: 'canvas' | 'conversation' | 'node';
  editingTarget: string;
  hasLock: boolean;
  lockExpiry?: Date;
}

@Injectable()
export class CollaborationService {
  constructor(
    @InjectModel(EditingSessionModel.name)
    private sessionModel: Model<EditingSessionDocument>,
    private redisService: RedisService,
    private activityService: ActivityService,
  ) {}

  /**
   * Start a new editing session
   */
  async startSession(data: CreateSessionDto): Promise<SessionInfo> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // End any existing sessions for this user on the same target
    await this.sessionModel.updateMany(
      {
        userId: data.userId,
        editingTarget: data.editingTarget,
        isActive: true,
      },
      {
        isActive: false,
        hasLock: false,
        lockExpiry: null,
      },
    );

    const session = await this.sessionModel.create({
      userId: data.userId,
      user: data.user,
      canvasId: data.canvasId,
      conversationId: data.conversationId,
      nodeId: data.nodeId,
      sessionId,
      editingType: data.editingType,
      editingTarget: data.editingTarget,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      isActive: true,
      hasLock: false,
    });

    return this.toSessionInfo(session);
  }

  /**
   * Update session activity (heartbeat)
   */
  async updateActivity(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOneAndUpdate(
      { sessionId, isActive: true },
      { lastActivityAt: new Date() },
      { new: true },
    );

    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * End an editing session
   */
  async endSession(sessionId: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      { sessionId },
      {
        isActive: false,
        hasLock: false,
        lockExpiry: null,
      },
    );

    return result.modifiedCount > 0;
  }

  /**
   * Acquire an exclusive lock on a resource
   */
  async acquireLock(
    sessionId: string,
    lockDurationMs: number = 30000,
  ): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOne({
      sessionId,
      isActive: true,
    });

    if (!session) {
      return null;
    }

    // Check if anyone else has an active lock on this target
    const existingLock = await this.sessionModel.findOne({
      editingTarget: session.editingTarget,
      sessionId: { $ne: sessionId },
      hasLock: true,
      lockExpiry: { $gt: new Date() },
      isActive: true,
    });

    if (existingLock) {
      throw new ConflictException(
        'Resource is currently locked by another user',
      );
    }

    // Acquire the lock
    const updatedSession = await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        hasLock: true,
        lockExpiry: new Date(Date.now() + lockDurationMs),
        lastActivityAt: new Date(),
      },
      { new: true },
    );

    return updatedSession ? this.toSessionInfo(updatedSession) : null;
  }

  /**
   * Extend an existing lock
   */
  async extendLock(
    sessionId: string,
    lockDurationMs: number = 30000,
  ): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOneAndUpdate(
      {
        sessionId,
        hasLock: true,
        isActive: true,
      },
      {
        lockExpiry: new Date(Date.now() + lockDurationMs),
        lastActivityAt: new Date(),
      },
      { new: true },
    );

    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * Release a lock
   */
  async releaseLock(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOneAndUpdate(
      { sessionId, hasLock: true },
      {
        hasLock: false,
        lockExpiry: null,
        lastActivityAt: new Date(),
      },
      { new: true },
    );

    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * Get all active sessions for a canvas
   */
  async getActiveSessions(canvasId: Types.ObjectId): Promise<SessionInfo[]> {
    const sessions = await this.sessionModel
      .find({
        canvasId,
        isActive: true,
        lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }, // Active in last 5 minutes
      })
      .sort({ lastActivityAt: -1 });

    return sessions.map((session) => this.toSessionInfo(session));
  }

  /**
   * Get active sessions for a specific resource
   */
  async getResourceSessions(
    editingTarget: Types.ObjectId,
  ): Promise<SessionInfo[]> {
    const sessions = await this.sessionModel
      .find({
        editingTarget,
        isActive: true,
        lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
      })
      .sort({ lastActivityAt: -1 });

    return sessions.map((session) => this.toSessionInfo(session));
  }

  /**
   * Check if a resource has an active lock
   */
  async hasActiveLock(
    editingTarget: Types.ObjectId,
    excludeSessionId?: string,
  ): Promise<boolean> {
    const filter: any = {
      editingTarget,
      hasLock: true,
      lockExpiry: { $gt: new Date() },
      isActive: true,
    };

    if (excludeSessionId) {
      filter.sessionId = { $ne: excludeSessionId };
    }

    const session = await this.sessionModel.findOne(filter);
    return session !== null;
  }

  /**
   * Get lock holder information
   */
  async getLockHolder(
    editingTarget: Types.ObjectId,
  ): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOne({
      editingTarget,
      hasLock: true,
      lockExpiry: { $gt: new Date() },
      isActive: true,
    });

    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * Force release all locks for a user (admin function)
   */
  async forceReleaseUserLocks(userId: Types.ObjectId): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, hasLock: true },
      {
        hasLock: false,
        lockExpiry: null,
        isActive: false,
      },
    );

    return result.modifiedCount;
  }

  /**
   * Get session by session ID
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOne({ sessionId });
    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(
    userId: Types.ObjectId,
    activeOnly: boolean = true,
  ): Promise<SessionInfo[]> {
    const filter: any = { userId };
    if (activeOnly) {
      filter.isActive = true;
    }

    const sessions = await this.sessionModel
      .find(filter)
      .sort({ lastActivityAt: -1 });

    return sessions.map((session) => this.toSessionInfo(session));
  }

  /**
   * Cleanup expired sessions (runs every 5 minutes)
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionModel.updateMany(
      {
        $or: [
          { lastActivityAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }, // Inactive for 5+ minutes
          { hasLock: true, lockExpiry: { $lt: new Date() } }, // Expired locks
        ],
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          hasLock: false,
          lockExpiry: null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      console.log(`Cleaned up ${result.modifiedCount} expired sessions`);
    }

    return result.modifiedCount;
  }

  /**
   * Cleanup expired locks only (runs every minute)
   */
  @Cron('* * * * *') // Every minute
  async cleanupExpiredLocks(): Promise<number> {
    const result = await this.sessionModel.updateMany(
      {
        hasLock: true,
        lockExpiry: { $lt: new Date() },
      },
      {
        $set: {
          hasLock: false,
          lockExpiry: null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      console.log(`Released ${result.modifiedCount} expired locks`);
    }

    return result.modifiedCount;
  }

  /**
   * Get collaboration statistics for a canvas
   */
  async getCanvasStats(canvasId: Types.ObjectId): Promise<{
    activeSessions: number;
    activeUsers: number;
    activeLocks: number;
    totalSessions: number;
  }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [activeSessions, activeLocks, totalSessions, uniqueUsers] =
      await Promise.all([
        this.sessionModel.countDocuments({
          canvasId,
          isActive: true,
          lastActivityAt: { $gt: fiveMinutesAgo },
        }),
        this.sessionModel.countDocuments({
          canvasId,
          hasLock: true,
          lockExpiry: { $gt: new Date() },
          isActive: true,
        }),
        this.sessionModel.countDocuments({ canvasId }),
        this.sessionModel.distinct('userId', {
          canvasId,
          isActive: true,
          lastActivityAt: { $gt: fiveMinutesAgo },
        }),
      ]);

    return {
      activeSessions,
      activeUsers: uniqueUsers.length,
      activeLocks,
      totalSessions,
    };
  }

  // =================== REDIS INTEGRATION METHODS ===================

  /**
   * Start a session with both MongoDB persistence and Redis real-time tracking
   */
  async startHybridSession(data: CreateSessionDto): Promise<{
    mongoSession: SessionInfo;
    redisPresence?: any;
  }> {
    // Start MongoDB session first
    const mongoSession = await this.startSession(data);

    try {
      // Join canvas in Redis for real-time collaboration
      const redisDto: JoinCanvasDto = {
        canvasId: data.canvasId.toString(),
        userId: data.userId.toString(),
        user: {
          id: data.user.id.toString(),
          name: data.user.name,
          email: data.user.email,
        },
      };

      const redisPresence = await this.redisService.joinCanvas(redisDto);

      return { mongoSession, redisPresence };
    } catch (error) {
      // Redis is optional - if it fails, still return the MongoDB session
      console.warn('Failed to join canvas in Redis:', error);
      return { mongoSession };
    }
  }

  /**
   * End session and clean up both MongoDB and Redis
   */
  async endHybridSession(
    sessionId: string,
    canvasId?: string,
  ): Promise<boolean> {
    const session = await this.sessionModel.findOne({ sessionId });

    // End MongoDB session
    const mongoResult = await this.endSession(sessionId);

    if (session && canvasId) {
      try {
        // Leave canvas in Redis
        const redisDto: LeaveCanvasDto = {
          canvasId: canvasId,
          userId: session.userId.toString(),
        };

        await this.redisService.leaveCanvas(redisDto);
      } catch (error) {
        console.warn('Failed to leave canvas in Redis:', error);
      }
    }

    return mongoResult;
  }

  /**
   * Acquire lock with hybrid approach - MongoDB for persistence, Redis for real-time
   */
  async acquireHybridLock(
    sessionId: string,
    lockDurationMs: number = 30000,
  ): Promise<{ mongoSession: SessionInfo | null; redisLock?: NodeLock }> {
    // Get MongoDB lock first
    const mongoSession = await this.acquireLock(sessionId, lockDurationMs);

    if (!mongoSession) {
      return { mongoSession: null };
    }

    try {
      // Get the full session details for Redis
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session) {
        return { mongoSession };
      }

      // Acquire Redis lock for real-time notifications
      const redisDto: LockNodeDto = {
        canvasId: session.canvasId.toString(),
        conversationId: session.conversationId?.toString() || '',
        nodeId: session.nodeId?.toString() || session.editingTarget.toString(),
        userId: session.userId.toString(),
        user: {
          id: session.user.id.toString(),
          name: session.user.name,
          email: session.user.email,
        },
        sessionId: sessionId,
        lockDurationSeconds: Math.floor(lockDurationMs / 1000),
      };

      const redisLock = await this.redisService.lockNode(redisDto);

      return { mongoSession, redisLock };
    } catch (error) {
      console.warn('Failed to acquire Redis lock:', error);
      return { mongoSession };
    }
  }

  /**
   * Release lock from both systems
   */
  async releaseHybridLock(sessionId: string): Promise<{
    mongoSession: SessionInfo | null;
    redisSuccess?: boolean;
  }> {
    const session = await this.sessionModel.findOne({ sessionId });

    // Release MongoDB lock
    const mongoSession = await this.releaseLock(sessionId);

    if (session) {
      try {
        // Release Redis lock
        const redisDto: UnlockNodeDto = {
          canvasId: session.canvasId.toString(),
          conversationId: session.conversationId?.toString() || '',
          nodeId:
            session.nodeId?.toString() || session.editingTarget.toString(),
          userId: session.userId.toString(),
        };

        const redisSuccess = await this.redisService.unlockNode(redisDto);

        return { mongoSession, redisSuccess };
      } catch (error) {
        console.warn('Failed to release Redis lock:', error);
      }
    }

    return { mongoSession };
  }

  /**
   * Get comprehensive collaboration state (MongoDB + Redis)
   */
  async getHybridCanvasState(canvasId: Types.ObjectId): Promise<{
    activeSessions: SessionInfo[];
    canvasPresence?: CanvasPresence;
    stats: any;
  }> {
    // Get MongoDB sessions
    const activeSessions = await this.getActiveSessions(canvasId);
    const stats = await this.getCanvasStats(canvasId);

    try {
      // Get Redis presence
      const canvasPresence = await this.redisService.getCanvasPresence({
        canvasId: canvasId.toString(),
      });

      return { activeSessions, canvasPresence, stats };
    } catch (error) {
      console.warn('Failed to get Redis presence:', error);
      return { activeSessions, stats };
    }
  }

  /**
   * Focus conversation with Redis real-time updates
   */
  async focusConversationHybrid(
    userId: Types.ObjectId,
    canvasId: Types.ObjectId,
    conversationId: Types.ObjectId,
    user: UserReference,
  ): Promise<void> {
    try {
      const redisDto: FocusConversationDto = {
        canvasId: canvasId.toString(),
        conversationId: conversationId.toString(),
        userId: userId.toString(),
        user: {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
        },
      };

      await this.redisService.focusConversation(redisDto);
    } catch (error) {
      console.warn('Failed to focus conversation in Redis:', error);
    }
  }

  /**
   * Enhanced cleanup that handles both systems
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async hybridCleanup(): Promise<{
    mongoSessions: number;
    redisCleanup?: number;
  }> {
    // Clean MongoDB
    const mongoSessions = await this.cleanupExpiredSessions();

    try {
      // Clean Redis for all known canvases
      const canvases = await this.sessionModel.distinct('canvasId');
      let totalRedisCleanup = 0;

      for (const canvasId of canvases) {
        const cleaned = await this.redisService.clearStaleLocksForCanvas({
          canvasId: canvasId.toString(),
        });
        totalRedisCleanup += cleaned;

        const presenceCleaned = await this.redisService.cleanupStalePresence(
          canvasId.toString(),
        );
        totalRedisCleanup += presenceCleaned;
      }

      return { mongoSessions, redisCleanup: totalRedisCleanup };
    } catch (error) {
      console.warn('Failed Redis cleanup:', error);
      return { mongoSessions };
    }
  }

  /**
   * Get real-time lock status (prioritizes Redis, falls back to MongoDB)
   */
  async getRealtimeLockStatus(
    canvasId: Types.ObjectId,
    conversationId: Types.ObjectId,
    nodeId: Types.ObjectId,
  ): Promise<{
    hasLock: boolean;
    lockHolder?: any;
    source: 'redis' | 'mongodb';
  }> {
    try {
      // Try Redis first for real-time data
      const redisLock = await this.redisService.getNodeLock({
        canvasId: canvasId.toString(),
        conversationId: conversationId.toString(),
        nodeId: nodeId.toString(),
      });

      if (redisLock) {
        return {
          hasLock: true,
          lockHolder: redisLock,
          source: 'redis',
        };
      }
    } catch (error) {
      console.warn('Failed to check Redis lock:', error);
    }

    // Fall back to MongoDB
    const mongoLock = await this.hasActiveLock(nodeId);
    const lockHolder = mongoLock ? await this.getLockHolder(nodeId) : null;

    return {
      hasLock: mongoLock,
      lockHolder,
      source: 'mongodb',
    };
  }

  private toSessionInfo(session: EditingSessionDocument): SessionInfo {
    return {
      sessionId: session.sessionId,
      user: session.user,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      editingType: session.editingType,
      editingTarget: session.editingTarget.toString(),
      hasLock: session.hasLock,
      lockExpiry: session.lockExpiry,
    };
  }
}
