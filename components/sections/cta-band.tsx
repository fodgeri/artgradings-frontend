import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";

/**
 * The closing call to action.
 *
 * Its heading is larger than `text-h2` in the design. One instance does not
 * earn a scale entry, so it takes an explicit size rather than a new token.
 *
 * `/submit` 404s until M3 — the same status the header's Submit button already
 * has, and recorded in `docs/content-requests.md`.
 */
export function CtaBand() {
  const t = useTranslations("home");

  return (
    <Section invert>
      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col items-center py-[46px] text-center">
          <h2 className="font-serif text-[clamp(2rem,1.5rem+2.2vw,3.25rem)] leading-[1.05] tracking-[-0.015em] text-ink">
            {t("ctaTitle")}
          </h2>
          <p className="mt-5 text-lead text-muted">{t("ctaLead")}</p>

          <Link href="/submit" className={`${buttonVariants({ variant: "gold" })} mt-9`}>
            {t("ctaPrimary")}
          </Link>
        </div>
      </Container>
    </Section>
  );
}
