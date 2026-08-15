import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import { GradeBadge } from "@/components/slab/grade-badge";
import { Slab } from "@/components/slab/slab";
import { Stat, StatStrip } from "@/components/ui/stat";

export function SlabSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Slab</h2>
      <p className="mt-2 max-w-prose text-lead text-muted">
        Sample data only. Grades, certificate numbers, and the grading scale itself are
        client-supplied and must never be rendered on a public page from these fixtures.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_SLABS.map((slab) => (
          <Slab key={slab.cert} data={slab} />
        ))}
      </div>
      <div className="mt-8 flex items-end gap-6">
        <GradeBadge grade="10" label="GEM MINT" />
        <GradeBadge grade="9.5" label="MINT+" size="lg" />
      </div>
      <div className="mt-10">
        <StatStrip>
          <Stat value="1.2M+" label="Cards certified" />
          <Stat value="48hr" label="Vault express" />
          <Stat value="100%" label="Guarantee" />
          <Stat value="4-point" label="Sub-grade report" />
        </StatStrip>
      </div>
    </div>
  );
}
