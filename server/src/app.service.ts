import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async testAI(message: string) {
    try {
      const { text } = await generateText({
        model: openai('gpt-4.1-nano.1-nano'),
        prompt: `You are a helpful assistant. Respond to: ${message}`,
      });

      return { success: true, response: text };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
