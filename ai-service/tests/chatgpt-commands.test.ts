import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readTextFile, registerChatGptCommands } from '../chatgpt/commands.ts';

test('ChatGPT text file command sends selected content in the current session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'symbiote-command-'));
  try {
    await writeFile(join(directory, 'example.txt'), 'example content');
    await writeFile(join(directory, 'binary.dat'), Buffer.from([0, 1]));
    await writeFile(join(directory, 'large.txt'), 'x'.repeat(100_001));
    assert.equal(await readTextFile(directory, 'example.txt'), 'example content');
    await assert.rejects(readTextFile(directory, 'binary.dat'), /UTF-8/);
    await assert.rejects(readTextFile(directory, 'large.txt'), /larger/);
    const commands = new Map<string, any>();
    const sent: string[] = [];
    registerChatGptCommands({ registerCommand: (name: string, command: any) => commands.set(name, command), sendUserMessage: (value: string) => sent.push(value) } as any);
    const notices: string[] = [];
    const ctx = { model: { provider: 'symbiote', id: 'chatgpt' }, cwd: directory, isIdle: () => true, ui: { notify: (message: string) => notices.push(message) } };
    await commands.get('chatgpt-file').handler('example.txt | summarize it', ctx);
    assert.match(sent[0], /summarize it/);
    assert.match(sent[0], /example content/);
    await commands.get('chatgpt-file').handler('example.txt', { ...ctx, model: { provider: 'symbiote', id: 'gemini' } });
    assert.equal(sent.length, 1);
    assert.match(notices[0], /ChatGPT model/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
