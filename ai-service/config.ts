import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Read the local session configuration without exposing it in process arguments. */
export function readConfig(): Record<string, string | undefined> {
  try { return parseConfig(readFileSync(join(projectRoot, '.env'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('The root .env file is missing; configure your AI service first.');
    throw error;
  }
}

export function parseConfig(source: string): Record<string, string> {
  const result = parse(source);
  // Our setup writes JSON-quoted strings; decode escapes such as embedded quotes.
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/);
    const key = match?.[1];
    const json = match?.[2];
    if (key && json) {
      try { result[key] = JSON.parse(json); } catch { /* Keep dotenv's parsing for non-JSON syntax. */ }
    }
  }
  return result;
}
