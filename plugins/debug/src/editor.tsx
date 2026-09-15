import { useT } from '@mosetta/ide-api/client';
import { Popup, type Windows } from '@mosetta/ide-plugin-ui';
import { useEffect, useRef } from 'preact/hooks';
import type { BreakpointEdit } from './state.js';
import type { BreakpointAsk } from './types.js';

export function BreakpointEditor({
  windows,
  edit,
  onDraft,
  onApply,
  onRemove,
  onClose,
}: {
  windows: Windows;
  edit: BreakpointEdit;
  onDraft: (patch: Partial<BreakpointAsk>) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  const field = (key: 'condition' | 'hitCondition' | 'logMessage', ref?: typeof first) => (
    <label class="debug-edit-row">
      <span>{t(`debug.edit.${key}`)}</span>
      <input
        ref={ref}
        class="field"
        value={edit.ask[key] ?? ''}
        placeholder={t(`debug.edit.${key}.hint`)}
        onInput={(event) => onDraft({ [key]: (event.currentTarget as HTMLInputElement).value })}
      />
    </label>
  );

  return (
    <Popup
      windows={windows}
      id="debug-edit"
      keys="debug-edit"
      class="debug-edit"
      size={{ w: 440, h: 200 }}
      min={{ w: 320, h: 160 }}
      anchor={edit.at}
      clear
      onClose={onClose}
    >
      <div class="debug-edit-title">{t('debug.edit.title', { path: edit.path, line: edit.ask.line })}</div>
      {field('condition', first)}
      {field('hitCondition')}
      {field('logMessage')}
      <div class="debug-edit-actions">
        <button type="button" class="debug-btn debug-edit-btn" onClick={onApply}>
          {t('debug.edit.apply')}
        </button>
        <button type="button" class="debug-btn debug-edit-btn is-quiet" onClick={onRemove}>
          {t('debug.menu.remove')}
        </button>
      </div>
    </Popup>
  );
}
