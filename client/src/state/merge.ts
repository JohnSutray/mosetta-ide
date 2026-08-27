import { batch, computed, signal } from '@preact/signals';
import type { MergeFile, MergeSession } from '@ide/protocol';
import { complain, expectExternal, forgetDiverged, rpc, say, whenSaveConflicts } from './session.js';
import { t } from '../i18n/index.js';
import {
  allDecided,
  buildText,
  defaultChoices,
  diff3,
  takeSide,
  undecided,
  type Choice,
  type Region,
  type SideChoice,
} from '../merge/diff3.js';

export const mergeSession = signal<MergeSession | null>(null);
export const mergeOpen = signal(false);
export const mergePath = signal<string | null>(null);
const decisions = signal<Map<string, Choice[]>>(new Map());
const cursorRaw = signal<number | null>(null);

export const mergePending = computed(
  () => mergeSession.value?.files.filter((file) => !file.done).length ?? 0,
);

export const mergeFile = computed<MergeFile | null>(() => {
  const session = mergeSession.value;
  if (!session) return null;
  const wanted = mergePath.value;
  return (
    session.files.find((file) => file.path === wanted) ??
    session.files.find((file) => !file.done) ??
    session.files[0] ??
    null
  );
});

export const mergeRegions = computed<Region[]>(() => {
  const file = mergeFile.value;
  if (!file || file.left.text === null || file.right.text === null) return [];
  return diff3(file.base ?? '', file.left.text, file.right.text);
});

export const mergeChoices = computed<Choice[]>(() => {
  const file = mergeFile.value;
  const regions = mergeRegions.value;
  if (!file) return [];
  const stored = decisions.value.get(file.path);
  if (stored && stored.length === regions.length) return stored;
  return defaultChoices(regions);
});

export const mergeResult = computed(() => buildText(mergeRegions.value, mergeChoices.value));

export const mergeReady = computed(() => {
  const file = mergeFile.value;
  if (!file) return false;
  if (file.left.text === null || file.right.text === null) return false;
  return allDecided(mergeRegions.value, mergeChoices.value);
});

export const mergeConflicts = computed(() =>
  mergeRegions.value
    .map((region, at) => ({ region, at }))
    .filter(({ region }) => region.kind === 'conflict')
    .map(({ at }) => at),
);

export const mergeCursor = computed(() => {
  const raw = cursorRaw.value;
  if (raw !== null && mergeRegions.value[raw]) return raw;
  return mergeConflicts.value[0] ?? 0;
});

export function setMergeCursor(at: number): void {
  cursorRaw.value = at;
}

export const mergeLeft = computed(() => {
  const regions = mergeRegions.value;
  const choices = mergeChoices.value;
  return regions.filter((region, at) => undecided(region, choices[at] ?? { left: null, right: null }))
    .length;
});

const promised = new Set<string>();

export function openMergeFor(path: string): void {
  if (focusOn(path)) return;
  promised.add(path);
}

function focusOn(path: string): boolean {
  const file = mergeSession.value?.files.find((item) => item.path === path && !item.done);
  if (!file) return false;
  batch(() => {
    mergePath.value = path;
    cursorRaw.value = null;
    mergeOpen.value = true;
  });
  return true;
}

whenSaveConflicts(openMergeFor);

export async function mergeFromDisk(path: string): Promise<void> {
  try {
    const session = await rpc.call('doc.mergeFromDisk', { path });
    batch(() => {
      mergeSession.value = session;
      if (session) {
        mergePath.value = path;
        cursorRaw.value = null;
        mergeOpen.value = true;
      }
    });
  } catch (err) {
    complain(describeMerge(err));
  }
}

export function showMerge(): void {
  if (!mergeSession.value) {
    say(t('merge.none'));
    return;
  }
  mergeOpen.value = true;
}

export function closeMerge(): void {
  mergeOpen.value = false;
}

export function toggleMerge(): void {
  if (mergeOpen.value) closeMerge();
  else showMerge();
}

export function pickMergeFile(path: string): void {
  batch(() => {
    mergePath.value = path;
    cursorRaw.value = null;
  });
}

export function stepMergeFile(delta: number): void {
  const session = mergeSession.value;
  const current = mergeFile.value;
  if (!session || !current) return;
  const at = session.files.findIndex((file) => file.path === current.path);
  const next = session.files[(at + delta + session.files.length) % session.files.length];
  if (next) pickMergeFile(next.path);
}

export function stepMergeConflict(delta: number): void {
  const spots = mergeConflicts.value;
  if (spots.length === 0) return;
  const here = mergeCursor.value;
  const at = spots.indexOf(here);
  if (at === -1) {
    const forward = spots.find((spot) => spot > here);
    const back = [...spots].reverse().find((spot) => spot < here);
    cursorRaw.value = (delta > 0 ? forward : back) ?? (delta > 0 ? spots[0]! : spots.at(-1)!);
    return;
  }
  cursorRaw.value = spots[(at + delta + spots.length) % spots.length]!;
}

export function decide(at: number, side: 'left' | 'right', choice: SideChoice): void {
  const file = mergeFile.value;
  if (!file) return;
  const next = mergeChoices.value.map((item) => ({ ...item }));
  const target = next[at];
  if (!target) return;
  target[side] = choice;
  if (mergeRegions.value[at]?.kind === 'both') {
    target.left = choice;
    target.right = choice;
  }
  remember(file.path, next);
}

export function decideHere(side: 'left' | 'right', choice: SideChoice): void {
  decide(mergeCursor.value, side, choice);
  if (choice !== null) stepMergeConflict(1);
}

export function acceptSide(side: 'left' | 'right'): void {
  const file = mergeFile.value;
  if (!file) return;
  if (file.left.text === null || file.right.text === null) {
    void resolveMerge(side === 'left' ? file.left.text : file.right.text);
    return;
  }
  remember(file.path, takeSide(mergeRegions.value, side));
}

export async function resolveMerge(text?: string | null): Promise<void> {
  const file = mergeFile.value;
  if (!file) return;
  const payload = text === undefined ? mergeResult.value : text;
  expectExternal(file.path);
  try {
    const rest = await rpc.call('merge.resolve', { path: file.path, text: payload });
    forgetDiverged(file.path);
    batch(() => {
      mergeSession.value = rest;
      decisions.value = drop(decisions.value, file.path);
      cursorRaw.value = null;
      mergePath.value = rest?.files.find((item) => !item.done)?.path ?? null;
      if (!rest) mergeOpen.value = false;
    });
    if (!rest) say(t('merge.done'));
  } catch (err) {
    complain(describeMerge(err));
  }
}

export async function cancelMerge(): Promise<void> {
  try {
    await rpc.call('merge.cancel', null);
  } catch (err) {
    complain(describeMerge(err));
    return;
  }
  batch(() => {
    mergeSession.value = null;
    mergeOpen.value = false;
    decisions.value = new Map();
  });
}

export async function loadMerge(): Promise<void> {
  try {
    mergeSession.value = await rpc.call('merge.state', null);
  } catch {
    mergeSession.value = null;
  }
}

export function resetMerge(): void {
  batch(() => {
    mergeSession.value = null;
    mergeOpen.value = false;
    mergePath.value = null;
    cursorRaw.value = null;
    decisions.value = new Map();
    promised.clear();
  });
}

export function isUndecided(at: number): boolean {
  const region = mergeRegions.value[at];
  const choice = mergeChoices.value[at];
  if (!region || !choice) return false;
  return undecided(region, choice);
}

function remember(path: string, choices: Choice[]): void {
  const next = new Map(decisions.value);
  next.set(path, choices);
  decisions.value = next;
}

function drop(map: Map<string, Choice[]>, path: string): Map<string, Choice[]> {
  const next = new Map(map);
  next.delete(path);
  return next;
}

function describeMerge(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

rpc.on('merge.state', (state) => {
  const had = mergeSession.value !== null;
  mergeSession.value = state;
  if (!state) {
    batch(() => {
      mergeOpen.value = false;
      mergePath.value = null;
      decisions.value = new Map();
    });
    return;
  }
  for (const path of [...promised]) {
    if (focusOn(path)) promised.delete(path);
  }

  if (!had) say(t('merge.appeared', { count: String(state.files.length) }));
});
