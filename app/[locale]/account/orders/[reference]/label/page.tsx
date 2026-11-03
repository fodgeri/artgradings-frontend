import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ParcelLabel } from "@/components/orders/parcel-label";
import { PrintButton } from "@/components/orders/print-button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { loadOrder } from "@/lib/orders/load-orders";
import { printablesAvailable } from "@/lib/orders/next-action";
import { orderQrSvg } from "@/lib/orders/qr";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders.printables");
  return { title: t("labelTitle"), description: t("labelMeta"), robots: { index: false } };
}

/** The parcel label to print. 404 unless it is the caller's and has been paid. */
export default async function LabelPage({ params }: PageProps<"/[locale]/account/orders/[reference]/label">) {
  const { locale: rawLocale, reference } = await params;
  const locale = resolveLocale(rawLocale);
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();
  const user = await requireUser({ locale, next: `/account/orders/${reference}/label` });

  const order = await loadOrder(await createClient(), reference, user.id);
  if (!order || !printablesAvailable(order.status)) notFound();

  const t = await getTranslations("orders.printables");
  const qrSvg = await orderQrSvg(order.reference);

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-4 print:hidden">
            <Link
              href={`/account/orders/${order.reference}`}
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {t("back")}
            </Link>
            <PrintButton />
          </div>
          <ParcelLabel reference={order.reference} qrSvg={qrSvg} />
        </div>
      </Container>
    </Section>
  );
}
