import { useTranslations } from "next-intl";

import { OrderQr } from "./order-qr";

/** A cut-out parcel label, roughly 10 x 15 cm in print. */
export function ParcelLabel({ reference, qrSvg }: { reference: string; qrSvg: string }) {
  const t = useTranslations("orders.printables");
  return (
    <div className="flex h-[15cm] w-[10cm] flex-col items-center justify-between border-2 border-dashed border-black bg-white p-[0.8cm] text-black">
      <OrderQr svg={qrSvg} reference={reference} size={220} />
      <div className="text-center">
        <p className="m-0 font-mono text-label uppercase">{t("referenceLabel")}</p>
        <p className="m-0 font-mono text-3xl font-bold tracking-wider">{reference}</p>
      </div>
      <div className="w-full border-t border-black pt-3">
        <p className="m-0 font-mono text-label uppercase">{t("shipTo")}</p>
        <p className="m-0 whitespace-pre-line text-base">{t("artAddress")}</p>
      </div>
    </div>
  );
}
