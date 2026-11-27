// Framing for Pi RPC mode: one JSON record per LF-terminated line (a trailing CR is tolerated).
export class JsonlReader {
  private buffer = '';
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const records: unknown[] = [];
    let at: number;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at).replace(/\r$/, '');
      this.buffer = this.buffer.slice(at + 1);
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { /* non-record output such as a startup banner */ }
    }
    return records;
  }
}
