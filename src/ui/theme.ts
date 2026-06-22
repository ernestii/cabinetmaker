import { createTheme, Menu, SegmentedControl, type MantineColorsTuple } from '@mantine/core';

// Slate + Indigo dark palette. This file is the SINGLE SOURCE OF TRUTH for the
// UI chrome colors. The bespoke SVG editor + legacy classes in styles.css read
// these via the generated Mantine CSS vars (--mantine-color-<name>-<0-9>), so
// retune here and styles.css follows automatically.
//
// primaryShade.dark = 4 → the "filled" variant of every color uses index 4,
// which is the visible accent in dark mode. Keep each accent at index 4.

// Soft-indigo primary.
const brand: MantineColorsTuple = [
  '#edf1fb',
  '#d6def4',
  '#abbcea',
  '#7d97de',
  '#6f8fd6', // 4  --accent
  '#5b7ccb',
  '#4e6fc0',
  '#4360a6',
  '#3a5290',
  '#2f4477',
];

// Muted teal — selection accent (--accent-2).
const select: MantineColorsTuple = [
  '#e8f6f2',
  '#d0ebe4',
  '#a6dacf',
  '#76c6b7',
  '#4c9d8e', // 4  --accent-2
  '#43897b',
  '#387468',
  '#2c5b51',
  '#20443c',
  '#142d28',
];

// Red — danger / overflow (--danger).
const danger: MantineColorsTuple = [
  '#fcecec',
  '#f6d6d5',
  '#eaaba9',
  '#e07e7b',
  '#d9605c', // 4  --danger
  '#cb4f4b',
  '#b54440',
  '#933734',
  '#722a28',
  '#511d1c',
];

// Neutral slate scale used for surfaces, borders and text in dark mode.
// Mantine reads dark[7]=body, dark[6]=surfaces, dark[4]=borders, dark[0]=text.
const dark: MantineColorsTuple = [
  '#e6e8eb', // 0  --text
  '#c3c7cd', // 1
  '#969ba3', // 2  --muted
  '#6b7079', // 3
  '#343941', // 4  --line (borders)
  '#262a31', // 5  --panel-2 (inputs/raised)
  '#1e2127', // 6  --panel (surfaces)
  '#16181d', // 7  --bg (body)
  '#101216', // 8
  '#0b0c0f', // 9
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 4 },
  // Filled accents (buttons, the active toolbar toggle, segmented chips) get
  // readable dark text on the mid-tone brand/teal rather than washed-out white —
  // matching the hand-picked #16181d the old `.tb-toggle.active`/`.print-btn` used.
  autoContrast: true,
  colors: { brand, select, danger, dark },
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: 'ui-monospace, Menlo, monospace',
  // A notch smaller than Mantine's defaults (md 16 → 14) for a denser, more
  // app-like UI. Body text reads off `md`; `size="sm"`/`"xs"` controls follow
  // suit. Drives every Mantine component via the generated --mantine-font-size-*.
  fontSizes: { xs: '11px', sm: '12.5px', md: '14px', lg: '16px', xl: '18px' },
  // Figma/Webflow-flat chrome: a tight radius scale so nothing reads as a pill.
  // 2px (xs) is the workhorse for inputs/buttons/chips; larger steps stay
  // restrained. defaultRadius flows into every Mantine control automatically.
  defaultRadius: 'xs',
  radius: { xs: '2px', sm: '3px', md: '4px', lg: '6px', xl: '8px' },
  components: {
    // Compact, dense menus app-wide (was the bespoke `.file-menu-dd` override).
    // Static styling only — no pseudo-states — so it lives cleanly in the theme.
    Menu: Menu.extend({
      styles: {
        dropdown: { padding: 4 },
        item: { fontSize: '12px', padding: '4px 8px' },
        label: {
          fontSize: '9.5px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '6px 8px 2px',
          color: 'var(--mantine-color-dark-2)',
        },
        divider: { margin: '4px 0' },
      },
    }),
    // Flat segmented switch — a recessed track with a raised active chip. This is
    // the native primitive the header nav and the inspector/toolbar toggles were
    // hand-rolling in CSS (`.seg-toggle`, `.tb-toggle`, the Tabs-as-segmented
    // header). Default (neutral) indicator reads flat; pass `color="brand"` for
    // an accent chip. Recessed track = the app background.
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { size: 'xs' },
      styles: {
        root: { backgroundColor: 'var(--mantine-color-dark-7)' },
      },
    }),
  },
});
