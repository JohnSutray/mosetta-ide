import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const UI_NAMES = [
  'installUi',
  'Popup',
  'PickPopup',
  'grouped',
  'matches',
  'Menu',
  'activeMenu',
  'Resizer',
  'Tip',
  'tips',
  'popups',
  'activePick',
  'geometry',
  'fuzzy',
  'Icon',
  'FileIcon',
  'DirIcon',
  'RootIcon',
  'Chevron',
  'fileTypes',
];

const CODE_NAMES = [
  'darcula',
  'Darcula',
  'languages',
  'Languages',
  'codePainter',
  'CodePainter',
  'lineDiff',
  'LineDiff',
  'inputMechanics',
  'InputMechanics',
  'CodeView',
];

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
  '@ide/ui': { from: 'ui', names: UI_NAMES },
  '@ide/code': { from: 'code', names: CODE_NAMES },
  '@ide/api/client': {
    from: 'api',
    names: [
      't',
      'problems',
      'goTo',
      'runCommand',
      'keysFor',
      'settings',
      'project',
      'fileTree',
      'fs',
      'openFile',
      'flushDocs',
      'setSetting',
      'primaryHeld',
      'merge',
      'workspaces',
      'openDoc',
      'editDoc',
      'closeFile',
      'dirty',
      'fileDiagnostics',
      'externalEpoch',
      'pendingReveal',
      'visit',
      'hover',
      'definition',
      'references',
      'peekFile',
      'searchIndex',
      'openerFor',
      'takeFocusOnMount',
      'wantsFocus',
      'chordHeld',
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

export interface BuiltPlugin {
  code: string;
  ms: number;
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

export class PluginBuild {
  shared(name: string): string[] {
    return SHARED[name]?.names ?? [];
  }

  async entry(
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
          name: 'ide-externals',
          setup(api) {
            if (side !== 'server') return;
            api.onResolve({ filter: /^[^./]/ }, (args) => {
              if (args.kind === 'entry-point') return null;
              if (SHARED[args.path] || peers.includes(args.path)) return null;
              if (args.path.startsWith('node:')) return { path: args.path, external: true };
              try {
                const found = createRequire(path.join(path.dirname(entry), 'noop.js')).resolve(
                  args.path,
                );
                return { path: pathToFileURL(found).href, external: true };
              } catch {
                return { path: args.path, external: true };
              }
            });
          },
        },
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
}

export const pluginBuild = new PluginBuild();
