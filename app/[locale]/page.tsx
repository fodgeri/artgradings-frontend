import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function Home() {
  // `useTranslations` is sync and works in Server Components — no `await`,
  // and the messages never reach the client bundle from here.
  const t = useTranslations("home");

  return (
    <div className="flex flex-1 flex-col items-center bg-surface">
      {/* Not a <main>: the locale layout already provides the one main
          landmark, and a second would make the document ambiguous. */}
      <div className="flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-8 py-32 sm:px-16">
        <div className="flex flex-col gap-6">
          <h1 className="max-w-xl font-serif text-display text-ink">
            {t("title")}
          </h1>
          <p className="max-w-md text-lead text-muted">{t("subtitle")}</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/submit"
            className="focus-ring gold-fill flex h-12 items-center justify-center rounded-control px-6 text-[15px] font-semibold text-on-gold shadow-gold"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href="/how-it-works"
            className="focus-ring flex h-12 items-center justify-center rounded-control border border-hairline bg-surface-raised px-6 text-[15px] font-semibold text-ink"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </div>
    </div>
  );
}
