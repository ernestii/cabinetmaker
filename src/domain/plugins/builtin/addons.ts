/**
 * Built-in cabinet add-ons (Axis 5). An add-on layers extra parts, 3D models
 * and plan steps onto a cabinet a user opts into via `Cabinet.addons` — without
 * touching its core construction. The first one is under-cabinet LED lighting,
 * which routes a dado into the bottom panel, drops a glowing strip beneath the
 * front edge, and adds the kit to the shopping list.
 */
import type { CabinetAddonDef } from '../types';

/** Warm-white LED colour (matches the LED strip fixture). */
const LED_WARM = '#fff1cf';
/** Cool-white alternative, selectable per cabinet. */
const LED_COOL = '#dfe9ff';
/** Per-cabinet LED kit price (strip + channel + driver/dimmer). */
const LED_KIT_PRICE = 45;
/** Routed channel for the aluminium LED extrusion. */
const LED_GROOVE_WIDTH = 0.5;
const LED_GROOVE_DEPTH = 0.5;

export const underCabinetLed: CabinetAddonDef = {
  id: 'under-cabinet-led',
  label: 'Under-cabinet LED strip',
  description: 'Warm-white LED in a routed channel under the front edge — task/accent lighting.',
  // Only overhead cabinets light the surface below them.
  slots: ['upper', 'tall'],
  fields: [
    {
      target: 'setting:tone',
      label: 'Colour',
      kind: 'select',
      default: 'warm',
      width: 140,
      options: [{ value: 'warm', label: 'Warm white' }, { value: 'cool', label: 'Cool white' }],
    },
  ],
  apply({ ctx, parts, nodes }) {
    const { widthIn: W, depthIn: D, index, c } = ctx;
    const t = c.carcassThicknessIn;
    const innerW = W - 2 * t;
    const tone = ctx.cabinet.addonSettings?.['under-cabinet-led']?.tone;
    const ledColor = tone === 'cool' ? LED_COOL : LED_WARM;

    // Record the dado on the bottom panel so it shows up in the cut plan.
    const bottom = parts.find((p) => p.id === `C${index}-BOT`);
    if (bottom) {
      if (!bottom.joinery.includes('groove')) bottom.joinery = [...bottom.joinery, 'groove'];
      const dado = `Route a ${LED_GROOVE_WIDTH}" × ${LED_GROOVE_DEPTH}" groove in the underside front edge for the LED channel.`;
      bottom.notes = bottom.notes ? `${bottom.notes} ${dado}` : dado;
    }

    // Glowing strip just beneath the front edge, shining down onto the surface.
    nodes.push({
      pos: [W / 2, -0.3, D - 1.5],
      size: [Math.max(innerW, 1), 0.4, 0.6],
      color: ledColor,
      emissive: ledColor,
      emissiveIntensity: 1.4,
      kind: 'light',
    });
  },
  steps: ({ index }) => [
    {
      phase: 'carcass',
      text: `Route a ${LED_GROOVE_WIDTH}" wide × ${LED_GROOVE_DEPTH}" deep groove along the underside front edge of the bottom, then fit the aluminium LED channel + warm-white strip and run the lead out the back.`,
      partIds: [`C${index}-BOT`],
    },
  ],
  shopping: ({ cabinet }) => [
    {
      key: `led-${cabinet.id}`,
      name: 'Under-cabinet LED strip kit',
      detail: `${Math.round(cabinet.widthIn)}" warm-white strip + aluminium channel, driver & dimmer`,
      qty: 1,
      unit: 'kit',
      unitPrice: LED_KIT_PRICE,
      total: LED_KIT_PRICE,
    },
  ],
  shoppingSection: 'Lighting',
};

export const builtinCabinetAddons: CabinetAddonDef[] = [underCabinetLed];
