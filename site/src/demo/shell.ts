import type { DemoFiles } from './memory.js';

const PROMPT = '\x1b[32mpasture\x1b[0m \x1b[90m$\x1b[0m ';

/**
 * A pretend shell for the demo's terminals. It has a line editor and a handful of
 * commands that read the demo project, so the terminal panel, its chips and its
 * survival across a reload can be shown without a machine behind them. It never
 * pretends to be more than that: anything it does not know says the real thing is a pty.
 */
export class PretendShell {
  private line = '';
  private running: ReturnType<typeof setInterval> | null = null;
  buffer = '';

  constructor(
    private readonly files: DemoFiles,
    private readonly git: () => string[],
    private readonly out: (data: string) => void,
  ) {}

  start(command?: string): void {
    this.print('\x1b[90mThis is a pretend shell: the real terminal is a pty on your machine. Try `help`.\x1b[0m\r\n');
    if (command) {
      this.print(PROMPT + command + '\r\n');
      this.run(command);
    } else this.print(PROMPT);
  }

  get busy(): boolean {
    return this.running !== null;
  }

  write(data: string): void {
    for (const ch of data) {
      if (ch === '\x03') {
        if (this.running) {
          clearInterval(this.running);
          this.running = null;
        }
        this.line = '';
        this.print('^C\r\n' + PROMPT);
      } else if (this.running) continue;
      else if (ch === '\r') {
        this.print('\r\n');
        const line = this.line.trim();
        this.line = '';
        if (line) this.run(line);
        if (!this.running) this.print(PROMPT);
      } else if (ch === '\x7f') {
        if (this.line.length === 0) continue;
        this.line = this.line.slice(0, -1);
        this.print('\b \b');
      } else if (ch === '\x0c') {
        this.print('\x1b[2J\x1b[H' + PROMPT + this.line);
      } else if (ch >= ' ') {
        this.line += ch;
        this.print(ch);
      }
    }
  }

  private print(text: string): void {
    this.buffer = (this.buffer + text).slice(-20_000);
    this.out(text);
  }

  private say(lines: string[]): void {
    this.print(lines.join('\r\n') + '\r\n');
  }

  private run(line: string): void {
    const [name = '', ...args] = line.split(/\s+/);
    switch (name) {
      case 'help':
        return this.say([
          'ls [dir]     list a directory of the demo project',
          'cat <file>   print a file (unsaved edits included)',
          'git status   what changed since the last commit',
          'npm test     run the tests (pretend)',
          'npm run dev  start the dev server (pretend; Ctrl+C stops it)',
          'clear        clear the screen',
        ]);
      case 'ls': {
        const dir = (args[0] ?? '').replace(/^\.\/?/, '').replace(/\/$/, '');
        if (dir !== '' && !this.files.isDir(dir)) return this.say([`ls: ${dir}: No such file or directory`]);
        return this.say([
          this.files
            .list(dir)
            .map((one) => (one.kind === 'dir' ? `\x1b[34m${one.name}/\x1b[0m` : one.name))
            .join('  '),
        ]);
      }
      case 'cat': {
        const path = (args[0] ?? '').replace(/^\.\//, '');
        if (!this.files.has(path)) return this.say([`cat: ${path}: No such file or directory`]);
        return this.say(this.files.state(path).text.replace(/\n$/, '').split('\n'));
      }
      case 'pwd':
        return this.say(['/demo/pasture']);
      case 'echo':
        return this.say([args.join(' ')]);
      case 'clear':
        return this.print('\x1b[2J\x1b[H');
      case 'whoami':
        return this.say(['visitor']);
      case 'git':
        if (args[0] === 'status') {
          const lines = this.git();
          return this.say(['On branch main', ...(lines.length ? ['Changes:', ...lines.map((one) => `  ${one}`)] : ['nothing to commit, working tree clean'])]);
        }
        return this.say([`git: '${args[0] ?? ''}' is not something the pretend shell knows. Try the git panel.`]);
      case 'npm':
      case 'pnpm':
        if (args[0] === 'test' || (args[0] === 'run' && args[1] === 'test')) return this.test();
        if (args[0] === 'run' && args[1] === 'dev') return this.dev();
        if (args[0] === 'run' && args[1] === 'build') return this.say(['', '> pasture@0.3.0 build', '> tsc -p .', '']);
        return this.say([`${name}: the pretend shell knows \`${name} test\`, \`${name} run dev\` and \`${name} run build\`.`]);
      default:
        return this.say([`${name}: command not found — this is a pretend shell; the real terminal is a pty on your machine`]);
    }
  }

  private test(): void {
    this.say([
      '',
      '> pasture@0.3.0 test',
      '> vitest run',
      '',
      ' \x1b[32m✓\x1b[0m test/flock.test.ts (3 tests) 4ms',
      '',
      ' Test Files  \x1b[32m1 passed\x1b[0m (1)',
      '      Tests  \x1b[32m3 passed\x1b[0m (3)',
      '',
    ]);
  }

  private dev(): void {
    this.say([
      '',
      '> pasture@0.3.0 dev',
      '> vite',
      '',
      '  \x1b[32mVITE v6.0.5\x1b[0m  ready in 212 ms',
      '',
      '  ➜  Local:   \x1b[36mhttp://localhost:5173/\x1b[0m',
      '',
    ]);
    let tick = 0;
    this.running = setInterval(() => {
      tick += 1;
      this.print(`\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m [vite] page reload src/flock.ts \x1b[90m(x${tick})\x1b[0m\r\n`);
    }, 4000);
  }
}
