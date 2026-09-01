import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

export function SurfaceSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Surfaces</h2>
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="p-6">
          <div className="font-mono text-meta text-muted">Card · solid</div>
          <p className="mt-2 text-ink">bg-surface-raised, hairline, shadow-card</p>
        </Card>
        <Card variant="glass" className="p-6">
          <div className="font-mono text-meta text-muted">Card · glass</div>
          <p className="mt-2 text-ink">the `glass` utility</p>
        </Card>
        <div className="glass-strong rounded-panel p-6">
          <div className="font-mono text-meta text-muted">glass-strong</div>
          <p className="mt-2 text-ink">elevated frosted panel</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Chip>Order ART-20481104</Chip>
        <Chip>TCG</Chip>
      </div>
      <div className="surface-invert mt-6 rounded-panel p-6">
        <div className="font-mono text-meta text-muted">surface-invert</div>
        <p className="mt-2 text-ink">
          Role tokens redefined locally — including gold-ink, which flips to the
          brighter gold because the darkened one fails on ink.
        </p>
      </div>
    </div>
  );
}
