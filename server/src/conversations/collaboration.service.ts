import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';

import { EditingSessionModel, EditingSessionDocument } from '../schemas/editing-session.schema';
import { UserReference } from '../schemas/conversation-mongo.types';

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
        isActive: true
      },
      {
        isActive: false,
        hasLock: false,
        lockExpiry: null
      }
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
      hasLock: false
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
      { new: true }
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
        lockExpiry: null
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Acquire an exclusive lock on a resource
   */
  async acquireLock(
    sessionId: string, 
    lockDurationMs: number = 30000
  ): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOne({ 
      sessionId, 
      isActive: true 
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
      isActive: true
    });

    if (existingLock) {
      throw new ConflictException('Resource is currently locked by another user');
    }

    // Acquire the lock
    const updatedSession = await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        hasLock: true,
        lockExpiry: new Date(Date.now() + lockDurationMs),
        lastActivityAt: new Date()
      },
      { new: true }
    );

    return updatedSession ? this.toSessionInfo(updatedSession) : null;
  }

  /**
   * Extend an existing lock
   */
  async extendLock(
    sessionId: string, 
    lockDurationMs: number = 30000
  ): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOneAndUpdate(
      { 
        sessionId, 
        hasLock: true, 
        isActive: true 
      },
      {
        lockExpiry: new Date(Date.now() + lockDurationMs),
        lastActivityAt: new Date()
      },
      { new: true }
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
        lastActivityAt: new Date()
      },
      { new: true }
    );

    return session ? this.toSessionInfo(session) : null;
  }

  /**
   * Get all active sessions for a canvas
   */
  async getActiveSessions(canvasId: Types.ObjectId): Promise<SessionInfo[]> {
    const sessions = await this.sessionModel.find({
      canvasId,
      isActive: true,
      lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // Active in last 5 minutes
    }).sort({ lastActivityAt: -1 });

    return sessions.map(session => this.toSessionInfo(session));
  }

  /**
   * Get active sessions for a specific resource
   */
  async getResourceSessions(editingTarget: Types.ObjectId): Promise<SessionInfo[]> {
    const sessions = await this.sessionModel.find({
      editingTarget,
      isActive: true,
      lastActivityAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
    }).sort({ lastActivityAt: -1 });

    return sessions.map(session => this.toSessionInfo(session));
  }

  /**
   * Check if a resource has an active lock
   */
  async hasActiveLock(
    editingTarget: Types.ObjectId, 
    excludeSessionId?: string
  ): Promise<boolean> {
    const filter: any = {
      editingTarget,
      hasLock: true,
      lockExpiry: { $gt: new Date() },
      isActive: true
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
  async getLockHolder(editingTarget: Types.ObjectId): Promise<SessionInfo | null> {
    const session = await this.sessionModel.findOne({
      editingTarget,
      hasLock: true,
      lockExpiry: { $gt: new Date() },
      isActive: true
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
        isActive: false
      }
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
  async getUserSessions(userId: Types.ObjectId, activeOnly: boolean = true): Promise<SessionInfo[]> {
    const filter: any = { userId };
    if (activeOnly) {
      filter.isActive = true;
    }

    const sessions = await this.sessionModel.find(filter)
      .sort({ lastActivityAt: -1 });

    return sessions.map(session => this.toSessionInfo(session));
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
          { hasLock: true, lockExpiry: { $lt: new Date() } } // Expired locks
        ],
        isActive: true
      },
      {
        $set: {
          isActive: false,
          hasLock: false,
          lockExpiry: null
        }
      }
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
        lockExpiry: { $lt: new Date() }
      },
      {
        $set: {
          hasLock: false,
          lockExpiry: null
        }
      }
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

    const [activeSessions, activeLocks, totalSessions, uniqueUsers] = await Promise.all([
      this.sessionModel.countDocuments({
        canvasId,
        isActive: true,
        lastActivityAt: { $gt: fiveMinutesAgo }
      }),
      this.sessionModel.countDocuments({
        canvasId,
        hasLock: true,
        lockExpiry: { $gt: new Date() },
        isActive: true
      }),
      this.sessionModel.countDocuments({ canvasId }),
      this.sessionModel.distinct('userId', {
        canvasId,
        isActive: true,
        lastActivityAt: { $gt: fiveMinutesAgo }
      })
    ]);

    return {
      activeSessions,
      activeUsers: uniqueUsers.length,
      activeLocks,
      totalSessions
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
      lockExpiry: session.lockExpiry
    };
  }
}