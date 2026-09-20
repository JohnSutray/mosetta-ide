import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { IdeProvider } from '@mosetta/ide-api/client';
import type { Registry } from '../state/registry.js';
import type { Plugins } from '../state/plugins.js';
import type { I18n } from '../i18n/index.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import { Splash } from './splash.js';
import type { Core } from '../core.js';

/** A slot in the frame: whatever was put into it is what we draw. */
function Region({ store, name, fallback }: { store: Registry; name: string; fallback?: JSX.Element }) {
  const views = store.all<() => unknown>(name).value;
  if (views.length === 0) return fallback ?? null;
  return <>{views.map((view) => view() as JSX.Element)}</>;
}

/**
 * What is visible when nobody drew the layout.
 *
 * An empty toolbar is survivable — the keys are still there. An empty middle is not:
 * that is where the whole editor, the whole tree and every panel live, and a white
 * screen is indistinguishable from "the IDE broke". A silent failure is the worst kind
 * of error, and this one would be the loudest of the silent ones.
 *
 * So the core holds NOT a spare layout — a second layout would drift from the first on
 * the first edit — but an explanation: who was supposed to take this slot, what is
 * missing, and what did come up. It is fixed by editing one line in `settings.json`,
 * and that line has to be named.
 */
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

/**
 * The tab's frame. Everything it lives on arrives from the root: the registry, the
 * plugins, the dictionary, and the services for plugin markup.
 */
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
