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
import { FileService } from '../services/file.service';

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
    private fileService: FileService,
  ) {}


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
    // Require user from headers
    if (!userFromHeaders || !userFromHeaders.userId || !userFromHeaders.userName) {
      throw new Error('User authentication is required. Please provide user headers.');
    }
    
    return {
      userId: userFromHeaders.userId,
      userName: userFromHeaders.userName,
    };
  }

  async getCanvas(userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<CanvasType> {
    // Return error if no canvas ID is provided - users should select a canvas from CreatePage
    throw new Error('Canvas ID is required. Please select a canvas from the projects page.');
  }

  async createCanvas(
    createCanvasDto: CreateCanvasDto,
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<CanvasType> {
    const user = this.getCurrentUser(userFromHeaders);
    const ownerId = this.createObjectIdFromString(user.userId);
    
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
    const user = this.getCurrentUser(userFromHeaders);
    const userId = this.createObjectIdFromString(user.userId);
    
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

  async deleteCanvas(canvasId: string, userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null }): Promise<boolean> {
    try {
      const user = this.getCurrentUser(userFromHeaders);
      const userId = this.createObjectIdFromString(user.userId);
      
      // Find the canvas and verify ownership
      const canvas = await this.canvasModel.findOne({ 
        _id: this.createObjectIdFromString(canvasId),
        isDeleted: { $ne: true }
      });
      
      if (!canvas) {
        return false;
      }
      
      // Check if user is owner
      if (!canvas.ownerId.equals(userId)) {
        throw new Error('Only the canvas owner can delete the canvas');
      }

      // Soft delete the canvas
      canvas.isDeleted = true;
      canvas.deletedAt = new Date();
      await canvas.save();

      // Soft delete all conversations in this canvas
      const conversations = await this.conversationModel.find({ 
        canvasId: canvas._id,
        isDeleted: { $ne: true }
      });

      for (const conversation of conversations) {
        conversation.isDeleted = true;
        conversation.deletedAt = new Date();
        await conversation.save();

        // Soft delete all nodes in each conversation
        await this.nodeModel.updateMany(
          { conversationId: conversation._id },
          {
            isDeleted: true,
            deletedAt: new Date(),
          }
        );
      }

      // Note: We don't log canvas deletion as an activity since it's a high-level
      // administrative action and the individual conversation/node deletions are already logged

      return true;
    } catch (error) {
      throw error;
    }
  }

  async getCanvasByIdOrDefault(canvasId: string): Promise<CanvasType> {
    if (!canvasId) {
      throw new Error('Canvas ID is required. Please select a canvas from the projects page.');
    }
    
    // Get specific canvas by ID
    const canvas = await this.canvasModel.findOne({ 
      _id: this.createObjectIdFromString(canvasId),
      isDeleted: { $ne: true }
    });
    
    if (!canvas) {
      throw new Error(`Canvas with ID ${canvasId} not found.`);
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

        // Get nodes with inherited attachments
        const nodesWithAttachments = await Promise.all(
          nodes.map(async (node) => {
            const nodeWithFiles = await this.getNodeWithInheritedFiles(
              conv._id.toString(),
              node._id.toString(),
            );

            const lastEditedBy = node.activity?.lastEditedBy ? {
              userId: node.activity.lastEditedBy.id.toString(),
              userName: node.activity.lastEditedBy.name,
              userEmail: node.activity.lastEditedBy.email,
              color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
            } : undefined;

            return {
              id: node._id.toString(),
              prompt: node.prompt,
              response: node.response,
              model: node.aiModel || 'gpt-4.1-nano',
              timestamp: node.createdAt,
              parentId: node.parentId ? node.parentId.toString() : undefined,
              isGenerating: node.isGenerating,
              position: node.position,
              attachments: nodeWithFiles?.attachments || [],
              lastEditedBy,
            };
          })
        );

        return {
          id: conv._id.toString(),
          name: conv.name,
          description: conv.description,
          nodes: nodesWithAttachments,
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
    createTreeDto: CreateConversationTreeDto & { canvasId: string },
    userFromHeaders?: { userId: string | null; userName: string | null; userEmail: string | null },
  ): Promise<ConversationTree> {
    // Get the specified canvas
    const canvas = await this.canvasModel.findOne({ 
      _id: this.createObjectIdFromString(createTreeDto.canvasId),
      isDeleted: { $ne: true }
    });
    
    if (!canvas) {
      throw new Error(`Canvas with ID ${createTreeDto.canvasId} not found.`);
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

      // Don't create an initial root node - let users create their first node via branching

      // Update canvas stats
      await this.canvasModel.findByIdAndUpdate(canvas._id, {
        $inc: { totalConversations: 1 },
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
        nodes: [],
        rootNodeId: '',
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
        nodes: [],
        rootNodeId: '',
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

      // Don't create an initial root node - let users create their first node via branching

      // Update canvas statistics
      await this.canvasModel.findByIdAndUpdate(canvas._id, {
        $inc: { totalConversations: 1 },
        lastActivityAt: new Date(),
      });

      const treeResult = {
        trees: [
          {
            id: conversation._id.toString(),
            name: conversation.name,
            description: conversation.description,
            nodes: [],
            rootNodeId: '',
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            position: conversation.position,
          },
        ],
        rootNodeId: '',
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
        nodes: [],
        rootNodeId: '',
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

    // Get nodes with inherited attachments
    const nodesWithAttachments = await Promise.all(
      nodes.map(async (node) => {
        const nodeWithFiles = await this.getNodeWithInheritedFiles(
          treeId,
          node._id.toString(),
        );

        const lastEditedBy = node.activity?.lastEditedBy ? {
          userId: node.activity.lastEditedBy.id.toString(),
          userName: node.activity.lastEditedBy.name,
          userEmail: node.activity.lastEditedBy.email,
          color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
        } : undefined;

        return {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
          attachments: nodeWithFiles?.attachments || [],
          lastEditedBy,
        };
      })
    );

    return {
      id: conversation._id.toString(),
      name: conversation.name,
      description: conversation.description,
      nodes: nodesWithAttachments,
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

      const user = this.getCurrentUser(userFromHeaders);
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
          lastEditedBy: {
            id: this.createObjectIdFromString(user.userId),
            name: user.userName,
            email: userFromHeaders?.userEmail || '',
          },
        },
      });

      // Update parent's child count
      if (parentNode) {
        parentNode.childCount += 1;
        await parentNode.save();
      } else {
        // If this is the first node (no parent), set it as the root node
        await this.conversationModel.findByIdAndUpdate(treeId, {
          rootNodeId: node._id,
        });
      }

      // Update conversation stats
      await this.conversationModel.findByIdAndUpdate(treeId, {
        $inc: { nodeCount: 1 },
        $max: { maxDepth: depth },
        $set: { 'activity.lastEditedAt': new Date() },
      });

      // Update canvas stats
      await this.canvasModel.findByIdAndUpdate(conversation.canvasId, {
        $inc: { totalNodes: 1 },
        $set: { lastActivityAt: new Date() },
      });

      // Log activity
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

      // Get node with inherited attachments for response
      const nodeWithFiles = await this.getNodeWithInheritedFiles(
        treeId,
        node._id.toString(),
      );

      // Broadcast node creation to all connected clients
      const nodeResult = {
        id: node._id.toString(),
        prompt: node.prompt,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        position: node.position,
        attachments: nodeWithFiles?.attachments || [],
        lastEditedBy: {
          userId: user.userId,
          userName: user.userName,
          userEmail: userFromHeaders?.userEmail || '',
          color: this.getColorForUserId(user.userId),
        },
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

    // Update lastEditedBy only for content changes (not position-only updates)
    const hasContentChanges = updateNodeDto.prompt !== undefined || updateNodeDto.response !== undefined;
    if (hasContentChanges) {
      const user = this.getCurrentUser(userFromHeaders);
      node.activity.lastEditedBy = {
        id: this.createObjectIdFromString(user.userId),
        name: user.userName,
        email: userFromHeaders?.userEmail || '',
      };
    }

    const savedNode = await node.save();

    // Log activity for node edits
    const editTypes: string[] = [];
    if (updateNodeDto.prompt !== undefined) editTypes.push('prompt');
    if (updateNodeDto.response !== undefined) editTypes.push('response');
    if (updateNodeDto.position !== undefined) editTypes.push('position');
    
    if (editTypes.length > 0) {
      const user = this.getCurrentUser(userFromHeaders);
      await this.activityService.logNodeEdited(
        node.canvasId.toString(),
        treeId,
        nodeId,
        user.userId,
        user.userName,
        `edited ${editTypes.join(' and ')}`,
      );
    }

    // Get updated node with inherited attachments
    const nodeWithFiles = await this.getNodeWithInheritedFiles(
      treeId,
      savedNode._id.toString(),
    );

    const user = this.getCurrentUser(userFromHeaders);

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
      attachments: nodeWithFiles?.attachments || [],
      lastEditedBy: {
        userId: user.userId,
        userName: user.userName,
        userEmail: userFromHeaders?.userEmail || '',
        color: this.getColorForUserId(user.userId),
      },
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

    // Get nodes with inherited attachments
    const nodesWithAttachments = await Promise.all(
      nodes.map(async (node) => {
        const nodeWithFiles = await this.getNodeWithInheritedFiles(
          treeId,
          node._id.toString(),
        );

        const lastEditedBy = node.activity?.lastEditedBy ? {
          userId: node.activity.lastEditedBy.id.toString(),
          userName: node.activity.lastEditedBy.name,
          userEmail: node.activity.lastEditedBy.email,
          color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
        } : undefined;

        return {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
          attachments: nodeWithFiles?.attachments || [],
          lastEditedBy,
        };
      })
    );

    return nodesWithAttachments;
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

    const filteredNodes = path.filter((node) => node.prompt && node.response && !node.isDeleted);
    
    // Get nodes with inherited attachments
    const nodesWithAttachments = await Promise.all(
      filteredNodes.map(async (node) => {
        const nodeWithFiles = await this.getNodeWithInheritedFiles(
          treeId,
          node._id.toString(),
        );

        const lastEditedBy = node.activity?.lastEditedBy ? {
          userId: node.activity.lastEditedBy.id.toString(),
          userName: node.activity.lastEditedBy.name,
          userEmail: node.activity.lastEditedBy.email,
          color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
        } : undefined;

        return {
          id: node._id.toString(),
          prompt: node.prompt,
          response: node.response,
          model: node.aiModel,
          timestamp: node.createdAt,
          parentId: node.parentId?.toString(),
          isGenerating: node.isGenerating,
          position: node.position,
          attachments: nodeWithFiles?.attachments || [],
          lastEditedBy,
        };
      })
    );

    return nodesWithAttachments;
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

      // Get conversation history with file attachments
      const history = await this.getConversationHistory(
        chatRequest.treeId,
        node._id.toString(),
      );
      
      // Get current node with inherited files for context
      const nodeForContext = await this.getNodeWithInheritedFiles(
        chatRequest.treeId,
        node._id.toString(),
      );

      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        [];

      // Build file context from all available attachments
      let fileContext = '';
      if (nodeForContext && nodeForContext.attachments && nodeForContext.attachments.length > 0) {
        const contextFiles = nodeForContext.attachments.filter(att => att.textContent);
        if (contextFiles.length > 0) {
          fileContext = '\n\nFile Context:\n';
          contextFiles.forEach(attachment => {
            fileContext += `--- ${attachment.originalName} ---\n`;
            fileContext += attachment.textContent + '\n\n';
          });
        }
      }

      // Add conversation history
      history.forEach((historyNode) => {
        if (historyNode.prompt && historyNode.response) {
          messages.push({ role: 'user', content: historyNode.prompt });
          messages.push({ role: 'assistant', content: historyNode.response });
        }
      });

      // Add current prompt with file context
      const promptWithContext = fileContext 
        ? chatRequest.prompt + fileContext
        : chatRequest.prompt;
      
      messages.push({ role: 'user', content: promptWithContext });

      const model = chatRequest.model || 'gpt-3.5-turbo';
      const { text } = await generateText({
        model: openai(model),
        messages: messages as any,
      });

      node.response = text;
      await node.save();

      // Get node with inherited attachments for response
      const nodeWithFiles = await this.getNodeWithInheritedFiles(
        chatRequest.treeId,
        node._id.toString(),
      );

      const lastEditedBy = node.activity?.lastEditedBy ? {
        userId: node.activity.lastEditedBy.id.toString(),
        userName: node.activity.lastEditedBy.name,
        userEmail: node.activity.lastEditedBy.email,
        color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
      } : undefined;

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
          attachments: nodeWithFiles?.attachments || [],
          lastEditedBy,
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
      // Update the node with the prompt and track editor
      node.prompt = chatRequest.prompt;
      node.aiModel = chatRequest.model;
      node.isGenerating = true;
      
      // Update lastEditedBy
      const user = this.getCurrentUser(userFromHeaders);
      node.activity.lastEditedBy = {
        id: this.createObjectIdFromString(user.userId),
        name: user.userName,
        email: userFromHeaders?.userEmail || '',
      };
      
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

      // Get conversation history with file attachments
      const history = await this.getConversationHistory(
        chatRequest.treeId,
        node._id.toString(),
      );
      
      // Get current node with inherited files for context
      const nodeWithInheritedFiles = await this.getNodeWithInheritedFiles(
        chatRequest.treeId,
        node._id.toString(),
      );

      console.log({ nodeWithInheritedFiles })

      const messages: Array<{ role: 'user' | 'assistant'; content: string }> =
        [];

      // Build file context from all available attachments
      let fileContext = '';
      if (nodeWithInheritedFiles && nodeWithInheritedFiles.attachments && nodeWithInheritedFiles.attachments.length > 0) {
        const contextFiles = nodeWithInheritedFiles.attachments.filter(att => att.textContent);
        if (contextFiles.length > 0) {
          fileContext = '\n\nFile Context:\n';
          contextFiles.forEach(attachment => {
            fileContext += `--- ${attachment.originalName} ---\n`;
            fileContext += attachment.textContent + '\n\n';
          });
        }
      }

      // Add conversation history
      history.forEach((historyNode) => {
        if (historyNode.prompt && historyNode.response) {
          messages.push({ role: 'user', content: historyNode.prompt });
          messages.push({ role: 'assistant', content: historyNode.response });
        }
      });

      // Add current prompt with file context
      const promptWithContext = fileContext 
        ? chatRequest.prompt + fileContext
        : chatRequest.prompt;
      
      messages.push({ role: 'user', content: promptWithContext });

      const model = chatRequest.model || '';
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

  async uploadFileToNode(
    treeId: string,
    nodeId: string,
    file: Buffer,
    filename: string,
    mimeType: string,
    originalName: string,
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

    try {
      const user = this.getCurrentUser(userFromHeaders);
      
      // Upload file using FileService
      const attachment = await this.fileService.uploadFile(
        file,
        filename,
        mimeType,
        originalName,
        user.userId,
      );

      // Add attachment to node
      node.attachments = node.attachments || [];
      node.attachments.push(attachment);
      await node.save();

      // Log activity
      await this.activityService.logActivity({
        canvasId: node.canvasId.toString(),
        conversationId: treeId,
        nodeId: nodeId,
        userId: user.userId,
        userName: user.userName,
        activityType: 'file_uploaded' as any,
        description: `${user.userName} uploaded file: ${originalName}`,
      });

      // Return updated node with lastEditedBy
      const lastEditedBy = node.activity?.lastEditedBy ? {
        userId: node.activity.lastEditedBy.id.toString(),
        userName: node.activity.lastEditedBy.name,
        userEmail: node.activity.lastEditedBy.email,
        color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
      } : undefined;

      return {
        id: node._id.toString(),
        prompt: node.prompt,
        response: node.response,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        isGenerating: node.isGenerating,
        position: node.position,
        attachments: node.attachments as any,
        lastEditedBy,
      };
    } catch (error) {
      throw error;
    }
  }

  async getNodeWithInheritedFiles(
    treeId: string,
    nodeId: string,
  ): Promise<ConversationNodeType | null> {
    const node = await this.nodeModel.findById(nodeId);
    if (
      !node ||
      node.isDeleted ||
      !node.conversationId.equals(new Types.ObjectId(treeId))
    ) {
      return null;
    }

    // Get all nodes in the conversation for hierarchy building
    const allNodes = await this.nodeModel
      .find({
        conversationId: treeId,
        isDeleted: { $ne: true },
      })
      .select('_id parentId attachments');

    // Build node hierarchy and attachments map
    const nodeHierarchy = new Map<string, string>();
    const nodeAttachments = new Map<string, any[]>();

    allNodes.forEach(n => {
      if (n.parentId) {
        nodeHierarchy.set(n._id.toString(), n.parentId.toString());
      }
      if (n.attachments && n.attachments.length > 0) {
        nodeAttachments.set(n._id.toString(), n.attachments);
      }
    });

    // Get inherited files
    const inheritedFiles = await this.fileService.getInheritedAttachments(
      nodeId,
      nodeAttachments,
      nodeHierarchy,
    );

    // Combine direct attachments with inherited ones
    const allAttachments = [
      ...(node.attachments || []),
      ...inheritedFiles,
    ];

    const lastEditedBy = node.activity?.lastEditedBy ? {
      userId: node.activity.lastEditedBy.id.toString(),
      userName: node.activity.lastEditedBy.name,
      userEmail: node.activity.lastEditedBy.email,
      color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
    } : undefined;

    return {
      id: node._id.toString(),
      prompt: node.prompt,
      response: node.response,
      model: node.aiModel,
      timestamp: node.createdAt,
      parentId: node.parentId?.toString(),
      isGenerating: node.isGenerating,
      position: node.position,
      attachments: allAttachments as any,
      lastEditedBy,
    };
  }

  async deleteFileFromNode(
    treeId: string,
    nodeId: string,
    attachmentId: string,
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

    try {
      // Find and remove the attachment
      const attachmentIndex = node.attachments?.findIndex(
        att => att.id === attachmentId
      );

      if (attachmentIndex === -1 || !node.attachments) {
        return null;
      }

      const attachment = node.attachments[attachmentIndex];
      
      // Delete from GridFS
      await this.fileService.deleteTextFile(new Types.ObjectId(attachment.gridFSFileId));

      // Remove from node
      node.attachments.splice(attachmentIndex, 1);
      await node.save();

      // Log activity
      const user = this.getCurrentUser(userFromHeaders);
      await this.activityService.logActivity({
        canvasId: node.canvasId.toString(),
        conversationId: treeId,
        nodeId: nodeId,
        userId: user.userId,
        userName: user.userName,
        activityType: 'file_deleted' as any,
        description: `${user.userName} deleted file: ${attachment.originalName}`,
      });

      const lastEditedBy = node.activity?.lastEditedBy ? {
        userId: node.activity.lastEditedBy.id.toString(),
        userName: node.activity.lastEditedBy.name,
        userEmail: node.activity.lastEditedBy.email,
        color: this.getColorForUserId(node.activity.lastEditedBy.id.toString()),
      } : undefined;

      return {
        id: node._id.toString(),
        prompt: node.prompt,
        response: node.response,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        isGenerating: node.isGenerating,
        position: node.position,
        attachments: node.attachments as any,
        lastEditedBy,
      };
    } catch (error) {
      throw error;
    }
  }
}
