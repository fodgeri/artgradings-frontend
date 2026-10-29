import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { NextActionKind } from "@/lib/orders/next-action";

/**
 * What the customer does next: pay (or learn that online payment is not
 * available yet), or send / bring the cards with the label and the form.
 */
export function NextAction({ reference, action }: { reference: string; action: NextActionKind }) {
  const t = useTranslations("orders.next");
  const base = `/account/orders/${reference}`;

  if (action.kind === "none") return null;

  if (action.kind === "paymentUnavailable") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("heading")}</h2>
        <p className="m-0 text-muted">{t("paymentUnavailable")}</p>
      </Card>
    );
  }

  if (action.kind === "pay") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("heading")}</h2>
        <Link href={`${base}/pay`} className={buttonVariants({ variant: "gold" })}>
          {t("pay")}
        </Link>
      </Card>
    );
  }

  const kind = action.kind;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-3 font-serif text-h3 text-ink">{t(`${kind}.title`)}</h2>
      <p className="m-0 text-muted">{t(`${kind}.instructions`)}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`${base}/label`} className={buttonVariants({ variant: "gold" })}>
          {t(`${kind}.label`)}
        </Link>
        <Link href={`${base}/form`} className={buttonVariants({ variant: "ghost" })}>
          {t(`${kind}.form`)}
        </Link>
      </div>
    </Card>
  );
}
