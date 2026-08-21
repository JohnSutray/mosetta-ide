import { signal } from '@preact/signals';
import { refreshScripts } from './terminals.js';

export const scriptsOpen = signal(false);

export function openScripts(): void {
  scriptsOpen.value = true;
  void refreshScripts();
}

export function closeScripts(): void {
  scriptsOpen.value = false;
}

export function toggleScripts(): void {
  if (scriptsOpen.value) closeScripts();
  else openScripts();
}
