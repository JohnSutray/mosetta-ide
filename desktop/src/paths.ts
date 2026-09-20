import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/**
 * Where an installed IDE lives.
 *
 * `~/.mosetta/ide` is a subdirectory of its own: `~/.mosetta` is shared with the same
 * publisher's framework. Inside it are the config (handy to put in git, to sync between
 * machines), the server's state, the logs and the installed versions.
 */
export class DesktopPaths {
  readonly home = path.join(os.homedir(), '.mosetta', 'ide');
  readonly config = path.join(this.home, 'config');
  readonly state = path.join(this.home, 'state');
  /**
   * The daemon's logs are next to it rather than inside `state`: the server moves the
   * state directory from its old place once, and occupied space would cancel that move.
   */
  readonly logs = path.join(this.home, 'logs');
  private readonly require: ReturnType<typeof createRequire>;

  /**
   * `pkg` is the `@mosetta/ide` package's directory: in the repository that is
   * `desktop/`, in an installation `node_modules/@mosetta/ide`. The neighbours are
   * looked up by name.
   */
  constructor(readonly pkg: string) {
    this.require = createRequire(path.join(pkg, 'package.json'));
  }

  /** What was built on this machine: the client and the main process. */
  get build(): string {
    return path.join(this.pkg, '.build');
  }

  get client(): string {
    return path.join(this.build, 'client');
  }

  get assets(): string {
    return path.join(this.pkg, 'assets');
  }

  get server(): string {
    return path.dirname(this.require.resolve('@mosetta/ide-server/package.json'));
  }
}
