import { describe, expect, test } from "vitest";

import { JOURNEY } from "@/lib/orders/status";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { StatusTimeline } from "./status-timeline";

const t = messages.orders;
const entry = (toStatus: string, createdAt: string) => ({ fromStatus: null, toStatus, actor: "system", createdAt });

describe("StatusTimeline", () => {
  test("greys out steps not reached and times the reached ones", () => {
    renderWithIntl(
      <StatusTimeline
        status="paid"
        log={[entry("awaiting_payment", "2026-10-01T10:00:00Z"), entry("paid", "2026-10-02T10:00:00Z")]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(JOURNEY.length);
    expect(items[0]).not.toHaveAttribute("aria-disabled");
    expect(items[0].querySelector("time")).toHaveAttribute("datetime", "2026-10-01T10:00:00.000Z");
    expect(items[1]).not.toHaveAttribute("aria-disabled");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    for (const unreached of items.slice(2)) {
      expect(unreached).toHaveAttribute("aria-disabled", "true");
      expect(unreached.querySelector("time")).toBeNull();
    }
  });

  test("a cancelled order ends its timeline at cancelled", () => {
    renderWithIntl(
      <StatusTimeline
        status="cancelled"
        log={[entry("awaiting_payment", "2026-10-01T10:00:00Z"), entry("cancelled", "2026-10-02T10:00:00Z")]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(t.status.awaiting_payment);
    expect(items[1]).toHaveTextContent(t.status.cancelled);
    expect(items[1]).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(t.status.paid)).toBeNull();
  });
});
