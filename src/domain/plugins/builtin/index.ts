/**
 * Registers every built-in plugin at module load. The rest of the engine pulls
 * this in for its side effect via a bare `import '../plugins/builtin'` at the
 * pipeline's composition roots (buildProject, assembly/steps), guaranteeing the
 * registries are populated before any build runs.
 */
import { registerPlugin } from '../registry';
import { builtinFrontTypes } from './frontTypes';
import { slabStyle, shakerStyle } from './doorStyles';
import { builtinFixtures } from './fixtures';
import { builtinHandles } from './handles';
import { workshopFixtures } from './workshop';
import { gridfinityDrawer } from './gridfinity';
import { builtinCabinetAddons } from './addons';
import { builtinSelectionCommands } from './selectionCommands';

/** Idempotent: registers the built-ins (used by tests after a registry reset). */
export function registerBuiltins(): void {
  registerPlugin({
    id: 'builtin',
    frontTypes: [...builtinFrontTypes, gridfinityDrawer],
    doorStyles: [slabStyle, shakerStyle],
    fixtures: [...builtinFixtures, ...workshopFixtures],
    handles: builtinHandles,
    cabinetAddons: builtinCabinetAddons,
    selectionCommands: builtinSelectionCommands,
  });
}

registerBuiltins();
