import { useMemo, useRef } from 'preact/hooks';
import { useT } from '@mosetta/ide-api/client';
import type { Chunk } from '@mosetta/ide-plugin-code';
import type { Diff, DiffRow } from './diff.js';
import type { DiffMode } from './settings.js';

type Painted = { old: Chunk[][]; now: Chunk[][] };

export function DiffView({
  diff,
  paint,
  mode,
  onRevert,
}: {
  diff: Diff;
  paint: (text: string, path: string) => Chunk[];
  mode: DiffMode;
  onRevert: ((hunk: number) => void) | null;
}) {
  const t = useT();
  const path = diff.path.value;
  const before = diff.before.value;
  const after = diff.after.value;

  const painted = useMemo(
    () => ({ old: lines(before, path, paint), now: lines(after, path, paint) }),
    [before, after, path],
  );

  if (!path) return null;
  if (diff.busy.value) return <div class="dif-note">{t('changes.diffLoading')}</div>;
  if (diff.error.value !== '') return <div class="dif-note is-bad">{diff.error.value}</div>;
  if (diff.blocks().length === 0) {
    return <div class="dif-note">{t(diff.deleted.value ? 'changes.diffGone' : 'changes.diffSame')}</div>;
  }

  return mode === 'split' ? (
    <Split diff={diff} painted={painted} onRevert={onRevert} />
  ) : (
    <Unified diff={diff} painted={painted} onRevert={onRevert} />
  );
}

function RevertHunk({ hunk, onRevert }: { hunk: number; onRevert: (hunk: number) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      class="dif-revert"
      title={t('changes.diffRevertHunk')}
      onClick={(event) => {
        event.stopPropagation();
        onRevert(hunk);
      }}
    >
      <RevertIcon />
    </button>
  );
}

function RevertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3.5 7.5a5 5 0 1 1 1.6 4.3" />
      <path d="M2 3.6v4h4" />
    </svg>
  );
}

function Unified({
  diff,
  painted,
  onRevert,
}: {
  diff: Diff;
  painted: Painted;
  onRevert: ((hunk: number) => void) | null;
}) {
  return (
    <div class="dif">
      {diff.blocks().map((block, at) =>
        block.kind === 'fold' ? (
          <Fold key={`fold-${block.id}`} diff={diff} id={block.id} lines={block.lines} />
        ) : (
          <div class="dif-rows" key={`rows-${at}`}>
            {block.rows.map((row, i) => (
              <div class={`dif-row is-${row.kind}`} key={`${row.kind}-${row.old ?? 0}-${row.now ?? 0}`}>
                <span class="dif-no">{row.old ?? ''}</span>
                <span class="dif-no">{row.now ?? ''}</span>
                <span class="dif-sign">{sign(row.kind)}</span>
                <Text row={row} painted={painted} />
                {onRevert && row.hunk !== null && row.hunk !== block.rows[i - 1]?.hunk && (
                  <RevertHunk hunk={row.hunk} onRevert={onRevert} />
                )}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function Split({
  diff,
  painted,
  onRevert,
}: {
  diff: Diff;
  painted: Painted;
  onRevert: ((hunk: number) => void) | null;
}) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollTop = from.scrollTop;
    syncing.current = false;
  };

  const sides = diff.sides();
  const side = (which: 'left' | 'right') =>
    sides.map((block, at) =>
      block.kind === 'fold' ? (
        <Fold key={`fold-${block.id}`} diff={diff} id={block.id} lines={block.lines} />
      ) : (
        <div class="dif-rows" key={`pairs-${at}`}>
          {block.pairs.map((pair, i) => {
            const row = which === 'left' ? pair.left : pair.right;
            if (!row) return <div class="dif-row is-none" key={`gap-${i}`} />;
            const first =
              which === 'right' &&
              row.hunk !== null &&
              row.hunk !== (block.pairs[i - 1]?.right?.hunk ?? null);
            return (
              <div class={`dif-row is-${row.kind}`} key={`${row.kind}-${row.old ?? 0}-${row.now ?? 0}`}>
                <span class="dif-no">{(which === 'left' ? row.old : row.now) ?? ''}</span>
                <span class="dif-sign">{sign(row.kind)}</span>
                <Text row={row} painted={painted} />
                {onRevert && first && <RevertHunk hunk={row.hunk!} onRevert={onRevert} />}
              </div>
            );
          })}
        </div>
      ),
    );

  return (
    <div class="dif is-split">
      <div class="dif-side" ref={left} onScroll={() => sync(left.current, right.current)}>
        {side('left')}
      </div>
      <div class="dif-side" ref={right} onScroll={() => sync(right.current, left.current)}>
        {side('right')}
      </div>
    </div>
  );
}

function Fold({ diff, id, lines: count }: { diff: Diff; id: number; lines: number }) {
  const t = useT();
  return (
    <button type="button" class="dif-fold" onClick={() => diff.toggleFold(id)}>
      {t('changes.diffFold', { lines: count })}
    </button>
  );
}

function Text({ row, painted }: { row: DiffRow; painted: Painted }) {
  const from = row.kind === 'del' ? painted.old : painted.now;
  const at = (row.kind === 'del' ? row.old : row.now) ?? 0;
  const chunks = from[at - 1] ?? [{ text: row.text, color: null }];
  return (
    <span class="dif-text">
      {chunks.map((chunk, i) => (
        <span key={i} style={chunk.color ? { color: chunk.color } : undefined}>
          {chunk.text}
        </span>
      ))}
      {chunks.length === 0 && ' '}
    </span>
  );
}

function sign(kind: DiffRow['kind']): string {
  return kind === 'ins' ? '+' : kind === 'del' ? '−' : '';
}

function lines(text: string, path: string | null, paint: (text: string, path: string) => Chunk[]): Chunk[][] {
  if (text === '' || !path) return [];
  const out: Chunk[][] = [[]];
  for (const chunk of paint(text, path)) {
    const parts = chunk.text.split('\n');
    parts.forEach((part: string, i: number) => {
      if (i > 0) out.push([]);
      if (part !== '') out[out.length - 1]!.push({ text: part, color: chunk.color });
    });
  }
  return out;
}
