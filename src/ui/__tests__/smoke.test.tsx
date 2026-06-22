import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { theme } from '../theme';
import { LayoutEditor } from '../LayoutEditor/LayoutEditor';
import { CutList } from '../CutList/CutList';
import { Shopping } from '../Shopping/Shopping';
import { Assembly } from '../Assembly/Assembly';
import { Settings } from '../Settings/Settings';
import { Materials } from '../Materials/Materials';

// Render through MantineProvider so components relying on the theme (the same
// context the real app provides) render exactly as they do in production.
const render = (ui: ReactNode) =>
  renderToString(
    <MantineProvider theme={theme} forceColorScheme="dark">
      {ui}
    </MantineProvider>,
  );

// These render the seed project through the real store + geometry pipeline.
// renderToString throws if any component crashes during render.
describe('UI render smoke', () => {
  it('renders the layout editor', () => {
    expect(render(<LayoutEditor />)).toContain('svg');
  });
  it('renders the cut list with per-sheet cards', () => {
    const html = render(<CutList />);
    expect(html).toContain('Sheet 1 of');
    expect(html).toContain('Straight-through cuts');
    expect(html).toContain('C1-'); // a part ID appears
  });
  it('renders the shopping list with the build-time estimate', () => {
    const html = render(<Shopping />);
    expect(html).toContain('Build time');
    expect(html).toContain('Estimated total');
  });
  it('renders assembly instructions', () => {
    expect(render(<Assembly />)).toContain('Cabinet');
  });
  it('renders the settings view', () => {
    expect(render(<Settings />)).toContain('Wall');
  });
  it('renders the materials view', () => {
    expect(render(<Materials />)).toContain('Materials');
  });
});
