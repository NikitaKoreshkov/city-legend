'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Fixed position for dropdown menus — avoids clipping inside overflow:hidden tables. */
export function useDropdownPortalStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  gap = 4,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + gap,
        left: rect.left,
        minWidth: rect.width,
        zIndex: 9999,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, gap]);

  return open ? style : null;
}
