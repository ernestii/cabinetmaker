import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parse } from '@babel/parser';
import type { Node } from '@babel/types';

// Dev-only source-location stamping for the Alt+I component explorer
// (src/ui/dev/inspector.ts). `@vitejs/plugin-react` v6 transforms JSX with oxc
// (no Babel hook) and React 19 keeps no structured source on elements, so the
// only reliable way to map a DOM node back to its line is to inject a marker at
// build time. This `pre` transform parses each .tsx, finds every host (lowercase)
// JSX element, and splices in `data-inspect="<file>:<line>:<col>"` — a plain
// data-* attribute React passes straight through. It inserts no newlines, so
// line numbers stay intact without a sourcemap. Gated to `apply: 'serve'`, so
// production builds never run it and ship none of the attributes.
function inspectLocations(): Plugin {
  return {
    name: 'jsx-inspect-location',
    enforce: 'pre',
    apply: 'serve',
    transform(code, id) {
      if (id.includes('/node_modules/') || !/\.[jt]sx$/.test(id)) return null;
      let ast;
      try {
        ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
      } catch {
        return null; // let the real compiler report the syntax error
      }
      const edits: { pos: number; text: string }[] = [];
      const visit = (node: Node | null | undefined) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'JSXOpeningElement') {
          const name = node.name;
          const hasMarker = node.attributes.some(
            (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'data-inspect',
          );
          if (name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name) && name.end != null && node.loc && !hasMarker) {
            const value = `${id}:${node.loc.start.line}:${node.loc.start.column + 1}`;
            edits.push({ pos: name.end, text: ` data-inspect=${JSON.stringify(value)}` });
          }
        }
        for (const key in node) {
          if (key === 'loc') continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (Array.isArray(child)) child.forEach((c) => visit(c as Node));
          else if (child && typeof child === 'object' && typeof (child as Node).type === 'string') visit(child as Node);
        }
      };
      visit(ast.program as unknown as Node);
      if (edits.length === 0) return null;
      // Splice from the back so earlier offsets stay valid as we insert.
      edits.sort((a, b) => b.pos - a.pos);
      let out = code;
      for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
      return { code: out, map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [inspectLocations(), react()],
  build: {
    // Stable vendor chunks: React and Mantine change only on dependency bumps,
    // so splitting them out lets returning users keep them cached (the server
    // marks hashed /assets/ files immutable) across app-code deploys.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/ },
          ],
        },
      },
    },
  },
});
