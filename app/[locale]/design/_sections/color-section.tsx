const ROLE_TOKENS = [
  "surface",
  "surface-sunken",
  "surface-raised",
  "ink",
  "ink-strong",
  "muted",
  "hairline",
  "gold",
  "gold-ink",
  "gold-bright",
  "gold-soft",
  "gold-line",
  "on-gold",
] as const;

export function ColorSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Colour</h2>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ROLE_TOKENS.map((token) => (
          <div key={token} className="rounded-card border border-hairline p-3">
            <div
              className="h-16 w-full rounded-control border border-hairline-faint"
              style={{ background: `var(--ag-${token})` }}
            />
            <div className="mt-2 font-mono text-meta text-ink">{token}</div>
            <div className="font-mono text-meta text-muted">--ag-{token}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
