import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShippingStep } from "@/components/submit/shipping-step";
import { StepIndicator } from "@/components/submit/step-indicator";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "@/i18n/navigation";
import { cardProblems } from "@/lib/orders/card-rules";
import { loadCatalog } from "@/lib/orders/catalog";
import { loadDraft, loadPrefill } from "@/lib/orders/load-draft";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submit.shipping");
  return { title: t("title"), description: t("metaDescription") };
}

/** Step 2 of the submission wizard: contact details and how the cards travel. */
export default async function ShippingPage({ params }: PageProps<"/[locale]/submit/shipping">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/submit/shipping" });
  const t = await getTranslations("submit.shipping");

  const supabase = await createClient();
  const catalog = await loadCatalog(supabase);
  const draft = await loadDraft(supabase);

  // No draft, or a card still unfinished: back to step 1.
  if (
    !draft ||
    draft.cards.length === 0 ||
    draft.cards.some((card) => cardProblems(card, catalog).length > 0)
  ) {
    return redirect({ href: "/submit", locale });
  }

  const prefill = await loadPrefill(supabase, user.id);

  return (
    <Section>
      <Container>
        <StepIndicator current="shipping" />
        <h1 className="mb-2 mt-6 font-serif text-h2 text-ink">{t("title")}</h1>
        <p className="mb-8 max-w-prose text-muted">{t("lead")}</p>
        <ShippingStep draft={draft} catalog={catalog} prefill={prefill} />
      </Container>
    </Section>
  );
}
