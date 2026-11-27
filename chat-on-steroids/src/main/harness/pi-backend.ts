import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { JsonlReader } from './jsonl.js';

export type HarnessEvent = { type: string; [key: string]: unknown };
export type HarnessResponse = { id?: string; type: 'response'; command?: string; success: boolean; data?: unknown; error?: string };

export interface PiBackendOptions {
  /** Folder the harness works in. Must be inside a root the user approved. */
  cwd: string;
  /** Path to the Pi CLI entry (see resolvePiCli). */
  cli: string;
  /** Node executable. Defaults to the one running the app. */
  node?: string;
  /** Extra Pi CLI options, for example ['--provider', 'x', '--model', 'y']. */
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

/** Location of the Symbiote harness' Pi CLI inside this monorepo. */
export function resolvePiCli(repoRoot: string): string {
  return path.join(repoRoot, 'symbiote-harness', 'harness', 'packages', 'coding-agent', 'dist', 'bundle', 'cli.js');
}

export function buildPiArgs(cli: string, extra: readonly string[] = []): string[] {
  return [cli, '--mode', 'rpc', '--no-session', ...extra];
}

/**
 * Runs the Symbiote (Pi) coding harness as an isolated subprocess over its JSONL RPC mode, so the app
 * can use it as an engine next to the ChatGPT bridge. It never touches the renderer.
 */
export class PiBackend {
  private child: ChildProcess | null = null;
  private seq = 0;
  private readonly pending = new Map<string, (r: HarnessResponse) => void>();
  private readonly listeners = new Set<(e: HarnessEvent) => void>();
  constructor(private readonly options: PiBackendOptions) {}

  get running(): boolean { return this.child !== null && this.child.exitCode === null; }

  onEvent(listener: (e: HarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  start(): void {
    if (this.running) return;
    const child = spawn(this.options.node ?? process.execPath, buildPiArgs(this.options.cli, this.options.args), {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const reader = new JsonlReader();
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      for (const record of reader.push(chunk)) this.dispatch(record as HarnessEvent | HarnessResponse);
    });
    child.stderr!.resume();
    child.on('exit', () => {
      for (const [id, resolve] of this.pending) resolve({ id, type: 'response', success: false, error: 'harness exited' });
      this.pending.clear();
      this.child = null;
    });
    this.child = child;
  }

  private dispatch(record: HarnessEvent | HarnessResponse): void {
    if (record.type === 'response') {
      const response = record as HarnessResponse;
      const resolve = response.id === undefined ? undefined : this.pending.get(response.id);
      if (resolve && response.id !== undefined) { this.pending.delete(response.id); resolve(response); }
      return;
    }
    for (const listener of this.listeners) listener(record as HarnessEvent);
  }

  /** Send one RPC command and wait for its correlated response. */
  request(command: { type: string; [key: string]: unknown }): Promise<HarnessResponse> {
    if (!this.running || !this.child?.stdin) return Promise.resolve({ type: 'response', success: false, error: 'harness not running' });
    const id = `cos-${++this.seq}`;
    return new Promise(resolve => {
      this.pending.set(id, resolve);
      this.child!.stdin!.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  }

  prompt(message: string): Promise<HarnessResponse> { return this.request({ type: 'prompt', message }); }

  stop(): void { this.child?.kill(); }
}
