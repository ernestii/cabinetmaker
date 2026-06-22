/**
 * Built-in handles. Each wraps the pure helpers in geometry/handles.ts (still
 * the source of truth, so existing tests and the hardware tally are unchanged);
 * the registry just gives the UI a list and gives plugins a place to add more.
 */
import type { HandleDef, HandleVizInput } from '../types';
import type { HandleType, Opening } from '../../types';
import { edgePullExtension, handleHardware, handleNodes, handleNote } from '../../geometry/handles';

/**
 * effectiveHandle() needs an opening whose handle resolves to this id; a bare
 * door opening (no explicit handle) makes the default fall through to `id`.
 */
const probe: Opening = { id: '', type: 'door', heightIn: 0 };

function def(id: HandleType, label: string, appliesTo: ('drawer' | 'door')[]): HandleDef {
  return {
    id,
    label,
    appliesTo,
    hardware: (leaves) => handleHardware(probe, leaves, id),
    faceExtensionIn: () => edgePullExtension(probe, id),
    note: (opening) => handleNote(opening, id),
    nodes: (inp: HandleVizInput) => handleNodes(inp, id),
  };
}

export const pullHandle = def('pull', 'Knob / pull', ['drawer', 'door']);
export const routerCutoutHandle = def('routerCutout', 'Router cutout', ['drawer']);
export const pushLatchHandle = def('pushLatch', 'Push-to-open', ['door']);
export const edgePullHandle = def('edgePull', 'Edge pull', ['door']);

export const builtinHandles: HandleDef[] = [pullHandle, routerCutoutHandle, pushLatchHandle, edgePullHandle];
