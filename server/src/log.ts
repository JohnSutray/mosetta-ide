import type { LogLevel, LogLine } from '@ide/protocol';

type Sink = (line: LogLine) => void;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class Journal {
  private readonly sinks = new Set<Sink>();

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

export const journal = new Journal();
