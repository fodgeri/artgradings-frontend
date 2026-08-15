import type { Metadata } from "next";

import { Container } from "@/components/ui/container";

import { ColorSection } from "./_sections/color-section";
import { ControlSection } from "./_sections/control-section";
import { SlabSection } from "./_sections/slab-section";
import { SurfaceSection } from "./_sections/surface-section";
import { TypeSection } from "./_sections/type-section";

/**
 * Internal design system gallery.
 *
 * Deliberately NOT behind an environment check: a components page leaks
 * nothing, and gating it means it stops working exactly where you most want to
 * check a rendering bug — production. It is excluded from indexing instead.
 *
 * Copy in this route and its `_sections` is exempt from the
 * no-hardcoded-strings rule; see CLAUDE.md.
 */
export const metadata: Metadata = {
  title: "Design system — ArtsGrading",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return (
    <Container>
      <div className="flex flex-col gap-20 py-16">
        <header>
          <h1 className="font-serif text-display text-ink">Design system</h1>
          <p className="mt-4 max-w-prose text-lead text-muted">
            Every token and primitive, rendered through the real layout and fonts. Use
            the theme control in the header to check both themes.
          </p>
        </header>
        <ColorSection />
        <TypeSection />
        <SurfaceSection />
        <ControlSection />
        <SlabSection />
      </div>
    </Container>
  );
}
