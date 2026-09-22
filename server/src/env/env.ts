import { Exec } from './exec.js';
import { Processes } from './processes.js';
import { ProcessMemory, type Runner } from './memory.js';
import { ShellEnv } from './shell-env.js';
import { Which } from './which.js';

/**
 * One server's `env/` axis: the user's environment, lookups along their PATH, launch
 * plans, and the ledger of live processes.
 *
 * These used to be four module-level instances, wired to each other by imports. Two
 * servers in one process (and in tests there are dozens) would have shared one process
 * ledger and one environment cache. Now there is one owner, the connections are
 * arguments, and the order of the fields is the order things come up in.
 */
export class Env {
  readonly shellEnv = new ShellEnv();
  readonly which = new Which(this.shellEnv);
  readonly exec = new Exec(this.which);
  /**
   * How much memory a process tree holds. It runs `ps` through the process ledger — by
   * a lazy reference, because the ledger holds this.
   */
  readonly memory: ProcessMemory = new ProcessMemory((): Runner => this.processes);
  readonly processes: Processes = new Processes(this.shellEnv, this.exec, this.memory);
}
