import { useState } from 'preact/hooks';
import { current, openProject, switchProject, workspaces } from '../state/session.js';

export function Projects() {
  const [root, setRoot] = useState('');
  const list = workspaces.value;
  const active = current.value;

  return (
    <div class="projects">
      <form
        class="open-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (root.trim()) void openProject(root.trim());
        }}
      >
        <input
          class="field"
          placeholder="Путь к проекту, например ~/WebstormProjects/new-ide"
          value={root}
          spellcheck={false}
          onInput={(e) => setRoot((e.target as HTMLInputElement).value)}
        />
        <button class="button" type="submit">
          Открыть
        </button>
      </form>

      {list.length > 0 && (
        <ul class="project-list">
          {list.map((ws) => (
            <li
              key={ws.id}
              class={`project ${ws.id === active?.id ? 'is-current' : ''}`}
              onClick={() => void switchProject(ws.id)}
              title={ws.root}
            >
              <span class="project-name">{ws.name}</span>
              <span class="project-meta">
                {ws.sessions > 0 ? `${ws.sessions} вкл.` : 'фоном'}
                {ws.held.length ? ` · ${ws.held.length} держат` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
