import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { FileAttachment } from '../schemas/file-attachment.schema';
import * as FormData from 'form-data';
import fetch from 'node-fetch';

@Injectable()
export class FileService {
  private gfs: any;
  private readonly FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

  constructor(@InjectConnection() private connection: Connection) {
    // Initialize GridFS
    this.initGridFS();
  }

  private async initGridFS() {
    // GridFS setup - in a real implementation you'd need gridfs-stream
    // For now, we'll create a simplified version using mongoose GridFS
    try {
      // This would typically be done with gridfs-stream package
      console.log('GridFS initialized');
    } catch (error) {
      console.error('GridFS initialization error:', error);
    }
  }

  async uploadFile(
    file: Buffer,
    filename: string,
    mimeType: string,
    originalName: string,
    uploadedBy?: string,
  ): Promise<FileAttachment> {
    try {
      console.log(`Processing file upload: ${originalName} (${mimeType})`);
      
      // Extract text content using FastAPI service
      let textContent: string | undefined;
      let processingStatus: 'processing' | 'completed' | 'failed' = 'processing';
      
      try {
        textContent = await this.extractTextContent(file, mimeType, originalName);
        
        if (textContent) {
          processingStatus = 'completed';
          console.log(`Successfully extracted ${textContent.length} characters from: ${originalName}`);
        } else {
          processingStatus = 'failed';
          console.warn(`No text content extracted from: ${originalName}`);
          // For files with no extractable text, store a placeholder
          textContent = `[No text content could be extracted from ${originalName}]`;
        }
      } catch (error) {
        console.error('Text extraction failed:', error);
        processingStatus = 'failed';
        textContent = `[Text extraction failed for ${originalName}: ${error.message}]`;
      }

      // Generate unique file ID and create .txt filename
      const fileId = new Types.ObjectId();
      const attachmentId = new Types.ObjectId().toString();
      const textFilename = this.generateTextFilename(originalName);
      
      // Convert text content to Buffer for GridFS storage
      const textBuffer = Buffer.from(textContent, 'utf-8');
      
      // In a real implementation with GridFS:
      // const uploadStream = this.gfs.openUploadStream(textFilename, {
      //   metadata: { 
      //     originalName, 
      //     originalMimeType: mimeType,
      //     uploadedBy,
      //     extractedAt: new Date()
      //   }
      // });
      // uploadStream.end(textBuffer);
      
      // For now, we'll simulate GridFS storage
      console.log(`Storing extracted text as: ${textFilename} (${textBuffer.length} bytes)`);

      const attachment: FileAttachment = {
        id: attachmentId,
        filename: textFilename, // Always .txt file
        originalName,
        mimeType: 'text/plain', // Always text/plain since we store .txt files
        originalMimeType: mimeType, // Store original file type for reference
        size: textBuffer.length, // Size of the extracted text
        originalSize: file.length, // Size of the original file
        gridFSFileId: fileId,
        textContent, // Store the text content directly on the attachment
        uploadedAt: new Date(),
        uploadedBy,
        isInherited: false,
        processingStatus,
      };

      return attachment;
    } catch (error) {
      throw new BadRequestException(`File upload failed: ${error.message}`);
    }
  }

  async getTextFile(gridFSFileId: Types.ObjectId): Promise<string | null> {
    try {
      // In a real GridFS implementation:
      // const downloadStream = this.gfs.openDownloadStream(gridFSFileId);
      // const chunks = [];
      // for await (const chunk of downloadStream) {
      //   chunks.push(chunk);
      // }
      // const buffer = Buffer.concat(chunks);
      // return buffer.toString('utf-8');
      
      // For now, return null as placeholder
      console.log(`Retrieving text file with GridFS ID: ${gridFSFileId}`);
      return null;
    } catch (error) {
      console.error('Text file retrieval error:', error);
      return null;
    }
  }

  async deleteTextFile(gridFSFileId: Types.ObjectId): Promise<boolean> {
    try {
      // In a real GridFS implementation:
      // await this.gfs.delete(gridFSFileId);
      
      console.log(`Deleting text file with GridFS ID: ${gridFSFileId}`);
      return true;
    } catch (error) {
      console.error('Text file deletion error:', error);
      return false;
    }
  }

  async getTextFileInfo(gridFSFileId: Types.ObjectId): Promise<any | null> {
    try {
      // In a real GridFS implementation:
      // return this.gfs.find({ _id: gridFSFileId }).toArray();
      
      console.log(`Retrieving text file info for GridFS ID: ${gridFSFileId}`);
      return null;
    } catch (error) {
      console.error('Text file info retrieval error:', error);
      return null;
    }
  }

  // Extract text content from any file type using FastAPI service
  private async extractTextContent(
    file: Buffer, 
    mimeType: string, 
    filename: string
  ): Promise<string | undefined> {
    try {
      console.log(`Extracting text from: ${filename} (${mimeType})`);
      
      // For simple text files, extract directly
      if (mimeType.startsWith('text/') || 
          mimeType === 'application/json' ||
          mimeType === 'application/javascript' ||
          mimeType === 'text/typescript') {
        const textContent = file.toString('utf-8');
        console.log(`Direct text extraction: ${textContent.length} characters`);
        return textContent;
      }

      // Use FastAPI service for all other file types
      console.log(`Using FastAPI extraction service for: ${filename}`);
      return await this.callFastAPIExtraction(file, filename);
    } catch (error) {
      console.error('Text extraction error:', error);
      throw error; // Rethrow to handle at upload level
    }
  }

  // Generate a .txt filename from the original filename
  private generateTextFilename(originalName: string): string {
    const timestamp = Date.now();
    const baseName = path.parse(originalName).name; // Remove extension
    return `${baseName}_${timestamp}.txt`;
  }

  // Call FastAPI service to extract text
  private async callFastAPIExtraction(file: Buffer, filename: string): Promise<string | undefined> {
    try {
      const formData = new FormData();
      formData.append('file', file, {
        filename,
        contentType: 'application/octet-stream'
      });

      console.log(`Sending ${file.length} bytes to FastAPI for extraction...`);
      
      const response = await fetch(`${this.FASTAPI_URL}/extract-text/`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
        timeout: 30000, // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FastAPI extraction failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      if (result.success && result.text) {
        console.log(`FastAPI extracted ${result.text.length} characters`);
        return result.text;
      }
      
      throw new Error(`FastAPI returned unsuccessful result: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error('FastAPI extraction error:', error);
      throw error; // Rethrow to handle at extraction level
    }
  }

  // Get inherited files from parent nodes
  async getInheritedAttachments(
    nodeId: string,
    allNodeAttachments: Map<string, FileAttachment[]>,
    nodeHierarchy: Map<string, string> // nodeId -> parentId
  ): Promise<FileAttachment[]> {
    const inheritedFiles: FileAttachment[] = [];
    let currentNodeId = nodeHierarchy.get(nodeId);

    console.log(`Getting inherited attachments for node: ${nodeId}`);
    console.log(`Parent node: ${currentNodeId}`);

    while (currentNodeId) {
      const parentAttachments = allNodeAttachments.get(currentNodeId) || [];
      console.log(`Found ${parentAttachments.length} attachments in parent node ${currentNodeId}:`, 
        parentAttachments.map(att => ({
          id: att.id,
          originalName: att.originalName,
          size: att.size,
          mimeType: att.mimeType
        }))
      );
      
      for (const attachment of parentAttachments) {
        const inheritedFile: FileAttachment = {
          id: attachment.id,
          filename: attachment.filename,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          originalMimeType: attachment.originalMimeType,
          size: attachment.size,
          originalSize: attachment.originalSize,
          gridFSFileId: attachment.gridFSFileId, 
          textContent: attachment.textContent,
          uploadedAt: new Date(attachment.uploadedAt),
          uploadedBy: attachment.uploadedBy,
          isInherited: true,
          inheritedFromNodeId: currentNodeId,
          processingStatus: attachment.processingStatus || 'completed',
          processingError: attachment.processingError,
        };
        
        console.log(`Created inherited file:`, {
          id: inheritedFile.id,
          originalName: inheritedFile.originalName,
          size: inheritedFile.size,
          mimeType: inheritedFile.mimeType,
          isInherited: inheritedFile.isInherited,
          inheritedFromNodeId: inheritedFile.inheritedFromNodeId
        });
        
        inheritedFiles.push(inheritedFile);
      }
      
      currentNodeId = nodeHierarchy.get(currentNodeId);
    }

    console.log(`Returning ${inheritedFiles.length} inherited files for node ${nodeId}`);
    return inheritedFiles;
  }

}