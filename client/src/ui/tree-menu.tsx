import { treeMenu } from '../state/tree-menu.js';
import { tree, treeOps } from '../state/tree-ops.js';
import { Menu, type MenuItem } from '@ide/ui';

export function TreeMenu() {
  const menu = treeMenu.open.value;
  if (!menu) return null;

  const { path, isDir } = menu;
  const many = tree.targets(path).length > 1;
  const items: MenuItem[] = [
    { label: 'tree.newFile', run: () => treeOps.create(path, isDir, 'file') },
    { label: 'tree.newFolder', run: () => treeOps.create(path, isDir, 'dir') },
    ...(many ? [] : [{ label: 'tree.rename', run: () => treeOps.rename(path) }]),
    { label: 'tree.copy', run: () => treeOps.copy(path, false) },
    { label: 'tree.cut', run: () => treeOps.copy(path, true) },
    {
      label: treeOps.clipboard.value ? 'tree.paste' : 'tree.pasteExternal',
      run: () => void treeOps.pasteInto(path, isDir),
    },
    ...(many
      ? []
      : [
          { label: 'tree.copyPath', run: () => void treeOps.copyAbsolutePath(path) },
          { label: 'tree.reveal', run: () => void treeOps.revealInOs(path) },
        ]),
    { label: 'tree.delete', danger: true, run: () => treeOps.remove(path, isDir) },
  ];

  return (
    <Menu
      class="tree-menu"
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={() => {
        treeMenu.open.value = null;
        tree.takeKeyboard();
      }}
    />
  );
}
