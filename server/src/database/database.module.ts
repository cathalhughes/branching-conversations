import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

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

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const mongoUri =
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/branching-conversations';

        return {
          uri: mongoUri,
          connectionFactory: (connection) => {
            connection.plugin(require('mongoose-lean-virtuals'));
            return connection;
          },
          // Connection options
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          // Enable monitoring
          monitorCommands: true,
        };
      },
      inject: [ConfigService],
    }),

    // Register all schemas
    MongooseModule.forFeature([
      { name: Canvas.name, schema: CanvasSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationNode.name, schema: ConversationNodeSchema },
      { name: EditingSessionModel.name, schema: EditingSessionSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
