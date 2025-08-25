import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { ActivityService } from './activity.service';

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

  private getCurrentUser() {
    // In a real app, this would get user from request context
    return {
      userId: this.getDefaultUserId(),
      userName: this.getDefaultUserName(),
    };
  }

  async getCanvas(): Promise<CanvasType> {
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

  async createConversationTree(
    createTreeDto: CreateConversationTreeDto,
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
      const user = this.getCurrentUser();
      await this.activityService.logConversationCreated(
        canvas._id.toString(),
        conversation._id.toString(),
        user.userId,
        user.userName,
      );

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

  async deleteConversationTree(treeId: string): Promise<boolean> {
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
    }

    return await this.getConversationTree(treeId);
  }

  async addNode(
    treeId: string,
    createNodeDto: CreateNodeDto,
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
      const user = this.getCurrentUser();
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

      return {
        id: node._id.toString(),
        prompt: node.prompt,
        model: node.aiModel,
        timestamp: node.createdAt,
        parentId: node.parentId?.toString(),
        position: node.position,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateNode(
    treeId: string,
    nodeId: string,
    updateNodeDto: UpdateNodeDto,
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
    const user = this.getCurrentUser();
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

    return {
      id: savedNode._id.toString(),
      prompt: savedNode.prompt,
      response: savedNode.response,
      model: savedNode.aiModel,
      timestamp: savedNode.createdAt,
      parentId: savedNode.parentId?.toString(),
      isGenerating: savedNode.isGenerating,
      position: savedNode.position,
    };
  }

  async deleteNode(treeId: string, nodeId: string): Promise<boolean> {
    try {
      const node = await this.nodeModel.findById(nodeId);
      if (
        !node ||
        node.isDeleted ||
        !node.conversationId.equals(new Types.ObjectId(treeId))
      ) {
        return false;
      }

      // Soft delete the node
      node.isDeleted = true;
      node.deletedAt = new Date();
      await node.save();

      // Update parent's child count
      if (node.parentId) {
        await this.nodeModel.findByIdAndUpdate(node.parentId, {
          $inc: { childCount: -1 },
        });
      }

      // Update conversation stats
      await this.conversationModel.findByIdAndUpdate(treeId, {
        $inc: { nodeCount: -1 },
        $set: { 'activity.lastEditedAt': new Date() },
      });

      return true;
    } catch (error) {
      throw error;
    }
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

  async *chatStream(chatRequest: ChatRequest) {
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
