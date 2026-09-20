import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';

/**
 * The tree's server half: reveal a file in the OS file manager. A conversation WITH THE
 * MACHINE rather than with the project's contents — we neither read nor write anything,
 * we ask the system to show. This used to be `fs.reveal` in the core's protocol; the
 * tree alone called it.
 */
export default class TreeServer {
  constructor(private readonly ide: Ide) {}

  @command() protected async reveal(params: unknown, call: CallContext): Promise<null> {
    const asked = params as { path?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('path: string required');
    const absolute = call.project.resolve(asked.path);
    const { command: cmd, args } = commandFor(absolute);
    const ran = await this.ide.run({ command: cmd, args, reason: `reveal ${absolute}`, timeoutMs: 10_000 });
    if (!ran.ok) throw new Error(`Could not reveal it: ${ran.stderr || 'the file manager did not answer'}`);
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
