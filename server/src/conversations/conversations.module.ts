import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';

// Import schemas
import { Canvas, CanvasSchema } from '../schemas/canvas.schema';
import { Conversation, ConversationSchema } from '../schemas/conversation.schema';
import { ConversationNode, ConversationNodeSchema } from '../schemas/conversation-node.schema';
import { EditingSessionModel, EditingSessionSchema } from '../schemas/editing-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Canvas.name, schema: CanvasSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationNode.name, schema: ConversationNodeSchema },
      { name: EditingSessionModel.name, schema: EditingSessionSchema },
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}