import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  UserPresence,
  ConversationFocus,
  NodeLock,
  CursorPosition,
  TypingIndicator,
  CanvasPresence,
  JoinCanvasDto,
  LeaveCanvasDto,
  FocusConversationDto,
  LockNodeDto,
  UnlockNodeDto,
  UpdateCursorDto,
  UpdateTypingDto,
  GetCanvasPresenceDto,
  GetNodeLockDto,
  ClearStaleLocksDto,
  REDIS_KEYS,
  REDIS_TTL,
  RedisCollaborationError,
  ERROR_CODES,
} from '../types/redis.types';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis | undefined;
  private publisher: Redis | undefined;
  private subscriber: Redis | undefined;
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const redisUrl =
        this.configService.get('REDIS_URL') || 'redis://localhost:6379';
      const redisOptions = {
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: false, // Changed to false to avoid connection issues
      };

      // Create Redis instances
      this.redis = new Redis(redisUrl, redisOptions);
      this.publisher = new Redis(redisUrl, redisOptions);
      this.subscriber = new Redis(redisUrl, redisOptions);

      // Set up error handlers before connecting
      this.redis!.on('error', (error) => {
        this.logger.error('Redis main connection error:', error);
        this.isConnected = false;
      });

      this.publisher.on('error', (error) => {
        this.logger.error('Redis publisher connection error:', error);
      });

      this.subscriber.on('error', (error) => {
        this.logger.error('Redis subscriber connection error:', error);
      });

      // Set up connect handlers
      this.redis!.on('connect', () => {
        this.logger.log('Redis main connection established');
      });

      this.publisher.on('connect', () => {
        this.logger.log('Redis publisher connection established');
      });

      this.subscriber.on('connect', () => {
        this.logger.log('Redis subscriber connection established');
      });

      this.redis!.on('ready', () => {
        this.logger.log('Redis main connection ready');
        this.isConnected = true;
      });

      // Wait for all connections to be ready
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
          this.redis!.on('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Publisher connection timeout')), 10000);
          this.publisher!.on('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Subscriber connection timeout')), 10000);
          this.subscriber!.on('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        })
      ]);

      this.isConnected = true;
      this.logger.log('Redis service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      // Don't throw error - allow graceful fallback
      this.isConnected = false;
      this.redis = undefined;
      this.publisher = undefined;
      this.subscriber = undefined;
    }
  }

  private async disconnect() {
    if (this.redis) await this.redis!.disconnect();
    if (this.publisher) await this.publisher.disconnect();
    if (this.subscriber) await this.subscriber.disconnect();
    this.isConnected = false;
    this.logger.log('Redis service disconnected');
  }

  private ensureConnected() {
    if (!this.isConnected || !this.redis) {
      throw new RedisCollaborationError(
        'Redis is not connected',
        ERROR_CODES.REDIS_CONNECTION_ERROR,
      );
    }
  }

  // =================== CANVAS PRESENCE ===================

  async joinCanvas(dto: JoinCanvasDto): Promise<UserPresence> {
    this.ensureConnected();

    const presence: UserPresence = {
      userId: dto.userId,
      user: dto.user,
      joinedAt: new Date(),
      lastActivityAt: new Date(),
      isActive: true,
    };

    const pipeline = this.redis!.pipeline();

    // Set user presence data
    pipeline.hset(
      REDIS_KEYS.CANVAS_PRESENCE(dto.canvasId, dto.userId),
      'data',
      JSON.stringify(presence),
    );

    // Add to canvas presence set for quick lookups
    pipeline.sadd(REDIS_KEYS.CANVAS_PRESENCE_SET(dto.canvasId), dto.userId);

    // Set TTL
    pipeline.expire(
      REDIS_KEYS.CANVAS_PRESENCE(dto.canvasId, dto.userId),
      REDIS_TTL.PRESENCE,
    );

    // Set activity heartbeat
    pipeline.set(
      REDIS_KEYS.ACTIVITY_HEARTBEAT(dto.canvasId, dto.userId),
      Date.now(),
      'EX',
      REDIS_TTL.ACTIVITY_HEARTBEAT,
    );

    await pipeline.exec();

    // Publish presence event
    await this.safePublish(
      `canvas:${dto.canvasId}:events`,
      JSON.stringify({
        type: 'USER_JOINED',
        data: presence,
        timestamp: new Date().toISOString(),
      }),
    );

    return presence;
  }

  async leaveCanvas(dto: LeaveCanvasDto): Promise<boolean> {
    this.ensureConnected();

    const pipeline = this.redis!.pipeline();

    // Get user info before removal for event publishing
    const userPresenceKey = REDIS_KEYS.CANVAS_PRESENCE(
      dto.canvasId,
      dto.userId,
    );
    const presenceData = await this.redis!.hget(userPresenceKey, 'data');

    // Remove user presence
    pipeline.del(userPresenceKey);
    pipeline.srem(REDIS_KEYS.CANVAS_PRESENCE_SET(dto.canvasId), dto.userId);

    // Remove activity heartbeat
    pipeline.del(REDIS_KEYS.ACTIVITY_HEARTBEAT(dto.canvasId, dto.userId));

    // Remove cursor position
    pipeline.del(REDIS_KEYS.CURSOR_POSITION(dto.canvasId, dto.userId));
    pipeline.srem(REDIS_KEYS.CURSOR_POSITIONS_SET(dto.canvasId), dto.userId);

    // Clear any conversation focus
    const conversationFocusKeys = await this.redis!.keys(
      `canvas:${dto.canvasId}:conversation:*:focus:${dto.userId}`,
    );
    for (const key of conversationFocusKeys) {
      const parts = key.split(':');
      const conversationId = parts[3];
      pipeline.del(key);
      pipeline.srem(
        REDIS_KEYS.CONVERSATION_FOCUS_SET(dto.canvasId, conversationId),
        dto.userId,
      );
    }

    // Clear any typing indicators
    const typingKeys = await this.redis!.keys(
      `canvas:${dto.canvasId}:node:*:typing:${dto.userId}`,
    );
    for (const key of typingKeys) {
      const parts = key.split(':');
      const nodeId = parts[3];
      pipeline.del(key);
      pipeline.srem(
        REDIS_KEYS.TYPING_INDICATORS_SET(dto.canvasId, nodeId),
        dto.userId,
      );
    }

    await pipeline.exec();

    // Publish leave event if user data was found
    if (presenceData) {
      const presence = JSON.parse(presenceData) as UserPresence;
      await this.safePublish(
        `canvas:${dto.canvasId}:events`,
        JSON.stringify({
          type: 'USER_LEFT',
          data: { userId: dto.userId, user: presence.user },
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return true;
  }

  // =================== CONVERSATION FOCUS ===================

  async focusConversation(
    dto: FocusConversationDto,
  ): Promise<ConversationFocus> {
    this.ensureConnected();

    const focus: ConversationFocus = {
      userId: dto.userId,
      conversationId: dto.conversationId,
      focusedAt: new Date(),
      lastActivityAt: new Date(),
    };

    const pipeline = this.redis!.pipeline();

    // Clear any existing conversation focus for this user on this canvas
    const existingFocusKeys = await this.redis!.keys(
      `canvas:${dto.canvasId}:conversation:*:focus:${dto.userId}`,
    );
    for (const key of existingFocusKeys) {
      const parts = key.split(':');
      const oldConversationId = parts[3];
      pipeline.del(key);
      pipeline.srem(
        REDIS_KEYS.CONVERSATION_FOCUS_SET(dto.canvasId, oldConversationId),
        dto.userId,
      );
    }

    // Set new focus
    pipeline.hset(
      REDIS_KEYS.CONVERSATION_FOCUS(
        dto.canvasId,
        dto.conversationId,
        dto.userId,
      ),
      'data',
      JSON.stringify(focus),
    );

    // Add to conversation focus set
    pipeline.sadd(
      REDIS_KEYS.CONVERSATION_FOCUS_SET(dto.canvasId, dto.conversationId),
      dto.userId,
    );

    // Set TTL
    pipeline.expire(
      REDIS_KEYS.CONVERSATION_FOCUS(
        dto.canvasId,
        dto.conversationId,
        dto.userId,
      ),
      REDIS_TTL.CONVERSATION_FOCUS,
    );

    await pipeline.exec();

    // Publish focus event
    await this.safePublish(
      `canvas:${dto.canvasId}:events`,
      JSON.stringify({
        type: 'CONVERSATION_FOCUSED',
        data: { ...focus, user: dto.user },
        timestamp: new Date().toISOString(),
      }),
    );

    return focus;
  }

  // =================== NODE LOCKING ===================

  async lockNode(dto: LockNodeDto): Promise<NodeLock> {
    this.ensureConnected();

    const lockKey = REDIS_KEYS.NODE_LOCK(
      dto.canvasId,
      dto.conversationId,
      dto.nodeId,
    );
    const lockDuration = dto.lockDurationSeconds || REDIS_TTL.NODE_LOCK;

    // Check if lock already exists
    const existingLock = await this.redis!.get(lockKey);
    if (existingLock) {
      const lock = JSON.parse(existingLock) as NodeLock;
      if (lock.userId !== dto.userId) {
        throw new RedisCollaborationError(
          `Node is already locked by ${lock.user.name}`,
          ERROR_CODES.LOCK_ALREADY_HELD,
          { currentLock: lock },
        );
      }
      // If it's the same user, extend the lock
      lock.expiresAt = new Date(Date.now() + lockDuration * 1000);
      await this.redis!.set(lockKey, JSON.stringify(lock), 'EX', lockDuration);
      return lock;
    }

    const lock: NodeLock = {
      nodeId: dto.nodeId,
      userId: dto.userId,
      user: dto.user,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + lockDuration * 1000),
      sessionId: dto.sessionId,
    };

    // Use SET with NX (only if not exists) to ensure atomicity
    const result = await this.redis!.set(
      lockKey,
      JSON.stringify(lock),
      'EX',
      lockDuration,
      'NX',
    );

    if (!result) {
      // Lock was acquired by someone else between our check and set
      const currentLock = await this.redis!.get(lockKey);
      const parsedLock = currentLock
        ? (JSON.parse(currentLock) as NodeLock)
        : null;
      throw new RedisCollaborationError(
        'Node was locked by another user',
        ERROR_CODES.LOCK_ALREADY_HELD,
        { currentLock: parsedLock },
      );
    }

    // Publish lock event
    await this.safePublish(
      `canvas:${dto.canvasId}:events`,
      JSON.stringify({
        type: 'NODE_LOCKED',
        data: lock,
        timestamp: new Date().toISOString(),
      }),
    );

    return lock;
  }

  async unlockNode(dto: UnlockNodeDto): Promise<boolean> {
    this.ensureConnected();

    const lockKey = REDIS_KEYS.NODE_LOCK(
      dto.canvasId,
      dto.conversationId,
      dto.nodeId,
    );
    const existingLock = await this.redis!.get(lockKey);

    if (!existingLock) {
      return false; // No lock to release
    }

    const lock = JSON.parse(existingLock) as NodeLock;

    // Verify ownership
    if (lock.userId !== dto.userId) {
      throw new RedisCollaborationError(
        'Cannot unlock node - not owned by user',
        ERROR_CODES.LOCK_NOT_OWNED,
        { currentLock: lock },
      );
    }

    await this.redis!.del(lockKey);

    // Publish unlock event
    await this.safePublish(
      `canvas:${dto.canvasId}:events`,
      JSON.stringify({
        type: 'NODE_UNLOCKED',
        data: {
          nodeId: dto.nodeId,
          userId: dto.userId,
          conversationId: dto.conversationId,
        },
        timestamp: new Date().toISOString(),
      }),
    );

    return true;
  }

  async extendNodeLock(
    canvasId: string,
    conversationId: string,
    nodeId: string,
    userId: string,
    lockDurationSeconds: number = REDIS_TTL.NODE_LOCK,
  ): Promise<NodeLock | null> {
    this.ensureConnected();

    const lockKey = REDIS_KEYS.NODE_LOCK(canvasId, conversationId, nodeId);
    const existingLock = await this.redis!.get(lockKey);

    if (!existingLock) {
      return null;
    }

    const lock = JSON.parse(existingLock) as NodeLock;

    if (lock.userId !== userId) {
      throw new RedisCollaborationError(
        'Cannot extend lock - not owned by user',
        ERROR_CODES.LOCK_NOT_OWNED,
      );
    }

    lock.expiresAt = new Date(Date.now() + lockDurationSeconds * 1000);
    await this.redis!.set(
      lockKey,
      JSON.stringify(lock),
      'EX',
      lockDurationSeconds,
    );

    return lock;
  }

  // =================== CURSOR TRACKING ===================

  async updateCursorPosition(dto: UpdateCursorDto): Promise<CursorPosition> {
    this.ensureConnected();

    // Check throttle
    const throttleKey = REDIS_KEYS.CURSOR_THROTTLE(dto.userId);
    const isThrottled = await this.redis!.exists(throttleKey);

    if (isThrottled) {
      throw new RedisCollaborationError(
        'Cursor updates are being throttled',
        ERROR_CODES.THROTTLE_LIMIT_EXCEEDED,
      );
    }

    const cursor: CursorPosition = {
      userId: dto.userId,
      user: dto.user,
      x: dto.x,
      y: dto.y,
      updatedAt: new Date(),
    };

    const pipeline = this.redis!.pipeline();

    // Set cursor data
    pipeline.hset(
      REDIS_KEYS.CURSOR_POSITION(dto.canvasId, dto.userId),
      'data',
      JSON.stringify(cursor),
    );

    // Add to cursor set
    pipeline.sadd(REDIS_KEYS.CURSOR_POSITIONS_SET(dto.canvasId), dto.userId);

    // Set TTL
    pipeline.expire(
      REDIS_KEYS.CURSOR_POSITION(dto.canvasId, dto.userId),
      REDIS_TTL.CURSOR_POSITION,
    );

    // Set throttle
    pipeline.set(throttleKey, '1', 'EX', REDIS_TTL.CURSOR_THROTTLE);

    await pipeline.exec();

    // Publish cursor update (don't await to avoid blocking)
    void this.safePublish(
      `canvas:${dto.canvasId}:events`,
      JSON.stringify({
        type: 'CURSOR_UPDATED',
        data: cursor,
        timestamp: new Date().toISOString(),
      }),
    );

    return cursor;
  }

  // =================== TYPING INDICATORS ===================

  async updateTypingIndicator(dto: UpdateTypingDto): Promise<void> {
    this.ensureConnected();

    const typingKey = REDIS_KEYS.TYPING_INDICATOR(
      dto.canvasId,
      dto.nodeId,
      dto.userId,
    );

    if (dto.isTyping) {
      const typing: TypingIndicator = {
        userId: dto.userId,
        user: dto.user,
        nodeId: dto.nodeId,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      };

      const pipeline = this.redis!.pipeline();
      pipeline.set(
        typingKey,
        JSON.stringify(typing),
        'EX',
        REDIS_TTL.TYPING_INDICATOR,
      );
      pipeline.sadd(
        REDIS_KEYS.TYPING_INDICATORS_SET(dto.canvasId, dto.nodeId),
        dto.userId,
      );
      await pipeline.exec();

      // Publish typing started
      await this.safePublish(
        `canvas:${dto.canvasId}:events`,
        JSON.stringify({
          type: 'TYPING_STARTED',
          data: typing,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      const pipeline = this.redis!.pipeline();
      pipeline.del(typingKey);
      pipeline.srem(
        REDIS_KEYS.TYPING_INDICATORS_SET(dto.canvasId, dto.nodeId),
        dto.userId,
      );
      await pipeline.exec();

      // Publish typing stopped
      await this.safePublish(
        `canvas:${dto.canvasId}:events`,
        JSON.stringify({
          type: 'TYPING_STOPPED',
          data: {
            userId: dto.userId,
            nodeId: dto.nodeId,
          },
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  // =================== PRESENCE QUERIES ===================

  async getCanvasPresence(dto: GetCanvasPresenceDto): Promise<CanvasPresence> {
    this.ensureConnected();

    const canvasId = dto.canvasId;

    // Get all users present on canvas
    const userIds = await this.redis!.smembers(
      REDIS_KEYS.CANVAS_PRESENCE_SET(canvasId),
    );

    // Get user presence data
    const users: UserPresence[] = [];
    if (userIds.length > 0) {
      const pipeline = this.redis!.pipeline();
      userIds.forEach((userId) => {
        pipeline.hget(REDIS_KEYS.CANVAS_PRESENCE(canvasId, userId), 'data');
      });
      const results = await pipeline.exec();

      for (const [error, result] of results || []) {
        if (!error && result) {
          try {
            users.push(JSON.parse(result as string));
          } catch (e) {
            this.logger.warn('Failed to parse user presence data:', e);
          }
        }
      }
    }

    // Get conversation focus data
    const conversationFocus: Record<string, ConversationFocus[]> = {};
    const conversationKeys = await this.redis!.keys(
      `canvas:${canvasId}:conversation:*:focus`,
    );

    for (const setKey of conversationKeys) {
      const parts = setKey.split(':');
      const conversationId = parts[3];
      const focusedUserIds = await this.redis!.smembers(setKey);

      if (focusedUserIds.length > 0) {
        const focusData: ConversationFocus[] = [];
        const pipeline = this.redis!.pipeline();

        focusedUserIds.forEach((userId) => {
          pipeline.hget(
            REDIS_KEYS.CONVERSATION_FOCUS(canvasId, conversationId, userId),
            'data',
          );
        });

        const results = await pipeline.exec();
        for (const [error, result] of results || []) {
          if (!error && result) {
            try {
              focusData.push(JSON.parse(result as string));
            } catch (e) {
              this.logger.warn('Failed to parse conversation focus data:', e);
            }
          }
        }

        if (focusData.length > 0) {
          conversationFocus[conversationId] = focusData;
        }
      }
    }

    // Get node locks
    const nodeLocks: Record<string, NodeLock> = {};
    const lockKeys = await this.redis!.keys(
      `canvas:${canvasId}:conversation:*:node:*:lock`,
    );

    if (lockKeys.length > 0) {
      const pipeline = this.redis!.pipeline();
      lockKeys.forEach((key) => pipeline.get(key));
      const results = await pipeline.exec();

      for (let i = 0; i < lockKeys.length; i++) {
        const [error, result] = results?.[i] || [];
        if (!error && result) {
          try {
            const lock = JSON.parse(result as string) as NodeLock;
            nodeLocks[lock.nodeId] = lock;
          } catch (e) {
            this.logger.warn('Failed to parse lock data:', e);
          }
        }
      }
    }

    // Get cursor positions
    const cursors: Record<string, CursorPosition> = {};
    const cursorUserIds = await this.redis!.smembers(
      REDIS_KEYS.CURSOR_POSITIONS_SET(canvasId),
    );

    if (cursorUserIds.length > 0) {
      const pipeline = this.redis!.pipeline();
      cursorUserIds.forEach((userId) => {
        pipeline.hget(REDIS_KEYS.CURSOR_POSITION(canvasId, userId), 'data');
      });

      const results = await pipeline.exec();
      for (let i = 0; i < cursorUserIds.length; i++) {
        const [error, result] = results?.[i] || [];
        if (!error && result) {
          try {
            const cursor = JSON.parse(result as string) as CursorPosition;
            cursors[cursor.userId] = cursor;
          } catch (e) {
            this.logger.warn('Failed to parse cursor data:', e);
          }
        }
      }
    }

    // Get typing indicators
    const typingIndicators: Record<string, TypingIndicator[]> = {};
    const typingKeys = await this.redis!.keys(
      `canvas:${canvasId}:node:*:typing`,
    );

    for (const setKey of typingKeys) {
      const parts = setKey.split(':');
      const nodeId = parts[3];
      const typingUserIds = await this.redis!.smembers(setKey);

      if (typingUserIds.length > 0) {
        const typingData: TypingIndicator[] = [];
        const pipeline = this.redis!.pipeline();

        typingUserIds.forEach((userId) => {
          pipeline.get(REDIS_KEYS.TYPING_INDICATOR(canvasId, nodeId, userId));
        });

        const results = await pipeline.exec();
        for (const [error, result] of results || []) {
          if (!error && result) {
            try {
              typingData.push(JSON.parse(result as string));
            } catch (e) {
              this.logger.warn('Failed to parse typing indicator data:', e);
            }
          }
        }

        if (typingData.length > 0) {
          typingIndicators[nodeId] = typingData;
        }
      }
    }

    return {
      canvasId,
      users,
      conversationFocus,
      nodeLocks,
      cursors,
      typingIndicators,
      lastUpdated: new Date(),
    };
  }

  async getNodeLock(dto: GetNodeLockDto): Promise<NodeLock | null> {
    this.ensureConnected();

    const lockKey = REDIS_KEYS.NODE_LOCK(
      dto.canvasId,
      dto.conversationId,
      dto.nodeId,
    );
    const lockData = await this.redis!.get(lockKey);

    if (!lockData) {
      return null;
    }

    try {
      return JSON.parse(lockData) as NodeLock;
    } catch (e) {
      this.logger.warn('Failed to parse lock data:', e);
      return null;
    }
  }

  // =================== CLEANUP METHODS ===================

  async clearStaleLocksForCanvas(dto: ClearStaleLocksDto): Promise<number> {
    this.ensureConnected();

    const lockKeys = await this.redis!.keys(
      `canvas:${dto.canvasId}:conversation:*:node:*:lock`,
    );
    if (lockKeys.length === 0) {
      return 0;
    }

    let clearedCount = 0;
    const pipeline = this.redis!.pipeline();

    // Get all locks
    lockKeys.forEach((key) => pipeline.get(key));
    const results = await pipeline.exec();

    const staleLocks: string[] = [];
    const now = new Date();

    for (let i = 0; i < lockKeys.length; i++) {
      const [error, result] = results?.[i] || [];
      if (!error && result) {
        try {
          const lock = JSON.parse(result as string) as NodeLock;
          if (lock.expiresAt && new Date(lock.expiresAt) < now) {
            staleLocks.push(lockKeys[i]);
          }
        } catch (e) {
          // Invalid lock data, consider it stale
          staleLocks.push(lockKeys[i]);
        }
      }
    }

    if (staleLocks.length > 0) {
      await this.redis!.del(...staleLocks);
      clearedCount = staleLocks.length;

      // Publish lock expiry events
      for (const lockKey of staleLocks) {
        const parts = lockKey.split(':');
        const nodeId = parts[5]; // canvas:canvasId:conversation:convId:node:nodeId:lock

        void this.safePublish(
          `canvas:${dto.canvasId}:events`,
          JSON.stringify({
            type: 'LOCK_EXPIRED',
            data: { nodeId },
            timestamp: new Date().toISOString(),
          }),
        );
      }
    }

    return clearedCount;
  }

  async cleanupStalePresence(canvasId: string): Promise<number> {
    this.ensureConnected();

    const userIds = await this.redis!.smembers(
      REDIS_KEYS.CANVAS_PRESENCE_SET(canvasId),
    );
    if (userIds.length === 0) {
      return 0;
    }

    let cleanedCount = 0;
    const staleUserIds: string[] = [];

    // Check activity heartbeats
    const pipeline = this.redis!.pipeline();
    userIds.forEach((userId) => {
      pipeline.get(REDIS_KEYS.ACTIVITY_HEARTBEAT(canvasId, userId));
    });

    const results = await pipeline.exec();
    const now = Date.now();
    const staleThreshold = REDIS_TTL.ACTIVITY_HEARTBEAT * 2 * 1000; // 2x heartbeat TTL

    for (let i = 0; i < userIds.length; i++) {
      const [error, result] = results?.[i] || [];
      const userId = userIds[i];

      if (
        error ||
        !result ||
        now - parseInt(result as string) > staleThreshold
      ) {
        staleUserIds.push(userId);
      }
    }

    // Clean up stale users
    for (const userId of staleUserIds) {
      await this.leaveCanvas({ canvasId, userId });
      cleanedCount++;
    }

    return cleanedCount;
  }

  // =================== UTILITY METHODS ===================

  async updateActivityHeartbeat(
    canvasId: string,
    userId: string,
  ): Promise<void> {
    this.ensureConnected();

    await this.redis!.set(
      REDIS_KEYS.ACTIVITY_HEARTBEAT(canvasId, userId),
      Date.now(),
      'EX',
      REDIS_TTL.ACTIVITY_HEARTBEAT,
    );
  }

  async batchUpdateActivity(
    canvasId: string,
    userIds: string[],
  ): Promise<void> {
    this.ensureConnected();

    if (userIds.length === 0) return;

    const pipeline = this.redis!.pipeline();
    const timestamp = Date.now();

    userIds.forEach((userId) => {
      pipeline.set(
        REDIS_KEYS.ACTIVITY_HEARTBEAT(canvasId, userId),
        timestamp,
        'EX',
        REDIS_TTL.ACTIVITY_HEARTBEAT,
      );
    });

    await pipeline.exec();
  }

  // Pub/Sub methods for integration with Socket.IO
  getPublisher(): Redis | undefined {
    return this.publisher;
  }

  getSubscriber(): Redis | undefined {
    return this.subscriber;
  }

  // Helper method for safe publishing
  private async safePublish(channel: string, message: string): Promise<void> {
    if (this.publisher) {
      try {
        await this.publisher.publish(channel, message);
      } catch (error) {
        this.logger.error('Failed to publish Redis event:', error);
      }
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected || !this.redis) return false;

    try {
      await this.redis!.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }
}
