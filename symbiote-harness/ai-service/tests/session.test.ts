import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadSession, saveSession, sessionKey, withSessionLock } from '../session.ts';

test('session mapping survives restart, isolates Pi sessions, and serializes turns', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'symbiote-session-'));
  const previous = process.env.SYMBIOTE_STATE_DIR;
  process.env.SYMBIOTE_STATE_DIR = dir;
  try {
    const key = sessionKey('chatgpt', 'pi-test-session');
    const state = loadSession(key);
    state.conversationId = 'web-test-conversation';
    saveSession(key, state);
    saveSession(key, state);
    assert.equal(loadSession(sessionKey('chatgpt', 'another-pi-session')).conversationId, undefined);
    const moduleUrl = new URL('../session.ts', import.meta.url).href;
    const source = `import {loadSession,sessionKey} from ${JSON.stringify(moduleUrl)}; if(loadSession(sessionKey('chatgpt','pi-test-session')).conversationId !== 'web-test-conversation') process.exit(1);`;
    const restarted = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: process.env });
    assert.equal(restarted.status, 0, restarted.stderr.toString());
    const order: string[] = [];
    await Promise.all([
      withSessionLock(key, async () => { order.push('first-start'); await new Promise(resolve => setTimeout(resolve, 15)); order.push('first-end'); }),
      withSessionLock(key, async () => { order.push('second-start'); order.push('second-end'); }),
    ]);
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
  } finally {
    if (previous === undefined) delete process.env.SYMBIOTE_STATE_DIR; else process.env.SYMBIOTE_STATE_DIR = previous;
    for (const file of readdirSync(dir)) unlinkSync(join(dir, file));
    rmdirSync(dir);
  }
});
