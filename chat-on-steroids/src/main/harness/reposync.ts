import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export interface ReposyncOptions {
  repo: string;
  port?: number;
  /** Default off: the bridge stays on the local machine unless the user opts in to a tunnel. */
  tunnel?: 'ngrok' | 'none';
  authKey?: string;
  ignore?: string[];
}

/** Location of the reposync (npm "repsyn") CLI inside this monorepo. */
export function resolveReposyncCli(repoRoot: string): string {
  return path.join(repoRoot, 'repsyn', 'bin', 'reposync.js');
}

export function buildReposyncArgs(cli: string, o: ReposyncOptions): string[] {
  const args = [cli, '--repo', o.repo];
  if (o.port !== undefined) args.push('--port', String(o.port));
  if ((o.tunnel ?? 'none') === 'none') args.push('--no-tunnel'); else args.push('--tunnel', o.tunnel!);
  if (o.authKey) args.push('--auth-key', o.authKey);
  if (o.ignore?.length) args.push('--ignore', o.ignore.join(','));
  return args;
}

/** Optional live-repo bridge for other chat frontends (Custom GPT Actions, Claude Projects). */
export function startReposync(cli: string, o: ReposyncOptions, node = process.execPath): ChildProcess {
  return spawn(node, buildReposyncArgs(cli, o), { cwd: o.repo, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' });
}
