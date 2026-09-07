import { t } from '@ide/api/client';
import { keys } from '@ide/plugin-keymap';
import { Fragment } from 'preact';
import type { KeyBinding, KeyContext, KeyScope } from '@ide/protocol';
import { Popup } from '@ide/ui';
import type { KeysWindow } from './state.js';

export function KeysPopup({ window: win }: { window: KeysWindow }) {
  if (!win.open.value) return null;

  const bindings = keys.bindings.value;
  const echo = keys.echo.value;
  const host = win.viewHost.value ?? keys.host;
  const elsewhere = host !== keys.host;
  const taken = keys.taken([host, `${host}:${keys.os}` as KeyScope]);
  const gone = taken.filter((item) => !item.soft);
  const ours = taken.filter((item) => item.soft);

  const groups = new Map<KeyContext, KeyBinding[]>();
  for (const binding of bindings) {
    const exact = `${host}:${keys.os}` as KeyScope;
    if (binding.where && !binding.where.includes(host) && !binding.where.includes(exact)) {
      continue;
    }
    const context = (binding.when ?? 'global') as KeyContext;
    const list = groups.get(context) ?? [];
    list.push(binding);
    groups.set(context, list);
  }

  return (
    <Popup
      id="keys.show"
      keys="keys"
      class="keys-help"
      size={{ w: 720, h: 560 }}
      min={{ w: 460, h: 320 }}
      onClose={() => win.close()}
    >
      <div class="keys-head">
        <div class="keys-title">
          {t('keys.title')}
          <span class="keys-hosts">
            {(['browser', 'electron'] as const).map((one) => (
              <span
                key={one}
                class={`keys-host ${one === host ? 'is-on' : ''}`}
                onClick={() => (win.viewHost.value = one === keys.host ? null : one)}
              >
                {t(`keys.host.${one}`)}
              </span>
            ))}
          </span>
        </div>
        <div class="keys-note">
          {t(host === 'browser' ? 'keys.mod.browser' : 'keys.mod.electron')}
        </div>
        {elsewhere && <div class="keys-note is-loud">{t('keys.elsewhere')}</div>}
        <div class="keys-note">{t('keys.clip')}</div>
        <div class="keys-note is-loud">{t('keys.captured')}</div>
      </div>

      <div class="keys-echo">
        <span class="keys-echo-label">{t('keys.echo')}</span>
        {echo ? (
          <>
            <kbd class="keys-kbd">{keys.humanize(echo.key)}</kbd>
            <span class="keys-echo-arrow">→</span>
            <span class={`keys-echo-command ${echo.command ? '' : 'is-free'}`}>
              {echo.command ? commandName(echo.command) : t('keys.echo.free')}
            </span>
            <span class="keys-echo-context">{contextName(echo.context)}</span>
          </>
        ) : (
          <span class="keys-echo-command is-free">{t('keys.echo.none')}</span>
        )}
      </div>
      <div class="keys-hint">{t('keys.echo.hint')}</div>

      <div class="keys-list">
        {gone.length > 0 && (
          <details class="keys-taken" open>
            <summary>{t('keys.taken', { count: gone.length })}</summary>
            <div class="keys-grid has-who">
              {gone.map((item) => (
                <div class="keys-row" key={`${item.scopes[0]}:${item.key}`}>
                  <kbd class="keys-kbd is-dead">{keys.humanize(item.key)}</kbd>
                  <span class="keys-command">{item.what}</span>
                  <span class="keys-who">{item.who}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {ours.length > 0 && (
          <details class="keys-taken is-ours" open>
            <summary>{t('keys.soft', { count: ours.length })}</summary>
            <div class="keys-grid has-who">
              {ours.map((item) => (
                <div class="keys-row" key={`${item.scopes[0]}:${item.key}`}>
                  <kbd class="keys-kbd is-soft">{keys.humanize(item.key)}</kbd>
                  <span class="keys-command">{item.what}</span>
                  <span class="keys-who">{item.who}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div class="keys-grid">
          {[...groups.entries()].map(([context, list]) => (
            <Fragment key={context}>
              <div class="keys-group-title">{contextName(context)}</div>
              {list.map((binding) => (
                <div class="keys-row" key={`${binding.command}:${binding.key}`}>
                  <kbd class="keys-kbd">{keys.humanize(binding.key)}</kbd>
                  <span class="keys-command">{commandName(binding.command)}</span>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </Popup>
  );
}

function commandName(id: string): string {
  return t(`command.${id}`);
}

function contextName(context: KeyContext): string {
  return t(`keys.context.${context}`);
}
