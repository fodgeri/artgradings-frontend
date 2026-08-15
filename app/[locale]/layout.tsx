import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AmbientGlow } from "@/components/layout/ambient-glow";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeScript } from "@/components/layout/theme-script";
import { routing } from "@/i18n/routing";
import "../globals.css";

// All three faces ship a variable version, so `weight` is omitted on purpose:
// that loads the full axis range in one file instead of one file per weight.
const serif = Newsreader({
  variable: "--ag-font-serif",
  subsets: ["latin"],
  display: "swap",
});

const sans = Hanken_Grotesk({
  variable: "--ag-font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--ag-font-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Prerender every locale at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  // The `[locale]` segment matches anything, so reject unknown codes here.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    // `suppressHydrationWarning` because ThemeScript mutates the `data-theme`
    // attribute before React hydrates, which React would otherwise report as
    // a server/client mismatch.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {/* Without props, the provider inherits locale, messages, time zone
            and formats from the server config in `i18n/request.ts`. */}
        <NextIntlClientProvider>
          <AmbientGlow />
          {/* The glow is `position: fixed` at z-0, so page content needs its
              own stacking context to sit above it. */}
          <div className="relative z-10 flex min-h-full flex-col">
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
            <SiteFooter />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
