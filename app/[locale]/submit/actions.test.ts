// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CATALOG } from "@/lib/orders/fixtures";
import { TERMS_VERSION } from "@/lib/orders/terms";
import type { DraftCardInput } from "@/lib/orders/types";
import { PHOTO_MAX_BYTES } from "@/lib/photos/limits";
import { formData } from "@/test/form-data";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

const mocks = vi.hoisted(() => {
  const state = {
    results: {} as Record<string, unknown[]>,
    calls: [] as { table: string; op: string; payload?: unknown; filters: unknown[][] }[],
  };
  function builder(table: string) {
    const call = { table, op: "select", payload: undefined as unknown, filters: [] as unknown[][] };
    state.calls.push(call);
    const b: Record<string, unknown> = {};
    const chain = (name: string) =>
      vi.fn((...args: unknown[]) => {
        if (name === "insert" || name === "update" || name === "delete") {
          call.op = name;
          call.payload = args[0];
        } else if (name !== "select" && name !== "order") {
          call.filters.push([name, ...args]);
        }
        return b;
      });
    for (const name of ["insert", "update", "delete", "select", "eq", "in", "not", "order", "limit", "maybeSingle", "single"]) {
      b[name] = chain(name);
    }
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const queue = state.results[`${table}.${call.op}`];
      const result = queue && queue.length > 0 ? queue.shift() : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    };
    return b;
  }
  return {
    state,
    from: vi.fn((table: string) => builder(table)),
    getClaims: vi.fn(),
    rpc: vi.fn(),
    startPayment: vi.fn(),
    getPaymentProvider: vi.fn(),
    loadCatalog: vi.fn(),
    putObject: vi.fn(),
    captureException: vi.fn(),
    redirect: vi.fn((args: unknown) => {
      throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims }, from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/orders/catalog", () => ({ loadCatalog: mocks.loadCatalog }));
vi.mock("@/lib/storage/r2", () => ({ putObject: mocks.putObject }));
vi.mock("@/lib/payments/provider", () => ({ getPaymentProvider: mocks.getPaymentProvider }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const actions = await import("./actions");

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const DRAFT = { id: "22222222-2222-4222-8222-222222222222", reference: "AG-0123ABCD" };

function queue(key: string, ...results: Result[]) {
  mocks.state.results[key] = [...results];
}
const callsTo = (table: string, op: string) =>
  mocks.state.calls.filter((c) => c.table === table && c.op === op);

function card(overrides: Partial<DraftCardInput> = {}): DraftCardInput {
  return {
    id: CARD_ID,
    position: 0,
    identifiedBy: "customer",
    releaseYear: 1999,
    brand: "Pokemon",
    language: "en",
    name: "Charizard",
    setName: "Base Set",
    cardNumber: "4/102",
    surface: null,
    signed: false,
    numbered: false,
    declaredValueCents: 40000,
    service: "grading",
    tierKey: "grading_standard",
    addOnKeys: [],
    persisted: false,
    ...overrides,
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
function upload(bytes: Uint8Array, type = "image/jpeg") {
  const data = formData({ cardId: CARD_ID });
  data.set("file", new File([bytes as BlobPart], "photo.jpg", { type }));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.results = {};
  mocks.state.calls = [];
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1", email: "a@example.test" } }, error: null });
  mocks.loadCatalog.mockResolvedValue(CATALOG);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.getPaymentProvider.mockReturnValue(null);
});

describe("saveCard", () => {
  test("opens a draft on first save and never sends a user id", async () => {
    queue("orders.select", { data: null, error: null });
    queue("orders.insert", { data: DRAFT, error: null });

    const result = await actions.saveCard("en", card());

    expect(result).toEqual({ ok: true, data: { reference: DRAFT.reference } });
    const [open] = callsTo("orders", "insert");
    expect(open.payload).toEqual({});
    expect(JSON.stringify(mocks.state.calls)).not.toMatch(/user_id|user-1/);
    const [insert] = callsTo("order_cards", "insert");
    expect((insert.payload as { order_id: string }).order_id).toBe(DRAFT.id);
  });

  test("reselects the draft when opening it loses a race", async () => {
    queue("orders.select", { data: null, error: null }, { data: DRAFT, error: null });
    queue("orders.insert", { data: null, error: { code: "23505" } });

    const result = await actions.saveCard("en", card());

    expect(result).toEqual({ ok: true, data: { reference: DRAFT.reference } });
    expect(callsTo("order_cards", "insert")).toHaveLength(1);
  });

  test("stores identified_by and never a price or catalog_ref", async () => {
    queue("orders.select", { data: DRAFT, error: null });

    await actions.saveCard("en", card({ identifiedBy: "art" }));

    const [insert] = callsTo("order_cards", "insert");
    const payload = insert.payload as Record<string, unknown>;
    expect(payload.identified_by).toBe("art");
    expect(Object.keys(payload)).not.toEqual(
      expect.arrayContaining(["price_cents", "identification_cents", "catalog_ref", "persisted"]),
    );
    expect(payload).toMatchObject({ set_name: "Base Set", tier_key: "grading_standard", declared_value_cents: 40000 });
  });

  test("clears dual and its add-ons on an unsigned card", async () => {
    queue("orders.select", { data: DRAFT, error: null });

    await actions.saveCard(
      "en",
      card({ signed: false, service: "dual", tierKey: "dual_standard", addOnKeys: ["digital_grade"] }),
    );

    const [insert] = callsTo("order_cards", "insert");
    expect(insert.payload).toMatchObject({ service: null, tier_key: null });
    expect(callsTo("order_card_add_ons", "insert")).toHaveLength(0);
  });

  test("drops add-ons that do not apply to the chosen service", async () => {
    queue("orders.select", { data: DRAFT, error: null });

    await actions.saveCard(
      "en",
      card({ service: "authentication", tierKey: "authentication_standard", addOnKeys: ["digital_grade"] }),
    );

    expect(callsTo("order_card_add_ons", "insert")).toHaveLength(0);
  });

  test("replaces the add-on links with the normalized keys", async () => {
    queue("orders.select", { data: DRAFT, error: null });

    await actions.saveCard("en", card({ addOnKeys: ["digital_grade"] }));

    expect(callsTo("order_card_add_ons", "delete")).toHaveLength(1);
    expect(callsTo("order_card_add_ons", "insert")[0].payload).toEqual([
      { card_id: CARD_ID, add_on_key: "digital_grade" },
    ]);
  });

  test("on a card removed in another tab returns cardGone and inserts nothing", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.update", { data: [], error: null });

    const result = await actions.saveCard("en", card({ persisted: true }));

    expect(result).toEqual({ ok: false, errorKey: "cardGone" });
    expect(callsTo("order_cards", "insert")).toHaveLength(0);
    expect(callsTo("order_card_add_ons", "insert")).toHaveLength(0);
  });

  test("on a draft submitted in another tab returns cardGone and opens no new draft", async () => {
    queue("orders.select", { data: null, error: null });

    const result = await actions.saveCard("en", card({ persisted: true }));

    expect(result).toEqual({ ok: false, errorKey: "cardGone" });
    expect(callsTo("orders", "insert")).toHaveLength(0);
  });

  test("updates a persisted card in place", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.update", { data: [{ id: CARD_ID }], error: null });

    const result = await actions.saveCard("en", card({ persisted: true }));

    expect(result.ok).toBe(true);
    expect(callsTo("order_cards", "insert")).toHaveLength(0);
    expect(callsTo("order_cards", "update")[0].payload).not.toHaveProperty("id");
  });

  test.each(["42501"])("an insert refused with %s returns cardGone", async (code) => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code } });

    expect(await actions.saveCard("en", card())).toEqual({ ok: false, errorKey: "cardGone" });
  });

  test("a failed draft lookup is reported and never drops a persisted card", async () => {
    queue("orders.select", { data: null, error: { code: "08006" } });

    expect(await actions.saveCard("en", card({ persisted: true }))).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(callsTo("order_cards", "insert")).toHaveLength(0);
  });

  test("a failed reselect after a lost race is reported", async () => {
    queue("orders.select", { data: null, error: null }, { data: null, error: { code: "08006" } });
    queue("orders.insert", { data: null, error: { code: "23505" } });

    expect(await actions.saveCard("en", card())).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("duplicate add-on keys are written once", async () => {
    queue("orders.select", { data: DRAFT, error: null });

    const result = await actions.saveCard("en", card({ addOnKeys: ["digital_grade", "digital_grade"] }));

    expect(result.ok).toBe(true);
    expect(callsTo("order_card_add_ons", "insert")[0].payload).toEqual([
      { card_id: CARD_ID, add_on_key: "digital_grade" },
    ]);
  });

  test("an add-on insert 23505 is reported, not cardGone", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_card_add_ons.insert", { data: null, error: { code: "23505" } });

    expect(await actions.saveCard("en", card({ addOnKeys: ["digital_grade"] }))).toEqual({
      ok: false,
      errorKey: "generic",
    });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("a card insert 23505 falls back to updating the card", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code: "23505" } });
    queue("order_cards.update", { data: [{ id: CARD_ID }], error: null });

    const result = await actions.saveCard("en", card({ addOnKeys: ["digital_grade"] }));

    expect(result).toEqual({ ok: true, data: { reference: DRAFT.reference } });
    expect(callsTo("order_cards", "update")).toHaveLength(1);
    expect(callsTo("order_card_add_ons", "insert")).toHaveLength(1);
  });

  test("a card insert 23505 whose update matches nothing is cardGone", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code: "23505" } });
    queue("order_cards.update", { data: [], error: null });

    expect(await actions.saveCard("en", card())).toEqual({ ok: false, errorKey: "cardGone" });
    expect(callsTo("order_card_add_ons", "insert")).toHaveLength(0);
  });

  test("not_draft on a card write is treated as a vanished card", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code: "P0001", message: "not_draft" } });

    expect(await actions.saveCard("en", card())).toEqual({ ok: false, errorKey: "cardGone" });
  });

  test("too_many_cards is surfaced", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code: "P0001", message: "too_many_cards" } });

    expect(await actions.saveCard("en", card())).toEqual({ ok: false, errorKey: "tooManyCards" });
  });

  test("rejects a declared value over the limit without calling Supabase", async () => {
    const result = await actions.saveCard("en", card({ declaredValueCents: 1_000_000_001 }));

    expect(result).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("rejects a language outside the list without calling Supabase", async () => {
    const result = await actions.saveCard("en", card({ language: "xx" }));

    expect(result).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test.each([
    ["a name over the limit", { name: "x".repeat(201) }],
    ["a year before 1880", { releaseYear: 1879 }],
    ["a zero declared value", { declaredValueCents: 0 }],
    ["an unknown identifier", { identifiedBy: "someone" as never }],
    ["a card id that is not a uuid", { id: "not-a-uuid" }],
  ])("rejects %s without calling Supabase", async (_label, overrides) => {
    expect(await actions.saveCard("en", card(overrides))).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("an unexpected Postgres error is reported with its code only", async () => {
    queue("orders.select", { data: DRAFT, error: null });
    queue("order_cards.insert", { data: null, error: { code: "XX000", message: "Charizard 1 Main St" } });

    const result = await actions.saveCard("en", card());

    expect(result).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const [, hint] = mocks.captureException.mock.calls[0];
    expect(hint).toEqual({ tags: { "order.flow": "saveCard", "order.code": "XX000" } });
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toMatch(/Charizard|Main St/);
  });
});

describe("removeCard", () => {
  test("deletes the card by id", async () => {
    queue("order_cards.delete", { data: [{ id: CARD_ID }], error: null });

    expect(await actions.removeCard("en", CARD_ID)).toEqual({ ok: true, data: null });
    expect(callsTo("order_cards", "delete")[0].filters).toContainEqual(["eq", "id", CARD_ID]);
  });

  test("a card that is already gone is a success", async () => {
    queue("order_cards.delete", { data: [], error: null });

    expect(await actions.removeCard("en", CARD_ID)).toEqual({ ok: true, data: null });
  });

  test("rejects an id that is not a uuid without calling Supabase", async () => {
    expect(await actions.removeCard("en", "nope")).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("saveShipping", () => {
  const shipping = {
    method: "postal" as const,
    firstName: " Ada ",
    lastName: "Lovelace",
    phone: "+36 30 123 4567",
    country: "HU",
    postcode: "1011",
    city: "Budapest",
    addressLine: "Fo utca 1",
    inboundInsuranceConfirmed: true,
  };

  test("updates only the draft's shipping columns", async () => {
    queue("orders.update", { data: [{ id: DRAFT.id }], error: null });

    expect(await actions.saveShipping("en", shipping)).toEqual({ ok: true, data: null });
    const [update] = callsTo("orders", "update");
    expect(Object.keys(update.payload as object).sort()).toEqual(
      [
        "address_city", "address_country", "address_line", "address_postcode",
        "contact_first_name", "contact_last_name", "contact_phone",
        "inbound_insurance_confirmed", "shipping_method",
      ],
    );
    expect(update.payload).toMatchObject({ contact_first_name: "Ada" });
    expect(update.filters).toContainEqual(["eq", "status", "draft"]);
  });

  test("with no draft to update returns notDraft", async () => {
    queue("orders.update", { data: [], error: null });

    expect(await actions.saveShipping("en", shipping)).toEqual({ ok: false, errorKey: "notDraft" });
  });

  test("rejects a malformed phone without calling Supabase", async () => {
    expect(await actions.saveShipping("en", { ...shipping, phone: "call me" })).toEqual({
      ok: false,
      errorKey: "generic",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("rejects an address line over the limit without calling Supabase", async () => {
    const result = await actions.saveShipping("en", { ...shipping, addressLine: "x".repeat(201) });

    expect(result).toEqual({ ok: false, errorKey: "generic" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("uploadPhoto", () => {
  test("stores the row, then the object, and returns the photo id", async () => {
    queue("card_photos.select", { data: [], error: null });
    queue("card_photos.insert", { data: { object_key: `card-photos/${CARD_ID}/p` }, error: null });

    const result = await actions.uploadPhoto("en", upload(JPEG));

    expect(result.ok).toBe(true);
    const [insert] = callsTo("card_photos", "insert");
    expect(insert.payload).toMatchObject({ card_id: CARD_ID, content_type: "image/jpeg", byte_size: JPEG.length });
    expect(mocks.putObject).toHaveBeenCalledWith(`card-photos/${CARD_ID}/p`, expect.any(Uint8Array), "image/jpeg");
  });

  test("refuses a renamed text file as photoType", async () => {
    const result = await actions.uploadPhoto("en", upload(new TextEncoder().encode("hello world")));

    expect(result).toEqual({ ok: false, errorKey: "photoType" });
    expect(callsTo("card_photos", "insert")).toHaveLength(0);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  test("refuses a file over the size limit as photoTooLarge", async () => {
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1);
    big.set(JPEG);

    expect(await actions.uploadPhoto("en", upload(big))).toEqual({ ok: false, errorKey: "photoTooLarge" });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  test("refuses a second photo for the same card as photoLimit", async () => {
    queue("card_photos.select", { data: [{ id: "existing" }], error: null });

    expect(await actions.uploadPhoto("en", upload(JPEG))).toEqual({ ok: false, errorKey: "photoLimit" });
    expect(callsTo("card_photos", "insert")).toHaveLength(0);
  });

  test("returns cardGone when the row cannot be inserted", async () => {
    queue("card_photos.select", { data: [], error: null });
    queue("card_photos.insert", { data: null, error: { code: "42501" } });

    expect(await actions.uploadPhoto("en", upload(JPEG))).toEqual({ ok: false, errorKey: "cardGone" });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  test("deletes the row when R2 rejects the upload", async () => {
    queue("card_photos.select", { data: [], error: null });
    queue("card_photos.insert", { data: { object_key: "k" }, error: null });
    mocks.putObject.mockRejectedValue(new Error("R2 down"));

    const result = await actions.uploadPhoto("en", upload(JPEG));

    expect(result).toEqual({ ok: false, errorKey: "generic" });
    const [insert] = callsTo("card_photos", "insert");
    const [del] = callsTo("card_photos", "delete");
    expect(del.filters).toContainEqual(["eq", "id", (insert.payload as { id: string }).id]);
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { "order.flow": "uploadPhoto", "order.code": "storage" },
    });
  });

  test("rejects a missing file without calling Supabase", async () => {
    expect(await actions.uploadPhoto("en", formData({ cardId: CARD_ID }))).toEqual({
      ok: false,
      errorKey: "generic",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("removePhoto", () => {
  test("deletes the row by id", async () => {
    queue("card_photos.delete", { data: [{ id: "p" }], error: null });
    const photoId = "33333333-3333-4333-8333-333333333333";

    expect(await actions.removePhoto("en", photoId)).toEqual({ ok: true, data: null });
    expect(callsTo("card_photos", "delete")[0].filters).toContainEqual(["eq", "id", photoId]);
  });
});

describe("authentication", () => {
  test("signed-out callers are sent to sign-in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    await expect(actions.saveCard("en", card())).rejects.toThrow(/NEXT_REDIRECT.*sign-in/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("an unknown locale falls back to the default", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    await expect(actions.removeCard("zz", CARD_ID)).rejects.toThrow(/"locale":"en"/);
  });
});

describe("submitOrder", () => {
  const redirected = (args: unknown) => `NEXT_REDIRECT ${JSON.stringify(args)}`;

  test("refuses without the terms box, without calling Supabase", async () => {
    const result = await actions.submitOrder("en", { termsAccepted: false });

    expect(result).toEqual({ ok: false, errorKey: "termsRequired" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("sends the terms version and no prices", async () => {
    mocks.rpc.mockResolvedValue({ data: "AG-0123ABCD", error: null });

    await expect(actions.submitOrder("en", { termsAccepted: true })).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.rpc).toHaveBeenCalledWith("submit_order", { p_terms_version: TERMS_VERSION });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/cents|price|total|user/i);
  });

  test("a second submit lands on the existing order instead of failing", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "not_draft" } });
    queue("orders.select", { data: { reference: "AG-0123ABCD" }, error: null });

    await expect(actions.submitOrder("en", { termsAccepted: true })).rejects.toThrow(
      redirected({ href: "/account/orders/AG-0123ABCD", locale: "en" }),
    );
    const [lookup] = callsTo("orders", "select");
    expect(lookup.filters).toContainEqual(["eq", "status", "awaiting_payment"]);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("not_draft with no awaiting order answers notDraft", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "not_draft" } });
    queue("orders.select", { data: null, error: null });

    expect(await actions.submitOrder("en", { termsAccepted: true })).toEqual({
      ok: false,
      errorKey: "notDraft",
    });
  });

  test("a catalog change since the running total surfaces its key", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "service_unavailable" } });

    expect(await actions.submitOrder("en", { termsAccepted: true })).toEqual({
      ok: false,
      errorKey: "serviceUnavailable",
    });
  });

  test("an unexpected error is reported by code and answers generic", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "Anna at 1 Main St" } });

    expect(await actions.submitOrder("en", { termsAccepted: true })).toEqual({
      ok: false,
      errorKey: "generic",
    });
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain("Anna");
  });

  test("with no payment provider, submit lands on the order page", async () => {
    mocks.rpc.mockResolvedValue({ data: "AG-0123ABCD", error: null });

    await expect(actions.submitOrder("en", { termsAccepted: true })).rejects.toThrow(
      redirected({ href: "/account/orders/AG-0123ABCD", locale: "en" }),
    );
  });

  test("with a payment provider, submit redirects to where it sends the customer", async () => {
    mocks.rpc.mockResolvedValue({ data: "AG-0123ABCD", error: null });
    mocks.startPayment.mockResolvedValue("/pay/AG-0123ABCD");
    mocks.getPaymentProvider.mockReturnValue({ id: "fake", startPayment: mocks.startPayment });

    await expect(actions.submitOrder("en", { termsAccepted: true })).rejects.toThrow(
      redirected({ href: "/pay/AG-0123ABCD", locale: "en" }),
    );
    expect(mocks.startPayment).toHaveBeenCalledWith({ reference: "AG-0123ABCD" });
  });
});
