import fs from 'node:fs';
import path from 'node:path';
import { PiBackend, resolvePiCli, type HarnessEvent, type HarnessResponse } from './pi-backend.js';

export interface EngineRoot { path: string; remote?: unknown }

/**
 * Settings for the optional Symbiote engine, read from the environment so no settings screen is
 * needed: COS_HARNESS_CLI is an explicit Pi CLI path; COS_HARNESS_ROOT is the monorepo root that
 * holds symbiote-harness/. With neither set, the engine is simply unavailable.
 */
export function harnessCliFromEnv(env: NodeJS.ProcessEnv, exists: (p: string) => boolean = fs.existsSync): string | null {
  const explicit = env.COS_HARNESS_CLI?.trim();
  if (explicit) return exists(explicit) ? explicit : null;
  const root = env.COS_HARNESS_ROOT?.trim();
  if (!root) return null;
  const cli = resolvePiCli(root);
  return exists(cli) ? cli : null;
}

/** The harness may run only inside a folder the user approved (local folders only). */
export function approvedCwd(cwd: unknown, roots: readonly EngineRoot[], isInside: (parent: string, child: string) => boolean): string {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('Harness folder must be an absolute path.');
  const resolved = path.resolve(cwd);
  if (!roots.some(r => !r.remote && isInside(r.path, resolved))) throw new Error('Harness folder is not inside an approved folder.');
  return resolved;
}

export interface EngineDeps {
  env: NodeJS.ProcessEnv;
  roots: () => readonly EngineRoot[];
  isInside: (parent: string, child: string) => boolean;
  emit: (event: HarnessEvent) => void;
  exists?: (p: string) => boolean;
  create?: (options: { cwd: string; cli: string }) => Pick<PiBackend, 'start' | 'stop' | 'prompt' | 'onEvent' | 'running'>;
}

/** Owns at most one running Pi engine for the app. */
export class HarnessEngine {
  private backend: ReturnType<NonNullable<EngineDeps['create']>> | null = null;
  private cwd: string | null = null;
  constructor(private readonly deps: EngineDeps) {}

  status(): { available: boolean; running: boolean; cwd: string | null } {
    return { available: harnessCliFromEnv(this.deps.env, this.deps.exists) !== null, running: this.backend?.running ?? false, cwd: this.backend?.running ? this.cwd : null };
  }

  start(cwd: unknown): { running: true; cwd: string } {
    const cli = harnessCliFromEnv(this.deps.env, this.deps.exists);
    if (!cli) throw new Error('Symbiote engine is not configured (set COS_HARNESS_CLI or COS_HARNESS_ROOT).');
    const dir = approvedCwd(cwd, this.deps.roots(), this.deps.isInside);
    this.stop();
    const backend = (this.deps.create ?? (o => new PiBackend(o)))({ cwd: dir, cli });
    backend.onEvent(this.deps.emit);
    backend.start();
    this.backend = backend;
    this.cwd = dir;
    return { running: true, cwd: dir };
  }

  async prompt(message: unknown): Promise<HarnessResponse> {
    if (typeof message !== 'string' || !message.trim() || message.length > 200_000) throw new Error('A prompt is required.');
    if (!this.backend?.running) throw new Error('Symbiote engine is not running.');
    return this.backend.prompt(message);
  }

  stop(): void { this.backend?.stop(); this.backend = null; this.cwd = null; }
}
