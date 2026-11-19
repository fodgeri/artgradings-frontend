import { describe, expect, test } from "vitest";

import { POP_MAX_PAGE, POP_PAGE_SIZE } from "@/lib/pop/search-params";

import { POP_INDEX_SETTINGS } from "./settings";

describe("POP_INDEX_SETTINGS", () => {
  test("lets the pager reach its last page", () => {
    expect(POP_INDEX_SETTINGS.pagination?.maxTotalHits).toBe(POP_PAGE_SIZE * POP_MAX_PAGE);
  });
});
