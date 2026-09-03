'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  visible: boolean;
  x: number;
  y: number;
};

/** Кастомная «лупа» на карточке товара — в portal, чтобы не ломалась из‑за sticky/transform. */
export function ProductMagnifyingGlass({ visible, x, y }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      className="hidden lg:block magnifying-glass magnifying-glass-visible fixed pointer-events-none"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 100,
      }}
      aria-hidden
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(212, 196, 184, 0.25)',
          border: '2px solid rgba(212, 196, 184, 0.6)',
          boxShadow: `
            inset 0 0 30px rgba(255, 255, 255, 0.4),
            0 8px 32px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.1)
          `,
          backdropFilter: 'blur(20px) brightness(1.3) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) brightness(1.3) saturate(1.5)',
        }}
      />
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className="rotating-ring" style={{ transformOrigin: '60px 60px' }}>
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="rgba(212, 196, 184, 0.8)"
            strokeWidth="2"
            strokeDasharray="125 35 125 35"
            strokeLinecap="round"
            strokeDashoffset="0"
          />
        </g>
        <line x1="60" y1="54" x2="60" y2="66" stroke="rgba(212, 196, 184, 0.9)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="54" y1="60" x2="66" y2="60" stroke="rgba(212, 196, 184, 0.9)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>,
    document.body
  );
}
