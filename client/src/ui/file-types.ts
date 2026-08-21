
export interface FileType {
  label: string;
  color: string;
  ink: string;
}

const LIGHT = '#e8eef2';
const DARK = '#1f2224';

export const PLAIN: FileType = { label: '', color: '#6f7679', ink: LIGHT };

function type(label: string, color: string, ink = LIGHT): FileType {
  return { label, color, ink };
}

const TS = type('TS', '#3178c6');
const JS = type('JS', '#d5b04b', DARK);
const JSON_ = type('{}', '#b5893a', DARK);
const LOCK = type('LK', '#6f7679');
const CONF = type('CF', '#7c8f9e', DARK);
const GENERATED = type('··', '#5a5f61');

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
  yml: type('YM', '#9876aa'),
  yaml: type('YM', '#9876aa'),
  toml: CONF,
  ini: CONF,
  env: CONF,
  lock: LOCK,
  sh: type('$', '#6a8759', DARK),
  zsh: type('$', '#6a8759', DARK),
  bash: type('$', '#6a8759', DARK),
  ps1: type('$', '#4f7fbf'),
  py: type('PY', '#4b8bbe'),
  go: type('GO', '#00add8', DARK),
  rs: type('RS', '#c9713c'),
  java: type('JV', '#cc7832'),
  kt: type('KT', '#8f6fd0'),
  rb: type('RB', '#cc3f33'),
  php: type('PHP', '#787cb5'),
  sql: type('SQL', '#7f9fb0', DARK),
  txt: type('TXT', '#6f7679'),
  log: type('LOG', '#6f7679'),
  map: GENERATED,
  png: type('IM', '#6a8759'),
  jpg: type('IM', '#6a8759'),
  jpeg: type('IM', '#6a8759'),
  gif: type('IM', '#6a8759'),
  webp: type('IM', '#6a8759'),
  avif: type('IM', '#6a8759'),
  ico: type('IM', '#6a8759'),
  woff: type('AA', '#a37acc'),
  woff2: type('AA', '#a37acc'),
  ttf: type('AA', '#a37acc'),
  pdf: type('PDF', '#cc3f33'),
  zip: type('ZIP', '#8a7f6f'),
};

export const BY_NAME: Record<string, FileType> = {
  'package.json': type('npm', '#cb3837'),
  'package-lock.json': LOCK,
  'pnpm-lock.yaml': LOCK,
  'yarn.lock': LOCK,
  'pnpm-workspace.yaml': type('npm', '#8a6a6a'),
  '.gitignore': type('git', '#e0603a'),
  '.gitattributes': type('git', '#e0603a'),
  '.gitmodules': type('git', '#e0603a'),
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
