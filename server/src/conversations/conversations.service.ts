import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import {
  Canvas,
  ConversationTree,
  ConversationNode,
  CreateConversationTreeDto,
  CreateNodeDto,
  UpdateNodeDto,
  ChatRequest,
  ChatResponse,
} from '../types/conversation.types';

@Injectable()
export class ConversationsService {
  private canvas: Canvas = {
    id: 'default-canvas',
    name: 'Main Canvas',
    trees: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  getCanvas(): Canvas {
    return this.canvas;
  }

  createConversationTree(createTreeDto: CreateConversationTreeDto): ConversationTree {
    const rootNode: ConversationNode = {
      id: `node-${Date.now()}-root`,
      prompt: 'Start conversation',
      response: 'Click "Add New Branch" to begin your conversation.',
      timestamp: new Date(),
      position: { x: createTreeDto.position.x + 50, y: createTreeDto.position.y + 100 },
    };

    const tree: ConversationTree = {
      id: `tree-${Date.now()}`,
      name: createTreeDto.name,
      description: createTreeDto.description,
      nodes: [rootNode],
      rootNodeId: rootNode.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      position: createTreeDto.position,
    };

    this.canvas.trees.push(tree);
    this.canvas.updatedAt = new Date();

    return tree;
  }

  getConversationTree(treeId: string): ConversationTree | null {
    return this.canvas.trees.find(tree => tree.id === treeId) || null;
  }

  deleteConversationTree(treeId: string): boolean {
    const initialLength = this.canvas.trees.length;
    this.canvas.trees = this.canvas.trees.filter(tree => tree.id !== treeId);
    
    if (this.canvas.trees.length < initialLength) {
      this.canvas.updatedAt = new Date();
      return true;
    }
    return false;
  }

  updateTree(treeId: string, updateData: { position?: { x: number; y: number } }): ConversationTree | null {
    const tree = this.getConversationTree(treeId);
    if (!tree) return null;

    if (updateData.position !== undefined) {
      tree.position = updateData.position;
    }

    tree.updatedAt = new Date();
    this.canvas.updatedAt = new Date();

    return tree;
  }

  addNode(treeId: string, createNodeDto: CreateNodeDto): ConversationNode | null {
    const tree = this.getConversationTree(treeId);
    if (!tree) return null;

    const node: ConversationNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      prompt: createNodeDto.prompt,
      model: createNodeDto.model,
      timestamp: new Date(),
      parentId: createNodeDto.parentId,
      position: createNodeDto.position,
    };

    tree.nodes.push(node);
    tree.updatedAt = new Date();
    this.canvas.updatedAt = new Date();

    return node;
  }

  updateNode(treeId: string, nodeId: string, updateNodeDto: UpdateNodeDto): ConversationNode | null {
    const tree = this.getConversationTree(treeId);
    if (!tree) return null;

    const node = tree.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    if (updateNodeDto.prompt !== undefined) {
      node.prompt = updateNodeDto.prompt;
    }
    if (updateNodeDto.response !== undefined) {
      node.response = updateNodeDto.response;
    }
    if (updateNodeDto.position !== undefined) {
      node.position = updateNodeDto.position;
    }

    tree.updatedAt = new Date();
    this.canvas.updatedAt = new Date();

    return node;
  }

  deleteNode(treeId: string, nodeId: string): boolean {
    const tree = this.getConversationTree(treeId);
    if (!tree) return false;

    const initialLength = tree.nodes.length;
    tree.nodes = tree.nodes.filter(node => node.id !== nodeId);
    
    if (tree.nodes.length < initialLength) {
      tree.updatedAt = new Date();
      this.canvas.updatedAt = new Date();
      return true;
    }
    return false;
  }

  getNodeChildren(treeId: string, nodeId: string): ConversationNode[] {
    const tree = this.getConversationTree(treeId);
    if (!tree) return [];

    return tree.nodes.filter(node => node.parentId === nodeId);
  }

  getConversationHistory(treeId: string, nodeId: string): ConversationNode[] {
    const tree = this.getConversationTree(treeId);
    if (!tree) return [];

    const history: ConversationNode[] = [];
    let currentNode = tree.nodes.find(n => n.id === nodeId);

    while (currentNode) {
      history.unshift(currentNode);
      if (currentNode.parentId) {
        currentNode = tree.nodes.find(n => n.id === currentNode!.parentId);
      } else {
        break;
      }
    }

    return history.filter(node => node.prompt && node.response);
  }

  async chat(chatRequest: ChatRequest): Promise<ChatResponse | null> {
    const tree = this.getConversationTree(chatRequest.treeId);
    if (!tree) return null;

    const node = tree.nodes.find(n => n.id === chatRequest.nodeId);
    if (!node) return null;

    // Update the node with the prompt
    node.prompt = chatRequest.prompt;
    node.model = chatRequest.model;

    try {
      const history = this.getConversationHistory(chatRequest.treeId, node.id);
      const messages: Array<{role: 'user' | 'assistant', content: string}> = [];
      
      // Add conversation history
      history.forEach(historyNode => {
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
      tree.updatedAt = new Date();
      this.canvas.updatedAt = new Date();

      return { node };
    } catch (error) {
      console.error('Chat error:', error);
      return null;
    }
  }

  async *chatStream(chatRequest: ChatRequest) {
    const tree = this.getConversationTree(chatRequest.treeId);
    if (!tree) return;

    const node = tree.nodes.find(n => n.id === chatRequest.nodeId);
    if (!node) return;

    // Update the node with the prompt
    node.prompt = chatRequest.prompt;
    node.model = chatRequest.model;
    node.isGenerating = true;

    yield { type: 'nodePromptUpdate', data: node };

    try {
      const history = this.getConversationHistory(chatRequest.treeId, node.id);
      const messages: Array<{role: 'user' | 'assistant', content: string}> = [];
      
      // Add conversation history
      history.forEach(historyNode => {
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
        yield { type: 'nodeResponseUpdate', data: { nodeId: node.id, response: fullText } };
      }

      node.isGenerating = false;
      tree.updatedAt = new Date();
      this.canvas.updatedAt = new Date();

      yield { type: 'nodeComplete', data: node };
    } catch (error) {
      console.error('Chat stream error:', error);
      node.isGenerating = false;
      yield { type: 'error', data: { message: 'Failed to generate response' } };
    }
  }
}