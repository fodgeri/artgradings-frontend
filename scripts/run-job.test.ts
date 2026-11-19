// @vitest-environment node
import { expect, test } from "vitest";

import { sign } from "./run-job.mjs";

test("signs like the database does", () => {
  expect(sign("search-delta", 1700000000, "test-secret")).toBe(
    "v1=ddd04777c2cff12e41d54cc8289adcc03281c52774b146301d41bd949816acfb",
  );
});
