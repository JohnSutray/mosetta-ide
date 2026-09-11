import type { JSX } from 'preact';
import { IdeProvider } from '@mosetta/ide-api/client';
import type { Registry } from '../state/registry.js';
import type { Plugins } from '../state/plugins.js';
import type { I18n } from '../i18n/index.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import type { Core } from '../core.js';

function Region({ store, name, fallback }: { store: Registry; name: string; fallback?: JSX.Element }) {
  const views = store.all<() => unknown>(name).value;
  if (views.length === 0) return fallback ?? null;
  return <>{views.map((view) => view() as JSX.Element)}</>;
}

function NoShell({ plugins, i18n }: { plugins: Plugins; i18n: I18n }) {
  const loaded = plugins.list.value.map((one) => one.name);
  return (
    <div class="no-shell">
      <div class="no-shell-title">{i18n.t('shell.missing')}</div>
      <p class="no-shell-why">{i18n.t('shell.missing.why')}</p>
      <p class="no-shell-why">
        {loaded.length > 0
          ? i18n.t('shell.missing.loaded', { names: loaded.join(', ') })
          : i18n.t('shell.missing.none')}
      </p>
    </div>
  );
}

export function App({ core }: { core: Core }) {
  return (
    <IdeProvider value={core.services}>
      <div
        class="app"
      >
        <Region store={core.store} name="chrome.top" />
        <Region store={core.store} name="chrome.main" fallback={<NoShell plugins={core.plugins} i18n={core.i18n} />} />
        <PluginSurfaces plugins={core.plugins} />
      </div>
    </IdeProvider>
  );
}
