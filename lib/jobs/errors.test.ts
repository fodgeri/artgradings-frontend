// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
const captureMessage = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException, captureMessage }));

import { reportJobError } from "./errors";

beforeEach(() => {
  captureException.mockReset();
  captureMessage.mockReset();
});

describe("reportJobError", () => {
  test("an ordinary failure is an exception with the job and code tags", () => {
    reportJobError("search-delta", "rpc_failed");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { "job.name": "search-delta", "job.code": "rpc_failed" },
    });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  test("an unconfigured Meilisearch is a warning message, not an exception", () => {
    reportJobError("search-delta", "meili_unavailable");
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith("Job error in search-delta", {
      level: "warning",
      tags: { "job.name": "search-delta", "job.code": "meili_unavailable" },
    });
  });
});
