import { describe, expect, it, vi } from 'vitest';
import { DirectAiBackend } from '../src/main/ai-service-backend';

describe('DirectAiBackend', () => {
  it('keeps one provider client alive and passes conversation continuation through', async () => {
    const sendPrompt = vi.fn()
      .mockResolvedValueOnce({ text: 'first', conversationId: 'chat-1' })
      .mockResolvedValueOnce({ text: 'second', conversationId: 'chat-1' });
    const createChatGpt = vi.fn(async () => ({ sendPrompt }));
    const backend = new DirectAiBackend({ createChatGpt });

    await expect(backend.send('chatgpt', 'hello')).resolves.toEqual({ text: 'first', conversationId: 'chat-1' });
    await expect(backend.send('chatgpt', 'continue', 'chat-1')).resolves.toEqual({ text: 'second', conversationId: 'chat-1' });
    expect(createChatGpt).toHaveBeenCalledTimes(1);
    expect(sendPrompt).toHaveBeenNthCalledWith(2, 'chat-1', 'continue');
  });

  it('rejects invalid input before it creates a provider client', async () => {
    const createGemini = vi.fn();
    const backend = new DirectAiBackend({ createGemini });
    await expect(backend.send('gemini', '   ')).rejects.toThrow(/prompt/i);
    await expect(backend.send('gemini', 'ok', '')).rejects.toThrow(/conversation/i);
    expect(createGemini).not.toHaveBeenCalled();
  });
});
