"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { type SlabData, Slab } from "@/components/slab/slab";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";

const ALL = "all";

/**
 * The recently-graded grid, on a dark band.
 *
 * The only client component in this work: its filter is local state over an
 * array that is already loaded, so there is no request and no suspense.
 *
 * `cards` is the M4 swap point — the same `SlabData[]` arrives from the Pop
 * Report instead of fixtures and nothing here changes.
 *
 * Categories are derived from the data rather than hardcoded, so a category
 * that exists in M4's real data cannot silently lose its filter.
 */
export function Showcase({ cards }: { cards: SlabData[] }) {
  const t = useTranslations("home");
  const [category, setCategory] = useState(ALL);

  const options = useMemo(() => {
    const seen = [...new Set(cards.map((card) => card.category))];
    return [{ value: ALL, label: t("filterAll") }, ...seen.map((c) => ({ value: c, label: c }))];
  }, [cards, t]);

  const visible = category === ALL ? cards : cards.filter((c) => c.category === category);

  return (
    <Section invert>
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>{t("showcaseEyebrow")}</Eyebrow>
            <h2 className="mt-3 max-w-[560px] font-serif text-h2 text-ink">
              {t("showcaseTitle")}
            </h2>
          </div>

          <SegmentedControl
            options={options}
            value={category}
            onValueChange={setCategory}
            label={t("showcaseEyebrow")}
          />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((card) => (
            <Slab key={card.cert} data={card} />
          ))}
        </div>
      </Container>
    </Section>
  );
}
