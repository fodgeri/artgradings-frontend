/**
 * The three fixed radial blobs behind the page.
 *
 * Purely decorative, so `aria-hidden` and no pointer events. Intensity is
 * themed through `--ag-glow-opacity`: a faint gold wash on paper (0.18), the
 * full effect on black (0.55), and nothing at all when the user has asked for
 * reduced transparency.
 */
export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[var(--ag-glow-opacity)] [@media(prefers-reduced-transparency:reduce)]:hidden"
    >
      <div className="absolute -left-[130px] -top-[170px] size-[620px] rounded-full bg-[radial-gradient(circle,var(--ag-gold),transparent_70%)] opacity-[0.42] blur-[130px]" />
      <div className="absolute -right-[240px] top-[560px] size-[720px] rounded-full bg-[radial-gradient(circle,var(--ag-glow-cool),transparent_70%)] opacity-[0.24] blur-[130px]" />
      <div className="absolute bottom-[240px] left-[32%] size-[560px] rounded-full bg-[radial-gradient(circle,var(--ag-gold),transparent_70%)] opacity-[0.16] blur-[130px]" />
    </div>
  );
}
