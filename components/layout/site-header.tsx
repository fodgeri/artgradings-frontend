import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** The typographic wordmark. Logo design is out of scope; this is the design's own mark. */
function Wordmark() {
  return (
    <Link
      href="/"
      className="focus-ring flex items-baseline font-serif text-[23px] font-medium text-ink"
    >
      Art<span className="text-gold">.</span>
    </Link>
  );
}

export function SiteHeader() {
  const t = useTranslations("nav");

  const links = [
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/pop-report", label: t("popReport") },
    { href: "/pricing", label: t("pricing") },
    { href: "/faq", label: t("faq") },
  ] as const;

  return (
    <header className="glass sticky top-0 z-50 rounded-none border-x-0 border-t-0">
      <Container>
        <nav className="flex h-[70px] items-center justify-between">
          <Wordmark />

          {/* Below `lg` the link row is replaced by the theme toggle and the
              CTA alone. A drawer arrives with the real page set in M1; there
              are four links and nothing to hide behind a hamburger yet. */}
          <div className="hidden items-center gap-[30px] lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="focus-ring text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3.5">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="focus-ring hidden text-sm font-medium text-muted transition-colors duration-150 hover:text-ink sm:block"
            >
              {t("signIn")}
            </Link>
            <Link
              href="/submit"
              className={cn(buttonVariants({ variant: "gold", size: "sm" }))}
            >
              {t("submit")}{" "}
              <span aria-hidden className="font-mono">
                →
              </span>
            </Link>
          </div>
        </nav>
      </Container>
    </header>
  );
}
