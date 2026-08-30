import { doc } from '../state/session.js';

export async function goTo(path: string, line: number, character = 0): Promise<void> {
  if (doc.open.peek()?.path !== path) await doc.openAt(path);
  doc.reveal(path, line, character);
}
