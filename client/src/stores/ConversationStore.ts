import { makeAutoObservable, runInAction } from 'mobx';
import {
  Canvas,
  ConversationTree,
  ConversationNode,
  CreateConversationTreeDto,
  ChatRequest,
} from '../types/conversation.types';

class ConversationStore {
  canvas: Canvas | null = null;
  selectedTreeId: string | null = null;
  selectedNodeId: string | null = null;
  isLoading = false;
  nodeLoadingStates: Map<string, boolean> = new Map();
  streamingNodes: Map<string, ConversationNode> = new Map();
  error: string | null = null;
  currentUser: { userId: string; userName: string; userEmail: string } | null = null;

  constructor() {
    makeAutoObservable(this);
    // Don't load canvas in constructor - users must select a canvas from CreatePage
  }

  setCurrentUser(user: { userId: string; userName: string; userEmail: string }) {
    this.currentUser = user;
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.currentUser) {
      headers['X-User-Id'] = this.currentUser.userId;
      headers['X-User-Name'] = this.currentUser.userName;
      headers['X-User-Email'] = this.currentUser.userEmail;
    }
    
    return headers;
  }

  async loadCanvas(canvasId?: string) {
    this.setLoading(true);
    try {
      const endpoint = canvasId 
        ? `http://localhost:3001/conversations/canvas/${canvasId}`
        : 'http://localhost:3001/conversations/canvas';
      
      const response = await fetch(endpoint, {
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to load canvas');
      
      const canvas = await response.json();
      runInAction(() => {
        this.canvas = {
          ...canvas,
          trees: canvas.trees.map((tree: any) => ({
            ...tree,
            createdAt: new Date(tree.createdAt),
            updatedAt: new Date(tree.updatedAt),
            nodes: tree.nodes.map((node: any) => ({
              ...node,
              timestamp: new Date(node.timestamp),
            })),
          })),
          createdAt: new Date(canvas.createdAt),
          updatedAt: new Date(canvas.updatedAt),
        };
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    } finally {
      this.setLoading(false);
    }
  }

  async createCanvas(projectData: {
    title: string;
    description: string;
    collaborators: Array<{
      userId: string;
      userName: string;
      userEmail: string;
      color: string;
    }>;
  }): Promise<string> {
    this.setLoading(true);
    try {
      const createCanvasDto = {
        name: projectData.title,
        description: projectData.description,
        collaborators: projectData.collaborators.map(collab => ({
          userId: collab.userId,
          userEmail: collab.userEmail,
          userName: collab.userName,
          permissions: 'write' as const,
        })),
      };

      const response = await fetch('http://localhost:3001/conversations/canvas', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(createCanvasDto),
      });

      if (!response.ok) {
        throw new Error('Failed to create canvas');
      }

      const newCanvas = await response.json();
      
      runInAction(() => {
        this.canvas = {
          ...newCanvas,
          trees: newCanvas.trees.map((tree: any) => ({
            ...tree,
            createdAt: new Date(tree.createdAt),
            updatedAt: new Date(tree.updatedAt),
          })),
          createdAt: new Date(newCanvas.createdAt),
          updatedAt: new Date(newCanvas.updatedAt),
        };
        this.error = null;
      });

      return newCanvas.id;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  async getUserCanvases(): Promise<any[]> {
    try {
      const response = await fetch('http://localhost:3001/conversations/user/canvases', {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user canvases');
      }

      const canvases = await response.json();
      return canvases;
    } catch (error) {
      console.error('Error fetching user canvases:', error);
      return [];
    }
  }

  async deleteCanvas(canvasId: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:3001/conversations/canvas/${canvasId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to delete canvas');
      }

      // If we're currently viewing the deleted canvas, clear it
      runInAction(() => {
        if (this.canvas?.id === canvasId) {
          this.canvas = null;
          this.selectedTreeId = null;
          this.selectedNodeId = null;
        }
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
      throw error;
    }
  }

  async createConversationTree(createTreeDto: CreateConversationTreeDto) {
    this.setLoading(true);
    try {
      if (!this.canvas?.id) {
        throw new Error('No canvas loaded. Please select a canvas first.');
      }
      
      const requestBody = {
        ...createTreeDto,
        canvasId: this.canvas.id
      };
      
      const response = await fetch('http://localhost:3001/conversations/trees', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) throw new Error('Failed to create conversation tree');
      
      const tree = await response.json();
      const newTreeId = tree.id;
      
      await this.loadCanvas(this.canvas.id);
      
      runInAction(() => {
        this.selectedTreeId = newTreeId;
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    } finally {
      this.setLoading(false);
    }
  }

  async deleteConversationTree(treeId: string) {
    this.setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/conversations/trees/${treeId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) throw new Error('Failed to delete conversation tree');
      
      const wasSelected = this.selectedTreeId === treeId;
      
      await this.loadCanvas(this.canvas?.id);
      
      runInAction(() => {
        if (wasSelected) {
          this.selectedTreeId = null;
          this.selectedNodeId = null;
        }
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    } finally {
      this.setLoading(false);
    }
  }

  async sendMessage(chatRequest: ChatRequest) {
    const nodeId = chatRequest.nodeId;
    this.setNodeLoading(nodeId, true);
    
    try {
      const response = await fetch('http://localhost:3001/conversations/chat/stream', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(chatRequest),
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              await this.handleStreamEvent(parsed);
            } catch (e) {
              console.error('Failed to parse stream data:', e);
            }
          }
        }
      }
      
      runInAction(() => {
        this.error = null;
      });
      
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
      throw error;
    } finally {
      this.setNodeLoading(nodeId, false);
    }
  }

  private async handleStreamEvent(event: any) {
    runInAction(() => {
      switch (event.type) {
        case 'nodePromptUpdate':
          // Node prompt updated - refresh canvas to show it
          this.loadCanvas(this.canvas?.id);
          break;
        case 'nodeResponseUpdate':
          // Update streaming response content
          const streamingNode = this.streamingNodes.get(event.data.nodeId);
          if (streamingNode) {
            streamingNode.response = event.data.response;
          }
          // Also update in canvas if available
          if (this.canvas) {
            for (const tree of this.canvas.trees) {
              const node = tree.nodes.find(n => n.id === event.data.nodeId);
              if (node) {
                node.response = event.data.response;
                node.isGenerating = true;
                break;
              }
            }
          }
          break;
        case 'nodeComplete':
          // Remove from streaming nodes and refresh canvas
          this.streamingNodes.delete(event.data.id);
          if (this.canvas) {
            for (const tree of this.canvas.trees) {
              const node = tree.nodes.find(n => n.id === event.data.id);
              if (node) {
                node.isGenerating = false;
                break;
              }
            }
          }
          this.loadCanvas(this.canvas?.id);
          break;
        case 'error':
          this.error = event.data.message;
          break;
      }
    });
  }

  async updateNodePosition(treeId: string, nodeId: string, position: { x: number; y: number }) {
    try {
      // Optimistically update the position locally first
      runInAction(() => {
        const tree = this.getTreeById(treeId);
        if (tree) {
          const node = tree.nodes.find(n => n.id === nodeId);
          if (node) {
            node.position = position;
          }
        }
      });

      const response = await fetch(`http://localhost:3001/conversations/trees/${treeId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ position }),
      });
      
      if (!response.ok) {
        // Revert the optimistic update by reloading
        await this.loadCanvas(this.canvas?.id);
        throw new Error('Failed to update node position');
      }
      
      runInAction(() => {
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    }
  }

  async updateTreePosition(treeId: string, position: { x: number; y: number }) {
    try {
      // Optimistically update the position locally first
      runInAction(() => {
        const tree = this.getTreeById(treeId);
        if (tree) {
          tree.position = position;
        }
      });

      const response = await fetch(`http://localhost:3001/conversations/trees/${treeId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ position }),
      });
      
      if (!response.ok) {
        // Revert the optimistic update by reloading
        await this.loadCanvas(this.canvas?.id);
        throw new Error('Failed to update tree position');
      }
      
      runInAction(() => {
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    }
  }

  setSelectedTree(treeId: string | null) {
    this.selectedTreeId = treeId;
    this.selectedNodeId = null;
  }

  setSelectedNode(nodeId: string | null) {
    this.selectedNodeId = nodeId;
  }

  setLoading(loading: boolean) {
    this.isLoading = loading;
  }

  setError(error: string | null) {
    this.error = error;
  }

  setNodeLoading(nodeId: string, loading: boolean) {
    if (loading) {
      this.nodeLoadingStates.set(nodeId, true);
    } else {
      this.nodeLoadingStates.delete(nodeId);
    }
  }

  isNodeLoading(nodeId: string): boolean {
    return this.nodeLoadingStates.get(nodeId) || false;
  }

  getNodeWithStreamingContent(treeId: string, nodeId: string): ConversationNode | undefined {
    // First check if there's streaming content
    const streamingNode = this.streamingNodes.get(nodeId);
    if (streamingNode) return streamingNode;
    
    // Otherwise return the regular node
    return this.getNodeById(treeId, nodeId);
  }

  async addNewNodeBranch(treeId: string, parentNodeId: string | null) {
    let newPosition = { x: 0, y: 150 }; // Default position for first node
    
    if (parentNodeId) {
      const parentNode = this.getNodeById(treeId, parentNodeId);
      if (!parentNode) return;

      const childrenCount = this.getNodeChildren(treeId, parentNodeId).length;
      const offsetX = childrenCount * 300;
      
      newPosition = {
        x: parentNode.position.x + offsetX,
        y: parentNode.position.y + 150,
      };
    } else {
      // For root node, position it relative to the tree header
      const tree = this.getTreeById(treeId);
      if (tree) {
        newPosition = {
          x: tree.position.x + 50, // Slightly offset from tree header
          y: tree.position.y + 200, // Below the tree header
        };
      }
    }

    try {
      const response = await fetch(`http://localhost:3001/conversations/trees/${treeId}/nodes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          prompt: '',
          parentId: parentNodeId,
          position: newPosition,
        }),
      });

      if (!response.ok) throw new Error('Failed to create node');

      const newNode = await response.json();
      await this.loadCanvas(this.canvas?.id);

      runInAction(() => {
        this.selectedNodeId = newNode.id;
        this.error = null;
      });

      return newNode;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
      throw error;
    }
  }

  getTreeById(treeId: string): ConversationTree | undefined {
    return this.canvas?.trees.find(tree => tree.id === treeId);
  }

  getNodeById(treeId: string, nodeId: string): ConversationNode | undefined {
    const tree = this.getTreeById(treeId);
    return tree?.nodes.find(node => node.id === nodeId);
  }

  getNodeChildren(treeId: string, nodeId: string): ConversationNode[] {
    const tree = this.getTreeById(treeId);
    if (!tree) return [];
    return tree.nodes.filter(node => node.parentId === nodeId);
  }

  async deleteNode(treeId: string, nodeId: string) {
    try {
      // Check if this is the root node before deletion
      const tree = this.getTreeById(treeId);
      const isRootNode = tree && tree.rootNodeId === nodeId;
      
      const response = await fetch(`http://localhost:3001/conversations/trees/${treeId}/nodes/${nodeId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) throw new Error('Failed to delete node');
      
      const wasSelectedNode = this.selectedNodeId === nodeId;
      const wasSelectedTree = this.selectedTreeId === treeId;
      
      // Force refresh the canvas to get latest state
      await this.loadCanvas(this.canvas?.id);
      
      runInAction(() => {
        // If we deleted a root node, the entire tree is gone
        if (isRootNode && wasSelectedTree) {
          this.selectedTreeId = null;
          this.selectedNodeId = null;
        } else if (wasSelectedNode) {
          this.selectedNodeId = null;
        }
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unknown error';
      });
    }
  }

  get selectedTree(): ConversationTree | undefined {
    return this.selectedTreeId ? this.getTreeById(this.selectedTreeId) : undefined;
  }

  get selectedNode(): ConversationNode | undefined {
    return this.selectedTreeId && this.selectedNodeId 
      ? this.getNodeById(this.selectedTreeId, this.selectedNodeId) 
      : undefined;
  }
}

export const conversationStore = new ConversationStore();