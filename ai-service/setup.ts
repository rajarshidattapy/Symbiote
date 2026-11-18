/** Interactive, local-only setup for Symbiote's web-session credentials. */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { projectRoot } from './config.ts';

export function mergeEnv(source: string, values: Record<string, string>): string {
  const pending = new Set(Object.keys(values));
  const lines = source.split(/\r?\n/).filter((line, index, list) => index !== list.length - 1 || line !== '');
  const updated = lines.flatMap(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in values)) return [line];
    if (!pending.delete(match[1])) return [];
    return [`${match[1]}=${JSON.stringify(values[match[1]])}`];
  });
  for (const key of pending) updated.push(`${key}=${JSON.stringify(values[key])}`);
  return updated.join('\n') + '\n';
}

/** Atomically update selected keys while retaining the other provider and settings. */
export function saveConfig(values: Record<string, string>, path = join(projectRoot, '.env')): void {
  const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const temporary = join(dirname(path), `.env-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, mergeEnv(original, values), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch { /* Already moved or not created. */ } }
}

/** Manual fallback for environments where the browser-assisted flow cannot work. */
export async function configureManual(provider: 'chatgpt' | 'gemini'): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run setup in an interactive terminal so credentials are not echoed.');
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: stdin, output, terminal: true });
  const secret = async (prompt: string) => {
    stdout.write(prompt); muted = true;
    try { return (await rl.question('')).trim(); }
    finally { muted = false; stdout.write('\n'); }
  };
  try {
    console.log(provider === 'chatgpt'
      ? 'Copy the Cookie and User-Agent request header values from your signed-in ChatGPT browser session.'
      : 'Copy the __Secure-1PSID and optional __Secure-1PSIDTS cookie values from your signed-in Gemini browser session.');
    console.log('Paste credentials locally. Secret input is hidden; do not share it.');
    let values: Record<string, string>;
    if (provider === 'chatgpt') {
      let cookie = await secret('Cookie header (hidden): ');
      cookie = cookie.replace(/^cookie:\s*/i, '');
      const userAgent = (await rl.question('User-Agent: ')).trim().replace(/^user-agent:\s*/i, '');
      if (!cookie.includes('=') || !userAgent) throw new Error('A cookie header and user-agent are required; no changes were made.');
      values = { CHATGPT_COOKIE: cookie, CHATGPT_USER_AGENT: userAgent };
    } else {
      const psid = await secret('__Secure-1PSID (hidden): ');
      const psidts = await secret('__Secure-1PSIDTS (hidden; optional): ');
      if (!psid) throw new Error('__Secure-1PSID is required; no changes were made.');
      values = { GEMINI_SECURE_1PSID: psid, GEMINI_SECURE_1PSIDTS: psidts };
    }
    if (Object.values(values).some(value => /[\r\n]/.test(value))) throw new Error('Values must be single-line; no changes were made.');
    saveConfig({ ...values, SYMBIOTE_PROVIDER: provider });
    console.log('Saved the root .env. Existing settings for other providers were preserved.');
  } finally { rl.close(); }
}

/** Open a private browser for the selected service and save only a verified session. */
export async function configure(provider: 'chatgpt' | 'gemini'): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run setup in an interactive terminal.');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const { signIn } = await import('./browser-auth.ts');
    const values = await signIn(provider, async () => { await rl.question('Press Enter after signing in: '); });
    saveConfig({ ...values, SYMBIOTE_PROVIDER: provider });
    console.log('Session saved locally. Keep your .env and account credentials private.');
  } finally { rl.close(); }
}
