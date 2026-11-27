import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { HarnessEngine, approvedCwd, harnessCliFromEnv } from '../src/main/harness/engine';

const inside = (parent: string, child: string) => child === parent || child.startsWith(parent + path.sep);
const roots = [{ path: '/work/proj' }, { path: '/srv/x', remote: { host: 'h' } }];

describe('harnessCliFromEnv', () => {
  it('is unavailable without settings or when the file is missing', () => {
    expect(harnessCliFromEnv({}, () => true)).toBeNull();
    expect(harnessCliFromEnv({ COS_HARNESS_CLI: '/x/cli.js' }, () => false)).toBeNull();
  });
  it('prefers the explicit CLI, else resolves from the monorepo root', () => {
    expect(harnessCliFromEnv({ COS_HARNESS_CLI: '/x/cli.js', COS_HARNESS_ROOT: '/r' }, () => true)).toBe('/x/cli.js');
    expect(harnessCliFromEnv({ COS_HARNESS_ROOT: '/r' }, () => true)).toBe(path.join('/r', 'symbiote-harness', 'harness', 'packages', 'coding-agent', 'dist', 'bundle', 'cli.js'));
  });
});

describe('approvedCwd', () => {
  it('accepts approved local folders and children', () => {
    expect(approvedCwd('/work/proj/sub', roots, inside)).toBe('/work/proj/sub');
  });
  it('rejects relative, outside, sibling-prefix and server folders', () => {
    for (const bad of ['proj', '/work', '/work/projEvil', '/srv/x', 42]) expect(() => approvedCwd(bad, roots, inside)).toThrow();
  });
});

describe('HarnessEngine', () => {
  const make = () => {
    const backend = { running: false, start: vi.fn(function (this: { running: boolean }) { this.running = true; }), stop: vi.fn(function (this: { running: boolean }) { this.running = false; }),
      prompt: vi.fn(async () => ({ type: 'response' as const, success: true })), onEvent: vi.fn() };
    const emit = vi.fn();
    const engine = new HarnessEngine({ env: { COS_HARNESS_CLI: '/x/cli.js' }, roots: () => roots, isInside: inside, emit, exists: () => true, create: () => backend });
    return { backend, emit, engine };
  };
  it('refuses to start unconfigured or outside approved folders', () => {
    const e = new HarnessEngine({ env: {}, roots: () => roots, isInside: inside, emit: () => undefined, exists: () => true });
    expect(() => e.start('/work/proj')).toThrow(/not configured/);
    expect(() => make().engine.start('/etc')).toThrow(/approved/);
  });
  it('starts, forwards events, prompts and stops', async () => {
    const { backend, emit, engine } = make();
    expect(engine.status()).toEqual({ available: true, running: false, cwd: null });
    expect(engine.start('/work/proj')).toEqual({ running: true, cwd: '/work/proj' });
    expect(backend.onEvent).toHaveBeenCalledWith(emit);
    expect((await engine.prompt('hello')).success).toBe(true);
    expect(engine.status().running).toBe(true);
    engine.stop();
    expect(backend.stop).toHaveBeenCalled();
    await expect(engine.prompt('x')).rejects.toThrow(/not running/);
  });
  it('rejects empty prompts', async () => {
    const { engine } = make(); engine.start('/work/proj');
    await expect(engine.prompt('  ')).rejects.toThrow(/required/);
  });
});
