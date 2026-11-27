import { app } from 'electron';
import { z } from 'zod';
import { DirectAiBackend, isDirectAiProvider, type DirectAiProvider } from './ai-service-backend.js';

type Register = <T>(channel: string, fn: (payload: unknown) => Promise<T>) => void;

const requestSchema = z.object({
  provider: z.string().refine(isDirectAiProvider, 'Unknown AI service provider.'),
  prompt: z.string().max(200_000),
  conversationId: z.string().min(1).max(512).optional()
}).strict();

/** Registers the optional direct AI-service backend. It is separate from the browser bridge. */
export function registerAiServiceIpc(handle: Register, backend = new DirectAiBackend()): DirectAiBackend {
  handle('aiService:send', async payload => {
    const request = requestSchema.parse(payload);
    return backend.send(request.provider as DirectAiProvider, request.prompt, request.conversationId);
  });
  handle('aiService:providers', async () => ({ providers: ['chatgpt', 'gemini'] as const }));
  app.on('before-quit', () => backend.close());
  return backend;
}
