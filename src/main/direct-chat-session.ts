/** Direct cookie-session delivery for the app's normal chat composer.
 *
 * This deliberately bypasses the browser bridge. The provider owns the remote conversation;
 * Symbiote keeps a local transcript using the same session store the renderer already reads.
 */
import { randomUUID } from 'node:crypto';
import { readConfig } from '../../ai-service/config.ts';
import { DirectAiBackend, type DirectAiProvider } from './ai-service-backend.js';
import { appendEvent, createSession, getSession, rebindSession } from './session/store.js';
import { userTitle } from './session/title.js';
import type { InputArgs, InputEntry } from './session/input.js';

function provider(): DirectAiProvider {
  const configured = readConfig().AI_SERVICE_PROVIDER?.trim().toLowerCase();
  if (configured === 'gemini') return 'gemini';
  if (configured && configured !== 'chatgpt') throw new Error('AI_SERVICE_PROVIDER must be "chatgpt" or "gemini".');
  return 'chatgpt';
}

function stored(text: string) { return { text, chars: text.length, truncated: false }; }

/** Sends one user-authored text prompt and records its completed provider reply. */
export async function sendDirectChat(backend: DirectAiBackend, input: InputArgs): Promise<InputEntry> {
  if (input.images?.length || input.attachments?.length) throw new Error('The direct AI service currently supports text messages only.');
  if (input.automation && input.automation !== 'off') throw new Error('Goal and Loop require the retired browser route and are unavailable with direct AI sessions.');
  if (input.branch || input.edit) throw new Error('Branching and editing require the retired browser route and are unavailable with direct AI sessions.');

  const existing = input.sessionId ? await getSession(input.sessionId) : null;
  const summary = existing ?? await createSession({ title: userTitle(input.text), titleSource: 'fallback' });
  const sessionId = summary.id;
  const previousConversationId = summary.conversationId ?? undefined;
  const now = Date.now();
  const turnId = `direct:${randomUUID()}`;
  const userMessageId = `direct:${input.id}`;
  await appendEvent(sessionId, { source: 'app', time: now, kind: 'user_message', turnId,
    messageId: userMessageId, inputId: input.id, inputDelivery: 'confirmed', authoredText: input.text,
    message: stored(input.text), ...(previousConversationId ? { conversationId: previousConversationId } : {}) });
  await appendEvent(sessionId, { source: 'app', time: now, kind: 'turn_start', turnId });
  try {
    const reply = await backend.send(provider(), input.text, previousConversationId);
    if (reply.conversationId !== previousConversationId) {
      const bound = await rebindSession(sessionId, summary.conversationId, reply.conversationId);
      if (!bound && summary.conversationId !== reply.conversationId) throw new Error('The direct provider conversation could not be attached to this local chat.');
    }
    const finishedAt = Date.now();
    await appendEvent(sessionId, { source: 'app', time: finishedAt, kind: 'assistant_message', turnId,
      messageId: `direct:${randomUUID()}`, providerMessageId: reply.conversationId,
      message: stored(reply.text), state: 'final', final: true, goalEligible: false });
    await appendEvent(sessionId, { source: 'app', time: finishedAt, kind: 'turn_end', turnId, outcome: 'completed' });
    return { ...input, sessionId, projectId: input.projectId ?? null, state: 'sent', owner: null,
      createdAt: now, conversationId: reply.conversationId, deliveredSessionId: sessionId,
      deliveredAt: finishedAt, messageId: userMessageId } as InputEntry;
  } catch (error) {
    await appendEvent(sessionId, { source: 'app', time: Date.now(), kind: 'chat_error', message: stored(error instanceof Error ? error.message : String(error)), recoverable: true });
    await appendEvent(sessionId, { source: 'app', time: Date.now(), kind: 'turn_end', turnId, outcome: 'failed' });
    throw error;
  }
}
