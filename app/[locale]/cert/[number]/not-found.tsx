import { useTranslations } from "next-intl";

import { CertLookupForm } from "@/components/pop/cert-lookup-form";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

export default function CertNotFound() {
  const t = useTranslations("cert.notFound");
  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col gap-8">
          <header>
            <h1 className="font-serif text-display text-ink">{t("title")}</h1>
            <p className="mt-6 text-lead text-muted">{t("body")}</p>
          </header>
          <CertLookupForm />
        </div>
      </Container>
    </Section>
  );
}
