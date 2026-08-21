import type { Handler } from '../rpc/context.js';

export const configGet: Handler<'config.get'> = (_params, ctx) => ctx.config.current;
