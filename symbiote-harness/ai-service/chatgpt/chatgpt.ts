/** Experimental ChatGPT web-session adapter. Uses the user's own session cookies. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../config.ts';

const origin = 'https://chatgpt.com';
const signer = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'sentinel-node-probe.cjs');

type Json = Record<string, any>;
export type ChatResponse = { text: string; conversationId: string };
export type ChatGptProject = { id: string; name: string };

async function runSigner(args: string[], input?: unknown): Promise<Json> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [signer, ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('ChatGPT security check failed' + (stderr ? ' (signer error).' : '.')));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('ChatGPT security check returned invalid data.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}

export class ChatGptService {
  private headers: Record<string, string>;
  private readonly fetcher: typeof fetch;
  private readonly signerRunner: typeof runSigner;
  constructor(cookie: string, userAgent: string, dependencies: { fetcher?: typeof fetch; signer?: typeof runSigner } = {}) {
    const deviceId = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('oai-did='))?.slice(8) || randomUUID();
    this.headers = { cookie, 'user-agent': userAgent, accept: 'application/json', origin, referer: `${origin}/`, 'oai-device-id': deviceId };
    this.fetcher = dependencies.fetcher || fetch;
    this.signerRunner = dependencies.signer || runSigner;
  }

  async init(): Promise<void> {
    const response = await this.fetcher(`${origin}/api/auth/session`, { headers: this.headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`ChatGPT session request returned HTTP ${response.status}.`);
    const session = await response.json() as Json;
    if (typeof session.accessToken !== 'string' || !session.accessToken) throw new Error('ChatGPT session did not return an access token.');
    this.headers.authorization = `Bearer ${session.accessToken}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = { ...this.headers, 'x-openai-target-path': path, 'x-openai-target-route': path,
      ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers };
    const response = await this.fetcher(origin + path, { ...init, headers, signal: init.signal || AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`ChatGPT returned HTTP ${response.status} for ${path}.`);
    return response;
  }

  private async securityHeaders(): Promise<Record<string, string>> {
    const { initial } = await this.signerRunner(['--emit-initial']);
    if (typeof initial !== 'string' || !initial) throw new Error('ChatGPT security check returned no initial proof.');
    const requirements = await (await this.request('/backend-api/sentinel/chat-requirements/prepare', {
      method: 'POST', body: JSON.stringify({ p: initial }),
    })).json() as Json;
    if (requirements.force_login) throw new Error('ChatGPT requires sign-in again.');
    let token = requirements.token;
    if (!token && !requirements.prepare_token) throw new Error('ChatGPT security check returned no preparation token.');
    const evidence = await this.signerRunner(['--requirements-stdin', '--emit-enforcement-json'], { requirements, initial });
    if (requirements.proofofwork?.required && !evidence.proof) throw new Error('ChatGPT proof of work could not be generated.');
    if (requirements.turnstile?.required && !evidence.turnstile) throw new Error('ChatGPT verification evidence could not be generated.');
    if (!token) {
      const body: Json = { prepare_token: requirements.prepare_token };
      if (evidence.proof) body.proofofwork = evidence.proof;
      if (evidence.turnstile) body.turnstile = evidence.turnstile;
      const final = await (await this.request('/backend-api/sentinel/chat-requirements/finalize', {
        method: 'POST', body: JSON.stringify(body),
      })).json() as Json;
      token = final.token;
    }
    if (typeof token !== 'string' || !token) throw new Error('ChatGPT security check returned no requirements token.');
    const headers: Record<string, string> = { 'openai-sentinel-chat-requirements-token': token };
    if (evidence.proof) headers['openai-sentinel-proof-token'] = evidence.proof;
    if (evidence.turnstile) headers['openai-sentinel-turnstile-token'] = evidence.turnstile;
    return headers;
  }

  /** List projects without creating or changing a ChatGPT conversation. */
  async listProjects(): Promise<ChatGptProject[]> {
    const results: ChatGptProject[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const path = '/backend-api/gizmos/snorlax/sidebar' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
      const data = await (await this.request(path)).json() as Json;
      if (!Array.isArray(data.items)) throw new Error('ChatGPT returned an unexpected projects list.');
      for (const item of data.items) {
        const gizmo = item?.gizmo;
        if (gizmo?.gizmo_type === 'snorlax' && typeof gizmo.id === 'string' && typeof gizmo.display?.name === 'string') {
          results.push({ id: gizmo.id, name: gizmo.display.name });
        }
      }
      if (data.cursor == null || data.cursor === '') break;
      if (typeof data.cursor !== 'string' || cursors.has(data.cursor) || cursors.size >= 100) throw new Error('ChatGPT returned invalid project pagination.');
      cursors.add(data.cursor);
      cursor = data.cursor;
    }
    return results;
  }

  async sendPrompt(conversationId: string | undefined, prompt: string, signal?: AbortSignal): Promise<ChatResponse> {
    const previous = conversationId ? await (await this.request(`/backend-api/conversations/${encodeURIComponent(conversationId)}`)).json() as Json : undefined;
    const security = await this.securityHeaders();
    const messageId = randomUUID();
    const body: Json = {
      action: 'next', messages: [{ id: messageId, author: { role: 'user' }, create_time: Date.now() / 1000,
        content: { content_type: 'text', parts: [prompt] }, metadata: { attachments: [], selected_sources: [], serialization_metadata: { custom_symbol_offsets: [] }, submission_mode: 'manual_send' } }],
      parent_message_id: previous?.current_node || randomUUID(),
      model: process.env.CHATGPT_WEB_MODEL || previous?.default_model_slug || 'gpt-5-6-thinking',
      client_prepare_state: 'sent', timezone_offset_min: new Date().getTimezoneOffset(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      conversation_mode: { kind: 'primary_assistant' }, enable_message_followups: true, system_hints: [],
      supports_buffering: false, supported_encodings: [], paragen_cot_summary_display_override: 'allow',
      force_parallel_switch: 'auto', thinking_effort: 'extended', local_function_names: ['local.continue_in_work'],
    };
    if (conversationId) body.conversation_id = conversationId;
    // Do not retry submissions: a failed response may still have created a message.
    const response = await this.request('/backend-api/f/conversation', { method: 'POST', body: JSON.stringify(body),
      headers: { ...security, accept: 'text/event-stream' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000) });
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('ChatGPT did not return an event stream.');
    let buffer = '', text = '', resolvedId = conversationId;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const consume = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const value = line.slice(6).trim();
      if (value === '[DONE]') return;
      let event: Json;
      try { event = JSON.parse(value); } catch { return; }
      if (typeof event.conversation_id === 'string' && event.conversation_id) resolvedId = event.conversation_id;
      if (event.message?.author?.role !== 'assistant') return;
      const parts = event.message?.content?.parts;
      if (Array.isArray(parts)) {
        const candidate = parts.map((part: any) => typeof part === 'string' ? part : part?.text || '').join('\n');
        if (candidate) text = candidate;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) consume(line);
      if (done) { if (buffer) consume(buffer); break; }
    }
    if (!resolvedId || !text) throw new Error('ChatGPT returned no conversation ID or response text. Check chat history before retrying.');
    const conversation = await (await this.request(`/backend-api/conversations/${encodeURIComponent(resolvedId)}`)).json() as Json;
    if (!Array.isArray(conversation.messages) || !conversation.messages.some((message: Json) => message.id === messageId)) {
      throw new Error('ChatGPT did not confirm the submitted message; check chat history before retrying.');
    }
    return { conversationId: resolvedId, text };
  }
}

export async function createClient(): Promise<ChatGptService> {
  const config = readConfig();
  const cookie = config.CHATGPT_COOKIE?.trim();
  if (!cookie) throw new Error('Add CHATGPT_COOKIE to the root .env file.');
  const client = new ChatGptService(cookie, config.CHATGPT_USER_AGENT || 'Mozilla/5.0');
  await client.init();
  return client;
}
