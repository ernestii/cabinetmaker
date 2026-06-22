/**
 * Lighting pack: an under-cabinet LED strip light fixture.
 *
 * It reserves an upper-zone bay and emits a glowing (`emissive`) `light` node.
 * (The gridfinity drawer front type lives in its own reference plugin,
 * `gridfinity.ts`.)
 */
import type { FixtureDef, FixturePlaceContext } from '../types';

const SIDE_GAP = 0.5; // clearance per side so the fixture slides into the bay
const LED_WARM = '#fff1cf';

export const ledStrip: FixtureDef = {
  id: 'led-strip',
  label: 'LED strip light',
  zone: 'upper',
  // Lighting belongs on a cabinet (the under-cabinet-led add-on), not as a
  // standalone "appliance" section — keep it out of the appliance pickers.
  selectable: false,
  defaultWidthIn: 36,
  countertop: 'pass',
  place(c: FixturePlaceContext): void {
    const { x0, widthIn, metrics } = c;
    const w = Math.max(6, widthIn - 2 * SIDE_GAP);
    // Under the uppers, just in front of the wall, lighting the bench below.
    const y = metrics.upperYBottom - 0.4;
    c.node({
      pos: [x0 + widthIn / 2, y, 2],
      size: [w, 0.5, 0.75],
      color: LED_WARM,
      emissive: LED_WARM,
      emissiveIntensity: 1.4,
      kind: 'light',
    });
  },
};

export const workshopFixtures: FixtureDef[] = [ledStrip];
