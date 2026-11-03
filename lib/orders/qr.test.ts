// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { toString } = vi.hoisted(() => ({ toString: vi.fn(async () => "<svg/>") }));
vi.mock("qrcode", () => ({ default: { toString } }));

import { orderQrSvg } from "./qr";

beforeEach(() => vi.stubEnv("SITE_URL", "https://example.test/"));
afterEach(() => {
  vi.unstubAllEnvs();
  toString.mockClear();
});

test("the QR code encodes the absolute /o/<reference> URL", async () => {
  await expect(orderQrSvg("AG-0123ABCD")).resolves.toBe("<svg/>");
  expect(toString).toHaveBeenCalledWith("https://example.test/o/AG-0123ABCD", {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
  });
});
