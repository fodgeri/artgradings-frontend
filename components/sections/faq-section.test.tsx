import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { FaqSection } from "./faq-section";

const items = messages.faq.items;

describe("FaqSection", () => {
  test("renders every question", () => {
    renderWithIntl(<FaqSection items={items} heading={messages.faq.title} />);
    for (const item of items) {
      expect(screen.getByRole("button", { name: item.question })).toBeInTheDocument();
    }
  });

  test("toggles a panel open and closed", async () => {
    const { user } = renderWithIntl(
      <FaqSection items={items} heading={messages.faq.title} />,
    );
    const trigger = screen.getByRole("button", { name: items[0].question });

    expect(screen.queryByText(items[0].answer)).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText(items[0].answer)).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByText(items[0].answer)).not.toBeInTheDocument();
  });

  test("renders its heading as an h2 so the page keeps a single h1", () => {
    renderWithIntl(<FaqSection items={items} heading={messages.faq.title} />);
    expect(
      screen.getByRole("heading", { level: 2, name: messages.faq.title }),
    ).toBeInTheDocument();
  });

  test("omits the heading when none is given", () => {
    // /faq passes none: its page h1 already introduces the accordion, and an
    // h2 repeating it would print the same words twice.
    renderWithIntl(<FaqSection items={items} />);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  test("renders the trailing link only when one is given", () => {
    const { unmount } = renderWithIntl(
      <FaqSection items={items} heading={messages.faq.title} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    unmount();

    renderWithIntl(
      <FaqSection
        items={items}
        heading={messages.faq.title}
        footerLink={{ href: "/faq", label: messages.home.faqLink }}
      />,
    );
    expect(screen.getByRole("link", { name: messages.home.faqLink })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
