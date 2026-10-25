/** The Pinnacle peak glyph. Decorative: hidden from assistive tech. */
export function SummitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" aria-hidden="true" focusable="false" className={className}>
      <path d="M0 20 L12 4 L16 9 L20 0 L32 20 Z" fill="currentColor" />
    </svg>
  );
}
