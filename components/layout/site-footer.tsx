import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Wordmark } from "@/components/layout/wordmark";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

function Column({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {heading}
      </h2>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring mb-[11px] block text-sm text-ink/80 transition-colors duration-150 hover:text-gold-ink"
    >
      {children}
    </Link>
  );
}

export function SiteFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");

  return (
    <footer className="surface-invert">
      <Container>
        <div className="border-t border-hairline pb-[50px] pt-[70px]">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <Wordmark />
              <p className="mt-4 max-w-[260px] text-sm text-muted">{t("tagline")}</p>
            </div>

            <Column heading={t("service")}>
              <FooterLink href="/how-it-works">{nav("howItWorks")}</FooterLink>
              <FooterLink href="/pricing">{nav("pricing")}</FooterLink>
              <FooterLink href="/submit">{nav("submit")}</FooterLink>
              <FooterLink href="/pop-report">{nav("popReport")}</FooterLink>
            </Column>

            <Column heading={t("company")}>
              <FooterLink href="/about">{t("about")}</FooterLink>
              <FooterLink href="/standard">{t("standard")}</FooterLink>
            </Column>

            <Column heading={t("support")}>
              <FooterLink href="/faq">{nav("faq")}</FooterLink>
              <FooterLink href="/track">{t("track")}</FooterLink>
              <FooterLink href="/cert">{t("certLookup")}</FooterLink>
              <FooterLink href="/contact">{t("contact")}</FooterLink>
            </Column>
          </div>

          <div className="mt-14 flex flex-col gap-3 border-t border-hairline pt-[26px] font-mono text-[11px] tracking-[0.08em] text-muted sm:flex-row sm:items-center sm:justify-between">
            {/* The header drops the theme control below `sm`, where it does
                not fit; this is its mobile home. Both instances read the same
                store, so only one is ever mounted visibly and they cannot
                disagree. */}
            <div className="mb-2 sm:hidden">
              <ThemeToggle />
            </div>
            <span>{t("copyright", { year: new Date().getFullYear() })}</span>
            <span>{t("legal")}</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
