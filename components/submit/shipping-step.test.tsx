import { beforeEach, describe, expect, test, vi } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "@/lib/orders/fixtures";
import { quoteDraft } from "@/lib/orders/pricing";
import type { Catalog, Draft, DraftShipping } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({ saveShipping: vi.fn(), push: vi.fn() }));

vi.mock("@/app/[locale]/submit/actions", () => ({ saveShipping: mocks.saveShipping }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

const { ShippingStep } = await import("./shipping-step");

const s = messages.submit.shipping;
const f = s.fields;

const EMPTY: DraftShipping = {
  method: null,
  firstName: null,
  lastName: null,
  phone: null,
  country: null,
  postcode: null,
  city: null,
  addressLine: null,
  inboundInsuranceConfirmed: false,
};
const complete: DraftShipping = {
  method: "postal",
  firstName: "Anna",
  lastName: "Kovacs",
  phone: "+36 1 234 5678",
  country: "HU",
  postcode: "1011",
  city: "Budapest",
  addressLine: "Fo utca 1",
  inboundInsuranceConfirmed: true,
};
const draftWith = (shipping: DraftShipping): Draft => ({ ...REFERENCE_DRAFT, shipping });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveShipping.mockResolvedValue({ ok: true, data: null });
});

describe("ShippingStep", () => {
  test("in person hides the address and the insurance checkbox", async () => {
    const { user } = renderWithIntl(
      <ShippingStep draft={draftWith(complete)} catalog={CATALOG} prefill={{}} />,
    );
    expect(screen.getByLabelText(f.postcode)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: s.insurance.label })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: s.method.in_person }));

    expect(screen.queryByLabelText(f.postcode)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(f.addressLine)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(s.inPerson.body)).toBeInTheDocument();
    // Contact fields stay, and Next is enabled on contact details alone.
    expect(screen.getByLabelText(f.firstName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s.next })).toBeEnabled();
  });

  test("postal requires the insurance acknowledgement before Next", async () => {
    const { user } = renderWithIntl(
      <ShippingStep
        draft={draftWith({ ...complete, inboundInsuranceConfirmed: false })}
        catalog={CATALOG}
        prefill={{}}
      />,
    );
    expect(screen.getByRole("button", { name: s.next })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: s.insurance.label }));
    expect(screen.getByRole("button", { name: s.next })).toBeEnabled();
  });

  test("only zoned countries are offered, named in the active locale", () => {
    renderWithIntl(<ShippingStep draft={draftWith(complete)} catalog={CATALOG} prefill={{}} />, {
      // The fixture messages are English; only the locale decides the country names.
      locale: "de" as never,
    });
    const select = screen.getByLabelText(f.country);
    const options = Array.from(select.querySelectorAll("option")).filter((o) => o.value !== "");
    expect(options.map((o) => o.value).sort()).toEqual(["AT", "DE", "HU", "SK"]);
    const names = new Intl.DisplayNames(["de"], { type: "region" });
    expect(options.find((o) => o.value === "DE")?.textContent).toBe(names.of("DE"));
    expect(options.map((o) => o.textContent)).toEqual(
      [...options.map((o) => o.textContent as string)].sort((a, b) => a.localeCompare(b, "de")),
    );
  });

  test("changing the country updates the fees in the running total", async () => {
    const catalog: Catalog = {
      ...CATALOG,
      zones: [
        { key: "a", countries: ["HU"], inboundCents: 1000, returnCents: 2000 },
        { key: "b", countries: ["US"], inboundCents: 5000, returnCents: 6000 },
      ],
    };
    const { user } = renderWithIntl(
      <ShippingStep draft={draftWith(complete)} catalog={catalog} prefill={{}} />,
    );
    const money = (cents: number) =>
      new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(cents / 100);
    const totalFor = (country: string) =>
      quoteDraft({ ...REFERENCE_DRAFT, shipping: { ...complete, country } }, catalog).totalCents;
    const panel = () => screen.getByRole("complementary", { name: messages.submit.total.title });

    expect(panel()).toHaveTextContent(money(totalFor("HU")));
    await user.selectOptions(screen.getByLabelText(f.country), "US");
    expect(panel()).toHaveTextContent(money(totalFor("US")));
    expect(totalFor("US")).not.toBe(totalFor("HU"));
  });

  test("the prefill fills empty fields and is not saved until edited", async () => {
    const stored: DraftShipping = { ...EMPTY, method: "postal", firstName: "Stored" };
    const { user } = renderWithIntl(
      <ShippingStep
        draft={draftWith(stored)}
        catalog={CATALOG}
        prefill={{ firstName: "Prefill", lastName: "Kovacs", phone: "+36 1 234 5678", city: "Budapest" }}
      />,
    );
    // Empty fields are filled; a stored value is never overwritten.
    expect(screen.getByLabelText(f.firstName)).toHaveValue("Stored");
    expect(screen.getByLabelText(f.lastName)).toHaveValue("Kovacs");
    expect(screen.getByLabelText(f.city)).toHaveValue("Budapest");

    // Nothing is saved on mount.
    await new Promise((r) => setTimeout(r, 1000));
    expect(mocks.saveShipping).not.toHaveBeenCalled();

    // The first edit saves the merged values.
    await user.type(screen.getByLabelText(f.postcode), "1");
    await vi.waitFor(() => expect(mocks.saveShipping).toHaveBeenCalled(), { timeout: 3000 });
    expect(mocks.saveShipping).toHaveBeenLastCalledWith(
      "en",
      expect.objectContaining({
        firstName: "Stored",
        lastName: "Kovacs",
        phone: "+36 1 234 5678",
        city: "Budapest",
        postcode: "1",
      }),
    );
  });

  test("Next saves an untouched prefill before leaving, and goes to the summary", async () => {
    const { user } = renderWithIntl(
      <ShippingStep
        draft={draftWith({ ...EMPTY, method: "postal", inboundInsuranceConfirmed: true })}
        catalog={CATALOG}
        prefill={complete}
      />,
    );
    await user.click(screen.getByRole("button", { name: s.next }));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/submit/summary"));
    expect(mocks.saveShipping).toHaveBeenCalledWith("en", expect.objectContaining({ lastName: "Kovacs" }));
  });

  test("Next does not leave when the save fails", async () => {
    mocks.saveShipping.mockResolvedValue({ ok: false, errorKey: "generic" });
    const { user } = renderWithIntl(
      <ShippingStep draft={draftWith(complete)} catalog={CATALOG} prefill={{}} />,
    );
    await user.type(screen.getByLabelText(f.postcode), "2");
    await user.click(screen.getByRole("button", { name: s.next }));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(s.nextFailed);
  });
});
