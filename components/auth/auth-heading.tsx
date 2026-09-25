/** The h1 and lead at the top of every auth page. */
export function AuthHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-h2 text-ink">{title}</h1>
      {lead && <p className="mt-3 text-muted">{lead}</p>}
    </div>
  );
}
