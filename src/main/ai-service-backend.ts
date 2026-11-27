/**
 * Direct, optional model transport for the local Symbiote AI service.
 *
 * This deliberately does not participate in the browser bridge: callers opt into it and own
 * the returned provider conversation id. Keeping the provider client alive is important for
 * Gemini, whose web adapter retains its conversation state in memory.
 */
import { createClient as createChatGptClient } from '../../ai-service/chatgpt/chatgpt.ts';
import { createClient as createGeminiClient } from '../../ai-service/gemini/gemini.ts';
import { app } from 'electron';
import path from 'node:path';

export const DIRECT_AI_PROVIDERS = ['chatgpt', 'gemini'] as const;
export type DirectAiProvider = (typeof DIRECT_AI_PROVIDERS)[number];

export interface DirectAiReply {
  text: string;
  conversationId: string;
}

interface DirectAiClient {
  sendPrompt(conversationId: string | undefined, prompt: string): Promise<DirectAiReply>;
  close?(): void;
}

export interface DirectAiBackendDeps {
  createChatGpt?: () => Promise<DirectAiClient>;
  createGemini?: () => Promise<DirectAiClient>;
}

export function isDirectAiProvider(value: unknown): value is DirectAiProvider {
  return typeof value === 'string' && (DIRECT_AI_PROVIDERS as readonly string[]).includes(value);
}

/** Owns provider clients for the application's lifetime. Never returns credentials to a caller. */
export class DirectAiBackend {
  private readonly clients = new Map<DirectAiProvider, DirectAiClient>();
  private readonly creating = new Map<DirectAiProvider, Promise<DirectAiClient>>();

  constructor(private readonly deps: DirectAiBackendDeps = {}) {}

  async send(provider: DirectAiProvider, prompt: string, conversationId?: string): Promise<DirectAiReply> {
    if (!isDirectAiProvider(provider)) throw new Error('Unknown AI service provider.');
    if (!prompt.trim() || prompt.length > 200_000) throw new Error('A prompt is required.');
    if (conversationId !== undefined && (!conversationId.trim() || conversationId.length > 512)) {
      throw new Error('Invalid provider conversation ID.');
    }
    const reply = await (await this.client(provider)).sendPrompt(conversationId, prompt);
    if (!reply || typeof reply.text !== 'string' || !reply.text || typeof reply.conversationId !== 'string' || !reply.conversationId) {
      throw new Error('AI service returned an invalid response.');
    }
    return reply;
  }

  close(): void {
    for (const client of this.clients.values()) client.close?.();
    this.clients.clear();
  }

  private async client(provider: DirectAiProvider): Promise<DirectAiClient> {
    const existing = this.clients.get(provider);
    if (existing) return existing;
    let pending = this.creating.get(provider);
    if (!pending) {
      // The ChatGPT adapter keeps its proof helper outside the JavaScript bundle. Its injected
      // test factory never reads that file, so leave test construction independent of Electron.
      if (provider === 'chatgpt' && !this.deps.createChatGpt) {
        process.env.SYMBIOTE_AI_SERVICE_VENDOR = app.isPackaged
          ? path.join(process.resourcesPath, 'ai-service', 'chatgpt', 'vendor')
          : path.join(app.getAppPath(), 'ai-service', 'chatgpt', 'vendor');
      }
      const create = provider === 'chatgpt'
        ? (this.deps.createChatGpt ?? createChatGptClient)
        : (this.deps.createGemini ?? createGeminiClient);
      pending = create().then(client => {
        this.clients.set(provider, client);
        this.creating.delete(provider);
        return client;
      }, error => {
        this.creating.delete(provider);
        throw error;
      });
      this.creating.set(provider, pending);
    }
    return pending;
  }
}
