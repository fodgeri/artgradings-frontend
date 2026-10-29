"use server";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import {
  BRAND_MAX,
  CARD_LANGUAGES,
  CARD_NUMBER_MAX,
  CARD_TEXT_MAX,
  DECLARED_VALUE_MAX_CENTS,
  RELEASE_YEAR_MIN,
  SURFACE_MAX,
  normalizeCard,
} from "@/lib/orders/card-rules";
import { loadCatalog } from "@/lib/orders/catalog";
import { TERMS_VERSION } from "@/lib/orders/terms";
import { getPaymentProvider } from "@/lib/payments/provider";
import {
  type OrderFlow,
  type SaveResult,
  orderErrorKey,
  reportOrderError,
} from "@/lib/orders/errors";
import {
  ADDRESS_LINE_MAX,
  CITY_MAX,
  NAME_MAX,
  PHONE_PATTERN,
  POSTCODE_MAX,
} from "@/lib/orders/shipping-rules";
import type { DraftCardInput, DraftShipping } from "@/lib/orders/types";
import { MAX_PHOTOS_PER_CARD, PHOTO_MAX_BYTES } from "@/lib/photos/limits";
import { sniffImageType } from "@/lib/photos/sniff";
import { putObject } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

const GENERIC = { ok: false, errorKey: "generic" } as const;
const CARD_GONE = { ok: false, errorKey: "cardGone" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PgError = { code?: string; message?: string };

/** Locale, signed-in user (or a redirect to sign-in) and the session client. */
async function session(rawLocale: string) {
  const locale = resolveLocale(rawLocale);
  await requireUser({ locale, next: "/submit" });
  return createClient();
}

/** Reports an unexpected failure by code only and answers `generic`. */
function unexpected(flow: OrderFlow, error: PgError): SaveResult<never> {
  reportOrderError(flow, error.code ?? "unknown");
  return GENERIC;
}

function isText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= max);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Types and limits, not completeness: a half-filled card is a valid draft. */
function validCard(card: DraftCardInput): boolean {
  return (
    typeof card === "object" &&
    card !== null &&
    typeof card.id === "string" &&
    UUID.test(card.id) &&
    isInt(card.position, 0, 1000) &&
    (card.identifiedBy === "customer" || card.identifiedBy === "art") &&
    (card.releaseYear === null || isInt(card.releaseYear, RELEASE_YEAR_MIN, 2100)) &&
    isText(card.brand, BRAND_MAX) &&
    (card.language === null || (CARD_LANGUAGES as readonly string[]).includes(card.language)) &&
    isText(card.name, CARD_TEXT_MAX) &&
    isText(card.setName, CARD_TEXT_MAX) &&
    isText(card.cardNumber, CARD_NUMBER_MAX) &&
    isText(card.surface, SURFACE_MAX) &&
    typeof card.signed === "boolean" &&
    typeof card.numbered === "boolean" &&
    (card.declaredValueCents === null || isInt(card.declaredValueCents, 1, DECLARED_VALUE_MAX_CENTS)) &&
    isText(card.service, 100) &&
    isText(card.tierKey, 100) &&
    Array.isArray(card.addOnKeys) &&
    card.addOnKeys.every((k) => typeof k === "string" && k.length <= 100) &&
    typeof card.persisted === "boolean"
  );
}

/** Blank text is stored as null. */
const clean = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function saveCard(
  locale: string,
  card: DraftCardInput,
): Promise<SaveResult<{ reference: string }>> {
  const supabase = await session(locale);
  if (!validCard(card)) return GENERIC;

  const { persisted, ...input } = card;
  const catalog = await loadCatalog(supabase);
  const n = normalizeCard({ ...input, photo: null }, catalog);

  const found = await supabase
    .from("orders")
    .select("id, reference")
    .eq("status", "draft")
    .maybeSingle();
  if (found.error) return unexpected("saveCard", found.error);
  let draft = found.data;

  if (!draft) {
    // An earlier save landed, yet there is no draft: it was submitted or cancelled.
    if (persisted) return CARD_GONE;
    const opened = await supabase.from("orders").insert({}).select("id, reference").single();
    if (opened.error?.code === "23505") {
      // Another tab opened it first.
      const again = await supabase
        .from("orders")
        .select("id, reference")
        .eq("status", "draft")
        .maybeSingle();
      if (again.error) return unexpected("saveCard", again.error);
      draft = again.data;
    } else if (opened.error) {
      return unexpected("saveCard", opened.error);
    } else {
      draft = opened.data;
    }
    if (!draft) return GENERIC;
  }

  const columns = {
    position: n.position,
    identified_by: n.identifiedBy,
    release_year: n.releaseYear,
    brand: clean(n.brand),
    language: n.language,
    name: clean(n.name),
    set_name: clean(n.setName),
    card_number: clean(n.cardNumber),
    surface: clean(n.surface),
    signed: n.signed,
    numbered: n.numbered,
    declared_value_cents: n.declaredValueCents,
    service: n.service,
    tier_key: n.tierKey,
  };

  // Update only: a card another tab removed must never be re-inserted.
  const update = async (): Promise<SaveResult<never> | null> => {
    const { data, error } = await supabase
      .from("order_cards")
      .update(columns)
      .eq("id", n.id)
      .select("id");
    if (error) return cardWriteFailure(error);
    return !data || data.length === 0 ? CARD_GONE : null;
  };

  if (persisted) {
    const failed = await update();
    if (failed) return failed;
  } else {
    const { error } = await supabase
      .from("order_cards")
      .insert({ id: n.id, order_id: draft.id, ...columns });
    if (error?.code === "23505") {
      // The card exists already (a retry, or an earlier autosave still in
      // flight). RLS matches only the caller's own draft card.
      const failed = await update();
      if (failed) return failed;
    } else if (error) {
      return cardWriteFailure(error);
    }
  }

  const addOnKeys = [...new Set(n.addOnKeys)];
  const cleared = await supabase.from("order_card_add_ons").delete().eq("card_id", n.id);
  if (cleared.error) return addOnFailure(cleared.error);
  if (addOnKeys.length > 0) {
    const linked = await supabase
      .from("order_card_add_ons")
      .insert(addOnKeys.map((add_on_key) => ({ card_id: n.id, add_on_key })));
    if (linked.error) return addOnFailure(linked.error);
  }

  return { ok: true, data: { reference: draft.reference } };
}

/** Add-on writes never mean the card is gone. */
function addOnFailure(error: PgError): SaveResult<never> {
  const key = orderErrorKey(error);
  return key === "generic" ? unexpected("saveCard", error) : { ok: false, errorKey: key };
}

/** `23505` and `42501` mean the card's place in the draft is gone; so does `not_draft`. */
function cardWriteFailure(error: PgError): SaveResult<never> {
  if (error.code === "23505" || error.code === "42501") return CARD_GONE;
  const key = orderErrorKey(error);
  if (key === "notDraft") return CARD_GONE;
  if (key !== "generic") return { ok: false, errorKey: key };
  return unexpected("saveCard", error);
}

export async function removeCard(locale: string, cardId: string): Promise<SaveResult<null>> {
  const supabase = await session(locale);
  if (typeof cardId !== "string" || !UUID.test(cardId)) return GENERIC;

  // Deleting a card that is already gone is the outcome the caller wanted.
  const { error } = await supabase.from("order_cards").delete().eq("id", cardId).select("id");
  if (error) {
    const key = orderErrorKey(error);
    return key === "generic" ? unexpected("removeCard", error) : { ok: false, errorKey: key };
  }
  return { ok: true, data: null };
}

function validShipping(s: DraftShipping): boolean {
  return (
    typeof s === "object" &&
    s !== null &&
    (s.method === null || s.method === "postal" || s.method === "in_person") &&
    isText(s.firstName, NAME_MAX) &&
    isText(s.lastName, NAME_MAX) &&
    (s.phone === null || (typeof s.phone === "string" && (s.phone.trim() === "" || PHONE_PATTERN.test(s.phone.trim())))) &&
    (s.country === null || (typeof s.country === "string" && /^[A-Z]{2}$/.test(s.country))) &&
    isText(s.postcode, POSTCODE_MAX) &&
    isText(s.city, CITY_MAX) &&
    isText(s.addressLine, ADDRESS_LINE_MAX) &&
    typeof s.inboundInsuranceConfirmed === "boolean"
  );
}

export async function saveShipping(
  locale: string,
  shipping: DraftShipping,
): Promise<SaveResult<null>> {
  const supabase = await session(locale);
  if (!validShipping(shipping)) return GENERIC;

  const { data, error } = await supabase
    .from("orders")
    .update({
      shipping_method: shipping.method,
      contact_first_name: clean(shipping.firstName),
      contact_last_name: clean(shipping.lastName),
      contact_phone: clean(shipping.phone),
      address_country: shipping.country,
      address_postcode: clean(shipping.postcode),
      address_city: clean(shipping.city),
      address_line: clean(shipping.addressLine),
      inbound_insurance_confirmed: shipping.inboundInsuranceConfirmed,
    })
    .eq("status", "draft")
    .select("id");
  if (error) return unexpected("saveShipping", error);
  if (!data || data.length === 0) return { ok: false, errorKey: "notDraft" };
  return { ok: true, data: null };
}

export async function uploadPhoto(
  locale: string,
  formData: FormData,
): Promise<SaveResult<{ photoId: string }>> {
  const supabase = await session(locale);

  const cardId = formData.get("cardId");
  const file = formData.get("file");
  if (typeof cardId !== "string" || !UUID.test(cardId) || !(file instanceof File)) return GENERIC;

  if (file.size > PHOTO_MAX_BYTES) return { ok: false, errorKey: "photoTooLarge" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, errorKey: "photoTooLarge" };

  const type = sniffImageType(bytes);
  if (type === null) return { ok: false, errorKey: "photoType" };

  const existing = await supabase.from("card_photos").select("id").eq("card_id", cardId);
  if (existing.error) return unexpected("uploadPhoto", existing.error);
  if ((existing.data?.length ?? 0) >= MAX_PHOTOS_PER_CARD) return { ok: false, errorKey: "photoLimit" };

  // The row first: RLS proves the caller owns a draft card before any byte is stored.
  const photoId = crypto.randomUUID();
  const { data: row, error } = await supabase
    .from("card_photos")
    .insert({ id: photoId, card_id: cardId, content_type: type, byte_size: bytes.length })
    .select("object_key")
    .single();
  if (error || !row) {
    if (error?.code === "42501" || error?.code === "23503" || orderErrorKey(error) === "notDraft") {
      return CARD_GONE;
    }
    return unexpected("uploadPhoto", error ?? {});
  }

  try {
    // Generated by the database, so the type says nullable although it never is.
    if (!row.object_key) throw new Error("No object key");
    await putObject(row.object_key, bytes, type);
  } catch {
    await supabase.from("card_photos").delete().eq("id", photoId);
    reportOrderError("uploadPhoto", "storage");
    return GENERIC;
  }
  return { ok: true, data: { photoId } };
}

export async function removePhoto(locale: string, photoId: string): Promise<SaveResult<null>> {
  const supabase = await session(locale);
  if (typeof photoId !== "string" || !UUID.test(photoId)) return GENERIC;

  // The trigger queues the R2 object for deletion.
  const { error } = await supabase.from("card_photos").delete().eq("id", photoId).select("id");
  if (error) {
    const key = orderErrorKey(error);
    return key === "generic" ? unexpected("removePhoto", error) : { ok: false, errorKey: key };
  }
  return { ok: true, data: null };
}

/**
 * Places the order. Prices are never sent: the database prices the draft and
 * stamps the acknowledgements. Every success and the double-click case end in
 * a redirect, which is returned outside any try because it throws.
 */
export async function submitOrder(
  locale: string,
  input: { termsAccepted: boolean },
): Promise<SaveResult<null>> {
  const resolved = resolveLocale(locale);
  const supabase = await session(resolved);
  if (input?.termsAccepted !== true) return { ok: false, errorKey: "termsRequired" };

  const { data, error } = await supabase.rpc("submit_order", { p_terms_version: TERMS_VERSION });
  if (error) {
    const key = orderErrorKey(error);
    if (key === "notDraft") {
      // A second click, or a second tab: the order already exists.
      const existing = await supabase
        .from("orders")
        .select("reference")
        .eq("status", "awaiting_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) return unexpected("submitOrder", existing.error);
      if (existing.data) {
        return redirect({ href: `/account/orders/${existing.data.reference}`, locale: resolved });
      }
      return { ok: false, errorKey: "notDraft" };
    }
    return key === "generic" ? unexpected("submitOrder", error) : { ok: false, errorKey: key };
  }
  if (typeof data !== "string" || data === "") return unexpected("submitOrder", {});

  const provider = getPaymentProvider();
  if (provider) {
    return redirect({ href: await provider.startPayment({ reference: data }), locale: resolved });
  }
  return redirect({ href: `/account/orders/${data}`, locale: resolved });
}
