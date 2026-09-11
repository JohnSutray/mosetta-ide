import { activate, type Ide } from '@mosetta/ide-api/client';
import { SheepField } from './field.js';
import { STYLE } from './style.js';

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
