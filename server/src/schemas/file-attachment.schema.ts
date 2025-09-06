import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class FileAttachment {
  @Prop({ required: true })
  id: string; // Unique identifier for this attachment

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true, default: 'text/plain' })
  mimeType: string; // Always text/plain since we store extracted text

  @Prop()
  originalMimeType: string; // Original file's mime type before extraction

  @Prop({ required: true })
  size: number; // Size of extracted text in bytes

  @Prop()
  originalSize: number; // Size of original file before extraction

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId })
  gridFSFileId: Types.ObjectId; // GridFS file ID

  @Prop()
  textContent?: string; // Extracted text content for context

  @Prop({ default: Date.now })
  uploadedAt: Date;

  @Prop()
  uploadedBy?: string; // User ID who uploaded the file

  @Prop({ default: false })
  isInherited: boolean; // Whether this file was inherited from parent

  @Prop()
  inheritedFromNodeId?: string; // If inherited, which node it came from

  @Prop({ default: 'completed' })
  processingStatus?: 'processing' | 'completed' | 'failed';

  @Prop()
  processingError?: string;
}

export const FileAttachmentSchema = SchemaFactory.createForClass(FileAttachment);

export type FileAttachmentDocument = FileAttachment & Document;