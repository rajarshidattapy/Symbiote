import { configure, configureManual } from '../setup.ts';
try { await (process.argv.includes('--manual') ? configureManual('gemini') : configure('gemini')); }
catch (error) { console.error(error instanceof Error ? error.message : 'Setup failed.'); process.exitCode = 1; }
