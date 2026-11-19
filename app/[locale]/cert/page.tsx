import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CertLookupForm } from "@/components/pop/cert-lookup-form";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { normaliseCertNumber } from "@/lib/pop/cert-number";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cert");
  return { title: t("title"), description: t("metaDescription") };
}

export default async function CertLookupPage({ params, searchParams }: PageProps<"/[locale]/cert">) {
  const { locale } = await params;
  const raw = (await searchParams).number;
  const input = Array.isArray(raw) ? raw[0] : raw;
  const t = await getTranslations("cert");

  const normalised = input === undefined ? null : normaliseCertNumber(input);
  if (normalised) {
    return redirect({ href: `/cert/${encodeURIComponent(normalised)}`, locale: resolveLocale(locale) });
  }

  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col gap-8">
          <header>
            <h1 className="font-serif text-display text-ink">{t("title")}</h1>
            <p className="mt-6 text-lead text-muted">{t("lead")}</p>
          </header>
          <CertLookupForm defaultValue={input?.slice(0, 64)} />
          {input !== undefined && (
            <p role="alert" className="text-ink">
              {t("notFound.body")}
            </p>
          )}
        </div>
      </Container>
    </Section>
  );
}
