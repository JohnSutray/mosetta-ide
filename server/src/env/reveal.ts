import { execFile } from 'node:child_process';
import { RpcError } from '../errors.js';

export function revealInFileManager(absolute: string): Promise<void> {
  const { command, args } = commandFor(absolute);
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (err) => {
      if (err) reject(RpcError.invalidParams(`Не смог показать: ${err.message}`));
      else resolve();
    });
  });
}

function commandFor(absolute: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') return { command: 'open', args: ['-R', absolute] };
  if (process.platform === 'win32') {
    return { command: 'explorer.exe', args: [`/select,${absolute}`] };
  }
  return { command: 'xdg-open', args: [absolute.slice(0, absolute.lastIndexOf('/')) || '/'] };
}
