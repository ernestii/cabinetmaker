import * as THREE from 'three';
import type { MaterialTexture } from './textureOptions';

// The three-free texture metadata (options + key predicates) lives in
// `textureOptions.ts`; re-export it here so existing `materialTexture` imports
// keep working while the eager Materials view imports the light module directly.
export type { MaterialTexture } from './textureOptions';
export { TEXTURE_OPTIONS, isMarble, isMaterialTexture, isMelamine } from './textureOptions';

interface GrainSpec {
  base: string;
  /** Streak colours blended over the base, lightest → darkest. */
  streaks: string[];
  density: number;
  waviness: number;
  strokeAlpha: number;
  flecks: number;
}

const SPECS: Record<'birch' | 'oak' | 'walnut', GrainSpec> = {
  birch: { base: '#ecdcc0', streaks: ['#f5ead4', '#ddc89e', '#cbb185', '#bfa173'], density: 38, waviness: 6, strokeAlpha: 0.22, flecks: 18 },
  oak: { base: '#caa06a', streaks: ['#e0c393', '#b07f45', '#946334'], density: 30, waviness: 9, strokeAlpha: 0.18, flecks: 22 },
  walnut: { base: '#5b4332', streaks: ['#6e5340', '#43301f', '#7a5a40'], density: 30, waviness: 8, strokeAlpha: 0.22, flecks: 10 },
};

/** Small deterministic PRNG so a texture looks identical every render. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZE = 512;

function drawGrain(spec: GrainSpec, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(seed);

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const fibres = Math.round((SIZE / 100) * spec.density);
  ctx.lineWidth = 1;
  for (let i = 0; i < fibres; i++) {
    const x0 = rnd() * SIZE;
    const phase = rnd() * Math.PI * 2;
    const freq = 1.5 + rnd() * 2.5;
    const amp = spec.waviness * (0.4 + rnd());
    ctx.strokeStyle = spec.streaks[Math.floor(rnd() * spec.streaks.length)];
    ctx.globalAlpha = spec.strokeAlpha * (0.6 + rnd() * 0.8);
    ctx.beginPath();
    for (let y = 0; y <= SIZE; y += 4) {
      const x = x0 + Math.sin((y / SIZE) * Math.PI * freq + phase) * amp;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  for (let i = 0; i < spec.flecks; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const len = 4 + rnd() * 12;
    ctx.strokeStyle = spec.streaks[spec.streaks.length - 1];
    ctx.globalAlpha = 0.15 + rnd() * 0.2;
    ctx.lineWidth = 1 + rnd();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 6, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * End-grain butcher block: a brick-offset grid of short square blocks in varying
 * (deep, warm) tones, separated by dark glue seams — a tiled look rather than
 * long continuous planks. Rows are offset half a block so seams stagger.
 */
function drawButcher(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(seed);
  // Darker, richer hardwood tones than the old edge-grain staves.
  const palette = ['#946a34', '#82592a', '#a3793f', '#6f4a22', '#8d6230', '#795226'];

  const block = 64; // ~3" tiles at TILE_INCHES = 24
  const seam = 2; // dark glue line between blocks

  // Seam-coloured backdrop shows through the gaps as grout/glue lines.
  ctx.fillStyle = '#4f3415';
  ctx.fillRect(0, 0, SIZE, SIZE);

  let row = 0;
  for (let y = 0; y < SIZE; y += block, row++) {
    const offset = (row % 2) * (block / 2);
    for (let x = -block; x < SIZE + block; x += block) {
      const bx = x + offset;
      const tone = palette[Math.floor(rnd() * palette.length)];
      ctx.fillStyle = tone;
      ctx.fillRect(bx + seam / 2, y + seam / 2, block - seam, block - seam);

      // A few short end-grain ticks so each block reads as wood, not a flat tile.
      const ticks = 3 + Math.floor(rnd() * 4);
      ctx.lineWidth = 1;
      for (let i = 0; i < ticks; i++) {
        ctx.strokeStyle = `rgba(50,30,10,${0.06 + rnd() * 0.08})`;
        const ly = y + seam + rnd() * (block - 2 * seam);
        const amp = 1 + rnd() * 2;
        const phase = rnd() * Math.PI * 2;
        ctx.beginPath();
        for (let px = bx + seam; px <= bx + block - seam; px += 5) {
          const yy = ly + Math.sin((px / block) * Math.PI * 2 + phase) * amp;
          if (px === bx + seam) ctx.moveTo(px, yy);
          else ctx.lineTo(px, yy);
        }
        ctx.stroke();
      }

      // Subtle top-left highlight / bottom-right shadow for a hint of relief.
      ctx.fillStyle = 'rgba(255,235,200,0.05)';
      ctx.fillRect(bx + seam / 2, y + seam / 2, block - seam, 2);
      ctx.fillStyle = 'rgba(40,24,8,0.10)';
      ctx.fillRect(bx + seam / 2, y + block - seam / 2 - 2, block - seam, 2);
    }
  }
  return canvas;
}

/** Veined marble (white or black) with drifting, branching veins. */
function drawMarble(light: boolean, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const rnd = mulberry32(seed);

  ctx.fillStyle = light ? '#edeef2' : '#202027';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Soft mottling so the slab isn't flat.
  for (let i = 0; i < 700; i++) {
    const r = 6 + rnd() * 26;
    ctx.fillStyle = light
      ? `rgba(210,212,222,${0.02 + rnd() * 0.05})`
      : `rgba(70,70,84,${0.03 + rnd() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rnd() * SIZE, rnd() * SIZE, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const vein = (x0: number, y0: number, width: number, alpha: number, depth: number) => {
    if (depth <= 0) return;
    const color = light ? `rgba(120,122,138,${alpha})` : `rgba(200,202,214,${alpha})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    let x = x0;
    let y = y0;
    const phase = rnd() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < SIZE + 12) {
      x += Math.sin(y * 0.03 + phase) * 4 + (rnd() - 0.5) * 7;
      y += 5 + rnd() * 9;
      ctx.lineTo(x, y);
      if (rnd() < 0.04) vein(x, y, width * 0.55, alpha * 0.7, depth - 1); // branch
    }
    ctx.stroke();
  };

  const veins = 5 + Math.floor(rnd() * 4);
  for (let v = 0; v < veins; v++) {
    vein(rnd() * SIZE, -10, 1 + rnd() * 2.5, 0.22 + rnd() * 0.3, 2);
  }
  return canvas;
}

/** Real-world inches one texture tile spans, so density is panel-independent. */
const TILE_INCHES = 24;

/** Idempotent per-face UV rescale to the panel's real size (see git history). */
export function applyTextureUv(geo: THREE.BufferGeometry, sizeInches: [number, number, number]): void {
  const uv = geo.attributes.uv;
  if (!uv) return;
  const ud = geo.userData as { baseUv?: Float32Array };
  if (!ud.baseUv) ud.baseUv = Float32Array.from(uv.array as ArrayLike<number>);
  const base = ud.baseUv;
  const [x, y, z] = sizeInches;
  const faces: [number, number][] = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
  for (let f = 0; f < 6; f++) {
    const su = faces[f][0] / TILE_INCHES;
    const sv = faces[f][1] / TILE_INCHES;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, base[i * 2] * su, base[i * 2 + 1] * sv);
    }
  }
  uv.needsUpdate = true;
}

const SEEDS: Record<MaterialTexture, number> = {
  birch: 1337, oak: 7331, walnut: 5150, butcher: 4242, marbleWhite: 9001, marbleBlack: 8002,
};

const cache = new Map<MaterialTexture, THREE.Texture>();

/** Cached procedural texture for a key. Safe to call every render. */
export function materialTexture(key: MaterialTexture): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const seed = SEEDS[key];
  const canvas =
    key === 'butcher' ? drawButcher(seed)
    : key === 'marbleWhite' ? drawMarble(true, seed)
    : key === 'marbleBlack' ? drawMarble(false, seed)
    : drawGrain(SPECS[key], seed);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
