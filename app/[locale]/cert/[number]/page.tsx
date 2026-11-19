import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Certificate, WithdrawnCertificate } from "@/components/pop/certificate";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { normaliseCertNumber } from "@/lib/pop/cert-number";
import { loadCertificate, loadGrades } from "@/lib/pop/load";

/** Always fresh: a withdrawal must show on the next scan of the slab. */
async function lookup(param: string) {
  let raw = param;
  try {
    raw = decodeURIComponent(param);
  } catch {
    return { normalised: null, cert: null };
  }
  const normalised = normaliseCertNumber(raw);
  return { normalised, cert: normalised ? await loadCertificate(normalised) : null };
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/cert/[number]">): Promise<Metadata> {
  const { normalised, cert } = await lookup((await params).number);
  const t = await getTranslations("cert");
  if (!normalised || !cert) return { title: t("notFound.title"), robots: { index: false } };
  if (cert.status === "withdrawn") return { title: t("withdrawn.title"), robots: { index: false } };
  return {
    title: t("pageTitle", { number: cert.certNumber }),
    description: t("metaDescription"),
  };
}

export default async function CertificatePage({ params }: PageProps<"/[locale]/cert/[number]">) {
  const { locale, number } = await params;
  const { normalised, cert } = await lookup(number);
  if (!normalised) notFound();
  if (normalised !== number) {
    return redirect({ href: `/cert/${encodeURIComponent(normalised)}`, locale: resolveLocale(locale) });
  }
  if (!cert) notFound();

  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-[960px]">
          {cert.status === "withdrawn" ? (
            <WithdrawnCertificate certNumber={cert.certNumber} />
          ) : (
            <Certificate cert={cert} grades={await loadGrades()} />
          )}
        </div>
      </Container>
    </Section>
  );
}
