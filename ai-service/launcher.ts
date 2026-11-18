/** Symbiote entry point: select a provider, sign in when necessary, then start Pi. */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { projectRoot, readConfig } from './config.ts';
import { configure, configureManual, saveConfig } from './setup.ts';
import type { Provider } from './browser-auth.ts';

type Options = { provider?: Provider; login: boolean; manual: boolean; select: boolean; piArgs: string[] };

export function parseArguments(args: string[]): Options {
  let provider: Provider | undefined, login = false, manual = false, select = false;
  let index = 0;
  while (index < args.length) {
    const arg = args[index];
    if (arg === '--') { index++; break; }
    if (arg === '--provider') {
      const value = args[index + 1];
      if (value !== 'chatgpt' && value !== 'gemini') throw new Error('Provider must be chatgpt or gemini.');
      provider = value; index += 2;
    } else if (arg === '--login') { login = true; index++; }
    else if (arg === '--manual-login') { login = true; manual = true; index++; }
    else if (arg === '--select') { select = true; index++; }
    else break;
  }
  return { provider, login, manual, select, piArgs: args.slice(index) };
}

export function hasCredentials(provider: Provider, config: Record<string, string | undefined>): boolean {
  return provider === 'chatgpt'
    ? Boolean(config.CHATGPT_COOKIE?.trim() && config.CHATGPT_USER_AGENT?.trim())
    : Boolean(config.GEMINI_SECURE_1PSID?.trim());
}

async function chooseProvider(): Promise<Provider> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Choose a provider in an interactive terminal, or use --provider chatgpt|gemini.');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log('\nWelcome to Symbiote. Choose your AI service:\n  1. ChatGPT\n  2. Gemini');
    for (;;) {
      const answer = (await rl.question('Selection [1/2]: ')).trim().toLowerCase();
      if (answer === '1' || answer === 'chatgpt') return 'chatgpt';
      if (answer === '2' || answer === 'gemini') return 'gemini';
      console.log('Enter 1 for ChatGPT or 2 for Gemini.');
    }
  } finally { rl.close(); }
}

async function main(): Promise<number> {
  const options = parseArguments(process.argv.slice(2));
  const cli = join(projectRoot, 'harness', 'packages', 'coding-agent', 'dist', 'cli.js');
  const extension = join(projectRoot, 'ai-service', 'pi-provider.ts');
  if (!existsSync(cli)) throw new Error('Pi is not built. Run npm install --ignore-scripts and npm run build:offline in harness/.');
  const envPath = join(projectRoot, '.env');
  const config = existsSync(envPath) ? readConfig() : {};
  const saved = config.SYMBIOTE_PROVIDER === 'chatgpt' || config.SYMBIOTE_PROVIDER === 'gemini' ? config.SYMBIOTE_PROVIDER : undefined;
  const interactiveChoice = !options.provider && (options.select || !saved);
  const provider = options.provider || (interactiveChoice ? await chooseProvider() : saved!);
  if (options.login || !hasCredentials(provider, config)) {
    console.log(`\nSet up ${provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'} to continue.`);
    await (options.manual ? configureManual(provider) : configure(provider));
  } else if (interactiveChoice) {
    saveConfig({ SYMBIOTE_PROVIDER: provider });
  }
  const child = spawn(process.execPath, [cli, '-e', extension, '--provider', 'symbiote', '--model', provider, ...options.piArgs], {
    cwd: process.cwd(), stdio: 'inherit', windowsHide: true,
  });
  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

// Allow the argument parser and credential checks to be imported without starting Pi.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(`Symbiote: ${error instanceof Error ? error.message : 'startup failed.'}`); process.exitCode = 1; }
}
