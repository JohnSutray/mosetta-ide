export class ServerReady {
  private buffer = '';
  private found = false;

  constructor(private readonly pattern: RegExp) {}

  feed(chunk: string): string | null {
    if (this.found) return null;
    this.buffer = (this.buffer + chunk).slice(-4000);
    const clean = this.buffer.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '\n');
    const settled = clean.slice(0, clean.lastIndexOf('\n') + 1);
    const hit = this.pattern.exec(settled);
    if (!hit) return null;
    this.found = true;
    return (hit[1] ?? hit[0]).replace(/[.,;:]+$/, '');
  }

  static compile(source: string, fallback: string): RegExp {
    try {
      return new RegExp(source);
    } catch {
      return new RegExp(fallback);
    }
  }
}
