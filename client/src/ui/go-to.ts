import { openFile, openFileAt, reveal } from '../state/session.js';

export async function goTo(path: string, line: number, character = 0): Promise<void> {
  if (openFile.peek()?.path !== path) await openFileAt(path);
  reveal(path, line, character);
}
