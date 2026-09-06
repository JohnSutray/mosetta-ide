import { describe, expect, it } from 'vitest';
import { Vocabulary, textIndex } from '../src/text.js';
import { matcher } from '../src/matcher.js';

function rank(query: string, items: string[], vocabulary?: Vocabulary): string[] {
  return items
    .map((item) => ({ item, m: matcher.match(textIndex.of(item, vocabulary), textIndex.fold(query)) }))
    .filter((r) => r.m)
    .sort((a, b) => b.m!.score - a.m!.score || a.item.length - b.item.length)
    .map((r) => r.item);
}

describe('разбор на слова', () => {
  it.each([
    ['DesktopCreditCardForm', ['Desktop', 'Credit', 'Card', 'Form']],
    ['creditCardForm.ts', ['credit', 'Card', 'Form', 'ts']],
    ['MY_VARIABLE', ['MY', 'VARIABLE']],
    ['src/util/helper.ts', ['src', 'util', 'helper', 'ts']],
    ['npm::@distrojs/core::dev', ['npm', 'distrojs', 'core', 'dev']],
    ['HTTPServer', ['HTTP', 'Server']],
    ['parseHTML2Text', ['parse', 'HTML', '2', 'Text']],
    ['ts::EMyRoleEnum.role', ['ts', 'E', 'My', 'Role', 'Enum', 'role']],
  ])('%s', (input, expected) => {
    expect(textIndex.splitPieces(input).map((p) => p.text)).toEqual(expected);
  });
});

describe('словарь проекта', () => {
  const vocabulary = new Vocabulary();
  for (const sample of [
    'desktop/creditCardForm.ts',
    'DesktopCreditCardForm',
    'src/form/formBuilder.ts',
  ]) {
    vocabulary.learn(sample);
  }

  it('раскладывает слипшееся по словам, выученным из проекта', () => {
    expect(vocabulary.segment('creditcardform')).toEqual(['credit', 'card', 'form']);
  });

  it('не выдумывает разбивку из незнакомых слов', () => {
    expect(vocabulary.segment('квартирныйвопрос')).toBeNull();
  });

  it('слипшееся имя ищется по первым буквам слов', () => {
    const item = textIndex.of('creditcardform.ts', vocabulary);
    const withVocabulary = matcher.match(item, 'ccf');
    const without = matcher.match(textIndex.of('creditcardform.ts'), 'ccf');
    expect(withVocabulary!.score).toBeGreaterThan(without!.score);
  });
});

describe('оценка совпадений', () => {
  it('dccf ловит все три формы записи', () => {
    const items = [
      'ts::DesktopCreditCardForm()',
      'desktop/creditCardForm.ts',
      'ts::Desktop.creditCardForm()',
    ];
    expect(rank('dccf', items)).toHaveLength(3);
  });

  it('начала слов важнее случайных букв в середине', () => {
    const ranked = rank('dccf', [
      'ts::advancedCheckoutConfigForm()',
      'ts::DesktopCreditCardForm()',
    ]);
    expect(ranked[0]).toBe('ts::DesktopCreditCardForm()');
  });

  it('одинаково хорошие аббревиатуры обе находятся', () => {
    const ranked = rank('dccf', [
      'ts::DesktopCreditCardForm()',
      'ts::doNotCallCheckFast()',
    ]);
    expect(ranked).toHaveLength(2);
  });

  it('целое слово важнее куска слова', () => {
    const ranked = rank('dev', ['npm::@distrojs/core::dev', 'ts::deviceValueRenderer()']);
    expect(ranked[0]).toBe('npm::@distrojs/core::dev');
  });

  it('префикс пространства имён отбирает свой сорт', () => {
    const items = [
      'npm::@distrojs/core::dev',
      'ts::DesktopCreditCardForm()',
      'desktop/creditCardForm.ts',
    ];
    expect(rank('ts::dccf', items)[0]).toBe('ts::DesktopCreditCardForm()');
    expect(rank('npm::dev', items)[0]).toBe('npm::@distrojs/core::dev');
  });

  it('подряд идущие символы ценнее разбросанных', () => {
    const ranked = rank('form', ['ts::formBuilder()', 'ts::fooOrMore()']);
    expect(ranked[0]).toBe('ts::formBuilder()');
  });

  it('чего нет — того нет', () => {
    expect(matcher.match(textIndex.of('src/main.ts'), 'zzz')).toBeNull();
  });

  it('позиции совпадений указывают на настоящие символы', () => {
    const item = 'ts::DesktopCreditCardForm()';
    const result = matcher.match(textIndex.of(item), 'dccf')!;
    const letters = result.positions.map((p) => item[p]);
    expect(letters).toEqual(['D', 'C', 'C', 'F']);
  });

  it('кириллица ищется, несмотря на разложение с диска', () => {
    const decomposed = 'src/находка.ts'.normalize('NFD');
    expect(matcher.match(textIndex.of(decomposed), textIndex.fold('находка'))).not.toBeNull();
  });
});
