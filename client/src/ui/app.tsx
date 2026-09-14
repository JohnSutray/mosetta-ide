import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { IdeProvider } from '@mosetta/ide-api/client';
import type { Registry } from '../state/registry.js';
import type { Plugins } from '../state/plugins.js';
import type { I18n } from '../i18n/index.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import { Splash } from './splash.js';
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
  const { startup } = core;
  const shell = core.store.all<() => unknown>('chrome.main').value.length > 0;
  useEffect(() => {
    if (shell) startup.shellAppeared();
  }, [shell, startup]);

  const covering = startup.covering.value;
  const explain = startup.explain.value;

  return (
    <IdeProvider value={core.services}>
      <div
        class="app"
      >
        <Region store={core.store} name="chrome.top" />
        <Region
          store={core.store}
          name="chrome.main"
          fallback={explain ? <NoShell plugins={core.plugins} i18n={core.i18n} /> : <div class="app-waiting" />}
        />
        <PluginSurfaces plugins={core.plugins} />
        {covering && <Splash leaving={shell} />}
      </div>
    </IdeProvider>
  );
}
