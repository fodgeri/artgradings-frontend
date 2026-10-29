import { describe, expect, test } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "./fixtures";
import { PHONE_PATTERN, shippingProblems } from "./shipping-rules";
import type { DraftShipping } from "./types";

const POSTAL = REFERENCE_DRAFT.shipping;
const with_ = (patch: Partial<DraftShipping>): DraftShipping => ({ ...POSTAL, ...patch });

describe("shippingProblems", () => {
  test("a complete postal address has none", () => {
    expect(shippingProblems(POSTAL, CATALOG)).toEqual([]);
  });

  test("a missing method is reported and address checks wait for it", () => {
    expect(shippingProblems(with_({ method: null, city: null }), CATALOG)).toEqual(["methodMissing"]);
  });

  test("names and phone are required for both methods", () => {
    const blank = { firstName: " ", lastName: null, phone: "12" } as const;
    expect(shippingProblems(with_(blank), CATALOG)).toEqual(["firstNameMissing", "lastNameMissing", "phoneInvalid"]);
    expect(shippingProblems(with_({ ...blank, method: "in_person" }), CATALOG))
      .toEqual(["firstNameMissing", "lastNameMissing", "phoneInvalid"]);
  });

  test("in-person needs only names and phone", () => {
    const inPerson = with_({
      method: "in_person", country: null, postcode: null, city: null, addressLine: null,
      inboundInsuranceConfirmed: false,
    });
    expect(shippingProblems(inPerson, CATALOG)).toEqual([]);
  });

  test("postal needs the insurance acknowledgement", () => {
    expect(shippingProblems(with_({ inboundInsuranceConfirmed: false }), CATALOG)).toEqual(["insuranceUnconfirmed"]);
  });

  test("postal needs postcode, city and address line", () => {
    expect(shippingProblems(with_({ postcode: "", city: null, addressLine: " " }), CATALOG))
      .toEqual(["postcodeMissing", "cityMissing", "addressMissing"]);
  });

  test("a country outside every zone is countryUnsupported", () => {
    expect(shippingProblems(with_({ country: "US" }), CATALOG)).toEqual(["countryUnsupported"]);
    expect(shippingProblems(with_({ country: null }), CATALOG)).toEqual(["countryUnsupported"]);
  });
});

test("the phone pattern accepts international formats and rejects letters", () => {
  expect(PHONE_PATTERN.test("+36 1 234 5678")).toBe(true);
  expect(PHONE_PATTERN.test("(01) 234-5678")).toBe(true);
  expect(PHONE_PATTERN.test("12345")).toBe(false);
  expect(PHONE_PATTERN.test("call me maybe")).toBe(false);
});
