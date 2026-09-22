/**
 * ScanToast.jsx
 *
 * Self-dismissing toast notification for barcode scan results.
 * Slides in from top-right with a smooth animation and auto-hides after 2.5s.
 *
 * Props:
 *   message (string)  — text to display
 *   onDone  (fn)      — called after the toast hides
 */
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function ScanToast({ message, onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    const enterTimer = requestAnimationFrame(() => setVisible(true));

    // Start exit after 2.2s, then call onDone after transition
    const hideTimer = setTimeout(() => setVisible(false), 2200);
    const doneTimer = setTimeout(() => onDone?.(), 2600);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 18px',
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px #e2f5ea',
        borderLeft: '4px solid #22c55e',
        transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 32px))',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        maxWidth: 320,
        pointerEvents: 'none',
      }}
    >
      <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: '#166534',
        lineHeight: 1.3,
      }}>
        {message}
      </span>
    </div>
  );
}
