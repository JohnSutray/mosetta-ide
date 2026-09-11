import type { Plugins } from '../state/plugins.js';

export function PluginSurfaces({ plugins }: { plugins: Plugins }) {
  return <>{plugins.surfaces.value.map((view, at) => <View key={at} render={view} />)}</>;
}

function View({ render }: { render: () => unknown }) {
  return <>{render() as never}</>;
}
