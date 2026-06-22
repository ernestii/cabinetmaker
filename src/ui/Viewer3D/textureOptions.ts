/**
 * Three-free texture metadata: the dropdown options + key predicates the
 * Materials tab and the 3D viewer both read. Kept separate from
 * `materialTexture.ts` (which pulls in three.js to build the actual maps) so the
 * eager Materials view doesn't drag the whole 3D stack into the initial bundle.
 */

/** Procedural textures that produce an image map (wood grains + marble). */
export type MaterialTexture = 'birch' | 'oak' | 'walnut' | 'butcher' | 'marbleWhite' | 'marbleBlack';

/** Dropdown options for the Materials tab. 'melamine' is a finish, not a map. */
export const TEXTURE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'birch', label: 'Birch' },
  { value: 'oak', label: 'Oak' },
  { value: 'walnut', label: 'Walnut' },
  { value: 'butcher', label: 'Butcher block' },
  { value: 'marbleWhite', label: 'Marble (white)' },
  { value: 'marbleBlack', label: 'Marble (black)' },
  { value: 'melamine', label: 'Melamine (sheen)' },
];

const MAP_TEXTURES = new Set<string>(['birch', 'oak', 'walnut', 'butcher', 'marbleWhite', 'marbleBlack']);

/** True when the key renders an image map (vs. a finish-only key like melamine). */
export function isMaterialTexture(s: string | undefined): s is MaterialTexture {
  return s != null && MAP_TEXTURES.has(s);
}

export const isMarble = (s: string | undefined) => s === 'marbleWhite' || s === 'marbleBlack';
export const isMelamine = (s: string | undefined) => s === 'melamine';
