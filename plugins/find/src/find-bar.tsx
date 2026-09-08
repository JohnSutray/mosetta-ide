import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { runCommand, t } from '@ide/api/client';
import { keysFor } from '@ide/plugin-keymap';
import { tips } from '@ide/windows';
import type { FindState } from './find.js';

interface ToolProps {
  command: string;
  title: string;
  on?: boolean;
  children: ComponentChildren;
}

function Tool({ command, title, on, children }: ToolProps) {
  return (
    <button
      type="button"
      class={`find-tool ${on ? 'is-on' : ''}`}
      onMouseEnter={(event) => tips.show(event.currentTarget as Element, t(title), keysFor(command))}
      onMouseLeave={() => tips.hide()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        tips.hide();
        runCommand(command);
      }}
    >
      {children}
    </button>
  );
}

export function FindBar({ find }: { find: FindState }) {
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const epoch = find.focusEpoch.value;
  const multiline = find.multiline.value;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    if (multiline) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, [epoch, multiline]);

  const replace = find.mode.value === 'replace';
  const count = find.count.value;
  const bad = !find.valid.value;
  const none = count !== null && count.total === 0;
  const counter = bad
    ? t('find.badPattern')
    : count === null
      ? ''
      : none
        ? t('find.none')
        : count.current
          ? `${count.current}/${count.total}`
          : String(count.total);

  const fieldProps = {
    class: 'field find-field',
    placeholder: t('find.placeholder'),
    value: find.term.value,
    spellcheck: false,
    onInput: (event: Event) => find.setTerm((event.currentTarget as HTMLInputElement).value),
  };

  return (
    <div class="find-bar">
      <div class="find-row" data-keys="find">
        <Tool command={replace ? 'find.open' : 'find.replace'} title={replace ? 'find.hideReplace' : 'find.showReplace'}>
          {replace ? '▾' : '▸'}
        </Tool>
        {multiline ? (
          <textarea ref={field as never} rows={3} data-keys="find-multiline" {...fieldProps} />
        ) : (
          <input ref={field as never} {...fieldProps} />
        )}
        <Tool command="find.toggleCase" title="find.case" on={find.caseSensitive.value}>
          Cc
        </Tool>
        <Tool command="find.toggleWords" title="find.words" on={find.words.value}>
          W
        </Tool>
        <Tool command="find.toggleRegex" title="find.regex" on={find.regex.value}>
          .*
        </Tool>
        <span class={`find-count ${none || bad ? 'is-none' : ''}`}>{counter}</span>
        <Tool command="find.prev" title="find.prev">
          ↑
        </Tool>
        <Tool command="find.next" title="find.next">
          ↓
        </Tool>
        <Tool command="find.newline" title="find.newline" on={multiline}>
          ⏎
        </Tool>
        <Tool command="find.close" title="find.close">
          ×
        </Tool>
      </div>
      {replace && (
        <div class="find-row" data-keys="find-replace">
          <span class="find-spacer" />
          <input
            class="field find-field"
            placeholder={t('find.replacePlaceholder')}
            value={find.replacement.value}
            spellcheck={false}
            onInput={(event) => find.setReplacement(event.currentTarget.value)}
          />
          <Tool command="find.replaceOne" title="find.replaceOne">
            {t('find.replaceOne')}
          </Tool>
          <Tool command="find.replaceAll" title="find.replaceAll">
            {t('find.replaceAll')}
          </Tool>
        </div>
      )}
    </div>
  );
}
