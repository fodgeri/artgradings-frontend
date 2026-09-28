import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { SettingsCards } from "./settings-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.settings");
  return { title: t("title") };
}

/**
 * Profile and settings. The address shown comes from Auth, not the JWT, which
 * lags an email change made on another device by up to an hour.
 */
export default async function SettingsPage({ params }: PageProps<"/[locale]/account/settings">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account/settings" });
  const t = await getTranslations("auth.settings");

  const supabase = await createClient();
  const [{ data: profile, error }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
    supabase.auth.getUser(),
  ]);
  // Every user has a profile (the provisioning trigger). Failing to read it is
  // an outage, reported by onRequestError — the message carries no user data.
  if (error || !profile) throw new Error("Could not load the profile for the settings page");

  return (
    <Section>
      <Container>
        <div className="mx-auto w-full max-w-[640px]">
          <Link href="/account" className="focus-ring text-sm font-semibold text-gold-ink underline">
            {t("backToAccount")}
          </Link>
          <h1 className="mt-4 mb-8 font-serif text-h2 text-ink">{t("title")}</h1>
          <SettingsCards
            firstName={profile.first_name}
            lastName={profile.last_name}
            email={auth.user?.email ?? user.email}
          />
        </div>
      </Container>
    </Section>
  );
}
