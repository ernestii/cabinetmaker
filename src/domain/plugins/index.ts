/**
 * Public entry point for the plugin system. Importing this registers all
 * built-ins (side effect) and re-exports the registry API + plugin types, so
 * UI and third-party code can `import { listFixtures, registerPlugin } from
 * '.../domain/plugins'` from one place.
 */
import './builtin';

export * from './registry';
export type * from './types';
