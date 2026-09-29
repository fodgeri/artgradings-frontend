import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";

import { loadSettings } from "./load-settings";
import { SettingsCards } from "./settings-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.settings");
  return { title: t("title") };
}

/** Profile and settings. `loadSettings` says where each value comes from. */
export default async function SettingsPage({ params }: PageProps<"/[locale]/account/settings">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account/settings" });
  const t = await getTranslations("auth.settings");

  const settings = await loadSettings(locale, user);

  return (
    <Section>
      <Container>
        <div className="mx-auto w-full max-w-[640px]">
          <Link href="/account" className="focus-ring text-sm font-semibold text-gold-ink underline">
            {t("backToAccount")}
          </Link>
          <h1 className="mt-4 mb-8 font-serif text-h2 text-ink">{t("title")}</h1>
          <SettingsCards
            firstName={settings.firstName}
            lastName={settings.lastName}
            email={settings.email}
          />
        </div>
      </Container>
    </Section>
  );
}
