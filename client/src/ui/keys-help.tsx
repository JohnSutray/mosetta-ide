import type { CommandId, KeyBinding, KeyContext } from '@ide/protocol';
import { keymap as keymapSignal } from '../state/config.js';
import { closeKeysHelp, keysHelpOpen, lastKey } from '../state/keys-help.js';
import { HOST, humanizeKey } from '../keys/host.js';
import { resolveClip } from '../keys/dispatcher.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

export function KeysHelp() {
  if (!keysHelpOpen.value) return null;

  const bindings = keymapSignal.value.bindings;
  const echo = lastKey.value;

  const groups = new Map<KeyContext, KeyBinding[]>();
  for (const binding of bindings) {
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
        <div class="keys-title">{t('keys.title')}</div>
        <div class="keys-note">
          {t(HOST === 'browser' ? 'keys.mod.browser' : 'keys.mod.electron')}
        </div>
        <div class="keys-note">{t('keys.clip')}</div>
        <div class="keys-note is-loud">{t('keys.captured')}</div>
      </div>

      <div class="keys-echo">
        <span class="keys-echo-label">{t('keys.echo')}</span>
        {echo ? (
          <>
            <kbd class="keys-kbd">{humanizeKey(echo.key)}</kbd>
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
        {[...groups.entries()].map(([context, list]) => (
          <div class="keys-group" key={context}>
            <div class="keys-group-title">{contextName(context)}</div>
            {list.map((binding) => (
              <div class="keys-row" key={`${binding.command}:${binding.key}`}>
                <kbd class="keys-kbd">{humanizeKey(resolveClip(binding.key))}</kbd>
                <span class="keys-command">{commandName(binding.command)}</span>
                {blockedHere(binding) && (
                  <span class="keys-blocked">
                    {t('keys.unavailable', { reason: blockedHere(binding) ?? '' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Popup>
  );
}

function commandName(id: CommandId): string {
  return t(`command.${id}`);
}

function blockedHere(binding: KeyBinding): string | undefined {
  return binding.unavailable?.[HOST];
}

function contextName(context: KeyContext): string {
  return t(`keys.context.${context}`);
}
