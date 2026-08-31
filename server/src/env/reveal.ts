import { RpcError } from '../errors.js';
import { processes } from './processes.js';

function commandFor(absolute: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') return { command: 'open', args: ['-R', absolute] };
  if (process.platform === 'win32') {
    return { command: 'explorer.exe', args: [`/select,${absolute}`] };
  }
  return { command: 'xdg-open', args: [absolute.slice(0, absolute.lastIndexOf('/')) || '/'] };
}

export class Reveal {
  async inFileManager(absolute: string): Promise<void> {
    const { command, args } = commandFor(absolute);
    const ran = await processes.run({
      command,
      args,
      reason: `показать ${absolute}`,
      timeoutMs: 10_000,
    });
    if (!ran.ok) {
      throw RpcError.invalidParams(`Не смог показать: ${ran.stderr || 'менеджер файлов не ответил'}`);
    }
  }
}

export const reveal = new Reveal();
