# Contributing to Cabinetmaker

Thanks for your interest! Cabinetmaker is a fully local, client-only browser app
for designing frameless/euro-style cabinetry (2D elevation → live 3D → cut list →
shopping list → assembly steps). There is no backend, no account, and no network
calls — a project is just JSON in `localStorage`.

Issues and pull requests are welcome. This guide covers how to get set up, the
checks every change must pass, and the conventions that keep the codebase
consistent.

## Getting started

```
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Open the **project menu** in the top bar and load a demo (kitchen, garage wall,
home bar, office built-ins) to explore.

## Before you open a PR

CI runs three checks on every push and pull request. Keep all three green:

```
npm run lint       # eslint . — must be clean
npm run build      # tsc -b && vite build — typecheck + production bundle
npm test           # vitest run
```

Formatting is enforced by Prettier (`npm run format` to apply,
`npm run format:check` to verify). Run `npm run test:coverage` if you want the v8
coverage report for the domain + state layers.

## How the code is organized

The hard logic is **pure, unit-tested TypeScript under `src/domain/`** (no React);
`src/ui/` is a thin shell, and `src/state/store.ts` is the Zustand store plus
`localStorage` persistence. The full map lives in
[`README.md`](./README.md#architecture) and [`CLAUDE.md`](./CLAUDE.md).

Keep new logic in `src/domain/` where it can be unit-tested without React.

## Add new components as plugins, not core edits

The engine has **no hard-coded `switch` on component type** — behaviour is looked
up from registries in `src/domain/plugins/`, and every built-in (door styles,
fronts, fixtures/appliances, handles, add-ons, selection commands) is itself a
plugin. To add a cabinet/door/appliance/accessory type, **register a plugin
rather than editing the pipeline.**

Start from the built-ins in `src/domain/plugins/builtin/` and read the **plugin
system** section of [`CLAUDE.md`](./CLAUDE.md), which documents all six extension
axes with worked examples. See `src/domain/__tests__/thirdPartyPlugin.test.ts`
and `cabinetAddon.test.ts` for end-to-end registration patterns.

## Code conventions

- 2-space indent, single quotes, semicolons, `printWidth` 120 (Prettier owns
  this — just run `npm run format`).
- Prefer `import type` for type-only imports (eslint enforces it).
- Dimensions are in **inches**; cut dimensions snap to 1/16".
- Don't widen the `MaterialRole` union — reuse `'face'` (visible/finished) or
  `'carcass'` (hidden) for any new flat panel so nesting/cost/edge-banding need no
  changes.
- Part ids must be **unique within a build** — emit one `Part` with `qty` rather
  than the same id twice. See `CLAUDE.md` for the id scheme.
- Match the surrounding code's style, naming, and comment density.

## Tests

Tests are Vitest, colocated in `src/**/__tests__/`. The **golden suites**
(`goldenDimensions`, `scene`, `demos`, `step`) lock real cut dimensions and the
build pipeline — if you refactor geometry, they must stay green **untouched**. Any
new plugin or behaviour should come with a test.

## Catalog data: keep it generic

The built-in materials/hardware catalog uses **generic material types only** — no
brand names, retailer names, or SKUs — and prices are clearly labelled as ballpark
estimates. Please keep new catalog entries brand-neutral and treat prices as
rough planning figures (the UI and README already carry the disclaimer).

## Commits & pull requests

- Write clear, focused commits; keep unrelated changes in separate PRs.
- Describe **what** changed and **why** in the PR body. Include before/after notes
  or screenshots for UI changes.
- Make sure `lint`, `build`, and `test` pass locally before pushing.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
