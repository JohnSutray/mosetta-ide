import type { LogLevel, LogLine } from '@ide/protocol';

type Sink = (line: LogLine) => void;

const sinks = new Set<Sink>();

export function onLog(sink: Sink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

function emit(level: LogLevel, scope: string, message: string) {
  const line: LogLine = { level, scope, message, at: Date.now() };
  for (const sink of sinks) sink(line);
  const stamp = new Date(line.at).toISOString().slice(11, 23);
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${stamp} ${level.padEnd(5)} ${scope}: ${message}\n`);
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function logger(scope: string): Logger {
  return {
    debug: (m) => emit('debug', scope, m),
    info: (m) => emit('info', scope, m),
    warn: (m) => emit('warn', scope, m),
    error: (m) => emit('error', scope, m),
  };
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}
