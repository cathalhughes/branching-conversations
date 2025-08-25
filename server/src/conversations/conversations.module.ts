import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { CollaborationService } from './collaboration.service';
import { CollaborationController } from './collaboration.controller';
import { CollaborationGateway } from './collaboration.gateway';
import { ActivityService } from './activity.service';
import { RedisModule } from './redis.module';

// Import schemas
import { Canvas, CanvasSchema } from '../schemas/canvas.schema';
import {
  Conversation,
  ConversationSchema,
} from '../schemas/conversation.schema';
import {
  ConversationNode,
  ConversationNodeSchema,
} from '../schemas/conversation-node.schema';
import {
  EditingSessionModel,
  EditingSessionSchema,
} from '../schemas/editing-session.schema';
import { ActivitySchema } from '../schemas/activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Canvas.name, schema: CanvasSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationNode.name, schema: ConversationNodeSchema },
      { name: EditingSessionModel.name, schema: EditingSessionSchema },
      { name: 'Activity', schema: ActivitySchema },
    ]),
    RedisModule,
  ],
  controllers: [ConversationsController, CollaborationController],
  providers: [ConversationsService, CollaborationService, CollaborationGateway, ActivityService],
  exports: [ConversationsService, CollaborationService, ActivityService],
})
export class ConversationsModule {}
