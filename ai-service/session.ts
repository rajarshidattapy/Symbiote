/** Local mapping from a Pi session to its ChatGPT web conversation. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type SessionState = { conversationId?: string; messages?: string[]; tools?: string };
const states = new Map<string, SessionState>();
const tails = new Map<string, Promise<void>>();
const fallbackSession = randomUUID();

function statePath(key: string): string {
  const directory = process.env.SYMBIOTE_STATE_DIR || join(homedir(), '.symbiote', 'pi-sessions');
  const hash = createHash('sha256').update(key).digest('hex');
  return join(directory, `${hash}.json`);
}

export function sessionKey(provider: string, sessionId?: string): string {
  return `${provider}:${sessionId || fallbackSession}`;
}

export function loadSession(key: string): SessionState {
  const cached = states.get(key);
  if (cached) return cached;
  let state: SessionState = {};
  try {
    const data = JSON.parse(readFileSync(statePath(key), 'utf8'));
    if (data.version !== 1 || typeof data.conversationId !== 'string' || !data.conversationId) {
      throw new Error('Invalid saved conversation mapping');
    }
    state = { conversationId: data.conversationId };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Could not read saved Symbiote session mapping; no new chat was started.');
    }
  }
  states.set(key, state);
  return state;
}

export function saveSession(key: string, state: SessionState): void {
  if (!state.conversationId) throw new Error('Missing web conversation ID');
  const path = statePath(key);
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ version: 1, conversationId: state.conversationId }), { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
  }
}

/** Serialize turns for a session, so parallel calls don't start duplicate chats. */
export async function withSessionLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  tails.set(key, current);
  await previous;
  try { return await run(); }
  finally {
    release();
    if (tails.get(key) === current) tails.delete(key);
  }
}
