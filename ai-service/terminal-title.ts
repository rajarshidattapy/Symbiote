/** Keep Pi's dynamic project and session title while displaying Symbiote's name. */
export function brandTerminalTitle(output: string): string {
  return output.replace(/\x1b\]0;π(?= - |\x07|\x1b\\)/g, '\x1b]0;Symbiote');
}

export function installTerminalTitleBranding(): void {
  const originalWrite = process.stdout.write;
  process.stdout.write = function (chunk: any, ...args: any[]) {
    if (typeof chunk === 'string') chunk = brandTerminalTitle(chunk);
    return (originalWrite as any).call(this, chunk, ...args);
  } as typeof process.stdout.write;
}
