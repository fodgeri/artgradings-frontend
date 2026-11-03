import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { loadOrders } from "@/lib/orders/load-orders";
import { createClient } from "@/lib/supabase/server";
import { OrdersList } from "@/components/orders/orders-list";

import { signOut } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.account");
  return { title: t("title") };
}

/**
 * Where sign-in and confirmation land: the customer's orders, with settings
 * (`/account/settings`) and sign-out alongside.
 */
export default async function AccountPage({
  params,
}: PageProps<"/[locale]/account">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account" });
  const t = await getTranslations("auth.account");
  const o = await getTranslations("orders");
  const orders = await loadOrders(await createClient(), user.id);

  return (
    <Section>
      <Container>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
          <Card className="p-6 sm:p-10">
            <h1 className="font-serif text-h2 text-ink">{t("title")}</h1>
            <p className="mt-3 text-muted">
              {t("signedInAs", { email: user.email })}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/account/settings"
                className={buttonVariants({ variant: "gold" })}
              >
                {t("settings")}
              </Link>
              <form action={signOut.bind(null, locale)}>
                <Button type="submit" variant="ghost">
                  {t("signOut")}
                </Button>
              </form>
            </div>
          </Card>

          <section aria-labelledby="orders-heading">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
              <h2
                id="orders-heading"
                className="m-0 font-serif text-h3 text-ink"
              >
                {o("title")}
              </h2>
              <Link
                href="/submit"
                className={buttonVariants({ variant: "ghost" })}
              >
                {o("startSubmission")}
              </Link>
            </div>
            <OrdersList orders={orders} />
          </section>
        </div>
      </Container>
    </Section>
  );
}
