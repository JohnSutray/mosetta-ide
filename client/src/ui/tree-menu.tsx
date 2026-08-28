import { treeMenu } from '../state/tree-menu.js';
import {
  askCreate,
  askRemove,
  askRename,
  clipboard,
  copyAbsolutePath,
  copyToClipboard,
  pasteInto,
  focusTree,
  revealInOs,
  targets,
} from '../state/tree-ops.js';
import { Menu, type MenuItem } from './menu.js';

export function TreeMenu() {
  const menu = treeMenu.value;
  if (!menu) return null;

  const { path, isDir } = menu;
  const many = targets(path).length > 1;
  const items: MenuItem[] = [
    { label: 'tree.newFile', run: () => askCreate(path, isDir, 'file') },
    { label: 'tree.newFolder', run: () => askCreate(path, isDir, 'dir') },
    ...(many ? [] : [{ label: 'tree.rename', run: () => askRename(path) }]),
    { label: 'tree.copy', run: () => copyToClipboard(path, false) },
    { label: 'tree.cut', run: () => copyToClipboard(path, true) },
    {
      label: clipboard.value ? 'tree.paste' : 'tree.pasteExternal',
      run: () => void pasteInto(path, isDir),
    },
    ...(many
      ? []
      : [
          { label: 'tree.copyPath', run: () => void copyAbsolutePath(path) },
          { label: 'tree.reveal', run: () => void revealInOs(path) },
        ]),
    { label: 'tree.delete', danger: true, run: () => askRemove(path, isDir) },
  ];

  return (
    <Menu
      class="tree-menu"
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={() => {
        treeMenu.value = null;
        focusTree();
      }}
    />
  );
}
