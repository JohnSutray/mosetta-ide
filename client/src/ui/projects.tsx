import { useEffect, useRef } from 'preact/hooks';
import { current, switchProject, workspaces } from '../state/session.js';
import {
  acceptPath,
  pathDraft,
  pathSelected,
  pathSuggestions,
  setPathDraft,
} from '../state/projects.js';

export function Projects() {
  const input = useRef<HTMLInputElement>(null);
  const list = workspaces.value;
  const active = current.value;
  const suggestions = pathSuggestions.value;
  const selected = pathSelected.value;

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div class="projects">
      <form
        class="open-form"
        onSubmit={(e) => {
          e.preventDefault();
          acceptPath();
        }}
      >
        <input
          ref={input}
          class="field"
          placeholder="Путь к проекту, например ~/WebstormProjects"
          value={pathDraft.value}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => setPathDraft((e.target as HTMLInputElement).value)}
        />

        <button class="button" type="submit">
          Открыть
        </button>

        {suggestions.length > 0 && (
          <div class="suggest">
            {suggestions.map((item, at) => (
              <div
                key={item.path}
                class={`suggest-row ${at === selected ? 'is-current' : ''}`}
                title={item.path}
                onClick={() => {
                  pathSelected.value = at;
                  acceptPath();
                }}
              >
                {item.name}
              </div>
            ))}
          </div>
        )}
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
