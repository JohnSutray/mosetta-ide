import { scripts, runScript } from '../state/terminals.js';
import { scriptsOpen, closeScripts } from '../state/scripts.js';
import { PickPopup, highlight, type PickItem } from './pick-popup.js';
import { t } from '../i18n/index.js';
import type { NpmScriptInfo } from '@ide/protocol';

export function ScriptsPopup() {
  if (!scriptsOpen.value) return null;

  const items: Array<PickItem<NpmScriptInfo>> = scripts.value.map((script) => ({
    key: script.id,
    text: script.id,
    value: script,
  }));

  return (
    <PickPopup
      id="scripts"
      title={t('panel.scripts')}
      items={items}
      placeholder={t('scripts.filter')}
      empty={t('scripts.empty')}
      size={{ w: 620, h: 420 }}
      min={{ w: 420, h: 240 }}
      onClose={closeScripts}
      onPick={(script) => {
        closeScripts();
        void runScript(script.id);
      }}
      row={(script, matches) => (
        <>
          <span class="pick-name">{highlight(script.id, matches)}</span>
          <span class="pick-detail">{script.command}</span>
        </>
      )}
    />
  );
}
