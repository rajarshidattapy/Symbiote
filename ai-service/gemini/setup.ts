import { configure } from '../setup.ts';
try { await configure('gemini'); }
catch (error) { console.error(error instanceof Error ? error.message : 'Setup failed.'); process.exitCode = 1; }
