export interface ConversationNode {
  id: string;
  prompt: string;
  response?: string;
  model?: string;
  timestamp: Date;
  parentId?: string;
  isGenerating?: boolean;
  position: {
    x: number;
    y: number;
  };
}

export interface ConversationTree {
  id: string;
  name: string;
  description?: string;
  nodes: ConversationNode[];
  rootNodeId: string;
  createdAt: Date;
  updatedAt: Date;
  position: {
    x: number;
    y: number;
  };
}

export interface Canvas {
  id: string;
  name: string;
  trees: ConversationTree[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationTreeDto {
  name: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface CreateNodeDto {
  prompt: string;
  model?: string;
  parentId?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface UpdateNodeDto {
  prompt?: string;
  response?: string;
  position?: {
    x: number;
    y: number;
  };
}

export interface ChatRequest {
  treeId: string;
  nodeId: string;
  prompt: string;
  model?: string;
}

export interface ChatResponse {
  node: ConversationNode;
}
