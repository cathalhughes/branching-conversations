import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Res,
  Headers,
} from '@nestjs/common';
import { Response } from 'express';
import { ConversationsService } from './conversations.service';
import {
  CreateConversationTreeDto,
  CreateNodeDto,
  UpdateNodeDto,
  ChatRequest,
  CreateCanvasDto,
} from '../types/conversation.types';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  private extractUserFromHeaders(headers: Record<string, string>) {
    return {
      userId: headers['x-user-id'] || null,
      userName: headers['x-user-name'] || null,
      userEmail: headers['x-user-email'] || null,
    };
  }

  @Get('canvas')
  getCanvas(@Headers() headers: Record<string, string>) {
    return this.conversationsService.getCanvas(this.extractUserFromHeaders(headers));
  }

  @Get('canvas/:canvasId')
  getCanvasById(@Param('canvasId') canvasId: string, @Headers() headers: Record<string, string>) {
    return this.conversationsService.getCanvasByIdOrDefault(canvasId);
  }

  @Post('canvas')
  createCanvas(@Body() createCanvasDto: CreateCanvasDto, @Headers() headers: Record<string, string>) {
    return this.conversationsService.createCanvas(createCanvasDto, this.extractUserFromHeaders(headers));
  }

  @Get('user/canvases')
  getUserCanvases(@Headers() headers: Record<string, string>) {
    return this.conversationsService.getUserCanvases(this.extractUserFromHeaders(headers));
  }

  @Post('trees')
  createConversationTree(@Body() createTreeDto: CreateConversationTreeDto, @Headers() headers: Record<string, string>) {
    return this.conversationsService.createConversationTree(createTreeDto, this.extractUserFromHeaders(headers));
  }

  @Post('canvas/:canvasId/trees')
  createConversationTreeInCanvas(
    @Param('canvasId') canvasId: string, 
    @Body() createTreeDto: CreateConversationTreeDto, 
    @Headers() headers: Record<string, string>
  ) {
    return this.conversationsService.createConversationTreeInCanvas(canvasId, createTreeDto, this.extractUserFromHeaders(headers));
  }

  @Get('trees/:treeId')
  getConversationTree(@Param('treeId') treeId: string) {
    const tree = this.conversationsService.getConversationTree(treeId);
    if (!tree) {
      throw new HttpException(
        'Conversation tree not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return tree;
  }

  @Delete('trees/:treeId')
  deleteConversationTree(@Param('treeId') treeId: string, @Headers() headers: Record<string, string>) {
    const success = this.conversationsService.deleteConversationTree(treeId, this.extractUserFromHeaders(headers));
    if (!success) {
      throw new HttpException(
        'Conversation tree not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true };
  }

  @Put('trees/:treeId')
  updateTree(
    @Param('treeId') treeId: string,
    @Body() updateData: { position?: { x: number; y: number } },
  ) {
    const tree = this.conversationsService.updateTree(treeId, updateData);
    if (!tree) {
      throw new HttpException(
        'Conversation tree not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return tree;
  }

  @Post('trees/:treeId/nodes')
  addNode(
    @Param('treeId') treeId: string,
    @Body() createNodeDto: CreateNodeDto,
    @Headers() headers: Record<string, string>,
  ) {
    const node = this.conversationsService.addNode(treeId, createNodeDto, this.extractUserFromHeaders(headers));
    if (!node) {
      throw new HttpException(
        'Conversation tree not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return node;
  }

  @Put('trees/:treeId/nodes/:nodeId')
  updateNode(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
    @Body() updateNodeDto: UpdateNodeDto,
    @Headers() headers: Record<string, string>,
  ) {
    const node = this.conversationsService.updateNode(
      treeId,
      nodeId,
      updateNodeDto,
      this.extractUserFromHeaders(headers),
    );
    if (!node) {
      throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
    }
    return node;
  }

  @Delete('trees/:treeId/nodes/:nodeId')
  deleteNode(@Param('treeId') treeId: string, @Param('nodeId') nodeId: string, @Headers() headers: Record<string, string>) {
    const success = this.conversationsService.deleteNode(treeId, nodeId, this.extractUserFromHeaders(headers));
    if (!success) {
      throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  @Get('trees/:treeId/nodes/:nodeId/children')
  getNodeChildren(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.conversationsService.getNodeChildren(treeId, nodeId);
  }

  @Get('trees/:treeId/nodes/:nodeId/history')
  getConversationHistory(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.conversationsService.getConversationHistory(treeId, nodeId);
  }

  @Post('chat')
  async chat(@Body() chatRequest: ChatRequest) {
    const response = await this.conversationsService.chat(chatRequest);
    if (!response) {
      throw new HttpException(
        'Failed to process chat request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return response;
  }

  @Post('chat/stream')
  async chatStream(@Body() chatRequest: ChatRequest, @Res() res: Response, @Headers() headers: Record<string, string>) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    try {
      for await (const chunk of this.conversationsService.chatStream(
        chatRequest,
        this.extractUserFromHeaders(headers),
      )) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: { message: 'Stream failed' } })}\n\n`,
      );
      res.end();
    }
  }
}
