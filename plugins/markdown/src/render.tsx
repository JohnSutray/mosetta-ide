import type { ComponentChildren, JSX } from 'preact';
import type { Block, Inline } from './markdown.js';
import type { MarkdownImages } from './images.js';

export interface Painter {
  paint(text: string, path: string): Array<{ text: string; color: string | null }>;
}

export interface Draw {
  painter: Painter | null;
  images: MarkdownImages;
  path: string;
}

export function Page({ blocks, draw: how }: { blocks: Block[]; draw: Draw }): JSX.Element {
  return <div class="md-page">{blocks.map((one, at) => draw(one, at, how))}</div>;
}

function draw(block: Block, key: number, how: Draw): ComponentChildren {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${Math.min(block.level, 6)}` as 'h1';
      return (
        <Tag key={key} class="md-heading">
          {block.parts.map(inline(how))}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} class="md-p">
          {block.parts.map(inline(how))}
        </p>
      );
    case 'rule':
      return <hr key={key} class="md-rule" />;
    case 'code':
      return <Code key={key} lang={block.lang} text={block.text} painter={how.painter} />;
    case 'quote':
      return (
        <blockquote key={key} class="md-quote">
          {block.blocks.map((one, at) => draw(one, at, how))}
        </blockquote>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key} class="md-list">
          {block.items.map((item, at) => (
            <li key={at}>{item.map((one, i) => draw(one, i, how))}</li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div key={key} class="md-table-box">
          <table class="md-table">
            <thead>
              <tr>{block.head.map((cell, at) => <th key={at}>{cell.map(inline(how))}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, at) => (
                <tr key={at}>{row.map((cell, i) => <td key={i}>{cell.map(inline(how))}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Code({ lang, text, painter }: { lang: string; text: string; painter: Painter | null }): JSX.Element {
  const named = LANGS[lang.toLowerCase()] ?? lang.toLowerCase();
  const pieces = painter && named ? painter.paint(text, `code.${named}`) : null;
  return (
    <pre class="md-code">
      <code>
        {pieces
          ? pieces.map((piece, at) => (
              <span key={at} style={piece.color ? { color: piece.color } : undefined}>
                {piece.text}
              </span>
            ))
          : text}
      </code>
      {lang ? <span class="md-code-lang">{lang}</span> : null}
    </pre>
  );
}

const LANGS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  tsx: 'tsx',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'jsonc',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'md',
  markdown: 'md',
  sh: 'sh',
  bash: 'sh',
};

function inline(how: Draw) {
  return function text(part: Inline, key: number): ComponentChildren {
  switch (part.kind) {
    case 'text':
      return part.text;
    case 'code':
      return (
        <code key={key} class="md-inline-code">
          {part.text}
        </code>
      );
    case 'strong':
      return <strong key={key}>{part.parts.map(text)}</strong>;
    case 'em':
      return <em key={key}>{part.parts.map(text)}</em>;
    case 'strike':
      return <s key={key}>{part.parts.map(text)}</s>;
    case 'link':
      return (
        <a key={key} class="md-link" href={part.href} target="_blank" rel="noreferrer">
          {part.parts.map(text)}
        </a>
      );
    case 'image':
      return <Picture key={key} src={part.src} alt={part.alt} how={how} />;
  }
  };
}

function Picture({ src, alt, how }: { src: string; alt: string; how: Draw }): JSX.Element {
  const url = how.images.source(src, how.path).value;
  if (!url) return <span class="md-image">{alt || src}</span>;
  return <img class="md-image-shown" src={url} alt={alt || src} />;
}
