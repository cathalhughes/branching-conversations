import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { ActivityService } from './activity.service';
import { CollaborationGateway } from './collaboration.gateway';

import { Canvas, CanvasModel } from '../schemas/canvas.schema';
import {
  Conversation,
  ConversationModel,
} from '../schemas/conversation.schema';
import {
  ConversationNode,
  ConversationNodeModel,
} from '../schemas/conversation-node.schema';
import {
  EditingSessionModel,
  EditingSessionDocument,
} from '../schemas/editing-session.schema';

import {
  Canvas as CanvasType,
  ConversationTree,
  ConversationNode as ConversationNodeType,
  CreateConversationTreeDto,
  CreateNodeDto,
  UpdateNodeDto,
  ChatRequest,
  ChatResponse,
  CreateCanvasDto,
} from '../types/conversation.types';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Canvas.name) private canvasModel: Model<CanvasModel>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationModel>,
    @InjectModel(ConversationNode.name)
    private nodeModel: Model<ConversationNodeModel>,
    @InjectModel(EditingSessionModel.name)
    private sessionModel: Model<EditingSessionDocument>,
    private configService: ConfigService,
    private activityService: ActivityService,
    @Inject(forwardRef(() => CollaborationGateway))
    private collaborationGateway: CollaborationGateway,
  ) {}

  private getDefaultUserId(): string {
    return (
      this.configService.get<string>('DEFAULT_USER_ID') ||
      '60f3b4b4c4c4c4c4c4c4c4c4'
    );
  }

  private getDefaultUserName(): string {
    return this.configService.get<string>('DEFAULT_USER_NAME') || 'Demo User';
  }

  private createObjectIdFromString(str: string): Types.ObjectId {
    // If it's already a valid ObjectId, use it
    if (Types.ObjectId.isValid(str)) {
      return new Types.ObjectId(str);
    }
    
    // Otherwise, create a deterministic ObjectId from the string
    // We'll use the first 24 characters of the hex representation of the string hash
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(str).digest('hex');
    // Take first 24 characters to make a valid ObjectId
    const objectIdString = hash.substring(0, 24);
    return new Types.ObjectId(objectIdString);
  }

  private getCurrentUser(userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }) {
    // Use user from headers if provided, otherwise fall back to default
    if (userFromHeaders && userFromHeaders.userId && userFromHeaders.userName) {
      return {
        userId: userFromHeaders.userId,
        userName: userFromHeaders.userName,
      };
    }
    
    // Fallback to default user
    return {
      userId: this.getDefaultUserId(),
      userName: this.getDefaultUserName(),
    };
  }

  async getCanvas(userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<CanvasType> {
    // Get or create default canvas
    let canvas = await this.canvasModel.findOne({ name: 'Main Canvas' });
    if (!canvas) {
      canvas = await this.canvasModel.create({
        name: 'Main Canvas',
        ownerId: new Types.ObjectId(this.getDefaultUserId()),
        totalConversations: 0,
        totalNodes: 0,
        lastActivityAt: new Date(),
        activity: {
          isBeingEdited: false,
          currentEditors: [],
        },
      });
    }

    // Get all conversations for this canvas
    const conversations = await this.conversationModel
      .find({
        canvasId: canvas._id,
        isDeleted: { $ne: true },
      })
      .sort({ 'activity.lastEditedAt': -1 });

    // Convert to the expected format
    const trees: ConversationTree[] = await Promise.all(
      conversations.map(async (conv) => {
        const nodes = await this.nodeModel
          .find({
            conversationId: conv._id,
            isDeleted: { $ne: true },
          })
          .sort({ depth: 1, branchIndex: 1 });

        return {
          id: conv._id.toString(),
          name: conv.name,
          description: conv.description,
          nodes: nodes.map((node) => ({
            id: node._id.toString(),
            prompt: node.prompt,
            response: node.response,
            model: node.aiModel,
            timestamp: node.createdAt,
            parentId: node.parentId?.toString(),
            isGenerating: node.isGenerating,
            position: node.position,
          })),
          rootNodeId: conv.rootNodeId?.toString() || '',
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          position: conv.position,
        };
      }),
    );

    return {
      id: canvas._id.toString(),
      name: canvas.name,
      trees,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    };
  }

  async createCanvas(
    createCanvasDto: CreateCanvasDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<CanvasType> {
    const user = userFromHeaders || {
      userId: this.getDefaultUserId(),
      userName: this.getDefaultUserName(),
      userEmail: null,
    };
    const ownerId = this.createObjectIdFromString(user.userId || this.getDefaultUserId());
    
    // Convert collaborator user IDs to ObjectIds and create collaborator info
    const collaborators = createCanvasDto.collaborators?.map(collab => ({
      userId: this.createObjectIdFromString(collab.userId),
      permissions: collab.permissions || 'write' as 'read' | 'write' | 'admin',
      joinedAt: new Date(),
    })) || [];

    // Create the new canvas
    const canvas = await this.canvasModel.create({
      name: createCanvasDto.name.trim(),
      description: createCanvasDto.description?.trim(),
      ownerId,
      collaborators,
      totalConversations: 0,
      totalNodes: 0,
      lastActivityAt: new Date(),
      activity: {
        isBeingEdited: false,
        currentEditors: [],
      },
    });

    return {
      id: canvas._id.toString(),
      name: canvas.name,
      trees: [], // New canvas starts with no conversations
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    };
  }

  async getUserCanvases(userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<any[]> {
    const user = userFromHeaders || {
      userId: this.getDefaultUserId(),
      userName: this.getDefaultUserName(),
      userEmail: null,
    };
    
    const userId = this.createObjectIdFromString(user.userId || this.getDefaultUserId());
    
    // Find canvases where user is owner or collaborator
    const canvases = await this.canvasModel.find({
      $or: [
        { ownerId: userId },
        { 'collaborators.userId': userId }
      ],
      isDeleted: { $ne: true }
    }).sort({ lastActivityAt: -1 });

    // Transform canvases to project format
    return canvases.map(canvas => ({
      id: canvas._id.toString(),
      title: canvas.name,
      description: canvas.description || '',
      createdAt: canvas.createdAt.toISOString().split('T')[0], // Format as YYYY-MM-DD
      lastActivity: this.getRelativeTime(canvas.lastActivityAt),
      isOwner: canvas.ownerId.equals(userId),
      collaborators: canvas.collaborators.map(collab => ({
        userId: collab.userId.toString(),
        userName: 'Collaborator', // We don't store full user info, so placeholder
        userEmail: '',
        color: this.getColorForUserId(collab.userId.toString()),
        permissions: collab.permissions
      }))
    }));
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Less than an hour ago';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

  private getColorForUserId(userId: string): string {
    // Simple hash-based color assignment
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  async getCanvasByIdOrDefault(canvasId?: string): Promise<CanvasType> {
    let canvas;
    
    if (canvasId && canvasId !== 'main_canvas') {
      // Try to get specific canvas
      canvas = await this.canvasModel.findOne({ 
        _id: this.createObjectIdFromString(canvasId),
        isDeleted: { $ne: true }
      });
    }
    
    // Fall back to default canvas behavior
    if (!canvas) {
      return this.getCanvas();
    }

    // Get all conversations for this canvas
    const conversations = await this.conversationModel
      .find({
        canvasId: canvas._id,
        isDeleted: { $ne: true },
      })
      .sort({ 'activity.lastEditedAt': -1 });

    // Convert to the expected format
    const trees: ConversationTree[] = await Promise.all(
      conversations.map(async (conv) => {
        const nodes = await this.nodeModel
          .find({
            conversationId: conv._id,
            isDeleted: { $ne: true },
          })
          .sort({ createdAt: 1 });

        return {
          id: conv._id.toString(),
          name: conv.name,
          description: conv.description,
          nodes: nodes.map(node => ({
            id: node._id.toString(),
            prompt: node.prompt,
            response: node.response,
            model: node.aiModel || 'system',
            timestamp: node.createdAt,
            parentId: node.parentId ? node.parentId.toString() : undefined,
            isGenerating: node.isGenerating,
            position: node.position,
          })),
          rootNodeId: conv.rootNodeId ? conv.rootNodeId.toString() : '',
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          position: conv.position,
        };
      }),
    );

    return {
      id: canvas._id.toString(),
      name: canvas.name,
      trees,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
    };
  }

  async createConversationTree(
    createTreeDto: CreateConversationTreeDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<ConversationTree> {
    // Get or create default canvas
    let canvas = await this.canvasModel.findOne({ name: 'Main Canvas' });
    if (!canvas) {
      canvas = await this.canvasModel.create({
        name: 'Main Canvas',
        ownerId: new Types.ObjectId(this.getDefaultUserId()),
        totalConversations: 0,
        totalNodes: 0,
        lastActivityAt: new Date(),
        activity: {
          isBeingEdited: false,
          currentEditors: [],
        },
      });
    }

    try {
      // Create the conversation
      const conversation = await this.conversationModel.create({
        name: createTreeDto.name,
        description: createTreeDto.description,
        canvasId: canvas._id,
        position: createTreeDto.position,
        nodeCount: 1,
        maxDepth: 0,
        allowBranching: true,
        activity: {
          isBeingEdited: false,
          currentEditors: [],
          lastEditedAt: new Date(),
        },
      });

      // Create the root node
      const rootNode = await this.nodeModel.create({
        prompt: 'Welcome to your new conversation',
        response:
          'This is the start of your conversation tree. Click "Add New Branch" to begin chatting.',
        conversationId: conversation._id,
        canvasId: canvas._id,
        position: {
          x: createTreeDto.position.x + 50,
          y: createTreeDto.position.y + 100,
        },
        depth: 0,
        branchIndex: 0,
        childCount: 0,
        reactFlowId: `node-${new Types.ObjectId().toString()}`,
        activity: {
          isBeingEdited: false,
          currentEditors: [],
          lastEditedAt: new Date(),
        },
      });

      // Update conversation with root node reference
      conversation.rootNodeId = rootNode._id;
      await conversation.save();

      // Update canvas stats
      await this.canvasModel.findByIdAndUpdate(canvas._id, {
        $inc: { totalConversations: 1, totalNodes: 1 },
        $set: { lastActivityAt: new Date() },
      });

      // Log activity
      const user = this.getCurrentUser(userFromHeaders);
      await this.activityService.logConversationCreated(
        canvas._id.toString(),
        conversation._id.toString(),
        user.userId,
        user.userName,
      );

      // Broadcast the new tree to all connected clients
      const treeResult = {
        id: conversation._id.toString(),
        name: conversation.name,
        description: conversation.description,
        nodes: [
          {
            id: rootNode._id.toString(),
            prompt: rootNode.prompt,
            response: rootNode.response,
            timestamp: rootNode.createdAt,
            position: rootNode.position,
          },
        ],
        rootNodeId: rootNode._id.toString(),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        position: conversation.position,
      };
      await this.collaborationGateway.broadcastTreeCreated(canvas._id.toString(), treeResult);

      // Return in expected format
      return {
        id: conversation._id.toString(),
        name: conversation.name,
        description: conversation.description,
        nodes: [
          {
            id: rootNode._id.toString(),
            prompt: rootNode.prompt,
            response: rootNode.response,
            timestamp: rootNode.createdAt,
            position: rootNode.position,
          },
        ],
        rootNodeId: rootNode._id.toString(),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        position: conversation.position,
      };
    } catch (error) {
      throw error;
    }
  }

  async createConversationTreeInCanvas(
    canvasId: string,
    createTreeDto: CreateConversationTreeDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<ConversationTree> {
    // Find the specific canvas
    const canvas = await this.canvasModel.findOne({ 
      _id: this.createObjectIdFromString(canvasId),
      isDeleted: { $ne: true }
    });
    
    if (!canvas) {
      throw new Error(`Canvas with ID ${canvasId} not found`);
    }

    try {
      // Create the conversation
      const conversation = await this.conversationModel.create({
        name: createTreeDto.name,
        description: createTreeDto.description,
        canvasId: canvas._id,
        position: createTreeDto.position,
        nodeCount: 1,
        maxDepth: 0,
        allowBranching: true,
      });

      // Create the root node
      const user = userFromHeaders || {
      userId: this.getDefaultUserId(),
      userName: this.getDefaultUserName(),
      userEmail: null,
    };
      const rootNode = await this.nodeModel.create({
        conversationId: conversation._id,
        canvasId: canvas._id,
        prompt: `Started conversation: ${createTreeDto.name}`,
        response: '',
        aiModel: 'system',
        position: { x: 0, y: 0 },
        author: {
          id: this.createObjectIdFromString(user.userId || this.getDefaultUserId()),
          name: user.userName || 'Unknown User',
          email: user.userEmail || '',
        },
        isGenerating: false,
        isDeleted: false,
      });

      // Update conversation with root node ID
      await this.conversationModel.findByIdAndUpdate(conversation._id, {
        rootNodeId: rootNode._id,
      });

      // Update canvas statistics
      await this.canvasModel.findByIdAndUpdate(canvas._id, {
        $inc: { totalConversations: 1, totalNodes: 1 },
        lastActivityAt: new Date(),
      });

      const treeResult = {
        trees: [
          {
            id: conversation._id.toString(),
            name: conversation.name,
            description: conversation.description,
            nodes: [
              {
                id: rootNode._id.toString(),
                prompt: rootNode.prompt,
                response: rootNode.response,
                model: 'system',
                timestamp: rootNode.createdAt,
                parentId: rootNode.parentId?.toString(),
                isGenerating: rootNode.isGenerating,
                position: rootNode.position,
              },
            ],
            rootNodeId: rootNode._id.toString(),
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            position: conversation.position,
          },
        ],
        rootNodeId: rootNode._id.toString(),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        position: conversation.position,
      };
      await this.collaborationGateway.broadcastTreeCreated(canvas._id.toString(), treeResult);

      // Return in expected format
      return {
        id: conversation._id.toString(),
        name: conversation.name,
        description: conversation.description,
        nodes: [
          {
            id: rootNode._id.toString(),
            prompt: rootNode.prompt,
            response: rootNode.response,
            model: 'system',
            timestamp: rootNode.createdAt,
            parentId: rootNode.parentId?.toString(),
            isGenerating: rootNode.isGenerating,
            position: rootNode.position,
          },
        ],
        rootNodeId: rootNode._id.toString(),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        position: conversation.position,
      };
    } catch (error) {
      throw error;
    }
  }

  async getConversationTree(treeId: string): Promise<ConversationTree | null> {
    const conversation = await this.conversationModel.findById(treeId);
    if (!conversation || conversation.isDeleted) {
      return null;
    }

    const nodes = await this.nodeModel
      .find({
        conversationId: conversation._id,
        isDeleted: { $ne: true },
      })
      .sort({ depth: 1, branchIndex: 1 });

    return {
      id: conversation._id.toString(),
      name: conversation.name,
      description: conversation.description,
      nodes: nodes.map((node) => ({
        id: node._id.toString(),
        prompt: node.prompt,
        response: node.response,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        isGenerating: node.isGenerating,
        position: node.position,
      })),
      rootNodeId: conversation.rootNodeId?.toString() || '',
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      position: conversation.position,
    };
  }

  async deleteConversationTree(treeId: string, userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<boolean> {
    try {
      const conversation = await this.conversationModel.findById(treeId);
      if (!conversation || conversation.isDeleted) {
        return false;
      }

      // Soft delete the conversation
      conversation.isDeleted = true;
      conversation.deletedAt = new Date();
      await conversation.save();

      // Soft delete all nodes in this conversation
      await this.nodeModel.updateMany(
        { conversationId: treeId },
        {
          isDeleted: true,
          deletedAt: new Date(),
        },
      );

      // Update canvas stats
      const nodeCount = await this.nodeModel.countDocuments({
        conversationId: treeId,
        isDeleted: { $ne: true },
      });

      await this.canvasModel.findByIdAndUpdate(conversation.canvasId, {
        $inc: {
          totalConversations: -1,
          totalNodes: -nodeCount,
        },
        $set: { lastActivityAt: new Date() },
      });

      // Broadcast tree deletion to all connected clients
      await this.collaborationGateway.broadcastTreeDeleted(conversation.canvasId.toString(), treeId);

      return true;
    } catch (error) {
      throw error;
    }
  }

  async updateTree(
    treeId: string,
    updateData: { position?: { x: number; y: number } },
  ): Promise<ConversationTree | null> {
    const conversation = await this.conversationModel.findById(treeId);
    if (!conversation || conversation.isDeleted) {
      return null;
    }

    if (updateData.position !== undefined) {
      conversation.position = updateData.position;
      await conversation.save();
      
      // Broadcast tree update to all connected clients
      const updatedTree = await this.getConversationTree(treeId);
      if (updatedTree) {
        await this.collaborationGateway.broadcastTreeUpdated(conversation.canvasId.toString(), updatedTree);
      }
    }

    return await this.getConversationTree(treeId);
  }

  async addNode(
    treeId: string,
    createNodeDto: CreateNodeDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<ConversationNodeType | null> {
    const conversation = await this.conversationModel.findById(treeId);
    if (!conversation || conversation.isDeleted) {
      return null;
    }

    // Handle empty prompt for initial node creation by providing a placeholder
    const prompt =
      createNodeDto.prompt && createNodeDto.prompt.trim() !== ''
        ? createNodeDto.prompt
        : 'Click to edit this prompt...';

    try {
      let parentNode: any = null;
      let depth = 0;
      let branchIndex = 0;

      if (createNodeDto.parentId) {
        parentNode = await this.nodeModel.findById(createNodeDto.parentId);
        if (!parentNode || parentNode.isDeleted) {
          return null;
        }
        depth = parentNode.depth + 1;
        branchIndex = parentNode.childCount;
      }

      const node = await this.nodeModel.create({
        prompt: prompt,
        aiModel: createNodeDto.model,
        parentId: createNodeDto.parentId,
        conversationId: treeId,
        canvasId: conversation.canvasId,
        position: createNodeDto.position,
        depth,
        branchIndex,
        childCount: 0,
        reactFlowId: `node-${new Types.ObjectId().toString()}`,
        activity: {
          isBeingEdited: false,
          currentEditors: [],
          lastEditedAt: new Date(),
        },
      });

      // Update parent's child count
      if (parentNode) {
        parentNode.childCount += 1;
        await parentNode.save();
      }

      // Update conversation stats
      await this.conversationModel.findByIdAndUpdate(treeId, {
        $inc: { nodeCount: 1 },
        $max: { maxDepth: depth },
        $set: { 'activity.lastEditedAt': new Date() },
      });

      // Log activity
      const user = this.getCurrentUser(userFromHeaders);
      if (createNodeDto.parentId) {
        // This is a branch creation
        await this.activityService.logBranchCreated(
          conversation.canvasId.toString(),
          treeId,
          node._id.toString(),
          user.userId,
          user.userName,
        );
      } else {
        // This is a new node creation
        await this.activityService.logActivity({
          canvasId: conversation.canvasId.toString(),
          conversationId: treeId,
          nodeId: node._id.toString(),
          userId: user.userId,
          userName: user.userName,
          activityType: 'node_created' as any,
          description: `${user.userName} created a new node`,
        });
      }

      // Broadcast node creation to all connected clients
      const nodeResult = {
        id: node._id.toString(),
        prompt: node.prompt,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        position: node.position,
      };
      await this.collaborationGateway.broadcastNodeCreated(conversation.canvasId.toString(), treeId, nodeResult);

      return nodeResult;
    } catch (error) {
      throw error;
    }
  }

  async updateNode(
    treeId: string,
    nodeId: string,
    updateNodeDto: UpdateNodeDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<ConversationNodeType | null> {
    const node = await this.nodeModel.findById(nodeId);
    if (
      !node ||
      node.isDeleted ||
      !node.conversationId.equals(new Types.ObjectId(treeId))
    ) {
      return null;
    }

    // Update fields
    if (updateNodeDto.prompt !== undefined) {
      node.prompt = updateNodeDto.prompt;
    }
    if (updateNodeDto.response !== undefined) {
      node.response = updateNodeDto.response;
    }
    if (updateNodeDto.position !== undefined) {
      node.position = updateNodeDto.position;
    }

    const savedNode = await node.save();

    // Log activity for node edits
    const user = this.getCurrentUser(userFromHeaders);
    const editTypes: string[] = [];
    if (updateNodeDto.prompt !== undefined) editTypes.push('prompt');
    if (updateNodeDto.response !== undefined) editTypes.push('response');
    if (updateNodeDto.position !== undefined) editTypes.push('position');
    
    if (editTypes.length > 0) {
      await this.activityService.logNodeEdited(
        node.canvasId.toString(),
        treeId,
        nodeId,
        user.userId,
        user.userName,
        `edited ${editTypes.join(' and ')}`,
      );
    }

    // Broadcast node update to all connected clients
    const nodeResult = {
      id: savedNode._id.toString(),
      prompt: savedNode.prompt,
      response: savedNode.response,
      model: savedNode.aiModel,
      timestamp: savedNode.createdAt,
      parentId: savedNode.parentId?.toString(),
      isGenerating: savedNode.isGenerating,
      position: savedNode.position,
    };
    await this.collaborationGateway.broadcastNodeUpdated(savedNode.canvasId.toString(), treeId, nodeResult);

    return nodeResult;
  }

  async deleteNode(treeId: string, nodeId: string, userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<boolean> {
    try {
      const node = await this.nodeModel.findById(nodeId);
      if (
        !node ||
        node.isDeleted ||
        !node.conversationId.equals(new Types.ObjectId(treeId))
      ) {
        return false;
      }

      // Check if this is the root node
      const conversation = await this.conversationModel.findById(treeId);
      if (!conversation || conversation.isDeleted) {
        return false;
      }

      const isRootNode = conversation.rootNodeId && conversation.rootNodeId.equals(new Types.ObjectId(nodeId));
      
      if (isRootNode) {
        // If deleting root node, delete the entire conversation tree
        return await this.deleteConversationTree(treeId, userFromHeaders);
      }

      // Get all descendant nodes recursively
      const descendantIds = await this.getDescendantNodeIds(nodeId);
      const totalNodesDeleted = descendantIds.length + 1; // +1 for the node itself

      // Soft delete the node and all its descendants
      const nodesToDelete = [nodeId, ...descendantIds];
      await this.nodeModel.updateMany(
        { _id: { $in: nodesToDelete } },
        {
          isDeleted: true,
          deletedAt: new Date(),
        }
      );

      // Update parent's child count
      if (node.parentId) {
        await this.nodeModel.findByIdAndUpdate(node.parentId, {
          $inc: { childCount: -1 },
        });
      }

      // Update conversation stats
      await this.conversationModel.findByIdAndUpdate(treeId, {
        $inc: { nodeCount: -totalNodesDeleted },
        $set: { 'activity.lastEditedAt': new Date() },
      });

      // Log activity
      const user = this.getCurrentUser(userFromHeaders);
      await this.activityService.logActivity({
        canvasId: node.canvasId.toString(),
        conversationId: treeId,
        nodeId: nodeId,
        userId: user.userId,
        userName: user.userName,
        activityType: 'node_deleted' as any,
        description: `${user.userName} deleted node and ${descendantIds.length} descendant(s)`,
      });

      // Broadcast node deletion to all connected clients
      await this.collaborationGateway.broadcastNodeDeleted(node.canvasId.toString(), treeId, nodeId);

      return true;
    } catch (error) {
      throw error;
    }
  }

  private async getDescendantNodeIds(nodeId: string): Promise<string[]> {
    const descendants: string[] = [];
    
    const children = await this.nodeModel.find({
      parentId: nodeId,
      isDeleted: { $ne: true },
    });

    for (const child of children) {
      descendants.push(child._id.toString());
      // Recursively get descendants of this child
      const childDescendants = await this.getDescendantNodeIds(child._id.toString());
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  async getNodeChildren(
    treeId: string,
    nodeId: string,
  ): Promise<ConversationNodeType[]> {
    const nodes = await this.nodeModel
      .find({
        parentId: nodeId,
        conversationId: treeId,
        isDeleted: { $ne: true },
      })
      .sort({ branchIndex: 1 });

    return nodes.map((node) => ({
      id: node._id.toString(),
      prompt: node.prompt,
      response: node.response,
      model: node.aiModel,
      timestamp: node.createdAt,
      parentId: node.parentId?.toString(),
      isGenerating: node.isGenerating,
      position: node.position,
    }));
  }

  async getConversationHistory(
    treeId: string,
    nodeId: string,
  ): Promise<ConversationNodeType[]> {
    // Get conversation path manually
    const path: any[] = [];
    let currentNode: any = await this.nodeModel.findById(nodeId);

    while (currentNode && !currentNode.isDeleted) {
      path.unshift(currentNode);
      if (currentNode.parentId) {
        currentNode = await this.nodeModel.findById(currentNode.parentId);
      } else {
        break;
      }
    }

    return path
      .filter((node) => node.prompt && node.response && !node.isDeleted)
      .map((node) => ({
        id: node._id.toString(),
        prompt: node.prompt,
        response: node.response,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        isGenerating: node.isGenerating,
        position: node.position,
      }));
  }

  async chat(chatRequest: ChatRequest): Promise<ChatResponse | null> {
    const node = await this.nodeModel.findById(chatRequest.nodeId);
    if (!node || node.isDeleted) {
      return null;
    }

    try {
      // Update the node with the prompt
      node.prompt = chatRequest.prompt;
      node.aiModel = chatRequest.model;
      await node.save();

      const history = await this.getConversationHistory(
        chatRequest.treeId,
        node._id.toString(),
      );
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        [];

      // Add conversation history
      history.forEach((historyNode) => {
        if (historyNode.prompt && historyNode.response) {
          messages.push({ role: 'user', content: historyNode.prompt });
          messages.push({ role: 'assistant', content: historyNode.response });
        }
      });

      // Add current prompt
      messages.push({ role: 'user', content: chatRequest.prompt });

      const model = chatRequest.model || 'gpt-3.5-turbo';
      const { text } = await generateText({
        model: openai(model),
        messages: messages as any,
      });

      node.response = text;
      await node.save();

      return {
        node: {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
        },
      };
    } catch (error) {
      console.error('Chat error:', error);
      return null;
    }
  }

  async *chatStream(chatRequest: ChatRequest, userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }) {
    const node = await this.nodeModel.findById(chatRequest.nodeId);
    if (!node || node.isDeleted) {
      return;
    }

    try {
      // Update the node with the prompt
      node.prompt = chatRequest.prompt;
      node.aiModel = chatRequest.model;
      node.isGenerating = true;
      await node.save();

      yield {
        type: 'nodePromptUpdate',
        data: {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
        },
      };

      const history = await this.getConversationHistory(
        chatRequest.treeId,
        node._id.toString(),
      );
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        [];

      // Add conversation history
      history.forEach((historyNode) => {
        if (historyNode.prompt && historyNode.response) {
          messages.push({ role: 'user', content: historyNode.prompt });
          messages.push({ role: 'assistant', content: historyNode.response });
        }
      });

      // Add current prompt
      messages.push({ role: 'user', content: chatRequest.prompt });

      const model = chatRequest.model || 'gpt-3.5-turbo';
      const result = await streamText({
        model: openai(model),
        messages: messages as any,
      });

      let fullText = '';
      for await (const delta of result.textStream) {
        fullText += delta;
        node.response = fullText;
        yield {
          type: 'nodeResponseUpdate',
          data: { nodeId: node._id.toString(), response: fullText },
        };
      }

      node.isGenerating = false;
      await node.save();

      yield {
        type: 'nodeComplete',
        data: {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
        },
      };
    } catch (error) {
      console.error('Chat stream error:', error);
      node.isGenerating = false;
      await node.save();
      yield { type: 'error', data: { message: 'Failed to generate response' } };
    }
  }
}
