/** One-request JSON bridge between Pi and the TypeScript web-session adapters. */
import { stdin, stdout } from 'node:process';

type BridgeRequest = { provider?: string; prompt?: string; conversation_id?: string };

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of stdin) input += chunk;
  const request = JSON.parse(input) as BridgeRequest;
  if (!request.prompt || typeof request.prompt !== 'string') throw new Error('Missing prompt');
  if (request.conversation_id !== undefined && (request.provider !== 'chatgpt' || typeof request.conversation_id !== 'string' || !request.conversation_id)) throw new Error('Invalid conversation ID');
  if (request.provider !== 'chatgpt' && request.provider !== 'gemini') throw new Error('Unknown provider');
  const service = request.provider === 'chatgpt' ? await import('./chatgpt/chatgpt.ts') : await import('./gemini/gemini.ts');
  const client = await service.createClient();
  try {
    const result = await client.sendPrompt(request.conversation_id, request.prompt);
    stdout.write(JSON.stringify({ text: result.text, conversation_id: result.conversationId }) + '\n');
  } finally {
    if ('close' in client && typeof client.close === 'function') client.close();
  }
}

try { await main(); }
catch (error) {
  // Avoid printing request contents or credentials from third-party error payloads.
  const login = process.platform === 'win32' ? 'symbiote -Login' : 'symbiote --login';
  stdout.write(JSON.stringify({ error: `${error instanceof Error ? error.name : 'Error'}: provider request failed. If your session expired, run ${login} to sign in again.` }) + '\n');
  process.exitCode = 1;
}
