import { useTranslations } from "next-intl";

import { type SlabData, Slab } from "@/components/slab/slab";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** The design's variant A: centred, with a row of trending slabs beneath. */
export function Hero({ cards }: { cards: SlabData[] }) {
  const t = useTranslations("home");

  // The design shows exactly three. Capped here rather than at the call site so
  // handing the hero the full fixture array — or M4's real trending query —
  // cannot overflow the row.
  const trending = cards.slice(0, 3);

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-center text-center">
          <Eyebrow>{t("heroEyebrow")}</Eyebrow>

          <h1 className="mt-5 max-w-[880px] font-serif text-display text-ink">
            {t("title")}
          </h1>

          <p className="mt-6 max-w-[600px] text-lead text-muted">{t("subtitle")}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/submit" className={buttonVariants({ variant: "gold" })}>
              {t("ctaPrimary")}
            </Link>
            {/* The design pointed this at #pricing. Pricing is deferred — its
                tiers and turnarounds are invented — so it points at the process
                instead. Tracked in docs/content-requests.md. */}
            <Link href="/how-it-works" className={buttonVariants({ variant: "ghost" })}>
              {t("ctaSecondary")}
            </Link>
          </div>

          <StatStrip className="mt-14">
            {t.raw("stats").map((stat: { value: string; label: string }) => (
              <Stat key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </StatStrip>
        </div>

        {/* One slab on mobile, two on tablet, three on desktop. The row caps
            rather than wrapping: a slab below its legible width reads as a
            thumbnail, and an orphan on a second row reads as a mistake. The
            surplus slabs stay in the DOM and are hidden by breakpoint, which
            keeps the markup identical across viewports. */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trending.map((card, index) => (
            <Slab
              key={card.cert}
              data={card}
              className={cn(
                index === 1 && "hidden sm:block",
                index === 2 && "hidden lg:block",
              )}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}
