import { Suspense, useEffect } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { useStore } from '../state/store';
import { AppHeader } from './AppHeader';
import { ThreeDView } from './Viewer3D/ThreeDView';
import { BottomNav } from './BottomNav';
import { SubNav } from './SubNav';
import { VIEWS } from './views';
import { LayoutEditor } from './LayoutEditor/LayoutEditor';
import { CutList } from './CutList/CutList';
import { Shopping } from './Shopping/Shopping';
import { Assembly } from './Assembly/Assembly';
import { Materials } from './Materials/Materials';
import { ErrorBoundary } from './ErrorBoundary';
import { StorageNotice } from './StorageNotice';
import { StatusBar } from './StatusBar';

/** True when a keystroke is landing in a text field — leave those edits alone. */
function isEditingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function App() {
  const view = useStore((s) => s.ui.view);
  const isMobile = useMediaQuery('(max-width: 47.99em)');

  // App-wide undo/redo: ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z (and Ctrl+Y) — ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <AppHeader />

      <StorageNotice />

      {/* Phone-only sub-tab strip for the active bottom-nav group. */}
      <SubNav />

      <main className="content">
        {/* key=view resets the boundary when switching tabs, so one crashed
            view doesn't keep the others stuck on the fallback. */}
        <ErrorBoundary key={view} label={VIEWS.find((v) => v.key === view)?.label}>
          <Suspense fallback={<div className="view-loading">Loading…</div>}>
            {view === 'layout' && <LayoutEditor />}
            {/* 3D reuses the Layout shell — same Project sidebar (which now also
                holds the visibility toggles) — so the floating Layout/3D toolbar
                stays in the exact same spot when you switch views (no jump). */}
            {view === '3d' && <ThreeDView isMobile={isMobile} />}
            {view === 'cutlist' && <CutList />}
            {view === 'shopping' && <Shopping />}
            {view === 'assembly' && <Assembly />}
            {view === 'materials' && <Materials />}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Desktop: floating status pills + view dock · phone: in-flow strip. */}
      <StatusBar />
      <BottomNav />
    </div>
  );
}
