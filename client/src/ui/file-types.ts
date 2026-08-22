
export type GlyphName =
  | 'lock'
  | 'git'
  | 'npm'
  | 'image'
  | 'terminal'
  | 'gear'
  | 'text'
  | 'archive';

export interface FileType {
  label: string;
  color: string;
  ink: string;
  glyph?: GlyphName;
}

const LIGHT = '#e8eef2';
const DARK = '#1f2224';

export const PLAIN: FileType = { label: '', color: '#6f7679', ink: LIGHT };

function type(label: string, color: string, ink = LIGHT): FileType {
  return { label, color, ink };
}

function drawn(label: string, color: string, glyph: GlyphName): FileType {
  return { label, color, ink: LIGHT, glyph };
}

const TS = type('TS', '#3178c6');
const JS = type('JS', '#d5b04b', DARK);
const JSON_ = type('{}', '#b5893a', DARK);
const LOCK = drawn('LK', '#8a8f92', 'lock');
const CONF = drawn('CF', '#8fa2b0', 'gear');
const GENERATED = type('··', '#5a5f61');
const IMAGE = drawn('IM', '#7aa05a', 'image');
const SHELL = drawn('SH', '#7fa06a', 'terminal');
const GIT = drawn('git', '#e0603a', 'git');
const NPM = drawn('npm', '#cb3837', 'npm');
const TEXT = drawn('TXT', '#8a8f92', 'text');

export const BY_EXTENSION: Record<string, FileType> = {
  ts: TS,
  tsx: type('TSX', '#3178c6'),
  mts: TS,
  cts: TS,
  js: JS,
  jsx: type('JSX', '#d5b04b', DARK),
  mjs: JS,
  cjs: JS,
  json: JSON_,
  jsonc: JSON_,
  json5: JSON_,
  md: type('MD', '#6a9fd4'),
  mdx: type('MDX', '#6a9fd4'),
  css: type('CSS', '#4b91d9'),
  scss: type('SC', '#cf649a'),
  sass: type('SC', '#cf649a'),
  less: type('LS', '#3a6ea5'),
  html: type('<>', '#e07b39', DARK),
  htm: type('<>', '#e07b39', DARK),
  xml: type('<>', '#9876aa'),
  svg: type('SVG', '#8fbc5a', DARK),
  vue: type('V', '#41b883', DARK),
  svelte: type('S', '#ff3e00'),
  yml: drawn('YM', '#a08ac0', 'gear'),
  yaml: drawn('YM', '#a08ac0', 'gear'),
  toml: CONF,
  ini: CONF,
  env: CONF,
  lock: LOCK,
  sh: SHELL,
  zsh: SHELL,
  bash: SHELL,
  ps1: drawn('PS', '#6f9ad4', 'terminal'),
  py: type('PY', '#4b8bbe'),
  go: type('GO', '#00add8', DARK),
  rs: type('RS', '#c9713c'),
  java: type('JV', '#cc7832'),
  kt: type('KT', '#8f6fd0'),
  rb: type('RB', '#cc3f33'),
  php: type('PHP', '#787cb5'),
  sql: type('SQL', '#7f9fb0', DARK),
  txt: TEXT,
  log: drawn('LOG', '#8a8f92', 'text'),
  map: GENERATED,
  png: IMAGE,
  jpg: IMAGE,
  jpeg: IMAGE,
  gif: IMAGE,
  webp: IMAGE,
  avif: IMAGE,
  ico: IMAGE,
  woff: type('AA', '#a37acc'),
  woff2: type('AA', '#a37acc'),
  ttf: type('AA', '#a37acc'),
  pdf: type('PDF', '#cc3f33'),
  zip: drawn('ZIP', '#a08f75', 'archive'),
  tar: drawn('TAR', '#a08f75', 'archive'),
  gz: drawn('GZ', '#a08f75', 'archive'),
};

export const BY_NAME: Record<string, FileType> = {
  'package.json': NPM,
  'package-lock.json': LOCK,
  'pnpm-lock.yaml': LOCK,
  'yarn.lock': LOCK,
  'pnpm-workspace.yaml': drawn('npm', '#9a6a6a', 'npm'),
  '.gitignore': GIT,
  '.gitattributes': GIT,
  '.gitmodules': GIT,
  '.npmrc': CONF,
  '.nvmrc': CONF,
  '.editorconfig': CONF,
  '.prettierrc': CONF,
  dockerfile: type('DK', '#2496ed'),
  makefile: type('MK', '#8a7f6f'),
};

export const BY_SUFFIX: Array<[string, FileType]> = [
  ['.d.ts', type('D', '#5a7ea8')],
  ['.tsbuildinfo', GENERATED],
  ['.config.ts', TS],
  ['.config.js', JS],
  ['.test.ts', type('TS', '#4e9a68')],
  ['.test.tsx', type('TSX', '#4e9a68')],
  ['.spec.ts', type('TS', '#4e9a68')],
];

export const BY_PREFIX: Array<[string, FileType]> = [
  ['tsconfig.', TS],
  ['jsconfig.', JS],
  ['.env', CONF],
];

export function fileType(name: string): FileType {
  const key = name.toLowerCase();
  const exact = BY_NAME[key];
  if (exact) return exact;
  for (const [suffix, found] of BY_SUFFIX) {
    if (key.endsWith(suffix)) return found;
  }
  for (const [prefix, found] of BY_PREFIX) {
    if (key.startsWith(prefix)) return found;
  }
  const dot = key.lastIndexOf('.');
  if (dot > 0) {
    const extension = BY_EXTENSION[key.slice(dot + 1)];
    if (extension) return extension;
  }
  return PLAIN;
}
