/** Configure a Symbiote provider selected from Pi's model picker. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot, readConfig } from './config.ts';
import { hasCredentials } from './launcher.ts';
import { saveConfig } from './setup.ts';
import type { Provider } from './browser-auth.ts';

type UI = {
  confirm(title: string, message: string): Promise<boolean>;
  notify(message: string, type?: 'info' | 'warning' | 'error'): void;
};
type Dependencies = {
  read(): Record<string, string | undefined>;
  save(values: Record<string, string>): void;
  signIn(provider: Provider, wait: () => Promise<void>, notice: (message: string) => void): Promise<Record<string, string>>;
};
const defaults: Dependencies = {
  read: () => existsSync(join(projectRoot, '.env')) ? readConfig() : {},
  save: saveConfig,
  signIn: async (provider, wait, notice) => (await import('./browser-auth.ts')).signIn(provider, wait, notice),
};

export async function setupSelectedModel(provider: Provider, ui: UI, deps: Dependencies = defaults): Promise<void> {
  const config = deps.read();
  if (!hasCredentials(provider, config)) {
    const values = await deps.signIn(provider, async () => {
      const completed = await ui.confirm('Sign in to ' + provider,
        'Complete sign-in in the browser. Keep it open, then choose Yes to finish setup.');
      if (!completed) throw new Error('Sign-in cancelled.');
    }, message => ui.notify(message, 'info'));
    deps.save({ ...values, SYMBIOTE_PROVIDER: provider });
    ui.notify(`${provider} session saved locally.`, 'info');
  } else if (config.SYMBIOTE_PROVIDER !== provider) {
    deps.save({ SYMBIOTE_PROVIDER: provider });
  }
}
