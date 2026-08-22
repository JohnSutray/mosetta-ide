import {
  chooseShell,
  closeShellPicker,
  shellDraft,
  shellPickerOpen,
  shells,
} from '../state/shells.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

export function ShellPicker() {
  if (!shellPickerOpen.value) return null;

  return (
    <Popup
      id="shells"
      keys="prompt"
      class="shells"
      size={{ w: 560, h: 380 }}
      min={{ w: 380, h: 240 }}
      onClose={closeShellPicker}
    >
      <div class="shells-title">{t('shell.title')}</div>
      <div class="shells-note">{t('shell.note')}</div>

      <div class="shells-list">
        {shells.value.map((item) => (
          <div
            key={item.path}
            class={`shells-row ${item.current ? 'is-current' : ''}`}
            title={item.path}
            onClick={() => void chooseShell(item.path)}
          >
            <span class="shells-name">{item.name}</span>
            <span class="shells-path">{item.path}</span>
            {item.current && <span class="shells-mark">{t('shell.current')}</span>}
          </div>
        ))}
        {shells.value.length === 0 && <div class="shells-empty">{t('shell.empty')}</div>}
      </div>

      <div class="shells-custom">
        <input
          class="shells-input"
          value={shellDraft.value}
          placeholder={t('shell.custom')}
          onInput={(event) => {
            shellDraft.value = (event.target as HTMLInputElement).value;
          }}
        />
        <button class="shells-apply" onClick={() => void chooseShell(shellDraft.value.trim())}>
          {t('shell.apply')}
        </button>
      </div>
      <div class="shells-reset" onClick={() => void chooseShell('')}>
        {t('shell.system')}
      </div>
    </Popup>
  );
}
