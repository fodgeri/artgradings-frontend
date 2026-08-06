import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function Home() {
  // `useTranslations` is sync and works in Server Components — no `await`,
  // and the messages never reach the client bundle from here.
  const t = useTranslations("home");

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col justify-center gap-10 py-32 px-8 sm:px-16">
        <div className="flex flex-col gap-6">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50">
            {t("title")}
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            href="/submit"
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href="/how-it-works"
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </main>
    </div>
  );
}
