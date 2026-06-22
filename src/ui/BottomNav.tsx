import { useEffect } from 'react';
import { useStore } from '../state/store';
import { NAV_GROUPS, groupForView, rememberView, resolveGroupTarget, type NavGroupKey } from './views';

const svg = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Compact glyph per grouped tab for the mobile bottom-nav. */
function Icon({ k }: { k: NavGroupKey }) {
  switch (k) {
    case 'design':
      // Pencil + panel — design/draw the layout.
      return (
        <svg {...svg} aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <line x1="10" y1="4" x2="10" y2="20" />
        </svg>
      );
    case 'plan':
      // Clipboard/list — the cut list, shopping list & assembly plan.
      return (
        <svg {...svg} aria-hidden>
          <rect x="5" y="4" width="14" height="17" rx="1.5" />
          <path d="M9 3.5h6v3H9z" />
          <line x1="8.5" y1="11" x2="15.5" y2="11" />
          <line x1="8.5" y1="15" x2="13.5" y2="15" />
        </svg>
      );
    case 'materials':
      return (
        <svg {...svg} aria-hidden>
          <rect x="3.5" y="3.5" width="10" height="10" rx="1.5" />
          <rect x="10.5" y="10.5" width="10" height="10" rx="1.5" />
        </svg>
      );
  }
}

/**
 * Phone-only bottom tab bar. Collapses the seven views into four grouped tabs
 * (Design · Plan · Materials · Settings); within a group the SubNav strip picks
 * the specific view. A flex child of the app shell (so it claims its own space
 * rather than overlapping content) that's hidden on tablet/desktop. Sets the
 * hash like the header tabs so deep links stay in sync.
 */
export function BottomNav() {
  const view = useStore((s) => s.ui.view);
  const setView = useStore((s) => s.setView);
  const activeGroup = groupForView(view);
  // Remember where we are in the current group so re-tapping its tab returns here.
  useEffect(() => {
    rememberView(view);
  }, [view]);

  function go(group: (typeof NAV_GROUPS)[number]) {
    // Stay put if we're already in this group; otherwise resume where we left
    // off (or the group's first view).
    if (group.key === activeGroup.key) return;
    const target = resolveGroupTarget(group);
    setView(target);
    // Keep the deep-link hash in sync without pushing a back-button entry per tap.
    history.replaceState(null, '', `#${target}`);
  }

  return (
    <nav className="bottom-nav" aria-label="Views">
      {NAV_GROUPS.map((g) => (
        <button
          key={g.key}
          type="button"
          className={activeGroup.key === g.key ? 'active' : undefined}
          aria-current={activeGroup.key === g.key ? 'page' : undefined}
          onClick={() => go(g)}
        >
          <Icon k={g.key} />
          <span className="bn-label">{g.label}</span>
        </button>
      ))}
    </nav>
  );
}
