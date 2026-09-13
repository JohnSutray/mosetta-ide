import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Keymap } from '@mosetta/ide-protocol';
import { journal } from '../log.js';
import { defaults } from './defaults.js';
import { jsonc } from './jsonc.js';
import { patch } from './patch.js';
import type { KeymapRules } from './store.js';

const log = journal.logger('config');

export class LegacyKeymap {
  constructor(private readonly rules: KeymapRules) {}

  async retire(dir: string): Promise<void> {
    const old = path.join(dir, 'keymap.json');
    const retired = `${old}.retired`;
    try {
      await fsp.rename(old, retired);
    } catch {
      return;
    }

    let raw: string;
    try {
      raw = await fsp.readFile(retired, 'utf8');
    } catch {
      return;
    }
    const mine = this.rules.validate(this.parse(raw, retired));
    const diff = this.rules.diff(this.rules.validate(defaults.keymap()), mine);
    if (diff.bindings.length === 0) {
      log.info('раскладка совпадала с заводской — в settings.json переносить нечего');
    } else {
      await this.moveIn(dir, diff);
    }
    log.warn(`${old} больше не читается — раскладка живёт разделом keymap в settings.json (ADR-0214)`);
  }

  private async moveIn(dir: string, diff: Keymap): Promise<void> {
    const file = path.join(dir, 'settings.json');
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {}
    const result = patch.section(
      text,
      'keymap',
      JSON.stringify(diff, null, 2),
      'Чем моя раскладка отличается от заводской (ADR-0214). Заводская — в поставке,',
    );
    if (result.text === text) {
      log.warn('в settings.json уже есть раздел keymap — оставляю как есть');
      return;
    }
    const temp = `${file}.moving-${process.pid}`;
    await fsp.writeFile(temp, result.text, 'utf8');
    await fsp.rename(temp, file);
    log.warn(`раскладка переехала в settings.json: ${diff.bindings.length} личных строк`);
  }

  private parse(raw: string, where: string): Keymap | null {
    try {
      return jsonc.parse<Keymap>(raw, where);
    } catch (err) {
      log.error(`старый keymap.json не разобран, переносить нечего: ${String(err)}`);
      return null;
    }
  }
}
