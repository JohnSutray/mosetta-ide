import { session } from '../state/session.js';
import { i18n } from '../i18n/index.js';
import type { Registry } from '../state/registry.js';

interface WidgetWish {
  id: string;
  side: 'left' | 'right';
  view: () => unknown;
}

export function registerToolbarWishes(store: Registry): void {
  const widget = (wish: WidgetWish) => store.add('toolbar.widget', wish, 'core');

  widget({ id: 'connection', side: 'right', view: () => <Connection /> });
}

function Connection() {
  return (
    <span
      class={`dot ${session.connected.value ? 'is-on' : 'is-off'}`}
      title={i18n.t('toolbar.connection')}
    />
  );
}
