import { app, type BrowserWindow } from 'electron';
import { getConfig } from './config.js';
import { isContained } from './sandbox.js';
import { HarnessEngine } from './harness/engine.js';

type Register = <T>(channel: string, fn: (payload: unknown) => Promise<T>) => void;

/** Optional Symbiote (Pi) engine next to the ChatGPT bridge. Main-process only; no renderer surface. */
export function registerHarnessIpc(handle: Register, getWindow: () => BrowserWindow | null): HarnessEngine {
  const engine = new HarnessEngine({
    env: process.env,
    roots: () => getConfig().roots,
    isInside: isContained,
    emit: event => { getWindow()?.webContents.send('harness:event', event); }
  });
  handle('harness:status', async () => engine.status());
  handle('harness:start', async payload => engine.start((payload as { cwd?: unknown } | null)?.cwd));
  handle('harness:prompt', async payload => engine.prompt((payload as { message?: unknown } | null)?.message));
  handle('harness:stop', async () => { engine.stop(); return engine.status(); });
  app.on('before-quit', () => engine.stop());
  return engine;
}
