import { describe, expect, it } from 'vitest';
import { Vocabulary, textIndex } from '../src/text.js';
import { matcher } from '../src/matcher.js';

/** Sort the variants by how the matcher scored them. */
function rank(query: string, items: string[], vocabulary?: Vocabulary): string[] {
  return items
    .map((item) => ({ item, m: matcher.match(textIndex.of(item, vocabulary), textIndex.fold(query)) }))
    .filter((r) => r.m)
    .sort((a, b) => b.m!.score - a.m!.score || a.item.length - b.item.length)
    .map((r) => r.item);
}

describe('splitting into words', () => {
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

describe('the project\'s vocabulary', () => {
  const vocabulary = new Vocabulary();
  for (const sample of [
    'desktop/creditCardForm.ts',
    'DesktopCreditCardForm',
    'src/form/formBuilder.ts',
  ]) {
    vocabulary.learn(sample);
  }

  it('it takes glued-together text apart into words learned from the project', () => {
    expect(vocabulary.segment('creditcardform')).toEqual(['credit', 'card', 'form']);
  });

  it('it does not invent a split out of unknown words', () => {
    expect(vocabulary.segment('housingproblem')).toBeNull();
  });

  it('a glued-together name is found by the words\' first letters', () => {
    const item = textIndex.of('creditcardform.ts', vocabulary);
    const withVocabulary = matcher.match(item, 'ccf');
    const without = matcher.match(textIndex.of('creditcardform.ts'), 'ccf');
    expect(withVocabulary!.score).toBeGreaterThan(without!.score);
  });
});

describe('scoring matches', () => {
  it('dccf catches all three ways of writing it', () => {
    const items = [
      'ts::DesktopCreditCardForm()',
      'desktop/creditCardForm.ts',
      'ts::Desktop.creditCardForm()',
    ];
    expect(rank('dccf', items)).toHaveLength(3);
  });

  it('word beginnings matter more than random letters in the middle', () => {
    const ranked = rank('dccf', [
      'ts::advancedCheckoutConfigForm()',
      'ts::DesktopCreditCardForm()',
    ]);
    expect(ranked[0]).toBe('ts::DesktopCreditCardForm()');
  });

  it('two equally good abbreviations are both found', () => {
    const ranked = rank('dccf', [
      'ts::DesktopCreditCardForm()',
      'ts::doNotCallCheckFast()',
    ]);
    expect(ranked).toHaveLength(2);
  });

  it('a whole word matters more than a piece of a word', () => {
    const ranked = rank('dev', ['npm::@distrojs/core::dev', 'ts::deviceValueRenderer()']);
    expect(ranked[0]).toBe('npm::@distrojs/core::dev');
  });

  it('a namespace prefix picks out its own kind', () => {
    const items = [
      'npm::@distrojs/core::dev',
      'ts::DesktopCreditCardForm()',
      'desktop/creditCardForm.ts',
    ];
    expect(rank('ts::dccf', items)[0]).toBe('ts::DesktopCreditCardForm()');
    expect(rank('npm::dev', items)[0]).toBe('npm::@distrojs/core::dev');
  });

  it('consecutive characters are worth more than scattered ones', () => {
    const ranked = rank('form', ['ts::formBuilder()', 'ts::fooOrMore()']);
    expect(ranked[0]).toBe('ts::formBuilder()');
  });

  it('what is not there is not there', () => {
    expect(matcher.match(textIndex.of('src/main.ts'), 'zzz')).toBeNull();
  });

  it('the match positions point at the real characters', () => {
    const item = 'ts::DesktopCreditCardForm()';
    const result = matcher.match(textIndex.of(item), 'dccf')!;
    const letters = result.positions.map((p) => item[p]);
    expect(letters).toEqual(['D', 'C', 'C', 'F']);
  });

  it('Cyrillic is found despite the decomposition disk hands over', () => {
    const decomposed = 'src/находка.ts'.normalize('NFD');
    expect(matcher.match(textIndex.of(decomposed), textIndex.fold('находка'))).not.toBeNull();
  });
});
