import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CollaborationService } from './collaboration.service';
import { RedisService } from './redis.service';
import { ActivityService } from './activity.service';
import {
  JoinCanvasDto,
  LeaveCanvasDto,
  FocusConversationDto,
  LockNodeDto,
  UnlockNodeDto,
  UpdateCursorDto,
  UpdateTypingDto,
} from '../types/redis.types';
import { ActivityFilter, ActivityType } from '../types/activity.types';

@Controller('collaboration')
export class CollaborationController {
  constructor(
    private collaborationService: CollaborationService,
    private redisService: RedisService,
    private activityService: ActivityService,
  ) {}

  // =================== CANVAS PRESENCE ===================

  @Post('canvas/join')
  async joinCanvas(@Body() dto: JoinCanvasDto) {
    try {
      const presence = await this.redisService.joinCanvas(dto);
      return {
        success: true,
        data: presence,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to join canvas',
      );
    }
  }

  @Post('canvas/leave')
  async leaveCanvas(@Body() dto: LeaveCanvasDto) {
    try {
      const success = await this.redisService.leaveCanvas(dto);
      return {
        success,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to leave canvas',
      );
    }
  }

  @Get('canvas/:canvasId/presence')
  async getCanvasPresence(@Param('canvasId') canvasId: string) {
    try {
      const presence = await this.redisService.getCanvasPresence({ canvasId });
      return {
        success: true,
        data: presence,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get canvas presence',
      );
    }
  }

  @Get('canvas/:canvasId/hybrid-state')
  async getHybridCanvasState(@Param('canvasId') canvasId: string) {
    try {
      if (!Types.ObjectId.isValid(canvasId)) {
        throw new BadRequestException('Invalid canvas ID');
      }

      const state = await this.collaborationService.getHybridCanvasState(
        new Types.ObjectId(canvasId),
      );

      return {
        success: true,
        data: state,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to get canvas state',
      );
    }
  }

  // =================== CONVERSATION FOCUS ===================

  @Post('conversation/focus')
  async focusConversation(@Body() dto: FocusConversationDto) {
    try {
      const focus = await this.redisService.focusConversation(dto);
      return {
        success: true,
        data: focus,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to focus conversation',
      );
    }
  }

  // =================== NODE LOCKING ===================

  @Post('node/lock')
  async lockNode(@Body() dto: LockNodeDto) {
    try {
      const lock = await this.redisService.lockNode(dto);
      return {
        success: true,
        data: lock,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to lock node',
      );
    }
  }

  @Post('node/unlock')
  async unlockNode(@Body() dto: UnlockNodeDto) {
    try {
      const success = await this.redisService.unlockNode(dto);
      return {
        success,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to unlock node',
      );
    }
  }

  @Get('node/:canvasId/:conversationId/:nodeId/lock')
  async getNodeLock(
    @Param('canvasId') canvasId: string,
    @Param('conversationId') conversationId: string,
    @Param('nodeId') nodeId: string,
  ) {
    try {
      const lock = await this.redisService.getNodeLock({
        canvasId,
        conversationId,
        nodeId,
      });

      return {
        success: true,
        data: lock,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to get node lock',
      );
    }
  }

  @Get('node/:canvasId/:conversationId/:nodeId/lock/realtime')
  async getRealtimeLockStatus(
    @Param('canvasId') canvasId: string,
    @Param('conversationId') conversationId: string,
    @Param('nodeId') nodeId: string,
  ) {
    try {
      if (
        !Types.ObjectId.isValid(canvasId) ||
        !Types.ObjectId.isValid(conversationId) ||
        !Types.ObjectId.isValid(nodeId)
      ) {
        throw new BadRequestException('Invalid object IDs');
      }

      const lockStatus = await this.collaborationService.getRealtimeLockStatus(
        new Types.ObjectId(canvasId),
        new Types.ObjectId(conversationId),
        new Types.ObjectId(nodeId),
      );

      return {
        success: true,
        data: lockStatus,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get realtime lock status',
      );
    }
  }

  @Post('node/:canvasId/:conversationId/:nodeId/extend-lock')
  async extendNodeLock(
    @Param('canvasId') canvasId: string,
    @Param('conversationId') conversationId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { userId: string; lockDurationSeconds?: number },
  ) {
    try {
      const lock = await this.redisService.extendNodeLock(
        canvasId,
        conversationId,
        nodeId,
        body.userId,
        body.lockDurationSeconds,
      );

      return {
        success: true,
        data: lock,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to extend node lock',
      );
    }
  }

  // =================== CURSOR TRACKING ===================

  @Post('cursor/update')
  async updateCursor(@Body() dto: UpdateCursorDto) {
    try {
      const cursor = await this.redisService.updateCursorPosition(dto);
      return {
        success: true,
        data: cursor,
      };
    } catch (error) {
      // Don't throw for throttling errors, just return the error info
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to update cursor',
      };
    }
  }

  // =================== TYPING INDICATORS ===================

  @Post('typing/update')
  async updateTyping(@Body() dto: UpdateTypingDto) {
    try {
      await this.redisService.updateTypingIndicator(dto);
      return {
        success: true,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to update typing indicator',
      );
    }
  }

  // =================== HYBRID SESSION MANAGEMENT ===================

  @Post('session/start')
  async startHybridSession(
    @Body()
    body: {
      userId: string;
      user: { id: string; name: string; email: string };
      canvasId: string;
      conversationId?: string;
      nodeId?: string;
      editingType: 'canvas' | 'conversation' | 'node';
      editingTarget: string;
    },
  ) {
    try {
      if (
        !Types.ObjectId.isValid(body.userId) ||
        !Types.ObjectId.isValid(body.canvasId) ||
        !Types.ObjectId.isValid(body.editingTarget)
      ) {
        throw new BadRequestException('Invalid object IDs');
      }

      const sessionData = {
        userId: new Types.ObjectId(body.userId),
        user: {
          id: new Types.ObjectId(body.user.id),
          name: body.user.name,
          email: body.user.email,
        },
        canvasId: new Types.ObjectId(body.canvasId),
        conversationId: body.conversationId
          ? new Types.ObjectId(body.conversationId)
          : undefined,
        nodeId: body.nodeId ? new Types.ObjectId(body.nodeId) : undefined,
        editingType: body.editingType,
        editingTarget: new Types.ObjectId(body.editingTarget),
      };

      const result =
        await this.collaborationService.startHybridSession(sessionData);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to start hybrid session',
      );
    }
  }

  @Delete('session/:sessionId')
  async endHybridSession(
    @Param('sessionId') sessionId: string,
    @Query('canvasId') canvasId?: string,
  ) {
    try {
      const success = await this.collaborationService.endHybridSession(
        sessionId,
        canvasId,
      );
      return {
        success,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to end hybrid session',
      );
    }
  }

  @Post('session/:sessionId/lock')
  async acquireHybridLock(
    @Param('sessionId') sessionId: string,
    @Body() body: { lockDurationMs?: number },
  ) {
    try {
      const result = await this.collaborationService.acquireHybridLock(
        sessionId,
        body.lockDurationMs,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to acquire hybrid lock',
      );
    }
  }

  @Delete('session/:sessionId/lock')
  async releaseHybridLock(@Param('sessionId') sessionId: string) {
    try {
      const result =
        await this.collaborationService.releaseHybridLock(sessionId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to release hybrid lock',
      );
    }
  }

  // =================== CLEANUP & MAINTENANCE ===================

  @Post('cleanup/canvas/:canvasId/stale-locks')
  async clearStaleLocksForCanvas(@Param('canvasId') canvasId: string) {
    try {
      const cleared = await this.redisService.clearStaleLocksForCanvas({
        canvasId,
      });
      return {
        success: true,
        data: { clearedCount: cleared },
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to clear stale locks',
      );
    }
  }

  @Post('cleanup/canvas/:canvasId/stale-presence')
  async cleanupStalePresence(@Param('canvasId') canvasId: string) {
    try {
      const cleaned = await this.redisService.cleanupStalePresence(canvasId);
      return {
        success: true,
        data: { cleanedCount: cleaned },
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to cleanup stale presence',
      );
    }
  }

  @Post('cleanup/hybrid')
  async runHybridCleanup() {
    try {
      const result = await this.collaborationService.hybridCleanup();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to run hybrid cleanup',
      );
    }
  }

  // =================== ACTIVITY & HEARTBEAT ===================

  @Post('activity/heartbeat')
  async updateActivityHeartbeat(
    @Body() body: { canvasId: string; userId: string },
  ) {
    try {
      await this.redisService.updateActivityHeartbeat(
        body.canvasId,
        body.userId,
      );
      return {
        success: true,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to update activity heartbeat',
      );
    }
  }

  @Post('activity/batch-heartbeat')
  async batchUpdateActivity(
    @Body() body: { canvasId: string; userIds: string[] },
  ) {
    try {
      await this.redisService.batchUpdateActivity(body.canvasId, body.userIds);
      return {
        success: true,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to batch update activity',
      );
    }
  }

  // =================== HEALTH & STATUS ===================

  @Get('health')
  async healthCheck() {
    try {
      const isHealthy = await this.redisService.isHealthy();
      return {
        success: true,
        data: {
          redis: isHealthy,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          redis: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Legacy MongoDB-only endpoints for backward compatibility
  @Get('sessions/canvas/:canvasId')
  async getCanvasSessions(@Param('canvasId') canvasId: string) {
    try {
      if (!Types.ObjectId.isValid(canvasId)) {
        throw new BadRequestException('Invalid canvas ID');
      }

      const sessions = await this.collaborationService.getActiveSessions(
        new Types.ObjectId(canvasId),
      );

      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get canvas sessions',
      );
    }
  }

  @Get('stats/canvas/:canvasId')
  async getCanvasStats(@Param('canvasId') canvasId: string) {
    try {
      if (!Types.ObjectId.isValid(canvasId)) {
        throw new BadRequestException('Invalid canvas ID');
      }

      const stats = await this.collaborationService.getCanvasStats(
        new Types.ObjectId(canvasId),
      );

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to get canvas stats',
      );
    }
  }

  // =================== ACTIVITY TRACKING ===================

  @Get('activities/canvas/:canvasId')
  async getCanvasActivities(
    @Param('canvasId') canvasId: string,
    @Query('conversationId') conversationId?: string,
    @Query('userId') userId?: string,
    @Query('activityTypes') activityTypes?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      if (!Types.ObjectId.isValid(canvasId)) {
        throw new BadRequestException('Invalid canvas ID');
      }

      const filter: ActivityFilter = {
        canvasId,
        conversationId,
        userId,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      if (activityTypes) {
        filter.activityTypes = activityTypes
          .split(',')
          .map((type) => type.trim() as ActivityType);
      }

      if (startDate) {
        filter.startDate = new Date(startDate);
      }

      if (endDate) {
        filter.endDate = new Date(endDate);
      }

      const activities = await this.activityService.getActivities(filter);

      return {
        success: true,
        data: activities,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to get activities',
      );
    }
  }

  @Get('activities/canvas/:canvasId/summary')
  async getActivitySummary(
    @Param('canvasId') canvasId: string,
    @Query('hours') hours?: string,
  ) {
    try {
      if (!Types.ObjectId.isValid(canvasId)) {
        throw new BadRequestException('Invalid canvas ID');
      }

      const hoursNumber = hours ? parseInt(hours, 10) : 24;
      const summary = await this.activityService.getActivitySummary(
        canvasId,
        hoursNumber,
      );

      return {
        success: true,
        data: summary,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get activity summary',
      );
    }
  }

  @Get('activities/conversation/:conversationId')
  async getConversationActivities(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      if (!Types.ObjectId.isValid(conversationId)) {
        throw new BadRequestException('Invalid conversation ID');
      }

      const filter: ActivityFilter = {
        conversationId,
        limit: limit ? parseInt(limit, 10) : 25,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      const activities = await this.activityService.getActivities(filter);

      return {
        success: true,
        data: activities,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get conversation activities',
      );
    }
  }

  @Get('activities/user/:userId')
  async getUserActivities(
    @Param('userId') userId: string,
    @Query('canvasId') canvasId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const filter: ActivityFilter = {
        userId,
        canvasId,
        limit: limit ? parseInt(limit, 10) : 25,
        offset: offset ? parseInt(offset, 10) : 0,
      };

      const activities = await this.activityService.getActivities(filter);

      return {
        success: true,
        data: activities,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to get user activities',
      );
    }
  }

  @Post('activities/cleanup')
  async cleanupOldActivities(@Query('daysToKeep') daysToKeep?: string) {
    try {
      const days = daysToKeep ? parseInt(daysToKeep, 10) : 30;
      const deletedCount = await this.activityService.cleanupOldActivities(days);

      return {
        success: true,
        data: { deletedCount },
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to cleanup old activities',
      );
    }
  }
}
