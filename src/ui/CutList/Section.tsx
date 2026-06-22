/** Caret that rotates from ▸ (collapsed) to ▾ (open) for a section header. */
export function Caret({ open }: { open: boolean }) {
  return (
    <svg className={`cut-caret${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Collapsible section with a clickable header. */
export function Section({ id, title, meta, open, onToggle, children }: {
  id: string; title: React.ReactNode; meta?: React.ReactNode;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mat-group cut-section">
      <button type="button" className="cut-section-head" onClick={onToggle} aria-expanded={open}>
        <Caret open={open} />
        <span className="cut-section-title">{title}</span>
        {meta != null && <span className="cut-section-meta">{meta}</span>}
      </button>
      {/* Body stays mounted (hidden when collapsed) so Print/PDF always emits the
          whole list regardless of what's folded on screen. */}
      <div className={`cut-section-body${open ? '' : ' collapsed'}`}>{children}</div>
    </section>
  );
}
