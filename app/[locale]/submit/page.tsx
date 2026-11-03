import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CardsStep } from "@/components/submit/cards-step";
import { StepIndicator } from "@/components/submit/step-indicator";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { MAX_CARDS_PER_ORDER } from "@/lib/orders/card-rules";
import { loadCatalog } from "@/lib/orders/catalog";
import { isOrderErrorKey } from "@/lib/orders/errors";
import { loadDraft } from "@/lib/orders/load-draft";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submit.cards");
  return { title: t("title"), description: t("metaDescription") };
}

/** Step 1 of the submission wizard: the cards and the services for each. */
export default async function SubmitPage({ params, searchParams }: PageProps<"/[locale]/submit">) {
  const locale = resolveLocale((await params).locale);
  const problem = (await searchParams).problem;
  const user = await requireUser({ locale, next: "/submit" });
  const t = await getTranslations("submit.cards");
  const errors = await getTranslations("submit.errors");

  const supabase = await createClient();
  const catalog = await loadCatalog(supabase);
  const draft = await loadDraft(supabase, user.id);

  return (
    <Section>
      <Container>
        <StepIndicator current="cards" />
        <h1 className="mb-2 mt-6 font-serif text-h2 text-ink">{t("title")}</h1>
        <p className="mb-8 max-w-prose text-muted">{t("lead")}</p>
        {isOrderErrorKey(problem) && (
          <p role="alert" className="mb-4 text-sm font-medium text-ink">
            {errors(problem, { max: MAX_CARDS_PER_ORDER })}
          </p>
        )}
        <CardsStep initialDraft={draft} catalog={catalog} />
      </Container>
    </Section>
  );
}
