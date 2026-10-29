import { NAME_MAX_LENGTH } from "@/lib/auth/profile-name";

import type { Catalog, DraftShipping } from "./types";

export const NAME_MAX = NAME_MAX_LENGTH;
export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,30}$/;
export const POSTCODE_MAX = 20;
export const CITY_MAX = 100;
export const ADDRESS_LINE_MAX = 200;

export type ShippingProblem =
  | "methodMissing"
  | "firstNameMissing"
  | "lastNameMissing"
  | "phoneInvalid"
  | "countryUnsupported"
  | "postcodeMissing"
  | "cityMissing"
  | "addressMissing"
  | "insuranceUnconfirmed";

const blank = (v: string | null) => v === null || v.trim() === "";

/**
 * Contact details are required for both methods; the address, country zone and
 * insurance acknowledgement only for postal. Mirrors `submit_order`.
 */
export function shippingProblems(shipping: DraftShipping, catalog: Catalog): ShippingProblem[] {
  const problems: ShippingProblem[] = [];

  if (shipping.method === null) problems.push("methodMissing");
  if (blank(shipping.firstName)) problems.push("firstNameMissing");
  if (blank(shipping.lastName)) problems.push("lastNameMissing");
  if (shipping.phone === null || !PHONE_PATTERN.test(shipping.phone.trim())) problems.push("phoneInvalid");

  if (shipping.method === "postal") {
    const inZone =
      shipping.country !== null &&
      catalog.zones.some((z) => z.countries.includes(shipping.country as string));
    if (!inZone) problems.push("countryUnsupported");
    if (blank(shipping.postcode)) problems.push("postcodeMissing");
    if (blank(shipping.city)) problems.push("cityMissing");
    if (blank(shipping.addressLine)) problems.push("addressMissing");
    if (!shipping.inboundInsuranceConfirmed) problems.push("insuranceUnconfirmed");
  }

  return problems;
}
