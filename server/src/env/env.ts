import { Exec } from './exec.js';
import { Processes } from './processes.js';
import { ProcessMemory, type Runner } from './memory.js';
import { ShellEnv } from './shell-env.js';
import { Which } from './which.js';

export class Env {
  readonly shellEnv = new ShellEnv();
  readonly which = new Which(this.shellEnv);
  readonly exec = new Exec(this.which);
  readonly memory: ProcessMemory = new ProcessMemory((): Runner => this.processes);
  readonly processes: Processes = new Processes(this.shellEnv, this.exec, this.memory);
}
