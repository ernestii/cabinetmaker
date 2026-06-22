# Cabinetmaker

A browser app for designing frameless / euro-style cabinetry — from a wall
layout all the way to an optimized, fully-IDed cut list. No more hand-deriving
cut lists in CAD.

**100% local and open-source.** Everything runs in your browser; your projects
live in `localStorage` and import/export as JSON. There is no account, no server,
and nothing leaves your machine.

> Cabinetmaker is the open-source, fully-local edition of the Cabinetor design tool.

## Features

- **Layout** — 2D elevation editor: add base/upper/tall runs, drag dividers to
  resize cabinet widths, click a cabinet to configure its front (mix & match
  doors, double doors, and any number of drawers per cabinet). Pick a handle
  per front — knob/pull or a routed finger cutout for drawers; knob/pull,
  push-to-open latch, or an integrated edge pull for doors.
- **3D** — live React-Three-Fiber preview of carcasses, fronts, legs, countertop
  and toekick, colored from the material library.
- **Cut List** — every part dimensioned and IDed (`C1-SIDE`, `C1-DR2-FACE`, …),
  nested onto 4×8 sheets per thickness (saw kerf + grain lock), with sheet count,
  waste %, and edge-banding totals. Countertops are listed separately as
  cut-to-length slabs. Print / PDF ready.
- **Shopping** — a check-off-as-you-go buy list grouped by department (sheet
  goods, countertops, edge banding, hardware) with material specs and ballpark
  prices, plus a running total. Print / PDF ready.
- **Assembly** — ordered, per-cabinet steps with pocket-hole / dowel notes and
  euro hinge boring positions.
- **Materials** — add real, priced stock from a built-in catalog (plywood, MDF,
  melamine, butcher block & slabs) or roll your own. Sheet goods and countertops
  are managed separately; countertops can be toggled on/off for the whole
  project. Plain-English "used for" roles, appearance presets, and per-piece
  hardware / labour pricing.
- **STEP export** — drop the 3D model into any CAD package.

Projects autosave to `localStorage` and import / export as JSON, so a design is a
single portable file.

> **Prices & products are estimates.** The built-in materials, hardware and
> appliance entries are generic material types — not specific brands — and their
> prices are rough planning ballparks that move with the market and vary by
> region. They are not affiliated with or endorsed by any retailer or
> manufacturer. Always confirm sizes and prices with your own supplier; tune any
> price on the Materials tab.

## Quick start

```
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Open the **project menu** in the top bar and pick a demo (kitchen, garage wall,
home bar, or office built-ins) to load a sample wall and explore.

Other scripts:

```
npm test           # vitest (geometry, nesting, store, render smoke, plugins)
npm run test:coverage  # vitest with v8 coverage (domain + state)
npm run lint       # eslint (must be clean)
npm run build      # tsc -b && vite build (typecheck + production bundle)
npm run preview    # serve the built dist/ to verify a production build
npm run format     # prettier --write
```

## Construction model (defaults, all overridable)

Frameless / full overlay. 3/4" carcass, 1/2" drawer boxes, 1/2" inset back
(doubles as a hanging cleat). Base cabinets use front/back stretchers; uppers and
tall units get a full top. 4.5" adjustable legs + a separate recessed toekick.
1.5" countertop slab. Reveals 1/16" per side (1/8" gaps). Side-mount slides, 1/2"
clearance per side. Dimensions are inches; cut dimensions snap to 1/16".

## Architecture

The hard logic is **pure, unit-tested TypeScript under `src/domain/`** (no
React); `src/ui/` is a thin shell, and `src/state/store.ts` is the Zustand store
plus `localStorage` persistence.

```
src/domain/
  types.ts          domain model: Project → Room → Wall → WallElement → Cabinet → Opening
  elements.ts       WallElement helpers + the vertical band layout
  constants.ts      thicknesses, reveals, kerf, slide lengths, …
  seed.ts           demos + new-project builders + material presets
  plugins/          the extension system (registries + built-ins)
  geometry/         buildProject → buildCabinet → carcass / fronts / doors / drawers
  cutlist/          collectParts → nesting (kerf + grain lock) → cost
  shopping/         buildShoppingList (departments + totals)
  assembly/         steps + figures
  export/           STEP (CAD) export
src/state/store.ts  Zustand + persist (localStorage) + JSON import/export
src/ui/             LayoutEditor, Viewer3D, CutList, Shopping, Assembly, Materials
```

**Pipeline:** `buildProject(project)` walks rooms → walls → elements, calls
`buildCabinet` per element, places each fixture via its plugin, and returns
`{ parts, nodes, hardware }`. `parts` are flat rectangles for the cut list;
`nodes` are axis-aligned boxes for the 3D viewer / STEP export.

Stack: **React + TypeScript + Three.js (R3F) + Zustand + Vite + Vitest**, with
Mantine for UI.

## Plugins — add your own door styles, fronts, appliances & more

The engine is fully modular: there are **no hard-coded `switch`es on component
type**. Behaviour is looked up from registries in `src/domain/plugins/`, and every
built-in (slab door, the drawer/door/fixed/false-front fronts, the handles, and
the dishwasher / range / hood / fridge fixtures) is itself a plugin registered in
`plugins/builtin/`. You add capabilities the same way — **no core edits.**

Six extension axes: **`FrontTypeDef`** (a kind of cabinet front),
**`DoorStyleDef`** (how a face looks / cuts), **`FixtureDef`** (an
appliance / fixture), **`HandleDef`** (opening hardware), **`CabinetAddonDef`**
(opt-in cabinet accessories), and **`SelectionCommandDef`** (multi-select bulk
commands).

```ts
import { registerPlugin } from './domain/plugins';

registerPlugin({
  id: 'my-cabinets',
  doorStyles: [{ id: 'shaker', label: 'Shaker', buildFace(c) { /* emit frame + panel */ } }],
  fixtures: [{ id: 'wine-fridge', label: 'Wine fridge', zone: 'base', defaultWidthIn: 24,
              countertop: 'pass', place(c) { /* c.node(...) / c.add(...) */ } }],
});
```

Registries are populated by a side-effect import of `domain/plugins/builtin` at
the pipeline roots, so every path (cut list, shopping, assembly, STEP export)
sees them. See `src/domain/plugins/builtin/` for copy-pasteable examples and
`src/domain/__tests__/thirdPartyPlugin.test.ts` for an end-to-end registration
test. The full plugin guide lives in [CLAUDE.md](./CLAUDE.md).

## Deploy (optional)

Cabinetmaker is a fully static SPA — there's no backend to host. To put it on the
web, build and upload `dist/` to any static host:

```
npm run build     # outputs dist/
npm run preview   # serve the built dist/ locally to verify
```

A [`netlify.toml`](./netlify.toml) and [`wrangler.jsonc`](./wrangler.jsonc) are
included with the build command, the SPA fallback (so hash-routed tabs resolve),
long-lived caching for content-hashed assets, and security headers. The app also
ships a baseline Content-Security-Policy via a `<meta>` tag in `index.html`. For
Vercel or GitHub Pages, mirror the same redirect + header rules.

CI (`.github/workflows/ci.yml`) runs lint, build (type-check) and tests on every
push and pull request.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md)
for the full guide. In short, before opening a PR keep the three CI checks green:

```
npm run lint
npm run build
npm test
```

The golden test suites (`goldenDimensions`, `scene`, `demos`, `step`) lock real
cut dimensions and the build pipeline — if you refactor geometry, they must stay
green. New component types should be added as plugins (see above) rather than
core edits.

## License

[MIT](./LICENSE) © Ernest Iliiasov
