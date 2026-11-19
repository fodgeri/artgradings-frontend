import { describe, expect, test } from "vitest";

import type { PopCertificate } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { Certificate, WithdrawnCertificate } from "./certificate";

type Pub = Extract<PopCertificate, { status: "public" }>;
const grades = [{ key: "g10" as const, value: 10 }, { key: "g9" as const, value: 9 }];
const cert = (o: Partial<Pub> = {}): Pub => ({
  status: "public", certNumber: "ART-08831204", cardId: "c1", cardName: "Charizard", cardNumber: "4/102",
  variant: null, setId: "s1", setName: "Base Set", category: "pokemon", releaseYear: 1999, language: "en",
  service: null, cardGrade: "g10", autographGrade: null, cardAuthentication: null,
  autographAuthentication: null, publishedAt: "2026-03-04T10:00:00Z", cardTotal: 12, gradedHigher: 0, ...o,
});

describe("Certificate", () => {
  test("shows the grade label, cert number, higher count and card link", () => {
    renderWithIntl(<Certificate cert={cert({ gradedHigher: 3 })} grades={grades} />);
    expect(screen.getAllByText(messages.catalog.grades.g10.label).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ART-08831204").length).toBeGreaterThan(0);
    expect(screen.getByText(/\b3\b/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.cert.viewCard })).toHaveAttribute(
      "href",
      "/pop-report/cards/c1",
    );
  });

  test("hides graded higher when unknown", () => {
    renderWithIntl(<Certificate cert={cert({ gradedHigher: null })} grades={grades} />);
    expect(screen.queryByText(/graded higher/)).not.toBeInTheDocument();
  });

  test("autograph line is absent when there is no autograph grade", () => {
    renderWithIntl(<Certificate cert={cert()} grades={grades} />);
    expect(screen.queryByText(messages.cert.autographGrade)).not.toBeInTheDocument();
  });

  test("autograph line is present with an autograph grade", () => {
    renderWithIntl(<Certificate cert={cert({ autographGrade: "g9" })} grades={grades} />);
    expect(screen.getByText(messages.cert.autographGrade)).toBeInTheDocument();
  });

  test("an authentic-only copy shows the authentic wording instead of a numeral", () => {
    renderWithIntl(
      <Certificate cert={cert({ cardGrade: null, cardAuthentication: "genuine" })} grades={grades} />,
    );
    expect(screen.getByText(messages.pop.table.authentic)).toBeInTheDocument();
    expect(screen.queryByText(messages.cert.cardGrade)).not.toBeInTheDocument();
  });
});

describe("WithdrawnCertificate", () => {
  test("shows the withdrawn copy and no card data", () => {
    renderWithIntl(<WithdrawnCertificate certNumber="ART-08831204" />);
    expect(screen.getByText(messages.cert.withdrawn.title)).toBeInTheDocument();
    expect(screen.getByText(/ART-08831204/)).toBeInTheDocument();
    expect(screen.queryByText("Charizard")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
