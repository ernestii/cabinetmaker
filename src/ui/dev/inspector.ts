/**
 * Alt+I component explorer (dev only). Toggle with Alt+I: the element under the
 * cursor is highlighted with a label showing its component + source location;
 * click it to jump straight to that line in Cursor. Esc (or Alt+I again) exits.
 *
 * Source locations come from the `data-inspect="<file>:<line>:<col>"` attribute
 * the dev-only Babel plugin in vite.config.ts stamps onto every host element —
 * so this never touches React internals to find the file. The component *name*
 * in the label is a best-effort read of the React fiber, wrapped in try/catch so
 * a React version bump can't break the inspector.
 *
 * Mounted via a DEV-gated dynamic import in main.tsx, so it ships in no
 * production bundle.
 */

let active = false;
let box: HTMLDivElement | null = null;
let label: HTMLDivElement | null = null;
let hint: HTMLDivElement | null = null;
let current: { file: string; line: string; col: string } | null = null;

/** Parse a `data-inspect` value back into its file / line / column parts. */
function parseLoc(value: string): { file: string; line: string; col: string } | null {
  const m = /^(.*):(\d+):(\d+)$/.exec(value);
  return m ? { file: m[1], line: m[2], col: m[3] } : null;
}

/** Best-effort React component name for a DOM node, via its fiber. */
function componentName(node: Element): string | null {
  try {
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
    if (!key) return null;
    // The reactFiber key holds the host fiber; walk up to the nearest function/
    // class/forwardRef/memo type and use its display name.
    let fiber = (node as unknown as Record<string, unknown>)[key] as { type?: unknown; return?: unknown } | null;
    let guard = 0;
    while (fiber && guard++ < 80) {
      const type: unknown = fiber.type;
      if (typeof type === 'function') {
        const fn = type as { displayName?: string; name?: string };
        return fn.displayName || fn.name || null;
      }
      if (type && typeof type === 'object') {
        const obj = type as { displayName?: string; render?: { name?: string } };
        const n = obj.displayName || obj.render?.name;
        if (n) return n;
      }
      fiber = fiber.return as typeof fiber;
    }
  } catch {
    // React internals shifted — fall back to the tag name in the caller.
  }
  return null;
}

/** Open `file:line:col` in Cursor via its URL scheme (no dev-server roundtrip). */
function openInCursor(loc: { file: string; line: string; col: string }) {
  const url = `cursor://file${encodeURI(loc.file)}:${loc.line}:${loc.col}`;
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ensureChrome() {
  if (box) return;
  box = document.createElement('div');
  box.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;border:1px solid #6f8fd6;' +
    'background:rgba(111,143,214,0.18);border-radius:2px;display:none;transition:all 40ms ease-out;';
  label = document.createElement('div');
  label.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;display:none;max-width:60vw;' +
    'font:500 11px ui-monospace,Menlo,monospace;color:#fff;background:#16181d;' +
    'border:1px solid #343941;border-radius:3px;padding:3px 7px;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;' +
    'pointer-events:none;font:500 12px ui-sans-serif,system-ui,sans-serif;color:#fff;' +
    'background:#6f8fd6;border-radius:4px;padding:6px 12px;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
  hint.textContent = 'Inspect mode — click an element to open it in Cursor · Esc to exit';
  document.body.append(box, label, hint);
}

function hideHighlight() {
  current = null;
  if (box) box.style.display = 'none';
  if (label) label.style.display = 'none';
}

function onMove(e: MouseEvent) {
  if (!active || !box || !label) return;
  const hostEl = (e.target as Element | null)?.closest?.('[data-inspect]') as HTMLElement | null;
  if (!hostEl) {
    hideHighlight();
    return;
  }
  const loc = parseLoc(hostEl.getAttribute('data-inspect') || '');
  if (!loc) {
    hideHighlight();
    return;
  }
  current = loc;
  const r = hostEl.getBoundingClientRect();
  box.style.display = 'block';
  box.style.left = `${r.left}px`;
  box.style.top = `${r.top}px`;
  box.style.width = `${r.width}px`;
  box.style.height = `${r.height}px`;

  const name = componentName(hostEl);
  const file = loc.file.split('/').pop() ?? loc.file;
  const tag = (hostEl.tagName || '').toLowerCase();
  label.textContent = `${name ? `<${name}> ` : ''}${file}:${loc.line}  ·  ${tag}`;
  label.style.display = 'block';
  // Prefer a label just above the element; tuck it below if it'd clip the top.
  const top = r.top > 28 ? r.top - 24 : r.bottom + 6;
  label.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - label.offsetWidth - 8))}px`;
  label.style.top = `${top}px`;
}

function onClick(e: MouseEvent) {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  const loc = current ?? parseLoc((e.target as Element | null)?.closest?.('[data-inspect]')?.getAttribute('data-inspect') || '');
  // Exit FIRST: openInCursor() synthesises an <a>.click(), which our own
  // capture-phase click listener would otherwise catch and re-enter, looping
  // openInCursor forever (stack overflow → page hangs, Esc dead). Deactivating
  // now drops the listener and trips the `if (!active) return` guard.
  deactivate();
  if (loc) openInCursor(loc);
}

/** Swallow the press so the app doesn't start a drag/selection under the click. */
function swallow(e: Event) {
  if (active) e.stopPropagation();
}

function activate() {
  if (active) return;
  active = true;
  ensureChrome();
  if (hint) hint.style.display = 'block';
  document.body.style.cursor = 'crosshair';
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', swallow, true);
  document.addEventListener('pointerdown', swallow, true);
}

function deactivate() {
  if (!active) return;
  active = false;
  hideHighlight();
  if (hint) hint.style.display = 'none';
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('mousedown', swallow, true);
  document.removeEventListener('pointerdown', swallow, true);
}

export function initComponentInspector() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyI') {
      e.preventDefault();
      if (active) deactivate();
      else activate();
    } else if (e.key === 'Escape' && active) {
      deactivate();
    }
  });
  // eslint-disable-next-line no-console
  console.info('%c[inspect]', 'color:#6f8fd6', 'Alt+I → toggle component inspector (click opens the source in Cursor)');
}
