import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonlReader } from '../src/main/harness/jsonl';
import { PiBackend, buildPiArgs, resolvePiCli } from '../src/main/harness/pi-backend';
import { buildReposyncArgs, resolveReposyncCli } from '../src/main/harness/reposync';

describe('harness jsonl framing', () => {
  it('splits on LF, tolerates CR, ignores banners, keeps partial lines', () => {
    const r = new JsonlReader();
    expect(r.push('banner\n{"a":1}\r\n{"b"')).toEqual([{ a: 1 }]);
    expect(r.push(':2}\n')).toEqual([{ b: 2 }]);
  });
});

describe('harness paths and args', () => {
  it('resolves the monorepo CLIs', () => {
    expect(resolvePiCli('/r')).toBe(path.join('/r', 'symbiote-harness', 'harness', 'packages', 'coding-agent', 'dist', 'bundle', 'cli.js'));
    expect(resolveReposyncCli('/r')).toBe(path.join('/r', 'repsyn', 'bin', 'reposync.js'));
  });
  it('runs Pi in RPC mode without a session', () => {
    expect(buildPiArgs('cli.js', ['--model', 'm'])).toEqual(['cli.js', '--mode', 'rpc', '--no-session', '--model', 'm']);
  });
  it('keeps reposync local unless a tunnel is requested', () => {
    expect(buildReposyncArgs('c.js', { repo: '/p' })).toEqual(['c.js', '--repo', '/p', '--no-tunnel']);
    expect(buildReposyncArgs('c.js', { repo: '/p', port: 4000, tunnel: 'ngrok', ignore: ['a', 'b'] }))
      .toEqual(['c.js', '--repo', '/p', '--port', '4000', '--tunnel', 'ngrok', '--ignore', 'a,b']);
  });
});

describe('PiBackend', () => {
  it('correlates responses, forwards events and fails pending requests on exit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-'));
    const cli = path.join(dir, 'fake.js');
    fs.writeFileSync(cli, `process.stdin.setEncoding('utf8');let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const c=JSON.parse(b.slice(0,i));b=b.slice(i+1);
      if(c.type==='prompt'){console.log(JSON.stringify({type:'agent_start'}));console.log(JSON.stringify({id:c.id,type:'response',command:'prompt',success:true}));}
      if(c.type==='quit')process.exit(0);}});`);
    const backend = new PiBackend({ cwd: dir, cli, args: [] });
    const events: string[] = [];
    backend.onEvent(e => events.push(e.type));
    backend.start();
    const ok = await backend.prompt('hi');
    expect(ok.success).toBe(true);
    expect(events).toContain('agent_start');
    const pending = backend.request({ type: 'quit' });
    expect((await pending).success).toBe(false);
    expect(backend.running).toBe(false);
    expect((await backend.prompt('x')).error).toBe('harness not running');
  });
});
