/**
 * The project the demo opens: a small TypeScript library, with a README to render, an
 * image to look at, a test, and a working tree that is not clean — one file changed
 * since the last commit and one not committed at all, so that git and the changes
 * panel have something to show.
 */
export const ROOT = '/demo/pasture';

export const FILES: Record<string, string> = {
  'README.md': `# pasture

A tiny library for herding pixel sheep.

![logo](logo.svg)

\`\`\`ts
import { Flock } from 'pasture';

const flock = new Flock(12);
flock.graze();
console.log(flock.count());
\`\`\`

## Scripts

| script | what it does |
|---|---|
| \`npm run dev\` | serves the playground on :5173 |
| \`npm test\` | runs the tests with vitest |
| \`npm run build\` | builds \`dist/\` |

This project is the demo on [ide.mosetta.org](https://ide.mosetta.org): nothing here runs,
but everything can be opened, searched, edited and diffed.
`,
  'package.json': `{
  "name": "pasture",
  "version": "0.3.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p .",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.9"
  }
}
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
`,
  '.gitignore': `node_modules
dist
`,
  'logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" width="160" height="120" shape-rendering="crispEdges">
  <rect width="16" height="12" fill="#2b2b2b"/>
  <rect x="3" y="3" width="9" height="5" fill="#e8e8e8"/>
  <rect x="2" y="4" width="11" height="3" fill="#e8e8e8"/>
  <rect x="11" y="2" width="3" height="3" fill="#3c3f41"/>
  <rect x="12" y="3" width="1" height="1" fill="#ffc66d"/>
  <rect x="4" y="8" width="1" height="2" fill="#3c3f41"/>
  <rect x="10" y="8" width="1" height="2" fill="#3c3f41"/>
  <rect x="0" y="10" width="16" height="2" fill="#629755"/>
</svg>
`,
  'src/index.ts': `export { Sheep, type Wool } from './sheep.js';
export { Flock } from './flock.js';
export { Pasture, type Patch } from './pasture.js';
export { render } from './render.js';
`,
  'src/sheep.ts': `/** How much wool a sheep carries, from shorn to ready for winter. */
export type Wool = 'shorn' | 'short' | 'fluffy';

/** One sheep: where it stands, how hungry it is, and what it is wearing. */
export class Sheep {
  hunger = 0.5;
  wool: Wool = 'short';

  constructor(
    readonly name: string,
    public x: number,
    public y: number,
  ) {}

  /** Eat a little of the patch it stands on; a full sheep grows wool instead. */
  graze(grass: number): number {
    const bite = Math.min(grass, this.hunger * 0.2);
    this.hunger = Math.max(0, this.hunger - bite);
    if (this.hunger === 0 && this.wool !== 'fluffy') this.wool = this.wool === 'shorn' ? 'short' : 'fluffy';
    return bite;
  }

  /** Wander one step, never off the pasture. */
  wander(width: number, height: number, random = Math.random): void {
    this.x = clamp(this.x + Math.round(random() * 2 - 1), 0, width - 1);
    this.y = clamp(this.y + Math.round(random() * 2 - 1), 0, height - 1);
    this.hunger = Math.min(1, this.hunger + 0.05);
  }

  shear(): boolean {
    if (this.wool !== 'fluffy') return false;
    this.wool = 'shorn';
    return true;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
`,
  'src/flock.ts': `import { Sheep } from './sheep.js';
import { Pasture } from './pasture.js';

const NAMES = ['Dolly', 'Shaun', 'Timmy', 'Bitzer', 'Lamb Chop', 'Baa-bara'];

/** A flock on its pasture. Counting sheep is, of course, the main feature. */
export class Flock {
  readonly sheep: Sheep[] = [];
  readonly pasture: Pasture;

  constructor(size: number, width = 24, height = 12) {
    this.pasture = new Pasture(width, height);
    for (let i = 0; i < size; i++) {
      const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? \` \${Math.floor(i / NAMES.length) + 1}\` : '');
      this.sheep.push(new Sheep(name, i % width, Math.floor(i / width)));
    }
  }

  count(): number {
    return this.sheep.length;
  }

  /** One tick of the day: everyone wanders, then everyone eats where they stand. */
  graze(): void {
    const unused = this.sheep.length;
    for (const one of this.sheep) {
      one.wander(this.pasture.width, this.pasture.height);
      this.pasture.eat(one.x, one.y, one.graze(this.pasture.grassAt(one.x, one.y)));
    }
    this.pasture.grow();
  }

  /** Shear everyone who is ready; returns how many bags of wool that made. */
  shearAll(): number {
    return this.sheep.filter((one) => one.shear()).length;
  }

  hungriest(): Sheep | undefined {
    return [...this.sheep].sort((a, b) => b.hunger - a.hunger)[0];
  }
}
`,
  'src/pasture.ts': `/** One patch of grass: 0 is bare earth, 1 is a meadow. */
export type Patch = number;

export class Pasture {
  private readonly grass: Patch[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.grass = Array.from({ length: width * height }, () => 0.6 + Math.random() * 0.4);
  }

  grassAt(x: number, y: number): Patch {
    return this.grass[y * this.width + x] ?? 0;
  }

  eat(x: number, y: number, amount: number): void {
    const at = y * this.width + x;
    this.grass[at] = Math.max(0, (this.grass[at] ?? 0) - amount);
  }

  /** Grass grows back slowly, and faster where it is already thick. */
  grow(rate = 0.02): void {
    for (let i = 0; i < this.grass.length; i++) {
      const patch = this.grass[i] ?? 0;
      this.grass[i] = Math.min(1, patch + rate * (0.5 + patch));
    }
  }
}
`,
  'src/render.ts': `import type { Flock } from './flock.js';

const GRASS = [' ', '.', ':', '*', '#'];

/** Draw the pasture as text: grass by density, sheep as 'o'. */
export function render(flock: Flock): string {
  const { width, height } = flock.pasture;
  const taken = new Set(flock.sheep.map((one) => one.y * width + one.x));
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      if (taken.has(y * width + x)) row += 'o';
      else row += GRASS[Math.min(GRASS.length - 1, Math.floor(flock.pasture.grassAt(x, y) * GRASS.length))];
    }
    rows.push(row);
  }
  return rows.join('\\n');
}
`,
  'src/styles.css': `:root {
  --grass: #629755;
  --wool: #e8e8e8;
}

.pasture {
  display: grid;
  gap: 1px;
  background: var(--grass);
  font-family: 'JetBrains Mono', monospace;
}

.sheep {
  color: var(--wool);
  animation: bob 1.2s ease-in-out infinite alternate;
}

@keyframes bob {
  to { transform: translateY(-2px); }
}
`,
  'test/flock.test.ts': `import { describe, expect, it } from 'vitest';
import { Flock } from '../src/flock.js';

describe('Flock', () => {
  it('counts its sheep', () => {
    expect(new Flock(12).count()).toBe(12);
  });

  it('names sheep after the classics, then numbers them', () => {
    const flock = new Flock(8);
    expect(flock.sheep[0]?.name).toBe('Dolly');
    expect(flock.sheep[6]?.name).toBe('Dolly 2');
  });

  it('shears nobody on the first day', () => {
    expect(new Flock(5).shearAll()).toBe(0);
  });
});
`,
  'docs/herding.md': `# Herding notes

- Sheep wander one step per tick and never leave the pasture.
- A full sheep grows wool: shorn → short → fluffy.
- Grass grows back faster where it is already thick.

TODO: a sheepdog that keeps the flock together.
`,
};

/**
 * What the last commit holds for the files that changed since. A file missing here
 * and missing from `UNTRACKED` is unchanged.
 */
export const HEAD: Record<string, string> = {
  'src/flock.ts': FILES['src/flock.ts']!.replace(
    `  /** One tick of the day: everyone wanders, then everyone eats where they stand. */
  graze(): void {
    const unused = this.sheep.length;
    for (const one of this.sheep) {`,
    `  graze(): void {
    for (const one of this.sheep) {`,
  ).replace(
    `
  hungriest(): Sheep | undefined {
    return [...this.sheep].sort((a, b) => b.hunger - a.hunger)[0];
  }
`,
    '',
  ),
  'README.md': FILES['README.md']!.replace(
    `
This project is the demo on [ide.mosetta.org](https://ide.mosetta.org): nothing here runs,
but everything can be opened, searched, edited and diffed.
`,
    '',
  ),
};

export const UNTRACKED = ['docs/herding.md'];

/** What the language server "found": one honest warning, for the problems panel. */
export const DIAGNOSTICS: Record<string, Array<{ line: number; from: number; to: number; message: string; code: number }>> = {
  'src/flock.ts': [
    {
      line: 24,
      from: 10,
      to: 16,
      message: "'unused' is declared but its value is never read.",
      code: 6133,
    },
  ],
};
