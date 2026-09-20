import type { Plugins } from '../state/plugins.js';

/**
 * Where plugins hang their own windows.
 *
 * The frame is the same one the core uses, so the close cross, Escape and the window
 * stack come to them by the fact of being born — a plugin does not have to reinvent the
 * behaviour, and the behaviour cannot drift from ours.
 */
export function PluginSurfaces({ plugins }: { plugins: Plugins }) {
  return <>{plugins.surfaces.value.map((view, at) => <View key={at} render={view} />)}</>;
}

function View({ render }: { render: () => unknown }) {
  return <>{render() as never}</>;
}
