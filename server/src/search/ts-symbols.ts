import type * as TS from 'typescript';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'interface'
  | 'type'
  | 'enum'
  | 'enum-member'
  | 'variable';

export interface TsSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
}

let ts: typeof TS | null = null;

export async function loadTypeScript(): Promise<typeof TS> {
  ts ??= (await import('typescript')).default ?? (await import('typescript'));
  return ts;
}

const SCRIPT_KIND: Record<string, number> = {
  ts: 3,
  mts: 3,
  cts: 3,
  tsx: 4,
  js: 1,
  mjs: 1,
  cjs: 1,
  jsx: 2,
};

export function canParse(extension: string): boolean {
  return extension in SCRIPT_KIND;
}

export function parseSymbols(
  api: typeof TS,
  path: string,
  text: string,
  extension: string,
): TsSymbol[] {
  const kind = SCRIPT_KIND[extension];
  if (kind === undefined) return [];

  const source = api.createSourceFile(
    path,
    text,
    api.ScriptTarget.Latest,
    false,
    kind as TS.ScriptKind,
  );

  const out: TsSymbol[] = [];
  const lineOf = (node: TS.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line;

  const isExported = (node: TS.Node): boolean =>
    (api.getCombinedModifierFlags(node as TS.Declaration) & api.ModifierFlags.Export) !== 0;

  const nameOf = (node: TS.Node | undefined): string | null => {
    if (!node) return null;
    if (api.isIdentifier(node) || api.isPrivateIdentifier(node)) return node.text;
    if (api.isStringLiteral(node) || api.isNumericLiteral(node)) return node.text;
    return null;
  };

  const push = (name: string | null, kind: SymbolKind, node: TS.Node, exported: boolean) => {
    if (!name) return;
    out.push({ name, kind, line: lineOf(node), exported });
  };

  const walkMembers = (owner: string, members: readonly TS.ClassElement[] | readonly TS.TypeElement[]) => {
    for (const member of members) {
      const name = nameOf(member.name);
      if (!name) continue;
      if (
        api.isMethodDeclaration(member) ||
        api.isMethodSignature(member) ||
        api.isConstructorDeclaration?.(member)
      ) {
        push(`${owner}.${name}()`, 'method', member, true);
      } else if (
        api.isPropertyDeclaration(member) ||
        api.isPropertySignature(member) ||
        api.isGetAccessorDeclaration(member) ||
        api.isSetAccessorDeclaration(member)
      ) {
        push(`${owner}.${name}`, 'property', member, true);
      }
    }
  };

  const walk = (statements: readonly TS.Statement[], prefix: string) => {
    for (const node of statements) {
      const exported = isExported(node);

      if (api.isFunctionDeclaration(node)) {
        const name = nameOf(node.name);
        push(name ? `${prefix}${name}()` : null, 'function', node, exported);
        continue;
      }

      if (api.isClassDeclaration(node)) {
        const name = nameOf(node.name);
        if (!name) continue;
        const full = `${prefix}${name}`;
        push(full, 'class', node, exported);
        walkMembers(full, node.members);
        continue;
      }

      if (api.isInterfaceDeclaration(node)) {
        const full = `${prefix}${node.name.text}`;
        push(full, 'interface', node, exported);
        walkMembers(full, node.members);
        continue;
      }

      if (api.isTypeAliasDeclaration(node)) {
        push(`${prefix}${node.name.text}`, 'type', node, exported);
        continue;
      }

      if (api.isEnumDeclaration(node)) {
        const full = `${prefix}${node.name.text}`;
        push(full, 'enum', node, exported);
        for (const member of node.members) {
          const name = nameOf(member.name);
          if (name) push(`${full}.${name}`, 'enum-member', member, true);
        }
        continue;
      }

      if (api.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          const name = nameOf(declaration.name);
          if (!name) continue;
          const init = declaration.initializer;
          const isFunction =
            !!init && (api.isArrowFunction(init) || api.isFunctionExpression(init));
          push(
            `${prefix}${name}${isFunction ? '()' : ''}`,
            isFunction ? 'function' : 'variable',
            declaration,
            exported,
          );
        }
        continue;
      }

      if (api.isModuleDeclaration(node) && node.body && api.isModuleBlock(node.body)) {
        const name = nameOf(node.name) ?? node.name.getText(source);
        walk(node.body.statements, `${prefix}${name}.`);
        continue;
      }
    }
  };

  walk(source.statements, '');
  return out;
}
