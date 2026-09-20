import path from 'node:path';
import { journal } from './log.js';
import { boot } from './server.js';

const log = journal.logger('main');

const port = process.env.IDE_PORT ? Number(process.env.IDE_PORT) : undefined;
const idleMs = process.env.IDE_WORKSPACE_IDLE_MS
  ? Number(process.env.IDE_WORKSPACE_IDLE_MS)
  : undefined;

const stateDir = process.env.IDE_STATE_DIR ? path.resolve(process.env.IDE_STATE_DIR) : undefined;
const trustedOrigins = (process.env.IDE_TRUSTED_ORIGINS ?? '').split(',').filter((one) => one !== '');

const server = await boot.start({ port, idleMs, stateDir, trustedOrigins });

process.send?.({ type: 'listening', port: server.port });

if (process.send) {
  process.on('disconnect', () => {
    log.info('the supervisor left: shutting down');
    void server.close().then(() => process.exit(0));
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`${signal}: shutting down`);
    void server.close().then(() => process.exit(0));
  });
}

process.on('unhandledRejection', (err) => log.error(`unhandled rejection: ${journal.describeError(err)}`));
