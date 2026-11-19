import { describe, expect, test } from "vitest";

import { CATEGORY_KEYS } from "@/lib/pop/keys";
import type { PopSearch } from "@/lib/pop/search-params";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SearchForm } from "./search-form";

describe("SearchForm", () => {
  test("is a plain GET form that submits to nothing but the page", () => {
    const { container } = renderWithIntl(<SearchForm search={{ q: "", page: 1 }} />);
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.hasAttribute("action")).toBe(false);
  });

  test("is prefilled from the parsed search", () => {
    const search: PopSearch = { q: "pikachu", kind: "tcg", category: "pokemon", year: 1999, grade: "g10", page: 3 };
    renderWithIntl(<SearchForm search={search} />);
    expect((screen.getByLabelText(messages.pop.search.form.q) as HTMLInputElement).value).toBe("pikachu");
    expect((screen.getByLabelText(messages.pop.search.form.kind) as HTMLSelectElement).value).toBe("tcg");
    expect((screen.getByLabelText(messages.pop.search.form.category) as HTMLSelectElement).value).toBe("pokemon");
    expect((screen.getByLabelText(messages.pop.search.form.year) as HTMLInputElement).value).toBe("1999");
    expect((screen.getByLabelText(messages.pop.search.form.grade) as HTMLSelectElement).value).toBe("g10");
  });

  test("offers every category and the authentic grade option", () => {
    renderWithIntl(<SearchForm search={{ q: "", page: 1 }} />);
    const category = screen.getByLabelText(messages.pop.search.form.category) as HTMLSelectElement;
    expect([...category.options].map((o) => o.value)).toEqual(["", ...CATEGORY_KEYS]);
    const grade = screen.getByLabelText(messages.pop.search.form.grade) as HTMLSelectElement;
    expect([...grade.options].map((o) => o.value)).toContain("authentic");
  });
});
