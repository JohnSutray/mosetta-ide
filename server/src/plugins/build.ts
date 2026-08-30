import { build } from 'esbuild';
import path from 'node:path';

const SHARED: Record<string, { from: string; names: string[] }> = {
  preact: { from: 'preact', names: ['h', 'Fragment', 'createElement', 'render', 'cloneElement'] },
  'preact/hooks': {
    from: 'hooks',
    names: ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useLayoutEffect'],
  },
  '@preact/signals': {
    from: 'signals',
    names: ['signal', 'computed', 'effect', 'batch', 'useSignal'],
  },
  '@ide/api/client': {
    from: 'api',
    names: [
      'PickPopup',
      'highlight',
      'shiftMatches',
      'showTerminal',
      't',
      'problems',
      'openPath',
      'goTo',
      'runCommand',
      'showTip',
      'hideTip',
      'keysFor',
      'settings',
      'Resizer',
      'widthOf',
      'openDoc',
      'editDoc',
      'closeFile',
      'dirty',
      'fileDiagnostics',
      'externalEpoch',
      'pendingReveal',
      'headFor',
      'visit',
      'diffLines',
      'showHunk',
      'askSymbol',
      'hover',
      'takeFocusOnMount',
      'wantsFocus',
      'chordHeld',
      'darcula',
      'textStyle',
      'dc',
      'paintCode',
      'languageFor',
      'inputKeymap',
      'remote',
      'stub',
      'activate',
      'registry',
    ],
  },
  '@ide/api/server': { from: 'api', names: ['command', 'activate'] },

  '@codemirror/state': {
    from: 'cm',
    names: ['EditorState', 'StateEffect', 'StateField', 'Annotation', 'RangeSetBuilder', 'Facet'],
  },
  '@codemirror/view': {
    from: 'cmView',
    names: [
      'EditorView',
      'Decoration',
      'ViewPlugin',
      'WidgetType',
      'GutterMarker',
      'gutter',
      'keymap',
      'lineNumbers',
      'highlightActiveLineGutter',
      'drawSelection',
      'highlightSpecialChars',
      'hoverTooltip',
    ],
  },
  '@codemirror/commands': {
    from: 'cmCommands',
    names: [
      'history',
      'undo',
      'redo',
      'deleteLine',
      'copyLineDown',
      'toggleComment',
      'moveLineUp',
      'moveLineDown',
      'addCursorAbove',
      'addCursorBelow',
      'cursorGroupLeft',
      'cursorGroupRight',
      'selectGroupLeft',
      'selectGroupRight',
      'indentMore',
      'indentLess',
    ],
  },
  '@codemirror/language': {
    from: 'cmLanguage',
    names: ['bracketMatching', 'indentOnInput', 'foldGutter'],
  },
  '@codemirror/search': { from: 'cmSearch', names: ['highlightSelectionMatches'] },
};

export function sharedNames(name: string): string[] {
  return SHARED[name]?.names ?? [];
}

export interface BuiltPlugin {
  code: string;
  ms: number;
}

export async function buildEntry(
  entry: string,
  side: 'client' | 'server',
  peers: string[] = [],
): Promise<BuiltPlugin> {
  const started = Date.now();
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: side === 'client' ? 'browser' : 'node',
    target: 'es2022',
    sourcemap: 'inline',
    sourceRoot: path.dirname(entry),
    jsx: 'automatic',
    jsxImportSource: 'preact',
    logLevel: 'silent',
    ...(side === 'server' ? { packages: 'external' as const } : {}),
    plugins: [
      {
        name: 'ide-peers',
        setup(api) {
          if (peers.length === 0) return;
          const filter = new RegExp(`^(${peers.map(escape).join('|')})$`);
          api.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'ide-peer' }));
          api.onLoad({ filter: /.*/, namespace: 'ide-peer' }, (args) => ({
            contents: `const found = globalThis.__ideApi.plugins.get(${JSON.stringify(args.path)});
if (!found) throw new Error('плагин ${args.path} не поднят — объявите его в "needs"');
export default found;`,
            loader: 'js',
          }));
        },
      },
      {
        name: 'ide-shared',
        setup(api) {
          const keys = Object.keys(SHARED);
          const filter = new RegExp(`^(${keys.map(escape).join('|')})$`);
          api.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'ide-shared' }));
          api.onLoad({ filter: /.*/, namespace: 'ide-shared' }, (args) => ({
            contents: shim(args.path),
            loader: 'js',
          }));
        },
      },
      {
        name: 'ide-jsx',
        setup(api) {
          api.onResolve({ filter: /^preact\/jsx-(dev-)?runtime$/ }, (args) => ({
            path: args.path,
            namespace: 'ide-jsx',
          }));
          api.onLoad({ filter: /.*/, namespace: 'ide-jsx' }, () => ({
            contents: `const r = globalThis.__ideApi.jsx;
export const jsx = r.jsx;
export const jsxs = r.jsxs;
export const jsxDEV = r.jsxDEV ?? r.jsx;
export const Fragment = r.Fragment;`,
            loader: 'js',
          }));
        },
      },
    ],
  });

  const file = result.outputFiles?.[0];
  if (!file) throw new Error('сборка не дала файла');
  return { code: file.text, ms: Date.now() - started };
}

function shim(name: string): string {
  const spec = SHARED[name];
  if (!spec) throw new Error(`нет заглушки для ${name}`);
  const lines = spec.names.map(
    (item) => `export const ${item} = globalThis.__ideApi.${spec.from}.${item};`,
  );
  return [
    `const missing = () => { throw new Error('${name}: приложение не отдало это наружу'); };`,
    `void missing;`,
    ...lines,
  ].join('\n');
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
