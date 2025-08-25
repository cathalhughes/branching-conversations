import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
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
  SOCKET_EVENTS,
  RedisCollaborationError,
} from '../types/redis.types';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  canvasId?: string;
  sessionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Adjust for your client URLs
    credentials: true,
  },
  namespace: '/collaboration',
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();
  private userCanvasMap = new Map<string, string>(); // userId -> canvasId
  private canvasRooms = new Map<string, Set<string>>(); // canvasId -> Set<socketId>

  constructor(
    private redisService: RedisService,
    @Inject(forwardRef(() => ActivityService))
    private activityService: ActivityService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Collaboration WebSocket Gateway initialized');

    // Subscribe to Redis events and broadcast to clients
    void this.setupRedisSubscriptions();
  }

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.id}`);

    // TODO: Implement authentication/authorization here
    // For now, we'll extract user info from query params or headers
    // In production, use JWT tokens or session authentication

    const userId = client.handshake.query.userId as string;
    const userName = client.handshake.query.userName as string;
    const userEmail = client.handshake.query.userEmail as string;

    if (!userId || !userName || !userEmail) {
      this.logger.warn('Client connection rejected - missing user info');
      client.emit('error', { message: 'Authentication required' });
      client.disconnect();
      return;
    }

    client.userId = userId;
    client.user = {
      id: userId,
      name: userName,
      email: userEmail,
    };
    client.sessionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.connectedClients.set(client.id, client);

    client.emit('connected', {
      sessionId: client.sessionId,
      userId: client.userId,
    });
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    try {
      // Clean up user presence if they were on a canvas
      if (client.canvasId && client.userId) {
        await this.handleLeaveCanvas(client, { canvasId: client.canvasId });
      }
    } catch (error) {
      this.logger.error('Error during client disconnect cleanup:', error);
    }

    this.connectedClients.delete(client.id);

    // Remove from canvas rooms
    for (const [canvasId, socketIds] of this.canvasRooms.entries()) {
      if (socketIds.has(client.id)) {
        socketIds.delete(client.id);
        if (socketIds.size === 0) {
          this.canvasRooms.delete(canvasId);
        }
        break;
      }
    }

    if (client.userId) {
      this.userCanvasMap.delete(client.userId);
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_CANVAS)
  async handleJoinCanvas(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string },
  ) {
    try {
      if (!client.userId || !client.user) {
        throw new Error('User not authenticated');
      }

      const dto: JoinCanvasDto = {
        canvasId: data.canvasId,
        userId: client.userId,
        user: client.user,
      };

      const presence = await this.redisService.joinCanvas(dto);

      // Update client state
      client.canvasId = data.canvasId;
      this.userCanvasMap.set(client.userId, data.canvasId);

      // Add to canvas room
      if (!this.canvasRooms.has(data.canvasId)) {
        this.canvasRooms.set(data.canvasId, new Set());
      }
      this.canvasRooms.get(data.canvasId)!.add(client.id);

      // Join Socket.IO room for this canvas
      await client.join(`canvas:${data.canvasId}`);

      // Get full canvas presence and send to client
      const canvasPresence = await this.redisService.getCanvasPresence({
        canvasId: data.canvasId,
      });

      client.emit('join_canvas_success', {
        presence,
        canvasPresence,
      });

      // Start heartbeat for this user
      this.startHeartbeat(client);

      // Log activity
      await this.activityService.logUserJoined(
        data.canvasId,
        client.userId,
        client.user.name,
      );

      this.logger.log(
        `User ${client.user.name} joined canvas ${data.canvasId}`,
      );
    } catch (error) {
      this.logger.error('Error joining canvas:', error);
      client.emit('join_canvas_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_CANVAS)
  async handleLeaveCanvas(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string },
  ) {
    try {
      if (!client.userId) {
        return;
      }

      const dto: LeaveCanvasDto = {
        canvasId: data.canvasId,
        userId: client.userId,
      };

      await this.redisService.leaveCanvas(dto);

      // Update client state
      client.canvasId = undefined;
      this.userCanvasMap.delete(client.userId);

      // Remove from canvas room
      const socketIds = this.canvasRooms.get(data.canvasId);
      if (socketIds) {
        socketIds.delete(client.id);
        if (socketIds.size === 0) {
          this.canvasRooms.delete(data.canvasId);
        }
      }

      // Leave Socket.IO room
      await client.leave(`canvas:${data.canvasId}`);

      client.emit('leave_canvas_success');

      // Log activity
      if (client.user) {
        await this.activityService.logActivity({
          canvasId: data.canvasId,
          userId: client.userId,
          userName: client.user.name,
          activityType: 'user_left_canvas' as any,
          description: `${client.user.name} left the canvas`,
        });
      }

      this.logger.log(`User ${client.userId} left canvas ${data.canvasId}`);
    } catch (error) {
      this.logger.error('Error leaving canvas:', error);
      client.emit('leave_canvas_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.FOCUS_CONVERSATION)
  async handleFocusConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string; conversationId: string },
  ) {
    try {
      if (!client.userId || !client.user) {
        throw new Error('User not authenticated');
      }

      const dto: FocusConversationDto = {
        canvasId: data.canvasId,
        conversationId: data.conversationId,
        userId: client.userId,
        user: client.user,
      };

      const focus = await this.redisService.focusConversation(dto);

      client.emit('focus_conversation_success', focus);
    } catch (error) {
      this.logger.error('Error focusing conversation:', error);
      client.emit('focus_conversation_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.LOCK_NODE)
  async handleLockNode(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      canvasId: string;
      conversationId: string;
      nodeId: string;
      lockDurationSeconds?: number;
    },
  ) {
    try {
      if (!client.userId || !client.user || !client.sessionId) {
        throw new Error('User not authenticated');
      }

      const dto: LockNodeDto = {
        canvasId: data.canvasId,
        conversationId: data.conversationId,
        nodeId: data.nodeId,
        userId: client.userId,
        user: client.user,
        sessionId: client.sessionId,
        lockDurationSeconds: data.lockDurationSeconds,
      };

      const lock = await this.redisService.lockNode(dto);

      client.emit('lock_node_success', lock);
    } catch (error) {
      this.logger.error('Error locking node:', error);

      if (error instanceof RedisCollaborationError) {
        client.emit('lock_node_error', {
          message: error.message,
          code: error.code,
          details: error.details,
        });
      } else {
        client.emit('lock_node_error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.UNLOCK_NODE)
  async handleUnlockNode(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      canvasId: string;
      conversationId: string;
      nodeId: string;
    },
  ) {
    try {
      if (!client.userId) {
        throw new Error('User not authenticated');
      }

      const dto: UnlockNodeDto = {
        canvasId: data.canvasId,
        conversationId: data.conversationId,
        nodeId: data.nodeId,
        userId: client.userId,
      };

      const success = await this.redisService.unlockNode(dto);

      client.emit('unlock_node_success', { success });
    } catch (error) {
      this.logger.error('Error unlocking node:', error);

      if (error instanceof RedisCollaborationError) {
        client.emit('unlock_node_error', {
          message: error.message,
          code: error.code,
          details: error.details,
        });
      } else {
        client.emit('unlock_node_error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.UPDATE_CURSOR)
  async handleUpdateCursor(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      canvasId: string;
      x: number;
      y: number;
    },
  ) {
    try {
      if (!client.userId || !client.user) {
        throw new Error('User not authenticated');
      }

      const dto: UpdateCursorDto = {
        canvasId: data.canvasId,
        userId: client.userId,
        user: client.user,
        x: data.x,
        y: data.y,
      };

      const cursor = await this.redisService.updateCursorPosition(dto);

      client.emit('update_cursor_success', cursor);
    } catch (error) {
      // Don't log cursor throttling errors to avoid spam
      if (
        !(
          error instanceof RedisCollaborationError &&
          error.code === 'THROTTLE_LIMIT_EXCEEDED'
        )
      ) {
        this.logger.error('Error updating cursor:', error);
      }

      client.emit('update_cursor_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.START_TYPING)
  async handleStartTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string; nodeId: string },
  ) {
    try {
      if (!client.userId || !client.user) {
        throw new Error('User not authenticated');
      }

      const dto: UpdateTypingDto = {
        canvasId: data.canvasId,
        nodeId: data.nodeId,
        userId: client.userId,
        user: client.user,
        isTyping: true,
      };

      await this.redisService.updateTypingIndicator(dto);

      client.emit('start_typing_success');
    } catch (error) {
      this.logger.error('Error starting typing indicator:', error);
      client.emit('start_typing_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.STOP_TYPING)
  async handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string; nodeId: string },
  ) {
    try {
      if (!client.userId || !client.user) {
        throw new Error('User not authenticated');
      }

      const dto: UpdateTypingDto = {
        canvasId: data.canvasId,
        nodeId: data.nodeId,
        userId: client.userId,
        user: client.user,
        isTyping: false,
      };

      await this.redisService.updateTypingIndicator(dto);

      client.emit('stop_typing_success');
    } catch (error) {
      this.logger.error('Error stopping typing indicator:', error);
      client.emit('stop_typing_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.HEARTBEAT)
  async handleHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string },
  ) {
    try {
      if (!client.userId) {
        return;
      }

      await this.redisService.updateActivityHeartbeat(
        data.canvasId,
        client.userId,
      );
      client.emit('heartbeat_ack');
    } catch (error) {
      this.logger.error('Error handling heartbeat:', error);
    }
  }

  @SubscribeMessage('get_canvas_presence')
  async handleGetCanvasPresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { canvasId: string },
  ) {
    try {
      const presence = await this.redisService.getCanvasPresence({
        canvasId: data.canvasId,
      });
      client.emit('canvas_presence', presence);
    } catch (error) {
      this.logger.error('Error getting canvas presence:', error);
      client.emit('canvas_presence_error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Scheduled cleanup methods
  async cleanupStaleConnections() {
    const staleThreshold = 60000; // 1 minute
    const now = Date.now();

    for (const [socketId, socket] of this.connectedClients.entries()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const lastSeen = (socket as any).lastSeen || socket.handshake.time;

      if (now - lastSeen > staleThreshold) {
        this.logger.log(`Cleaning up stale connection: ${socketId}`);
        socket.disconnect(true);
      }
    }
  }

  private async setupRedisSubscriptions() {
    try {
      const subscriber = this.redisService.getSubscriber();
      
      if (!subscriber) {
        this.logger.warn('Redis subscriber not available - real-time events will be limited');
        return;
      }

      // Subscribe to all canvas events
      await subscriber.psubscribe('canvas:*:events');
      this.logger.log('Subscribed to Redis canvas events');

      subscriber.on('pmessage', (_pattern, channel, message) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const event = JSON.parse(message);
          const canvasId = channel.split(':')[1];

          // Broadcast to all clients in this canvas room
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-member-access
          this.server.to(`canvas:${canvasId}`).emit(event.type, event.data);

          this.logger.debug(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            `Broadcasted event ${event.type} to canvas:${canvasId}`,
          );
        } catch (error) {
          this.logger.error('Error processing Redis event:', error);
        }
      });
    } catch (error) {
      this.logger.error('Failed to setup Redis subscriptions:', error);
      this.logger.warn('Continuing without Redis subscriptions - real-time events will be limited');
    }
  }

  private startHeartbeat(_client: AuthenticatedSocket) {
    // Client should send heartbeats every 30 seconds
    // We don't need to implement server-side heartbeat timer here
    // as Redis TTLs handle the cleanup automatically
  }

  // Admin/utility methods
  async forceDisconnectUser(userId: string) {
    const canvasId = this.userCanvasMap.get(userId);
    if (canvasId) {
      await this.redisService.leaveCanvas({ canvasId, userId });
    }

    for (const [socketId, socket] of this.connectedClients.entries()) {
      if (socket.userId === userId) {
        socket.emit('force_disconnect', { reason: 'Admin disconnect' });
        socket.disconnect(true);
        break;
      }
    }
  }

  async broadcastToCanvas(canvasId: string, event: string, data: unknown) {
    this.server.to(`canvas:${canvasId}`).emit(event, data);
  }

  // =================== CANVAS CHANGE BROADCASTING ===================

  async broadcastCanvasChange(canvasId: string, changeType: string, data: any) {
    try {
      this.server.to(`canvas:${canvasId}`).emit('canvas_change', {
        type: changeType,
        data: data,
        timestamp: new Date(),
      });

      this.logger.debug(`Broadcasted canvas change ${changeType} to canvas:${canvasId}`);
    } catch (error) {
      this.logger.error('Error broadcasting canvas change:', error);
    }
  }

  async broadcastTreeCreated(canvasId: string, tree: any) {
    await this.broadcastCanvasChange(canvasId, 'tree_created', { tree });
  }

  async broadcastTreeDeleted(canvasId: string, treeId: string) {
    await this.broadcastCanvasChange(canvasId, 'tree_deleted', { treeId });
  }

  async broadcastTreeUpdated(canvasId: string, tree: any) {
    await this.broadcastCanvasChange(canvasId, 'tree_updated', { tree });
  }

  async broadcastNodeCreated(canvasId: string, treeId: string, node: any) {
    await this.broadcastCanvasChange(canvasId, 'node_created', { treeId, node });
  }

  async broadcastNodeUpdated(canvasId: string, treeId: string, node: any) {
    await this.broadcastCanvasChange(canvasId, 'node_updated', { treeId, node });
  }

  async broadcastNodeDeleted(canvasId: string, treeId: string, nodeId: string) {
    await this.broadcastCanvasChange(canvasId, 'node_deleted', { treeId, nodeId });
  }

  // =================== ACTIVITY BROADCASTING ===================

  async broadcastActivity(canvasId: string, activity: any) {
    try {
      // Broadcast to all clients connected to this canvas
      this.server.to(`canvas:${canvasId}`).emit('activity_update', {
        type: 'activity',
        data: activity,
      });

      // If this is a high-priority activity, also send toast notification
      if (this.isHighPriorityActivity(activity.activityType)) {
        this.server.to(`canvas:${canvasId}`).emit('activity_notification', {
          type: 'toast',
          data: {
            id: activity.id,
            message: activity.description,
            activityType: activity.activityType,
            userName: activity.userName,
            timestamp: activity.timestamp,
            priority: this.getActivityPriority(activity.activityType),
          },
        });
      }

      this.logger.debug(`Broadcasted activity ${activity.activityType} to canvas:${canvasId}`);
    } catch (error) {
      this.logger.error('Error broadcasting activity:', error);
    }
  }

  async broadcastToUser(userId: string, event: string, data: unknown) {
    try {
      // Find the user's socket and send direct message
      for (const [socketId, socket] of this.connectedClients.entries()) {
        if (socket.userId === userId) {
          socket.emit(event, data);
          this.logger.debug(`Sent ${event} to user ${userId}`);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Error broadcasting to user ${userId}:`, error);
    }
  }

  async broadcastConversationActivity(conversationId: string, activity: any) {
    try {
      // Find all users who have this conversation visible and send targeted update
      const targetEvent = `conversation:${conversationId}:activity`;
      
      // Broadcast to canvas room (will be filtered by clients based on their current view)
      if (activity.canvasId) {
        this.server.to(`canvas:${activity.canvasId}`).emit(targetEvent, {
          type: 'conversation_activity',
          conversationId,
          data: activity,
        });
      }

      this.logger.debug(`Broadcasted conversation activity to ${targetEvent}`);
    } catch (error) {
      this.logger.error('Error broadcasting conversation activity:', error);
    }
  }

  async broadcastNodeActivity(nodeId: string, activity: any) {
    try {
      const targetEvent = `node:${nodeId}:activity`;
      
      if (activity.canvasId) {
        this.server.to(`canvas:${activity.canvasId}`).emit(targetEvent, {
          type: 'node_activity',
          nodeId,
          data: activity,
        });
      }

      this.logger.debug(`Broadcasted node activity to ${targetEvent}`);
    } catch (error) {
      this.logger.error('Error broadcasting node activity:', error);
    }
  }

  async broadcastBulkActivity(canvasId: string, activities: any[]) {
    try {
      this.server.to(`canvas:${canvasId}`).emit('bulk_activity_update', {
        type: 'bulk_activity',
        data: {
          activities,
          count: activities.length,
          timestamp: new Date(),
        },
      });

      this.logger.debug(`Broadcasted ${activities.length} bulk activities to canvas:${canvasId}`);
    } catch (error) {
      this.logger.error('Error broadcasting bulk activity:', error);
    }
  }

  private isHighPriorityActivity(activityType: string): boolean {
    const highPriorityTypes = [
      'branch_created',
      'conflict_detected', 
      'error_occurred',
      'user_joined_canvas',
      'user_left_canvas',
      'conversation_created'
    ];
    
    return highPriorityTypes.includes(activityType);
  }

  private getActivityPriority(activityType: string): string {
    const priorityMap: Record<string, string> = {
      'conflict_detected': 'critical',
      'error_occurred': 'critical',
      'branch_created': 'high',
      'user_joined_canvas': 'medium',
      'user_left_canvas': 'medium',
      'conversation_created': 'medium',
      'node_edited': 'low',
      'conversation_moved': 'low',
    };

    return priorityMap[activityType] || 'low';
  }

  // Get statistics
  getConnectionStats() {
    return {
      connectedClients: this.connectedClients.size,
      canvasRooms: Array.from(this.canvasRooms.entries()).map(
        ([canvasId, sockets]) => ({
          canvasId,
          clientCount: sockets.size,
        }),
      ),
      userCanvasMap: Array.from(this.userCanvasMap.entries()),
    };
  }
}
