/** Interactive web sign-in in an isolated browser; never reads a user's browser profile. */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { GeminiClient, MemoryStorageAdapter } from 'gemini-web-api';
import { ChatGptService } from './chatgpt/chatgpt.ts';

export type Provider = 'chatgpt' | 'gemini';
type BrowserCookie = { name: string; value: string };

/** Extract only cookies required by the chosen service. */
export function valuesFromCookies(provider: Provider, cookies: BrowserCookie[], userAgent: string): Record<string, string> {
  if (provider === 'chatgpt') {
    if (!cookies.length || !userAgent) throw new Error('No ChatGPT session was found. Complete sign-in and try again.');
    return { CHATGPT_COOKIE: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '), CHATGPT_USER_AGENT: userAgent };
  }
  const psid = cookies.find(cookie => cookie.name === '__Secure-1PSID')?.value;
  const psidts = cookies.find(cookie => cookie.name === '__Secure-1PSIDTS')?.value;
  if (!psid) throw new Error('No Gemini session was found. Complete sign-in and try again.');
  return { GEMINI_SECURE_1PSID: psid, GEMINI_SECURE_1PSIDTS: psidts || '' };
}

export async function captureValues(provider: Provider, context: BrowserContext, page: Page): Promise<Record<string, string>> {
  const urls = provider === 'chatgpt'
    ? ['https://chatgpt.com/']
    : ['https://gemini.google.com/', 'https://accounts.google.com/'];
  const cookies = await context.cookies(urls);
  const userAgent = provider === 'chatgpt' ? await page.evaluate(() => navigator.userAgent) : '';
  return valuesFromCookies(provider, cookies, userAgent);
}

export async function validateValues(provider: Provider, values: Record<string, string>): Promise<Record<string, string>> {
  if (provider === 'chatgpt') {
    await new ChatGptService(values.CHATGPT_COOKIE, values.CHATGPT_USER_AGENT).init();
    return values;
  } else {
    const cookies: Record<string, string> = { '__Secure-1PSID': values.GEMINI_SECURE_1PSID };
    if (values.GEMINI_SECURE_1PSIDTS) cookies['__Secure-1PSIDTS'] = values.GEMINI_SECURE_1PSIDTS;
    const client = new GeminiClient({ cookies, storage: new MemoryStorageAdapter() });
    try {
      await client.init(false);
      const validated = client.getCookies();
      return { ...values, GEMINI_SECURE_1PSID: validated['__Secure-1PSID'] || values.GEMINI_SECURE_1PSID,
        GEMINI_SECURE_1PSIDTS: validated['__Secure-1PSIDTS'] || values.GEMINI_SECURE_1PSIDTS };
    } finally { client.close(); }
  }
}

/** Capture and verify only after the user finishes signing in. */
export async function finishSignIn(
  provider: Provider, context: BrowserContext, page: Page,
  waitForUser: () => Promise<void>, validate = validateValues,
  notice: (message: string) => void = console.log,
): Promise<Record<string, string>> {
  await waitForUser();
  if (page.isClosed()) throw new Error('The sign-in browser was closed before setup finished.');
  const values = await captureValues(provider, context, page);
  notice('Checking your session...');
  try { return await validate(provider, values); }
  catch { throw new Error('The session could not be verified. Make sure sign-in and browser verification are complete, then retry.'); }
}

export async function signIn(provider: Provider, waitForUser: () => Promise<void>, notice: (message: string) => void = console.log): Promise<Record<string, string>> {
  let browser;
  try {
    // Use a fresh temporary browser profile, never the user's existing Chrome profile.
    try { browser = await chromium.launch({ channel: 'chrome', headless: false }); }
    catch { browser = await chromium.launch({ headless: false }); }
  } catch {
    throw new Error('Could not open the sign-in browser. Check that a graphical desktop is available and Chromium is installed. On Linux, Playwright may also need system browser dependencies.');
  }
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(provider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://gemini.google.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    notice(`A browser opened. Sign in to ${provider === 'chatgpt' ? 'ChatGPT' : 'Gemini'} and complete any verification.`);
    notice('Keep the browser open, then return to this terminal.');
    return await finishSignIn(provider, context, page, waitForUser, validateValues, notice);
  } finally {
    await browser.close();
  }
}
