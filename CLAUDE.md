# CLAUDE.md

Guidance for AI agents (and humans) working in this repo. Read this before making
changes, and keep it accurate when you change the architecture.

## What this is

**Cabinetmaker** — a browser app for designing frameless/euro-style cabinetry: a
2D elevation editor → live 3D → cut list (sheet nesting) → shopping list →
assembly steps. React + Three.js + Zustand + Vite + Vitest. The app is **fully
local and client-only**: projects persist to `localStorage` and import/export as
JSON. There is no backend, no account, and no network calls.

## Commands

```
npm install
npm run dev            # Vite dev server on http://localhost:5173
npm test               # vitest run (run this before committing)
npm run test:watch
npm run test:coverage  # vitest with v8 coverage (domain + state)
npm run lint           # eslint . (must be clean)
npm run build          # tsc -b && vite build (typecheck + production bundle)
npm run preview        # serve the built dist/ locally to verify
npm run format         # prettier --write .
```

CI runs `lint`, `build` (typecheck), and `test` on every push. Keep all three green.

## Architecture

The hard logic is **pure, unit-tested TypeScript under `src/domain/`** (no React);
`src/ui/` is a thin shell; `src/state/store.ts` is the Zustand store + persistence.

```
src/domain/
  types.ts          domain model: Project → Room → Wall → WallElement → Cabinet → Opening
  elements.ts       WallElement helpers (elementKind, elementVertical) + the band layout
  constants.ts      thicknesses, reveals, kerf, slide lengths, …
  seed.ts           demos + new-project builders + material presets
  plugins/          THE EXTENSION SYSTEM (see below)
  geometry/         buildProject → buildCabinet → carcass/fronts/doors/drawers/…
  cutlist/          collectParts → nesting (kerf + grain lock) → cost
  shopping/         buildShoppingList (departments + totals)
  assembly/         steps + figures
  export/           STEP (CAD) export
src/state/store.ts  Zustand + persist (localStorage) + JSON import/export
src/state/persistStorage.ts  resilient localStorage adapter (backup mirror +
                    corruption recovery + quota-safe writes)
src/ui/             LayoutEditor (Elevation + Inspector), Viewer3D, CutList,
                    Shopping, Assembly, Materials
src/main.tsx        boots Mantine + the App (no router; single editor view)
```

A **`Wall`** is a free-form list of positioned **`WallElement`**s (`{ id, xIn,
widthIn, zone, cabinet?, fixtureId?, fixture?, workbench? }`). Each element sits
in a vertical band (`zone`: `base`/`upper`/`tall`) at an absolute `xIn`, so the
base and upper rows are independent — nothing forces them to align. What an
element *is* (cabinet, appliance, workbench, a cabinet WITH an integrated
appliance, or empty) is derived from which fields are set, not a rigid `type`.

**Pipeline:** `buildProject(project)` walks rooms → walls → elements (array
order, base-before-upper, sets the cabinet index), calls `buildCabinet` per
element with a cabinet, places each `fixtureId` via its plugin, and returns
`{ parts, nodes, hardware }`. `parts` are flat rectangles for the cut list;
`nodes` are axis-aligned boxes for the 3D viewer/STEP. Coordinate frame is
**cabinet-local** (x=0 left, y=0 carcass bottom, z=0 wall); `buildProject`
offsets/rotates nodes into room space. Fixtures and counters emit directly in
**wall-local** coords (use the element's `x0`). Merged countertops/toekicks span
contiguous, equal-depth base elements (`emitSpansX`, sorted by `xIn`).

### Conventions

- Match surrounding code: 2-space indent, single quotes, semicolons, `printWidth`
  120. Prefer `import type` for types (eslint enforces it).
- Part ids: `C{index}-{ROLE}`, `C{index}-DR{n}-{...}`, `C{index}-DOOR{n}`; fixtures
  use `APP{shortId(element.id)}-...`. Ids must be **unique within a build** — emit one
  `Part` with `qty` rather than the same id twice.
- Don't widen `MaterialRole`. Reuse `'face'` (visible/finished) or `'carcass'`
  (hidden) for any new flat panel so nesting/cost/edge-banding need no changes.
- Dimensions are inches; cut dims snap to 1/16".

## The plugin system (`src/domain/plugins/`) — how to add components

The engine has **no hard-coded `switch` on component type**. Behaviour is looked up
from registries, and every built-in (slab door, the drawer/door/fixed/falseFront
fronts, the four handles, and the dishwasher/range/hood/fridge fixtures) is itself a
plugin in `plugins/builtin/`. **Add new components the same way — no core edits.**

Files:
- `plugins/types.ts` — the interfaces (`FrontTypeDef`, `DoorStyleDef`, `FixtureDef`,
  `HandleDef`, `CabinetmakerPlugin`) and their context types.
- `plugins/registry.ts` — `registerPlugin()` + getters (`getFrontType`,
  `getDoorStyle`, `getFixture`, `listFixtures`, …). Throws on duplicate id per axis.
- `plugins/builtin/*` — the built-ins; `builtin/index.ts` registers them all.
- `plugins/index.ts` — barrel: `import './builtin'` (side effect) + re-exports.

### Registering

For a **bundled** plugin, add it to `plugins/builtin/index.ts`’s `registerBuiltins()`.
For an **app/third-party** plugin, call `registerPlugin(...)` in a module that is
imported before any build runs (e.g. from `builtin/index.ts`, or at app startup in
`src/main.tsx`). Registration happens via a side-effect import of `plugins/builtin`
placed at the pipeline roots (`buildProject.ts`, `assembly/steps.ts`,
`buildCabinet.ts`) — so every path (cut list, cost, shopping, assembly, STEP) sees
the plugins.

```ts
import { registerPlugin } from './domain/plugins';
registerPlugin({ id: 'my-plugin', doorStyles: [...], frontTypes: [...], fixtures: [...] });
```

### Axis 1 — DoorStyleDef (how a face looks/cuts)

`buildFace` computes the face geometry (size, leaf split, edge-pull extension,
handle nodes) and delegates Part/node emission to the selected style. `'slab'` is
the default; unset/unknown `Opening.doorStyle` resolves to slab. **Reference:**
`plugins/builtin/doorStyles.ts` (slab + the shaker frame-and-panel example).

```ts
import type { DoorStyleDef } from '../types';

export const myStyle: DoorStyleDef = {
  id: 'beadboard',
  label: 'Beadboard',
  buildFace(c) {
    // c: { f, partId, label, leaves, faceW, faceHeight, gap, cy, W, D, tf,
    //      faceMaterialId, faceColor, faceTexture, note, emit }
    c.f.add({
      id: c.partId, label: c.label, role: 'face', materialId: c.faceMaterialId,
      thicknessIn: c.tf, wIn: c.faceW, lIn: c.faceHeight, qty: c.leaves,
      edgeBandEdges: ['top', 'bottom', 'left', 'right'], joinery: [], grainLocked: true, notes: c.note,
    });
    // Emit one panel node per leaf via c.emit (it tags the node with the right
    // open-group so doors still swing). For a pair, place leaves at
    // W/2 ± (gap/2 + faceW/2); add Parts ONCE with qty*leaves to avoid id clashes.
    c.emit({ pos: [c.W / 2, c.cy, c.D + c.tf / 2], size: [c.faceW, c.faceHeight, c.tf],
             color: c.faceColor, textureUrl: c.faceTexture, kind: 'face' });
  },
};
```

### Axis 2 — FrontTypeDef (a kind of cabinet front)

Replaces the opening switch. `build` emits parts/nodes (use the `BuildContext` +
`PartFactory` helpers like the existing `buildDrawer`/`buildDoor`) and returns the
hardware it needs; `steps` adds assembly instructions. `fields` declares the
per-front Inspector controls (see **Declarative fields** below), `commands` adds
suggest/transform buttons, and `opens` (`'drawer'`/`'door'`) buckets the front for
assembly figures. **Reference:** `plugins/builtin/frontTypes.ts`; the gridfinity
drawer (`plugins/builtin/gridfinity.ts`) is the full single-file example — fields +
a layout command + node tooltips, all in one module.

```ts
import type { FrontTypeDef } from '../types';
import { handleField } from '../fields';

export const ventFront: FrontTypeDef = {
  id: 'vent', label: 'Vent grille',
  fields: [handleField('door')],             // declarative Inspector controls (see below)
  selectable: true,                          // show in the Inspector dropdown
  hostsShelves: false,
  build({ ctx, f, item, ordinal }) {
    f.add({ id: `C${ctx.index}-VENT${ordinal}`, label: 'Vent grille', role: 'face',
            materialId: 'face', thicknessIn: 0.75, wIn: ctx.widthIn - 0.125, lIn: item.faceHeightIn,
            qty: 1, edgeBandEdges: ['top','bottom','left','right'], joinery: [], grainLocked: true });
    return { hinges: 0, slidePairs: 0, pulls: 0, pushLatches: 0 };
  },
  steps: ({ ordinal }) => [{ phase: 'faces', text: `Fit vent grille ${ordinal}.` }],
};
```

### Axis 3 — FixtureDef (appliance / fixture in a wall element)

An element with `fixtureId` carries a fixture. The fixture reserves width, places
a 3D volume, optionally emits finished panels into the cut list, decides whether
the merged countertop **passes** over it (`'pass'`, base zone only — e.g.
dishwasher) or **breaks** at it (`'break'` — e.g. range/fridge). Appliances are
**not priced** — they're user-sourced at real, fast-moving prices, so fixtures
have no shopping/cost contribution (don't add one). By default a fixture is **standalone** — it owns
its whole element, locks the zone to its band, and the editor clears any
cabinet/workbench when you pick it (and vice-versa). Set `integratable: true` for a
drop-in that genuinely shares its section with a carcass (e.g. a cooktop over a base
cabinet); only then may a cabinet/workbench and the fixture both be set on one
element. `standardWidthsIn` lets the editor lock the element to the appliance's
stock sizes. The editor also prevents elements whose bands overlap from
overlapping in x (same band, or a full-height `tall` column vs the base/upper it
spans — see `bandsOverlap` in `domain/elements.ts`). Emit in **wall-local** coords
using `c.x0` / `c.widthIn`. **Reference:** `plugins/builtin/fixtures.ts`.

```ts
import type { FixtureDef } from '../types';

export const wineFridge: FixtureDef = {
  id: 'wine-fridge', label: 'Wine fridge', zone: 'base',  // 'base' | 'upper' | 'tall'
  defaultWidthIn: 24, standardWidthsIn: [24, 30], countertop: 'pass',
  fields: [{ target: 'frontPanel', label: 'Cabinet-front panel', kind: 'toggle' }],  // Inspector toggles
  place(c) {
    // c: { element, project, add(part), node(n), x0, widthIn, config, metrics, idBase }
    const h = c.metrics.counterUndersideY;
    c.node({ pos: [c.x0 + c.widthIn / 2, h / 2, 12], size: [c.widthIn - 1, h, 24],
             color: '#b9bdc2', kind: 'appliance' });
    if (c.config?.frontPanel) {
      c.add({ id: `${c.idBase}-FRONT`, label: 'Wine fridge panel', role: 'face', cabinetId: c.element.id,
              materialId: 'face', thicknessIn: 0.75, wIn: c.widthIn - 1, lIn: h, qty: 1,
              edgeBandEdges: ['top','bottom','left','right'], joinery: ['screw'], grainLocked: true });
    }
  },
};
```

### Axis 4 — HandleDef

Pull / push-latch / routed / edge-pull. Thin wrappers over `geometry/handles.ts`.
Add one only if you need genuinely new opening hardware. **Reference:**
`plugins/builtin/handles.ts`.

### Axis 5 — CabinetAddonDef (opt-in cabinet accessories)

A cabinet opts into add-ons by listing their ids in `Cabinet.addons: string[]`
(multi-select). An add-on layers extra parts/3D models onto a **finished**
cabinet and can tweak what's already there — `buildCabinet` runs `apply` after
the carcass + fronts exist, handing over the live `parts`/`nodes` arrays plus the
`BuildContext` + `PartFactory`. `steps` adds assembly instructions; `shopping`
adds buy lines (grouped under `shoppingSection`, default `'Add-ons'`); `slots`
filters which run kinds the Inspector offers it for. The built-in
`under-cabinet-led` routes a dado into the bottom panel (adds `'groove'` joinery
+ a note), drops a glowing `kind: 'light'` node, and lists an LED kit under
"Lighting". **Reference:** `plugins/builtin/addons.ts`.

```ts
import type { CabinetAddonDef } from '../types';

export const wireGrommet: CabinetAddonDef = {
  id: 'wire-grommet', label: 'Wire grommet', slots: ['base', 'tall'],
  apply({ ctx, f, parts, nodes }) {
    const back = parts.find((p) => p.id === `C${ctx.index}-BACK`);
    if (back) back.notes = [back.notes, 'Bore a 2" grommet hole.'].filter(Boolean).join(' ');
    nodes.push({ pos: [ctx.widthIn / 2, ctx.carcassHeightIn - 3, 0.5], size: [2, 2, 0.4], color: '#222', kind: 'panel' });
  },
  steps: ({ index }) => [{ phase: 'carcass', text: 'Bore the 2" wire grommet in the back.', partIds: [`C${index}-BACK`] }],
  shopping: ({ cabinet }) => [{ key: `grommet-${cabinet.id}`, name: 'Wire grommet', detail: '2"', qty: 1, unit: 'ea', unitPrice: 3, total: 3 }],
};
```

### Axis 6 — SelectionCommandDef (multi-select bulk commands)

A **bulk operation** offered when the user selects several wall elements at once
in the elevation editor (Ctrl/Cmd/Shift-click adds to the selection; a floating
toolbar over the selection — and a panel in the Inspector — surface the commands).
`run` reads the whole selection and returns **per-element patches** keyed by id;
the store snaps/width-clamps `xIn`/`widthIn` and assigns any other field verbatim,
so a command can also set e.g. `heightOverrideIn` or swap a `cabinet`.
`minElements` (default 2) and `enabledFor` gate when it's offered. The built-in
`spread-evenly` redistributes the gaps per band (outer edges fixed). Like every
axis it's registry-driven — register one and it shows up with no UI edits.
**Reference:** `plugins/builtin/selectionCommands.ts`.

```ts
import type { SelectionCommandDef } from '../types';

export const alignWidths: SelectionCommandDef = {
  id: 'align-widths', label: 'Match widths', minElements: 2,
  enabledFor: ({ elements }) => elements.length >= 2,
  run: ({ elements }) => {
    const w = Math.max(...elements.map((e) => e.widthIn));
    return { elements: elements.map((e) => ({ id: e.id, patch: { widthIn: w } })) };
  },
};
```

The store tracks the set in `ui.selectedElementIds` (with `selectedElementId` as
the primary for the single-element Inspector); `runSelectionCommand(id)` resolves
the selection against the active wall and applies the patches. Multi-select also
nudges (arrows) and deletes the whole set.

### Declarative fields, settings, commands, tooltips

These are the seams that let a plugin own its UI + config without core edits:

- **`fields: PluginField[]`** (on `FrontTypeDef`, `FixtureDef`, `CabinetAddonDef`) —
  declarative controls the Inspector renders generically (`ui/plugins/PluginFields.tsx`).
  A field's `target` is either a known **core** field (`'doorCount'`, `'hingeSide'`,
  `'shelves'`, `'slideLen'`, `'handle'`, `'doorStyle'` for openings; `'frontPanel'`,
  `'sidePanels'`, `'overheadPanel'` for fixtures) or `'setting:<key>'` for the plugin's
  own bag. Reuse the shared builders in `plugins/fields.ts` (`slideField()`,
  `handleField('drawer'|'door')`, `doorStyleField()`, `doorCountField()`,
  `hingeSideField()`, `shelvesField()`). `kind` ∈ `number|toggle|segmented|select`;
  `options` may be a function (re-evaluated per render), `visibleWhen` hides a field.
- **Settings bags** — `Opening.settings`, `FixtureConfig.settings`,
  `Cabinet.addonSettings[id]` are open `Record<string, unknown>`. Read them in `build`/
  `place`/`apply` (e.g. `item.opening.settings`, `ctx.cabinet.addonSettings?.[id]`);
  unknown keys are ignored, so a project survives a plugin being removed.
- **`commands`** (front types) — buttons that compute a layout suggestion and return
  `{ front: Opening[] }` (replace the cabinet's fronts) or `{ opening: Partial<Opening> }`
  (patch this one). The store's `runFrontCommand` supplies carcass dims + `newId`.
- **`Node3D.tooltip`** — text the viewer shows on hover (distinct from the always-on
  `badge`).
- **Custom React UI (escape hatch)** — when the declarative schema can't express a
  control (a colour picker, a live preview, an interactive 3D handle), a plugin
  registers React components in the **UI-side** registry `ui/plugins/registry.tsx`
  (the domain stays React-free, so components can't live on the plugin defs). Call
  `registerPluginUI({ id, front?, fixture?, addon?, overlays? })` at app startup,
  keyed by the same plugin ids: `front`/`fixture`/`addon` map an id → an
  `InspectorPanel` (gets the same `get`/`set` field adapter `PluginFields` uses, so
  it reads/writes core fields + the `setting:<key>` bag), and `overlays` maps a
  `Node3D.overlayId` → a `ViewerOverlay` rendered as R3F content at the node. The
  Inspector renders a registered panel right **after** the declarative `fields`, and
  the viewer renders the overlay alongside the node — both are purely additive, so a
  plugin uses declarative fields, a custom panel, or both.

The Inspector still reads `listFrontTypes()` / `listDoorStyles()` / `listFixtures()` /
`listHandles()` / `listCabinetAddons()`, so a registered plugin shows up in the
dropdowns (or, for add-ons, as per-cabinet checkboxes filtered by `slots`) and renders
its `fields` + `commands` with **no UI edits**.

### Gotchas / checklist when adding a plugin

- [ ] Unique part ids; emit one `Part` with `qty` (don’t re-add the same id per leaf).
- [ ] Reuse `MaterialRole` `'face'`/`'carcass'` for panels — don’t widen the union.
- [ ] Fixtures emit in wall-local coords (`c.x0`); `kind: 'appliance'` nodes render
      as boxes in the viewer. A node may also set `modelUrl` (the viewer fits a glTF
      into the box, falling back to the box if the asset is missing — drop assets in
      `public/models/`), `emissive`/`emissiveIntensity` (glow), `kind: 'light'` (glow
      + a soft point light), `badge` (an always-on label), or `tooltip` (shown on
      hover). See the LED strip (glow / `light`) in `plugins/builtin/workshop.ts` and
      the gridfinity drawer (`badge` + `tooltip`) in `plugins/builtin/gridfinity.ts`.
- [ ] STEP export (`export/solids.ts`) carries only **fabricated** nodes; the
      `NON_FABRICATED` set drops `wall`/`ceiling`/`appliance`/`light`. Bought
      appliances and lighting (incl. add-on glow models) are not cut parts, so an
      add-on that should appear in CAD must emit a real part kind (panel/face/…).
- [ ] `countertop: 'pass'` only merges the counter for `zone: 'base'`.
- [ ] Ensure your plugin module is imported before a build (register in
      `builtin/index.ts` or at app startup).
- [ ] Add a test (see `__tests__/thirdPartyPlugin.test.ts` for front/style/fixture
      and `__tests__/cabinetAddon.test.ts` for the add-on end-to-end pattern; reset
      the registry with `__resetRegistryForTests()` + `registerBuiltins()` in
      `afterEach` if your test mutates it).
- [ ] Run `npm run lint && npm run build && npm test`.

## Tests

Vitest, in `src/**/__tests__/`. Golden suites (`goldenDimensions`, `scene`,
`demos`, `step`) lock real cut dimensions and the pipeline — if you refactor
geometry, these must stay green untouched. Plugin coverage lives in
`plugins.test.ts`, `doorStyle.test.ts`, `appliance.test.ts`,
`thirdPartyPlugin.test.ts`, and `pluginApi.test.ts` (declarative fields, settings
bags, commands, tooltips).
