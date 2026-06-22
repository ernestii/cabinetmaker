# AGENTS.md

See **[CLAUDE.md](./CLAUDE.md)** for the canonical agent guide: project overview,
commands, architecture, code conventions, and — most importantly — **how to add
new components via the plugin system** (door styles, front types, appliances,
handles) with worked examples for each axis.

Quick start:

```
npm install
npm test          # vitest — keep green before committing
npm run lint
npm run build     # typecheck + bundle
```

To add a cabinet/door/appliance type, you almost never edit core files — you
register a plugin. Start from the built-ins in `src/domain/plugins/builtin/`
(`doorStyles.ts`, `frontTypes.ts`, `fixtures.ts`, `handles.ts`) and read the
"plugin system" section of CLAUDE.md.
