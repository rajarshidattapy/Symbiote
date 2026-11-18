import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { finishSignIn, valuesFromCookies } from '../browser-auth.ts';
import { hasCredentials, parseArguments } from '../launcher.ts';
import { parseConfig } from '../config.ts';
import { saveConfig } from '../setup.ts';
import { setupSelectedModel } from '../model-setup.ts';

test('first-run arguments select providers and retain Pi options', () => {
  assert.deepEqual(parseArguments(['--provider', 'gemini', '--login', '--', '--list-models']),
    { provider: 'gemini', login: true, manual: false, select: false, piArgs: ['--list-models'] });
  assert.equal(hasCredentials('chatgpt', { CHATGPT_COOKIE: 'a=b', CHATGPT_USER_AGENT: 'agent' }), true);
  assert.equal(hasCredentials('gemini', { GEMINI_SECURE_1PSID: '' }), false);
  assert.throws(() => parseArguments(['--provider', 'other']), /Provider must/);
});

test('capture chooses only relevant Gemini cookie values', () => {
  const values = valuesFromCookies('gemini', [
    { name: 'unrelated', value: 'do-not-store' },
    { name: '__Secure-1PSID', value: 'fake-id' },
    { name: '__Secure-1PSIDTS', value: 'fake-timestamp' },
  ], '');
  assert.deepEqual(values, { GEMINI_SECURE_1PSID: 'fake-id', GEMINI_SECURE_1PSIDTS: 'fake-timestamp' });
  assert.throws(() => valuesFromCookies('gemini', [], ''), /No Gemini session/);
});

test('browser sign-in waits for the user and validates before returning credentials', async () => {
  const order: string[] = [];
  const context = { async cookies(urls: string[]) {
    order.push('capture'); assert.deepEqual(urls, ['https://chatgpt.com/']);
    return [{ name: 'session', value: 'fake-session' }];
  } };
  const page = { isClosed: () => false, async evaluate() { return 'fake-agent'; } };
  const result = await finishSignIn('chatgpt', context as any, page as any,
    async () => { order.push('user'); },
    async (_provider, values) => { order.push('validate'); return values; }, () => {});
  assert.deepEqual(order, ['user', 'capture', 'validate']);
  assert.deepEqual(result, { CHATGPT_COOKIE: 'session=fake-session', CHATGPT_USER_AGENT: 'fake-agent' });
  await assert.rejects(finishSignIn('chatgpt', context as any, page as any,
    async () => {}, async () => { throw new Error('sensitive error'); }, () => {}), /could not be verified/);
});

test('saving a verified provider preserves existing settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'symbiote-onboarding-'));
  const path = join(dir, '.env');
  try {
    writeFileSync(path, 'GEMINI_SECURE_1PSID="other-provider"\n');
    saveConfig({ CHATGPT_COOKIE: 'session=fake', CHATGPT_USER_AGENT: 'agent', SYMBIOTE_PROVIDER: 'chatgpt' }, path);
    const config = parseConfig(readFileSync(path, 'utf8'));
    assert.equal(config.GEMINI_SECURE_1PSID, 'other-provider');
    assert.equal(config.CHATGPT_COOKIE, 'session=fake');
    assert.equal(config.SYMBIOTE_PROVIDER, 'chatgpt');
  } finally { unlinkSync(path); rmdirSync(dir); }
});

test('selecting an unconfigured model opens setup; cancellation saves nothing', async () => {
  const writes: Record<string, string>[] = [];
  let browserOpened = 0;
  const ui = { confirm: async () => true, notify: () => {} };
  const deps = {
    read: () => ({ CHATGPT_COOKIE: 'existing', CHATGPT_USER_AGENT: 'agent' }),
    save: (values: Record<string, string>) => { writes.push(values); },
    signIn: async (_provider: 'chatgpt' | 'gemini', wait: () => Promise<void>) => {
      browserOpened++; await wait(); return { GEMINI_SECURE_1PSID: 'fake' };
    },
  };
  await setupSelectedModel('gemini', ui, deps);
  assert.equal(browserOpened, 1);
  assert.deepEqual(writes, [{ GEMINI_SECURE_1PSID: 'fake', SYMBIOTE_PROVIDER: 'gemini' }]);
  writes.length = 0;
  await assert.rejects(setupSelectedModel('gemini', { ...ui, confirm: async () => false }, deps), /cancelled/);
  assert.equal(writes.length, 0);
});
