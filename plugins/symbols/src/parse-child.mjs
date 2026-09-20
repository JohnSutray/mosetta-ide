/**
 * Parsing symbols in a SEPARATE process.
 *
 * Why a process rather than a thread or a parser of our own: TypeScript's parse tree
 * costs tens of megabytes per file, and V8 does not give that memory back to the
 * operating system even after garbage collection. Measured on a built bundle of 760 KB:
 * 61 MB of RSS in the daemon, and it stayed there for good. A process that has exited
 * gives everything back at once.
 *
 * The parser is THE VERY SAME one, though: the symbols are complete, with no
 * approximations. A lexer with no tree, and other people's grammars (lezer,
 * tree-sitter), were rejected — they would be catching up with the reference
 * implementation, with unpredictable divergences.
 *
 * The conversation is JSON lines on stdin and stdout: one line per request, one per
 * answer. The path to TypeScript itself arrives as an argument: the child looks for its
 * dependencies where they were installed for the plugin rather than where it was
 * started from.
 */
import { createRequire } from 'node:module';
import readline from 'node:readline';

const ts = createRequire(process.argv[2]).call(null, 'typescript');
const SCRIPT_KIND = { ts: 3, mts: 3, cts: 3, tsx: 4, js: 1, mjs: 1, cjs: 1, jsx: 2 };

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let ask;
  try {
    ask = JSON.parse(line);
  } catch {
    return;
  }
  const answer = { id: ask.id, files: {} };
  for (const file of ask.files ?? []) {
    try {
      answer.files[file.path] = symbolsOf(file.path, file.text, file.ext);
    } catch (err) {
      answer.files[file.path] = [];
      if (!answer.failed) answer.failed = String(err);
    }
  }
  process.stdout.write(`${JSON.stringify(answer)}\n`);
});

function symbolsOf(path, text, extension) {
  const kind = SCRIPT_KIND[extension];
  if (kind === undefined) return [];
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kind);
  const out = [];
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const isExported = (node) => (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
  const nameOf = (node) => {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return null;
  };
  const push = (name, kind_, node, exported) => {
    if (name) out.push({ name, kind: kind_, line: lineOf(node), exported });
  };
  const walkMembers = (owner, members) => {
    for (const member of members) {
      const name = nameOf(member.name);
      if (!name) continue;
      if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member) || ts.isConstructorDeclaration?.(member)) {
        push(`${owner}.${name}()`, 'method', member, true);
      } else if (
        ts.isPropertyDeclaration(member) ||
        ts.isPropertySignature(member) ||
        ts.isGetAccessorDeclaration(member) ||
        ts.isSetAccessorDeclaration(member)
      ) {
        push(`${owner}.${name}`, 'property', member, true);
      }
    }
  };
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node)) push(nameOf(node.name), 'function', node, isExported(node));
    else if (ts.isClassDeclaration(node)) {
      const name = nameOf(node.name);
      push(name, 'class', node, isExported(node));
      if (name) walkMembers(name, node.members);
    } else if (ts.isInterfaceDeclaration(node)) {
      const name = nameOf(node.name);
      push(name, 'interface', node, isExported(node));
      if (name) walkMembers(name, node.members);
    } else if (ts.isTypeAliasDeclaration(node)) push(nameOf(node.name), 'type', node, isExported(node));
    else if (ts.isEnumDeclaration(node)) {
      const name = nameOf(node.name);
      push(name, 'enum', node, isExported(node));
      for (const member of node.members) push(`${name}.${nameOf(member.name)}`, 'enum-member', member, true);
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        push(nameOf(declaration.name), 'variable', declaration, isExported(node));
      }
    }
    ts.forEachChild(node, (child) => {
      if (ts.isModuleDeclaration(child) || ts.isModuleBlock(child)) visit(child);
    });
  };
  ts.forEachChild(source, visit);
  return out;
}
