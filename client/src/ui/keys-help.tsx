import { config } from '../state/config.js';
import { Fragment } from 'preact';
import type { KeyBinding, KeyContext, KeyScope } from '@ide/protocol';
import { closeKeysHelp, keysHelpOpen, lastKey, viewHost } from '../state/keys-help.js';
import { keyHost } from '../keys/host.js';
import { reservedIn } from '../keys/reserved.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

export function KeysHelp() {
  if (!keysHelpOpen.value) return null;

  const bindings = config.keymap.value.bindings;
  const echo = lastKey.value;
  const host = viewHost.value ?? keyHost.host;
  const elsewhere = host !== keyHost.host;
  const taken = reservedIn([host, `${host}:${keyHost.os}` as KeyScope]);
  const gone = taken.filter((item) => !item.soft);
  const ours = taken.filter((item) => item.soft);

  const groups = new Map<KeyContext, KeyBinding[]>();
  for (const binding of bindings) {
    const exact = `${host}:${keyHost.os}` as KeyScope;
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
      id="keys"
      keys="keys"
      class="keys-help"
      size={{ w: 720, h: 560 }}
      min={{ w: 460, h: 320 }}
      onClose={closeKeysHelp}
      onEscape={() => {}}
    >
      <div class="keys-head">
        <div class="keys-title">
          {t('keys.title')}
          <span class="keys-hosts">
            {(['browser', 'electron'] as const).map((one) => (
              <span
                key={one}
                class={`keys-host ${one === host ? 'is-on' : ''}`}
                onClick={() => (viewHost.value = one === keyHost.host ? null : one)}
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
            <kbd class="keys-kbd">{keyHost.humanize(echo.key)}</kbd>
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
                  <kbd class="keys-kbd is-dead">{keyHost.humanize(item.key)}</kbd>
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
                  <kbd class="keys-kbd is-soft">{keyHost.humanize(item.key)}</kbd>
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
                  <kbd class="keys-kbd">{keyHost.humanize(binding.key)}</kbd>
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
