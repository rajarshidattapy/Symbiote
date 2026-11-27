/** Experimental Gemini web-session adapter. */
import { GeminiClient, MemoryStorageAdapter } from 'gemini-web-api';
import { readConfig } from '../config.ts';
import type { ChatResponse } from '../chatgpt/chatgpt.ts';

export class GeminiService {
  private readonly client: GeminiClient;
  private readonly sessions = new Map<string, ReturnType<GeminiClient['startChat']>>();
  constructor(client: GeminiClient) { this.client = client; }

  async sendPrompt(conversationId: string | undefined, prompt: string): Promise<ChatResponse> {
    const chat = conversationId ? this.sessions.get(conversationId) : this.client.startChat();
    if (!chat) throw new Error('Unknown Gemini conversation in this process; start a new chat.');
    const response = await chat.sendMessage(prompt);
    if (!response.text || !chat.cid) throw new Error('Gemini did not return a text response and conversation ID.');
    this.sessions.set(chat.cid, chat);
    return { text: response.text, conversationId: chat.cid };
  }

  close(): void { this.client.close(); }
}

export async function createClient(): Promise<GeminiService> {
  const config = readConfig();
  const psid = config.GEMINI_SECURE_1PSID?.trim();
  if (!psid) throw new Error('Add GEMINI_SECURE_1PSID to the root .env file.');
  const cookies: Record<string, string> = { '__Secure-1PSID': psid };
  if (config.GEMINI_SECURE_1PSIDTS?.trim()) cookies['__Secure-1PSIDTS'] = config.GEMINI_SECURE_1PSIDTS.trim();
  const client = new GeminiClient({ cookies, storage: new MemoryStorageAdapter() });
  // Don't rotate the user's browser cookies or write them to disk.
  await client.init(false);
  return new GeminiService(client);
}
