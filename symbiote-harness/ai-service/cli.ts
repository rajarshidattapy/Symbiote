/** Standalone terminal chat for a Symbiote web-session adapter. */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const provider = process.argv[2];
if (provider !== 'chatgpt' && provider !== 'gemini') {
  console.error('Usage: node ai-service/cli.ts chatgpt|gemini');
  process.exit(1);
}
const input = createInterface({ input: stdin, output: stdout });
let client: Awaited<ReturnType<typeof import('./chatgpt/chatgpt.ts').createClient>> | Awaited<ReturnType<typeof import('./gemini/gemini.ts').createClient>> | undefined;
try {
  console.log(`Connecting to ${provider}...`);
  const service = provider === 'chatgpt' ? await import('./chatgpt/chatgpt.ts') : await import('./gemini/gemini.ts');
  client = await service.createClient();
  console.log('Connected. Type /new for a new chat or /quit to exit.');
  let conversationId: string | undefined;
  for (;;) {
    const prompt = (await input.question('\nYou: ')).trim();
    if (['/quit', '/exit'].includes(prompt.toLowerCase())) break;
    if (prompt.toLowerCase() === '/new') { conversationId = undefined; continue; }
    if (!prompt) continue;
    try {
      const result = await client.sendPrompt(conversationId, prompt);
      conversationId = result.conversationId;
      console.log(`\n${provider}: ${result.text}`);
    } catch (error) {
      console.error(`Request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      console.error('The request may have reached the service; check history before retrying.');
    }
  }
} catch (error) {
  console.error(`Could not connect: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  input.close();
  if (client && 'close' in client && typeof client.close === 'function') client.close();
}
