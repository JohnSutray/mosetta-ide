import { activate, plugin, type Ide } from '@mosetta/ide-api/client';
import { SheepField } from './field.js';
import { STYLE } from './style.js';

/**
 * Pixel sheep.
 *
 * An interface should have a face. An empty editor panel is needed on its merits —
 * without it the tree stretches across the whole screen — but since a human is looking
 * at it, let there be something alive there rather than grey emptiness with an apology.
 * This is not a joke for its own sake but part of the same promise as "the interface
 * does not lie".
 *
 * And now it is exactly what it always was in substance: an OPTIONAL ornament, switched
 * off by a line in the settings file. The core knows nothing about sheep; the editor
 * only knows that an empty space can be occupied, and declares a key for it. Who
 * occupies it is not its business.
 */
@plugin({ title: 'plugin.sheep' })
export default class Sheep {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<{ id: string; view: () => unknown }>('editor.empty').add({
      id: 'sheep',
      view: () => <SheepField />,
    });
  }
}
