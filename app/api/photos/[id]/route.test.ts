// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const maybeSingle = vi.hoisted(() => vi.fn());
const getObject = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          eq(...args);
          return { maybeSingle };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/storage/r2", () => ({ getObject }));

import { GET } from "./route";

const call = (id: string) =>
  GET(new Request(`http://localhost/api/photos/${id}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  maybeSingle.mockReset();
  getObject.mockReset();
  eq.mockReset();
});

describe("GET /api/photos/[id]", () => {
  test("a photo the caller cannot see is 404, and R2 is never asked", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await call("someone-elses");

    expect(res.status).toBe(404);
    expect(eq).toHaveBeenCalledWith("id", "someone-elses");
    expect(getObject).not.toHaveBeenCalled();
  });

  test("a visible row whose object is gone is 404", async () => {
    maybeSingle.mockResolvedValue({
      data: { object_key: "card-photos/c/p", content_type: "image/webp" },
    });
    getObject.mockResolvedValue(null);

    expect((await call("p")).status).toBe(404);
  });

  test("serves the object privately with nosniff", async () => {
    maybeSingle.mockResolvedValue({
      data: { object_key: "card-photos/c/p", content_type: "image/webp" },
    });
    getObject.mockResolvedValue({
      body: new Blob(["pixels"]).stream(),
      contentType: "application/octet-stream",
    });

    const res = await call("p");

    expect(getObject).toHaveBeenCalledWith("card-photos/c/p");
    expect(res.status).toBe(200);
    // The stored, validated type wins over whatever the bucket reports.
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe("pixels");
  });
});
