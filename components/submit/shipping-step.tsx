"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { saveShipping } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldInput, FieldSelect } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Link, useRouter } from "@/i18n/navigation";
import { quoteDraft } from "@/lib/orders/pricing";
import {
  ADDRESS_LINE_MAX,
  CITY_MAX,
  NAME_MAX,
  PHONE_MAX,
  POSTCODE_MAX,
  shippingProblems,
  type ShippingProblem,
} from "@/lib/orders/shipping-rules";
import type { Catalog, Draft, DraftShipping, ShippingMethod } from "@/lib/orders/types";

import { RunningTotal } from "./running-total";
import { useAutosave } from "./use-autosave";

type FieldName = "firstName" | "lastName" | "phone" | "country" | "postcode" | "city" | "addressLine";

const FIELD_OF: Partial<Record<ShippingProblem, FieldName>> = {
  firstNameMissing: "firstName",
  lastNameMissing: "lastName",
  phoneInvalid: "phone",
  countryUnsupported: "country",
  postcodeMissing: "postcode",
  cityMissing: "city",
  addressMissing: "addressLine",
};

const isBlank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/** The stored draft wins; the prefill only fills what is still empty. */
function merge(stored: DraftShipping, prefill: Partial<DraftShipping>): DraftShipping {
  const out = { ...stored };
  for (const key of [
    "firstName",
    "lastName",
    "phone",
    "country",
    "postcode",
    "city",
    "addressLine",
  ] as const) {
    const fill = prefill[key];
    if (isBlank(stored[key]) && !isBlank(fill)) out[key] = fill as string;
  }
  return out;
}

/** Step 2: contact details, delivery method and, for post, the address. */
export function ShippingStep({
  draft,
  catalog,
  prefill,
}: {
  draft: Draft;
  catalog: Catalog;
  prefill: Partial<DraftShipping>;
}) {
  const t = useTranslations("submit");
  const locale = useLocale();
  const router = useRouter();

  // Initialising the autosave with the merged value is what keeps an unedited
  // prefill from being saved: the hook only saves once the value changes.
  const [shipping, setShipping] = useState<DraftShipping>(() => merge(draft.shipping, prefill));
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const latestShipping = useRef(shipping);
  useEffect(() => {
    latestShipping.current = shipping;
  });
  const storedKey = useRef(JSON.stringify(draft.shipping));

  const { status, errorKey, flush } = useAutosave(shipping, async (v) => {
    const result = await saveShipping(locale, v);
    if (result.ok) storedKey.current = JSON.stringify(v);
    return result;
  });

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const codes = [...new Set(catalog.zones.flatMap((z) => z.countries))];
    return codes
      .map((code) => ({ code, label: names.of(code) ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [catalog, locale]);

  const quote = useMemo(
    () =>
      quoteDraft(
        { reference: draft.reference, currency: catalog.currency, cards: draft.cards, shipping },
        catalog,
      ),
    [draft, catalog, shipping],
  );

  const problems = shippingProblems(shipping, catalog);
  const complete = problems.length === 0;
  const postal = shipping.method === "postal";

  const update = (patch: Partial<DraftShipping>) => setShipping((prev) => ({ ...prev, ...patch }));
  const touch = (field: FieldName) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  const errorFor = (field: FieldName) => {
    if (!touched.has(field)) return null;
    const problem = problems.find((p) => FIELD_OF[p] === field);
    return problem && FIELD_OF[problem] ? t(`shipping.problems.${problem}` as "shipping.problems.cityMissing") : null;
  };

  const text = (field: FieldName, max: number, label: string, extra: { type?: string; autoComplete?: string } = {}) => (
    <Field label={label} invalid={!!errorFor(field)}>
      <FieldInput
        {...extra}
        value={shipping[field] ?? ""}
        maxLength={max}
        onChange={(e) => update({ [field]: e.target.value === "" ? null : e.target.value })}
        onBlur={() => touch(field)}
        aria-invalid={errorFor(field) ? true : undefined}
      />
      <FieldError>{errorFor(field)}</FieldError>
    </Field>
  );

  const next = async () => {
    setFailed(false);
    setLeaving(true);
    let ok = false;
    try {
      ok = await flush();
      // An untouched prefill was never saved; Next is the moment it must be.
      // The form is locked while leaving, so this is still the value flushed;
      // the ref guarantees the newest one is never replaced by a stale closure.
      const current = latestShipping.current;
      if (ok && JSON.stringify(current) !== storedKey.current) {
        const result = await saveShipping(locale, current);
        if (result.ok) storedKey.current = JSON.stringify(current);
        else ok = false;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      router.push("/submit/summary");
      return;
    }
    setLeaving(false);
    setFailed(true);
  };

  return (
    <div className="grid gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <div className="flex flex-col gap-4">
        <Card className="p-5 sm:p-6">
          <fieldset disabled={leaving} className="m-0 min-w-0 border-0 p-0">
          <div className="mb-6 flex flex-col gap-2">
            <span className="font-mono text-label uppercase text-muted">{t("shipping.method.label")}</span>
            <SegmentedControl
              label={t("shipping.method.label")}
              value={shipping.method ?? ""}
              onValueChange={(next) => update({ method: next as ShippingMethod })}
              options={[
                { value: "postal", label: t("shipping.method.postal") },
                { value: "in_person", label: t("shipping.method.in_person") },
              ]}
            />
          </div>

          <h2 className="mb-3 font-serif text-h3 text-ink">{t("shipping.contact")}</h2>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {text("firstName", NAME_MAX, t("shipping.fields.firstName"), { autoComplete: "given-name" })}
            {text("lastName", NAME_MAX, t("shipping.fields.lastName"), { autoComplete: "family-name" })}
            {text("phone", PHONE_MAX, t("shipping.fields.phone"), { type: "tel", autoComplete: "tel" })}
          </div>

          {postal && (
            <div className="mt-2">
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label={t("shipping.fields.country")} invalid={!!errorFor("country")}>
                  <FieldSelect
                    value={shipping.country ?? ""}
                    onChange={(e) => update({ country: e.target.value === "" ? null : e.target.value })}
                    onBlur={() => touch("country")}
                    autoComplete="country"
                    aria-invalid={errorFor("country") ? true : undefined}
                  >
                    <option value="">{t("shipping.fields.countryPlaceholder")}</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </FieldSelect>
                  <FieldError>{errorFor("country")}</FieldError>
                </Field>
                {text("postcode", POSTCODE_MAX, t("shipping.fields.postcode"), { autoComplete: "postal-code" })}
                {text("city", CITY_MAX, t("shipping.fields.city"), { autoComplete: "address-level2" })}
                {text("addressLine", ADDRESS_LINE_MAX, t("shipping.fields.addressLine"), {
                  autoComplete: "address-line1",
                })}
              </div>
              <Checkbox
                checked={shipping.inboundInsuranceConfirmed}
                disabled={leaving}
                onCheckedChange={(inboundInsuranceConfirmed) => update({ inboundInsuranceConfirmed })}
                label={t("shipping.insurance.label")}
                description={t("shipping.insurance.description")}
              />
            </div>
          )}

          {shipping.method === "in_person" && (
            <div className="mt-2">
              <h3 className="font-serif text-h3 text-ink">{t("shipping.inPerson.heading")}</h3>
              <p className="text-muted">{t("shipping.inPerson.body")}</p>
            </div>
          )}

          </fieldset>

          <p role="status" className="mt-3 min-h-5 text-sm text-muted">
            {status === "saving" && t("autosave.saving")}
            {status === "saved" && t("autosave.saved")}
            {status === "error" && (
              <>
                {t("autosave.error")}
                {errorKey && errorKey !== "generic" ? ` ${t(`errors.${errorKey}`)}` : ""}
              </>
            )}
          </p>
        </Card>

        {failed && (
          <p role="alert" className="text-sm font-medium text-ink">
            {t("shipping.nextFailed")}
          </p>
        )}
        <div>
          <Link href="/submit" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("shipping.back")}
          </Link>
        </div>
      </div>

      <RunningTotal
        quote={quote}
        cardCount={draft.cards.length}
        action={
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={next} disabled={!complete || leaving}>
              {t("shipping.next")}
            </Button>
            {!complete && <p className="text-sm text-muted">{t("shipping.incomplete")}</p>}
          </div>
        }
      />
    </div>
  );
}
