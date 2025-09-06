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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Delete('canvas/:canvasId')
  async deleteCanvas(@Param('canvasId') canvasId: string, @Headers() headers: Record<string, string>) {
    const success = await this.conversationsService.deleteCanvas(canvasId, this.extractUserFromHeaders(headers));
    if (!success) {
      throw new HttpException(
        'Canvas not found or permission denied',
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true };
  }

  @Get('user/canvases')
  getUserCanvases(@Headers() headers: Record<string, string>) {
    return this.conversationsService.getUserCanvases(this.extractUserFromHeaders(headers));
  }

  @Post('trees')
  createConversationTree(@Body() createTreeDto: CreateConversationTreeDto & { canvasId: string }, @Headers() headers: Record<string, string>) {
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

  @Post('trees/:treeId/nodes/:nodeId/files')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: any,
    @Headers() headers: Record<string, string>,
  ) {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    const node = await this.conversationsService.uploadFileToNode(
      treeId,
      nodeId,
      file.buffer,
      file.filename || `upload_${Date.now()}`,
      file.mimetype,
      file.originalname,
      this.extractUserFromHeaders(headers),
    );

    if (!node) {
      throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
    }

    return node;
  }

  @Get('trees/:treeId/nodes/:nodeId/files')
  async getNodeFiles(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
  ) {
    const node = await this.conversationsService.getNodeWithInheritedFiles(treeId, nodeId);
    if (!node) {
      throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
    }

    return {
      nodeId,
      attachments: node.attachments || [],
    };
  }

  @Delete('trees/:treeId/nodes/:nodeId/files/:attachmentId')
  async deleteFile(
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
    @Param('attachmentId') attachmentId: string,
    @Headers() headers: Record<string, string>,
  ) {
    const node = await this.conversationsService.deleteFileFromNode(
      treeId,
      nodeId,
      attachmentId,
      this.extractUserFromHeaders(headers),
    );

    if (!node) {
      throw new HttpException('Node or file not found', HttpStatus.NOT_FOUND);
    }

    return { success: true };
  }
}
