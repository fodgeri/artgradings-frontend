import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";

import { signOut } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.account");
  return { title: t("title") };
}

/**
 * Where sign-in and confirmation land. Deliberately a landing page, not a
 * settings screen — profile and settings are the next M2 spec.
 */
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account" });
  const t = await getTranslations("auth.account");

  return (
    <Section>
      <Container>
        <Card className="mx-auto w-full max-w-[560px] p-6 sm:p-10">
          <h1 className="font-serif text-h2 text-ink">{t("title")}</h1>
          <p className="mt-3 text-muted">{t("signedInAs", { email: user.email })}</p>
          <form action={signOut.bind(null, locale)} className="mt-8">
            <Button type="submit" variant="ghost">
              {t("signOut")}
            </Button>
          </form>
        </Card>
      </Container>
    </Section>
  );
}
