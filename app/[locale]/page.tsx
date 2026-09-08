import { useTranslations } from "next-intl";

import { CtaBand } from "@/components/sections/cta-band";
import { FaqSection } from "@/components/sections/faq-section";
import { Hero } from "@/components/sections/hero";
import { type Step, Steps } from "@/components/sections/steps";
import { Showcase } from "@/components/sections/showcase";
import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import { type AccordionItem } from "@/components/ui/accordion";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";

export default function Home() {
  // `useTranslations` is sync and works in Server Components — no `await`, and
  // the messages never reach the client bundle from here.
  const t = useTranslations("home");
  const steps: Step[] = useTranslations("howItWorks").raw("steps");
  const faqItems: AccordionItem[] = useTranslations("faq").raw("items");

  return (
    // Not a <main>: the locale layout already provides the one main landmark,
    // and a second would make the document ambiguous.
    <>
      <Hero cards={SAMPLE_SLABS} />

      <Section>
        <Container>
          <div className="max-w-[560px]">
            <Eyebrow>{t("stepsTitle")}</Eyebrow>
            <h2 className="mt-3 font-serif text-h2 text-ink">{t("stepsHeading")}</h2>
          </div>

          <Steps items={steps} className="mt-12" />

          <p className="mt-8">
            <Link
              href="/how-it-works"
              className="focus-ring text-sm font-semibold text-gold-ink hover:underline"
            >
              {t("stepsLink")} <span aria-hidden>→</span>
            </Link>
          </p>
        </Container>
      </Section>

      <Showcase cards={SAMPLE_SLABS} />

      {/* The slice lives here rather than inside FaqSection: the section
          renders what it is given, so the landing and /faq differ in their
          data rather than in a flag. */}
      <FaqSection
        items={faqItems.slice(0, 4)}
        heading={t("faqTitle")}
        footerLink={{ href: "/faq", label: t("faqLink") }}
      />

      <CtaBand />
    </>
  );
}
