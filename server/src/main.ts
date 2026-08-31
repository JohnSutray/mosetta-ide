import { journal } from './log.js';
import { startServer } from './server.js';

const log = journal.logger('main');

const port = process.env.IDE_PORT ? Number(process.env.IDE_PORT) : undefined;
const idleMs = process.env.IDE_WORKSPACE_IDLE_MS
  ? Number(process.env.IDE_WORKSPACE_IDLE_MS)
  : undefined;

const server = await startServer({ port, idleMs });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`${signal}: закрываюсь`);
    void server.close().then(() => process.exit(0));
  });
}

process.on('unhandledRejection', (err) => log.error(`необработанный reject: ${journal.describeError(err)}`));
