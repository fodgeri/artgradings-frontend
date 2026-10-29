import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { ParcelLabel } from "./parcel-label";

describe("ParcelLabel", () => {
  test("shows the reference and a QR image named after it", () => {
    renderWithIntl(<ParcelLabel reference="AG-0123ABCD" qrSvg="<svg/>" />);
    expect(screen.getByText("AG-0123ABCD")).toBeInTheDocument();
    const img = screen.getByAltText(messages.orders.printables.qrAlt.replace("{reference}", "AG-0123ABCD"));
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText(messages.orders.printables.artAddress)).toBeInTheDocument();
  });
});
