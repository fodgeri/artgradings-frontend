import { useTranslations } from "next-intl";

/** The QR code as an `<img>` with a data URI, which keeps `dangerouslySetInnerHTML` out of it. */
export function OrderQr({ svg, reference, size }: { svg: string; reference: string; size: number }) {
  const t = useTranslations("orders.printables");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an inline data URI; next/image has nothing to optimise
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={t("qrAlt", { reference })}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}
