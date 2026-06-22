import { useEffect, useRef, useState } from 'react';
import { TableOfContents } from '@mantine/core';

/**
 * The shared left-rail table of contents used by every report page (Cut List,
 * Shopping, Assembly, Materials): a Mantine scrollspy ToC pinned to the page's
 * `.report-layout` grid. The app scrolls inside `.content` (not the window), so
 * the scroll host is resolved from this nav's own DOM ancestry on mount.
 *
 * `selector` picks the headings (h2 → top level, h3 → sub-item by default;
 * pass `getDepth`/`getValue` for pages whose section titles aren't headings).
 * `dataKey` re-scans the DOM when the underlying data changes.
 */
export function PageToc({ selector, getDepth, getValue, dataKey }: {
  selector: string;
  getDepth?: (el: HTMLElement) => number;
  getValue?: (el: HTMLElement) => string;
  dataKey?: unknown;
}) {
  const [scrollHost, setScrollHost] = useState<HTMLElement | null>(null);
  const navRef = (node: HTMLElement | null) => {
    if (node) setScrollHost(node.closest<HTMLElement>('.content'));
  };
  const reinit = useRef<() => void>(() => {});
  useEffect(() => { reinit.current?.(); }, [dataKey]);

  return (
    <nav ref={navRef} className="page-toc" aria-label="Contents">
      {scrollHost && (
        <TableOfContents
          variant="light" color="brand" size="sm" radius="sm"
          minDepthToOffset={2} depthOffset={22}
          reinitializeRef={reinit}
          scrollSpyOptions={{ selector, scrollHost, offset: 24, getDepth, getValue }}
          getControlProps={({ data }) => ({
            onClick: () => data.getNode().scrollIntoView({ behavior: 'smooth', block: 'start' }),
            children: data.value,
            'data-depth': data.depth,
          })}
        />
      )}
    </nav>
  );
}
