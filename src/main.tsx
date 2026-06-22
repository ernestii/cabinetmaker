import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { App } from './ui/App';
import { theme } from './ui/theme';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <Notifications />
      <App />
    </MantineProvider>
  </StrictMode>,
);

// Dev-only Alt+I component explorer (click an element to open it in your editor).
// Dynamically imported behind the DEV flag so it ships in no production bundle.
if (import.meta.env.DEV) {
  import('./ui/dev/inspector').then((m) => m.initComponentInspector());
}
