import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { CtaBand } from "@/components/sections/cta-band";
import { FaqSection } from "@/components/sections/faq-section";
import { type AccordionItem } from "@/components/ui/accordion";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq");
  return { title: t("title"), description: t("lead") };
}

export default function FaqPage() {
  const t = useTranslations("faq");
  const items: AccordionItem[] = t.raw("items");

  return (
    <>
      {/* The page owns the h1 and the lead. */}
      <Section className="pb-0">
        <Container>
          <div className="mx-auto max-w-[760px]">
            <h1 className="font-serif text-display text-ink">{t("title")}</h1>
            <p className="mt-6 text-lead text-muted">{t("lead")}</p>
          </div>
        </Container>
      </Section>

      {/* No heading: the page h1 above already introduces the accordion. */}
      {/* pt-0: the heading band above already opened the page, and two
          stacked section paddings read as a gap rather than a rhythm. */}
      <FaqSection items={items} className="pt-0" />

      <CtaBand />
    </>
  );
}
