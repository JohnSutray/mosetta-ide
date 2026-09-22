/**
 * "The server is ready": an address in the program's output.
 *
 * VS Code does this at home (`serverReadyAction`) rather than in the adapter: it
 * watches the console and, on seeing an address, raises a second session — the browser.
 * We watch where the user watches: the program's terminal (or the output events, if
 * there is no terminal).
 *
 * The output arrives in pieces, in colours and with carriage returns, so a buffer
 * accumulates, the codes are stripped, and the address is looked for among WORDS that
 * have already ended: `http://localhost:51` with no space after it is not an address
 * yet.
 */
export class ServerReady {
  private buffer = '';
  private found = false;

  constructor(private readonly pattern: RegExp) {}

  /** Feed it a piece of output; the first address found is returned ONCE. */
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

  /**
   * From the setting — with a fallback expression, if the user has written a broken
   * one.
   */
  static compile(source: string, fallback: string): RegExp {
    try {
      return new RegExp(source);
    } catch {
      return new RegExp(fallback);
    }
  }
}
