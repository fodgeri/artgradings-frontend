import { describe, expect, test } from "vitest";
import messages from "@/messages/en.json";
import { CATEGORY_KEYS, GRADE_KEYS } from "./keys";

describe("catalogue keys", () => {
  test.each(CATEGORY_KEYS)("category %s has a label", (key) => {
    expect(messages.catalog.categories[key].label).toBeTruthy();
  });

  test.each(GRADE_KEYS)("grade %s has a label", (key) => {
    expect(messages.catalog.grades[key].label).toBeTruthy();
  });

  test("both category kinds have a label", () => {
    expect(messages.catalog.kinds.tcg.label).toBeTruthy();
    expect(messages.catalog.kinds.sports.label).toBeTruthy();
  });

  test("the scale has nineteen grades", () => {
    expect(GRADE_KEYS).toHaveLength(19);
  });
});
