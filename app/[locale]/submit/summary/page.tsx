import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SummaryStep } from "@/components/submit/summary-step";
import { StepIndicator } from "@/components/submit/step-indicator";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { loadCatalog } from "@/lib/orders/catalog";
import { orderErrorKey, reportOrderError } from "@/lib/orders/errors";
import { loadDraft } from "@/lib/orders/load-draft";
import { mapQuote } from "@/lib/orders/map-quote";
import { summaryRedirect } from "@/lib/orders/step-redirect";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submit.summary");
  return { title: t("title"), description: t("metaDescription") };
}

/** Step 3 of the submission wizard: the server's quote, then submit. */
export default async function SummaryPage({ params }: PageProps<"/[locale]/submit/summary">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/submit/summary" });
  const t = await getTranslations("submit.summary");

  const supabase = await createClient();
  const catalog = await loadCatalog(supabase);
  const draft = await loadDraft(supabase, user.id);

  // A withdrawn service or tier goes back with `?problem=`, so the reason survives.
  const back = summaryRedirect(draft, catalog);
  if (back !== null || draft === null) return redirect({ href: back ?? "/submit", locale });

  // The server's figures are the only ones shown here.
  const { data, error } = await supabase.rpc("quote_order");
  if (error) {
    const key = orderErrorKey(error);
    if (key === "generic") {
      reportOrderError("submitOrder", error.code ?? "unknown");
      throw new Error("Could not quote the order");
    }
    return redirect({ href: `/submit?problem=${key}`, locale });
  }

  return (
    <Section>
      <Container>
        <StepIndicator current="summary" />
        <h1 className="mb-2 mt-6 font-serif text-h2 text-ink">{t("title")}</h1>
        <p className="mb-8 max-w-prose text-muted">{t("lead")}</p>
        <SummaryStep draft={draft} quote={mapQuote(data)} />
      </Container>
    </Section>
  );
}
