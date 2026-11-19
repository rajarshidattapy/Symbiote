import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ChatGptService } from '../chatgpt/chatgpt.ts';
import { GeminiService } from '../gemini/gemini.ts';
import { parseConfig } from '../config.ts';
import { mergeEnv } from '../setup.ts';

test('ChatGPT projects are listed across pages without modifying conversations', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async url => {
    const u = new URL(String(url)); calls.push(u.pathname);
    const items = u.searchParams.has('cursor')
      ? [{ gizmo: { gizmo_type: 'snorlax', id: 'two', display: { name: 'Second' } } }]
      : [{ gizmo: { gizmo_type: 'snorlax', id: 'one', display: { name: 'First' } } }, { gizmo: { gizmo_type: 'other', id: 'skip', display: { name: 'Other' } } }];
    return new Response(JSON.stringify({ items, cursor: u.searchParams.has('cursor') ? null : 'next' }));
  };
  const client = new ChatGptService('test=cookie', 'test-agent', { fetcher });
  assert.deepEqual(await client.listProjects(), [{ id: 'one', name: 'First' }, { id: 'two', name: 'Second' }]);
  assert.deepEqual(calls, ['/backend-api/gizmos/snorlax/sidebar', '/backend-api/gizmos/snorlax/sidebar']);
});

test('ChatGPT sends a new message and continues the same conversation', async () => {
  const messages: string[] = [];
  const bodies: any[] = [];
  const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/auth/session') return json({ accessToken: 'fake-token' });
    if (path.endsWith('/prepare')) return json({ token: 'fake-requirements' });
    if (path === '/backend-api/conversations/web-chat') return json({ conversation_id: 'web-chat', current_node: 'parent', messages: messages.map(id => ({ id })) });
    if (path === '/backend-api/f/conversation') {
      const body = JSON.parse(String(init?.body)); bodies.push(body); messages.push(body.messages[0].id);
      const event = { conversation_id: 'web-chat', message: { author: { role: 'assistant' }, content: { parts: ['answer'] } } };
      return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected endpoint ${path}`);
  };
  const signer = async (args: string[]) => args.includes('--emit-initial') ? { initial: 'fake-proof' } : {};
  const service = new ChatGptService('test=cookie', 'test-agent', { fetcher, signer });
  await service.init();
  const first = await service.sendPrompt(undefined, 'one');
  const second = await service.sendPrompt(first.conversationId, 'two');
  assert.equal(first.text, 'answer');
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(bodies[0].conversation_id, undefined);
  assert.equal(bodies[1].conversation_id, 'web-chat');
  assert.equal(bodies[1].parent_message_id, 'parent');
});

test('Gemini reuses its in-process chat and closes its client', async () => {
  let starts = 0, closed = false;
  const fake = { startChat() { starts++; return { cid: 'gemini-chat', async sendMessage(value: string) { return { text: value }; } }; }, close() { closed = true; } };
  const service = new GeminiService(fake as any);
  const first = await service.sendPrompt(undefined, 'first');
  const second = await service.sendPrompt(first.conversationId, 'second');
  assert.equal(starts, 1);
  assert.equal(second.text, 'second');
  service.close();
  assert.equal(closed, true);
});

test('setup preserves the other provider and round-trips quoted credentials', () => {
  const result = mergeEnv('# comment\nGEMINI_SECURE_1PSID="keep"\nCHATGPT_COOKIE="old"\n', { CHATGPT_COOKIE: 'a=b; x="quoted"', CHATGPT_USER_AGENT: 'test-agent' });
  const config = parseConfig(result);
  assert.equal(config.GEMINI_SECURE_1PSID, 'keep');
  assert.equal(config.CHATGPT_COOKIE, 'a=b; x="quoted"');
  assert.equal(config.CHATGPT_USER_AGENT, 'test-agent');
});
