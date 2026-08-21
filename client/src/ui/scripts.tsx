import { runScript, scripts, terminals } from '../state/terminals.js';

export function Scripts() {
  const list = scripts.value;
  if (list.length === 0) {
    return <div class="placeholder">В проекте нет package.json со скриптами</div>;
  }

  const running = new Map(terminals.value.map((info) => [info.name, info]));
  let previousPackage = '';

  return (
    <div class="scripts">
      {list.map((script) => {
        const header = script.packageName !== previousPackage ? script.packageName : null;
        previousPackage = script.packageName;
        const terminal = running.get(script.id);
        const mark = terminal ? (terminal.alive ? 'has-terminal' : 'terminal-dead') : '';
        return (
          <div key={script.id}>
            {header && <div class="scripts-package">{header}</div>}
            <div
              class={`script ${mark}`}
              title={script.command}
              onClick={() => void runScript(script.id)}
            >
              <span class="script-name">{script.script}</span>
              <span class="script-command">{script.command}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
