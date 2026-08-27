import { batch, computed, signal } from '@preact/signals';
import type { IndexHit, IndexKind } from '@ide/protocol';
import { openFileAt, reveal, rpc } from './session.js';
import { pluginOpener } from './plugins.js';

export const searchOpen = signal(false);
export const searchQuery = signal('');
export const searchHits = signal<IndexHit[]>([]);
export const searchSelected = signal(0);
export const searchPreview = signal<{ path: string; text: string; line: number } | null>(null);

export const KIND_TITLE: Record<IndexKind, string> = {
  ts: 'search.kind.ts',
  npm: 'search.kind.npm',
  file: 'search.kind.file',
};

export const searchRows = computed(() => {
  const rows: Array<{ header: string } | { hit: IndexHit; at: number }> = [];
  let previous: IndexKind | null = null;
  searchHits.value.forEach((hit, at) => {
    if (hit.kind !== previous) {
      rows.push({ header: KIND_TITLE[hit.kind] });
      previous = hit.kind;
    }
    rows.push({ hit, at });
  });
  return rows;
});

export const selectedHit = computed(() => searchHits.value[searchSelected.value] ?? null);

function groupByKind(hits: IndexHit[]): IndexHit[] {
  const groups = new Map<IndexKind, IndexHit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.kind);
    if (list) list.push(hit);
    else groups.set(hit.kind, [hit]);
  }
  return [...groups.values()].flat();
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;
let queryToken = 0;

export function openSearch(): void {
  batch(() => {
    searchOpen.value = true;
    searchSelected.value = 0;
  });
  void runQuery(searchQuery.value);
}

export function closeSearch(): void {
  batch(() => {
    searchOpen.value = false;
    searchPreview.value = null;
  });
}

export function setQuery(value: string): void {
  searchQuery.value = value;
  void runQuery(value);
}

async function runQuery(value: string): Promise<void> {
  const token = ++queryToken;
  if (value.trim() === '') {
    batch(() => {
      searchHits.value = [];
      searchSelected.value = 0;
      searchPreview.value = null;
    });
    return;
  }
  try {
    const hits = await rpc.call('index.search', { query: value, limit: 60 });
    if (token !== queryToken) return;
    batch(() => {
      searchHits.value = groupByKind(hits);
      searchSelected.value = 0;
    });
    schedulePreview();
  } catch {
    if (token === queryToken) searchHits.value = [];
  }
}

export function moveSelection(delta: number): void {
  const total = searchHits.value.length;
  if (total === 0) return;
  searchSelected.value = (searchSelected.value + delta + total) % total;
  schedulePreview();
}

export function selectAt(at: number): void {
  searchSelected.value = at;
  schedulePreview();
}

export function acceptSelected(): void {
  const hit = selectedHit.value;
  if (!hit) return;
  closeSearch();

  const opener = pluginOpener(hit.kind);
  if (opener) {
    opener(hit);
    return;
  }

  void openFileAt(hit.path).then(() => {
    if (hit.line !== undefined) reveal(hit.path, hit.line);
  });
}

function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  const hit = selectedHit.value;
  if (!hit) {
    searchPreview.value = null;
    return;
  }
  previewTimer = setTimeout(() => {
    previewTimer = null;
    const token = queryToken;
    void rpc
      .call('doc.state', { path: hit.path })
      .then((doc) => {
        if (token !== queryToken || !searchOpen.value) return;
        searchPreview.value = { path: doc.path, text: doc.text, line: hit.line ?? 0 };
      })
      .catch(() => (searchPreview.value = null));
  }, 90);
}
