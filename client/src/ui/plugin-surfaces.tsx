import { pluginSurfaces } from '../state/plugins.js';

export function PluginSurfaces() {
  return <>{pluginSurfaces.value.map((view, at) => <View key={at} render={view} />)}</>;
}

function View({ render }: { render: () => unknown }) {
  return <>{render() as never}</>;
}
