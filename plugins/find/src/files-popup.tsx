import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useIde, useT } from '@ide/api/client';
import type CodePlugin from '@ide/plugin-code';
import { EDITOR_DEFAULTS } from '@ide/plugin-code';
import { Popup } from '@ide/ui';
import type { Windows } from '@ide/windows';
import type { FileHit } from './grep.js';
import type { FindFiles } from './files.js';

interface ToolProps {
  keysFor: (command: string) => string[];
  windows: Windows;
  command: string;
  title: string;
  on?: boolean;
  disabled?: boolean;
  children: ComponentChildren;
}

function Tool({ keysFor, windows, command, title, on, disabled, children }: ToolProps) {
  const ide = useIde();
  const t = useT();
  return (
    <button
      type="button"
      class={`find-tool ${on ? 'is-on' : ''}`}
      disabled={disabled}
      onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, t(title), keysFor(command))}
      onMouseLeave={() => windows.tips.hide()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        windows.tips.hide();
        ide.runCommand(command);
      }}
    >
      {children}
    </button>
  );
}

export function FindFilesPopup({ keysFor, windows, files, code }: { keysFor: (command: string) => string[]; windows: Windows; files: FindFiles; code: CodePlugin }) {
  const ide = useIde();
  const t = useT();
  const query = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);
  const mask = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focus = files.focus.value;

  useEffect(() => {
    if (!files.open.value) return;
    const target = focus.field === 'replace' ? replace : focus.field === 'mask' ? mask : query;
    target.current?.focus();
    if (focus.field !== 'mask') target.current?.select();
  }, [files.open.value, focus]);

  useEffect(() => {
    list.current?.querySelector('.fif-row.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [files.selected.value, files.hits.value]);

  const editor = ide.settingsOf('editor', EDITOR_DEFAULTS).value;
  if (!files.open.value) return null;

  const preview = files.preview.value;
  const replacing = files.mode.value === 'replace';
  const total = files.hits.value.length;
  const report = files.report.value;

  return (
    <Popup windows={windows} id="find-files" keys="find-files" class="fif" size={{ w: 1100, h: 640 }} min={{ w: 560, h: 320 }} onClose={() => files.close()}>
      <div class="fif-head">
        <div class="fif-row">
          <span class="fif-icon">⌕</span>
          <input
            ref={query}
            class="fif-input"
            value={files.query.value}
            spellcheck={false}
            placeholder={t('findFiles.placeholder')}
            onFocus={() => files.focusOn('query')}
            onInput={(event) => files.setQuery(event.currentTarget.value)}
          />
          <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleCase" title="find.case" on={files.caseSensitive.value}>
            Cc
          </Tool>
          <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleWords" title="find.words" on={files.words.value}>
            W
          </Tool>
          <Tool keysFor={keysFor} windows={windows} command="findFiles.toggleRegex" title="find.regex" on={files.regex.value}>
            .*
          </Tool>
          <span class={`fif-count ${files.busy.value ? 'is-busy' : ''}`}>
            {files.query.value === '' ? '' : `${total}${files.truncated.value ? '+' : ''} · ${files.files.value} ${t('findFiles.files')}`}
          </span>
          <Tool keysFor={keysFor} windows={windows} command={replacing ? 'find.files' : 'find.filesReplace'} title={replacing ? 'find.hideReplace' : 'find.showReplace'}>
            {replacing ? '▾' : '▸'}
          </Tool>
        </div>
        {replacing && (
          <div class="fif-row">
            <span class="fif-icon">⇄</span>
            <input
              ref={replace}
              class="fif-input"
              value={files.replacement.value}
              spellcheck={false}
              placeholder={t('find.replacePlaceholder')}
              onFocus={() => files.focusOn('replace')}
              onInput={(event) => files.setReplacement(event.currentTarget.value)}
            />
            <Tool keysFor={keysFor} windows={windows} command="findFiles.replaceFile" title="findFiles.replaceFile" disabled={total === 0}>
              {t('findFiles.replaceFile')}
            </Tool>
            <Tool keysFor={keysFor} windows={windows} command="findFiles.replaceAll" title="findFiles.replaceAll" disabled={total === 0}>
              {t('findFiles.replaceAll')}
            </Tool>
          </div>
        )}
        <div class="fif-row fif-masks" data-keys="find-files-mask">
          {files.masks.value.map((one) => (
            <span class={`fif-chip ${files.isOff(one) ? 'is-off' : ''}`} key={one}>
              <button type="button" class="fif-chip-name" onMouseDown={(event) => event.preventDefault()} onClick={() => files.toggleMask(one)}>
                {one}
              </button>
              <button type="button" class="fif-chip-close" onMouseDown={(event) => event.preventDefault()} onClick={() => files.removeMask(one)}>
                ×
              </button>
            </span>
          ))}
          <input
            ref={mask}
            class="fif-mask"
            value={files.maskDraft.value}
            spellcheck={false}
            placeholder={t('findFiles.mask')}
            onFocus={() => files.focusOn('mask')}
            onInput={(event) => (files.maskDraft.value = event.currentTarget.value)}
          />
        </div>
      </div>

      <div class="fif-body">
        <div class="fif-list" ref={list}>
          {files.rows.value.map((row, i) =>
            'header' in row ? (
              <div class="fif-section" key={`h${i}`}>
                <span class="fif-section-path">{row.header}</span>
                <span class="fif-section-count">{row.count}</span>
              </div>
            ) : (
              <Row
                key={`${row.hit.path}:${row.hit.line}:${row.hit.from}`}
                hit={row.hit}
                current={row.at === files.selected.value}
                onPick={() => files.selectAt(row.at)}
                onOpen={() => files.accept()}
              />
            ),
          )}
          {total === 0 && files.query.value !== '' && !files.busy.value && <div class="fif-empty">{t('findFiles.empty')}</div>}
          {files.truncated.value && <div class="fif-note">{t('findFiles.truncated')}</div>}
          {report && (
            <div class="fif-note">
              {t('findFiles.replaced')} {report.replaced} · {report.files} {t('findFiles.files')}
            </div>
          )}
        </div>
        <div class="fif-preview">
          {preview ? (
            <code.View key={preview.path} path={preview.path} text={preview.text} line={preview.line} settings={editor} />
          ) : (
            <div class="fif-empty">{t('findFiles.preview')}</div>
          )}
        </div>
      </div>
    </Popup>
  );
}

function Row({ hit, current, onPick, onOpen }: { hit: FileHit; current: boolean; onPick: () => void; onOpen: () => void }) {
  const text = hit.text;
  const lead = Math.max(0, hit.from - 40);
  const before = text.slice(lead, hit.from);
  const match = text.slice(hit.from, hit.to);
  const after = text.slice(hit.to, hit.to + 120);
  return (
    <div class={`fif-row-hit ${current ? 'is-current' : ''} fif-row`} onMouseMove={current ? undefined : onPick} onClick={onOpen}>
      <span class="fif-line">{hit.line + 1}</span>
      <span class="fif-text">
        {lead > 0 && '…'}
        {before}
        <b>{match}</b>
        {after}
      </span>
    </div>
  );
}
