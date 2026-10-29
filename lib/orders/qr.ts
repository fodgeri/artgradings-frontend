import "server-only";

import QRCode from "qrcode";

import { siteUrl } from "@/lib/site-url";

import { orderPath } from "./reference";

/** The SVG of a QR code pointing at the order's permanent `/o/<reference>` URL. */
export function orderQrSvg(reference: string): Promise<string> {
  return QRCode.toString(new URL(orderPath(reference), siteUrl()).href, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
  });
}
