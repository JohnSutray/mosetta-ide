import { command, type CallContext, type Ide } from '@ide/api/server';

export default class TreeServer {
  constructor(private readonly ide: Ide) {}

  @command() protected async reveal(params: unknown, call: CallContext): Promise<null> {
    const asked = params as { path?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('нужен path: string');
    const absolute = call.project.resolve(asked.path);
    const { command: cmd, args } = commandFor(absolute);
    const ran = await this.ide.run({ command: cmd, args, reason: `показать ${absolute}`, timeoutMs: 10_000 });
    if (!ran.ok) throw new Error(`Не смог показать: ${ran.stderr || 'менеджер файлов не ответил'}`);
    return null;
  }
}

function commandFor(absolute: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') return { command: 'open', args: ['-R', absolute] };
  if (process.platform === 'win32') {
    return { command: 'explorer.exe', args: [`/select,${absolute}`] };
  }
  return { command: 'xdg-open', args: [absolute.slice(0, absolute.lastIndexOf('/')) || '/'] };
}
