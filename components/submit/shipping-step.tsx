"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { saveShipping } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldInput, FieldSelect } from "@/components/ui/field";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Link, useRouter } from "@/i18n/navigation";
import { MAX_CARDS_PER_ORDER } from "@/lib/orders/card-rules";
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

import { FormSection } from "./form-section";
import { type OrderTodo, RunningTotal } from "./running-total";
import { useAutosave } from "./use-autosave";

type FieldName = "firstName" | "lastName" | "phone" | "country" | "postcode" | "city" | "addressLine";

/** Where a problem is fixed: a text field, the method cards or the insurance box. */
type Target = FieldName | "method" | "insurance";

const FIELD_OF: Record<ShippingProblem, Target> = {
  methodMissing: "method",
  insuranceUnconfirmed: "insurance",
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

  const tCatalog = useTranslations("catalog");
  // Next with something missing shows every problem, touched or not.
  const [showAll, setShowAll] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ target: Target; tick: number } | null>(null);
  const form = useRef<HTMLDivElement>(null);

  const problems = shippingProblems(shipping, catalog);
  const complete = problems.length === 0;
  const postal = shipping.method === "postal";

  const update = (patch: Partial<DraftShipping>) => setShipping((prev) => ({ ...prev, ...patch }));
  const touch = (field: FieldName) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  const problemAt = (target: Target) => problems.find((p) => FIELD_OF[p] === target);
  const errorFor = (field: FieldName) => {
    if (!showAll && !touched.has(field)) return null;
    const problem = problemAt(field);
    return problem ? t(`shipping.problems.${problem}`) : null;
  };
  const methodError = showAll && problemAt("method") ? t("shipping.problems.methodMissing") : null;
  const insuranceError =
    showAll && problemAt("insurance") ? t("shipping.problems.insuranceUnconfirmed") : null;

  const goTo = (target: Target) => {
    setShowAll(true);
    setFocusTarget((prev) => ({ target, tick: (prev?.tick ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!focusTarget) return;
    const target = form.current?.querySelector<HTMLElement>(`[data-field="${focusTarget.target}"]`);
    if (!target) return;
    const control = target.matches("input, select")
      ? target
      : (target.querySelector<HTMLElement>('[role="radio"], [role="checkbox"]') ?? target);
    control.scrollIntoView?.({ block: "center" });
    control.focus?.();
  }, [focusTarget]);

  const todos: OrderTodo[] = problems.map((problem) => ({
    id: problem,
    label: t(`shipping.problems.${problem}`),
    onSelect: () => goTo(FIELD_OF[problem]),
  }));

  const catalogLabel = (key: string) => (tCatalog.has(key as never) ? tCatalog(key as never) : null);
  const lines = draft.cards.map((card) => ({
    id: card.id,
    title:
      card.name?.trim() ||
      (card.identifiedBy === "art" ? t("cards.unknownSummary") : t("cards.untitled")),
    detail:
      [
        card.service ? (catalogLabel(`services.${card.service}.label`) ?? card.service) : null,
        card.tierKey ? (catalogLabel(`tiers.${card.tierKey}.label`) ?? card.tierKey) : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
  }));

  const text = (field: FieldName, max: number, label: string, extra: { type?: string; autoComplete?: string } = {}) => (
    <Field label={label} invalid={!!errorFor(field)}>
      <FieldInput
        {...extra}
        data-field={field}
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
    if (!complete) {
      goTo(FIELD_OF[problems[0]]);
      return;
    }
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
    <div className="grid gap-8 pb-36 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <div className="flex flex-col gap-4" ref={form}>
        <Card className="overflow-hidden">
          <fieldset disabled={leaving} className="m-0 min-w-0 border-0 p-0">
            <FormSection number="01" heading={t("shipping.method.label")}>
              <div data-field="method">
                <ChoiceCards
                  label={t("shipping.method.label")}
                  columns={2}
                  disabled={leaving}
                  invalid={!!methodError}
                  value={shipping.method}
                  onValueChange={(next) => update({ method: next as ShippingMethod })}
                  options={[
                    {
                      value: "postal",
                      title: t("shipping.method.postal"),
                      description: t("shipping.method.postalHint"),
                    },
                    {
                      value: "in_person",
                      title: t("shipping.method.in_person"),
                      description: t("shipping.method.inPersonHint"),
                    },
                  ]}
                />
                {methodError && (
                  <p role="alert" className="text-sm m-0 mt-2 font-medium text-ink">
                    {methodError}
                  </p>
                )}
              </div>
            </FormSection>

            <FormSection number="02" heading={t("shipping.contact")}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {text("firstName", NAME_MAX, t("shipping.fields.firstName"), { autoComplete: "given-name" })}
                {text("lastName", NAME_MAX, t("shipping.fields.lastName"), { autoComplete: "family-name" })}
                {text("phone", PHONE_MAX, t("shipping.fields.phone"), { type: "tel", autoComplete: "tel" })}
              </div>
            </FormSection>

            {postal && (
              <FormSection number="03" heading={t("shipping.address")}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Field label={t("shipping.fields.country")} invalid={!!errorFor("country")}>
                    <FieldSelect
                      data-field="country"
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
              </FormSection>
            )}

            {postal && (
              <FormSection number="04" heading={t("shipping.insurance.heading")}>
                <div data-field="insurance">
                  <Checkbox
                    checked={shipping.inboundInsuranceConfirmed}
                    disabled={leaving}
                    onCheckedChange={(inboundInsuranceConfirmed) => update({ inboundInsuranceConfirmed })}
                    label={t("shipping.insurance.label")}
                    description={t("shipping.insurance.description")}
                  />
                  {insuranceError && (
                    <p role="alert" className="text-sm m-0 mt-2 font-medium text-ink">
                      {insuranceError}
                    </p>
                  )}
                </div>
              </FormSection>
            )}

            {shipping.method === "in_person" && (
              <FormSection number="03" heading={t("shipping.inPerson.heading")}>
                <p className="m-0 text-muted">{t("shipping.inPerson.body")}</p>
              </FormSection>
            )}
          </fieldset>

          <p role="status" className="text-sm m-0 min-h-5 px-5 pb-3 text-muted empty:hidden sm:px-6">
            {status === "saving" && t("autosave.saving")}
            {status === "saved" && t("autosave.saved")}
            {status === "error" && (
              <>
                {t("autosave.error")}
                {errorKey && errorKey !== "generic" ? ` ${t(`errors.${errorKey}`, { max: MAX_CARDS_PER_ORDER })}` : ""}
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
        lines={lines}
        shipping="fees"
        todos={todos}
        action={
          <Button type="button" onClick={next} disabled={leaving} className="w-full">
            {t("shipping.next")}
          </Button>
        }
      />
    </div>
  );
}
