import type { LogLevel, LogLine } from '@mosetta/ide-protocol';

type Sink = (line: LogLine) => void;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class Journal {
  /**
   * Who listens to the lines besides stdout: the tabs. A field rather than a
   * module-level set.
   */
  private readonly sinks = new Set<Sink>();

  /**
   * The journal: it writes to a stream and hands lines to its subscribers.
   *
   * The status strip at the bottom of the editor stays silent — everything the editor
   * has to say goes to the log panel. So the log is a stream of events heading
   * outwards, and stdout is only a duplicate, for development.
   */
  onLog(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  logger(scope: string): Logger {
    return {
      debug: (m) => this.emit('debug', scope, m),
      info: (m) => this.emit('info', scope, m),
      warn: (m) => this.emit('warn', scope, m),
      error: (m) => this.emit('error', scope, m),
    };
  }

  private emit(level: LogLevel, scope: string, message: string): void {
    const line: LogLine = { level, scope, message, at: Date.now() };
    for (const sink of this.sinks) sink(line);
    const stamp = new Date(line.at).toISOString().slice(11, 23);
    const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    out.write(`${stamp} ${level.padEnd(5)} ${scope}: ${message}\n`);
  }

  describeError(err: unknown): string {
    if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
    return String(err);
  }
}

/** One per process: the subscribers live in it. */
export const journal = new Journal();
