/** Chevron that points up when collapsed (tap to reveal) and down when open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mobile-sheet-chevron${open ? ' open' : ''}`}
      aria-hidden
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

/**
 * Phone-only bottom sheet hosting the Inspector. Collapsed it shows just the
 * header (the elevation stays usable behind it); tap the header — or the
 * chevron — to slide the controls up. Deliberately tap-only: the earlier
 * swipe-to-drag gesture fought with scrolling the controls and was easy to
 * trigger by accident, so a single clear toggle replaces it.
 */
export function MobileSheet({
  expanded,
  onExpandedChange,
  peekLabel,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  peekLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Tap-away scrim: only present (and clickable) while the sheet is open, so
          touching the elevation behind it collapses the inspector. */}
      {expanded && (
        <div className="mobile-sheet-scrim" onClick={() => onExpandedChange(false)} aria-hidden />
      )}
      <div className={`mobile-sheet${expanded ? ' expanded' : ''}`}>
        <button
          type="button"
          className="mobile-sheet-header"
          onClick={() => onExpandedChange(!expanded)}
          aria-label={expanded ? 'Hide panel' : 'Show panel'}
          aria-expanded={expanded}
        >
          <span className="mobile-sheet-peek">{peekLabel}</span>
          <Chevron open={expanded} />
        </button>
        <div className="mobile-sheet-body">{children}</div>
      </div>
    </>
  );
}
