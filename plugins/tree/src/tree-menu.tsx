import type { Windows } from '@mosetta/ide-plugin-ui';
import { Menu, type MenuItem } from '@mosetta/ide-plugin-ui';
import type { TreeMenuState } from './menu.js';
import type { TreeOps, TreeSelection } from './state.js';

export function TreeMenu({ windows,
  menu,
  selection,
  ops,
}: { windows: Windows;
  menu: TreeMenuState;
  selection: TreeSelection;
  ops: TreeOps;
}) {
  const open = menu.open.value;
  if (!open) return null;

  const { path, isDir } = open;
  const many = selection.targets(path).length > 1;
  const items: MenuItem[] = [
    { label: 'tree.newFile', run: () => ops.create(path, isDir, 'file') },
    { label: 'tree.newFolder', run: () => ops.create(path, isDir, 'dir') },
    ...(many ? [] : [{ label: 'tree.rename', run: () => ops.rename(path) }]),
    { label: 'tree.copy', run: () => ops.copy(path, false) },
    { label: 'tree.cut', run: () => ops.copy(path, true) },
    {
      label: ops.clipboard.value ? 'tree.paste' : 'tree.pasteExternal',
      run: () => void ops.pasteInto(path, isDir),
    },
    ...(many
      ? []
      : [
          { label: 'tree.copyPath', run: () => void ops.copyAbsolutePath(path) },
          { label: 'tree.reveal', run: () => void ops.revealInOs(path) },
        ]),
    { label: 'tree.delete', danger: true, run: () => ops.remove(path, isDir) },
  ];

  return (
    <Menu windows={windows}
      class="tree-menu"
      x={open.x}
      y={open.y}
      items={items}
      onClose={() => {
        menu.close();
        selection.takeKeyboard();
      }}
    />
  );
}
