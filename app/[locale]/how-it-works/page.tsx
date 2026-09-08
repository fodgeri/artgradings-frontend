import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { CtaBand } from "@/components/sections/cta-band";
import { type Step, Steps } from "@/components/sections/steps";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

/**
 * `getTranslations` rather than `useTranslations`: metadata generation is an
 * async context, where the sync hook is unavailable.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("howItWorks");
  return { title: t("title"), description: t("lead") };
}

export default function HowItWorksPage() {
  const t = useTranslations("howItWorks");
  const steps: Step[] = t.raw("steps");

  return (
    <>
      <Section>
        <Container>
          <div className="max-w-[720px]">
            <h1 className="font-serif text-display text-ink">{t("title")}</h1>
            <p className="mt-6 text-lead text-muted">{t("lead")}</p>
          </div>

          <Steps items={steps} className="mt-14" />
        </Container>
      </Section>

      <CtaBand />
    </>
  );
}
