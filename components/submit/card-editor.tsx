"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { removePhoto, uploadPhoto } from "@/app/[locale]/submit/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceCards, ChoiceCheckCard } from "@/components/ui/choice-cards";
import { Field, FieldDescription, FieldError, FieldInput, FieldSelect } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import {
  BRAND_MAX,
  CARD_LANGUAGES,
  CARD_NUMBER_MAX,
  CARD_TEXT_MAX,
  MAX_CARDS_PER_ORDER,
  SURFACE_MAX,
  type CardProblem,
  applicableAddOns,
  availableServices,
  cardProblems,
  lowestTierCents,
  normalizeCard,
  tierChoices,
} from "@/lib/orders/card-rules";
import type { OrderErrorKey } from "@/lib/orders/errors";
import type { Catalog, DraftCard, IdentifiedBy } from "@/lib/orders/types";
import { parseMoney } from "@/lib/money";
import { compressPhoto } from "@/lib/photos/compress";

import { FormSection } from "./form-section";
import { ServiceIcon } from "./service-icon";

export type CardFieldName =
  | "name" | "brand" | "setName" | "cardNumber" | "releaseYear" | "language"
  | "value" | "service" | "tier";

export const CARD_FIELD_OF: Record<CardProblem, CardFieldName> = {
  yearMissing: "releaseYear",
  yearOutOfRange: "releaseYear",
  brandMissing: "brand",
  languageMissing: "language",
  nameMissing: "name",
  setMissing: "setName",
  cardNumberMissing: "cardNumber",
  valueMissing: "value",
  serviceMissing: "service",
  serviceNeedsSigned: "service",
  tierMissing: "tier",
  overCap: "tier",
};

/** The order the fields appear in, which is the order problems are reported in. */
const FIELD_ORDER: readonly CardFieldName[] = [
  "name", "brand", "setName", "cardNumber", "releaseYear", "language", "value", "service", "tier",
];

/** A card's problems, first on screen first. */
export function orderedCardProblems(problems: CardProblem[]): CardProblem[] {
  return [...problems].sort(
    (a, b) => FIELD_ORDER.indexOf(CARD_FIELD_OF[a]) - FIELD_ORDER.indexOf(CARD_FIELD_OF[b]),
  );
}

const groupLabel = "mb-2 block font-mono text-label uppercase text-muted";
const legendClass = "mb-2 p-0 font-mono text-label uppercase text-muted";

/**
 * One card's form, in four sections: photo and identification, details,
 * declared value, service. Every edit passes through `normalizeCard`, so the
 * card the parent holds is always internally consistent.
 *
 * `ensureSaved` resolves once the card exists on the server: a photo hangs
 * from a stored card, so a photo chosen on a never-saved card saves it first.
 * `showAllProblems` reveals every error, not only those of touched fields —
 * what Next does when something is missing.
 */
export function CardEditor({
  card,
  catalog,
  ensureSaved,
  showAllProblems = false,
  onChange,
  onPhoto,
  onGone,
}: {
  card: DraftCard;
  catalog: Catalog;
  ensureSaved: () => Promise<boolean>;
  showAllProblems?: boolean;
  onChange: (card: DraftCard) => void;
  /** Sets only the photo, so edits made during an upload are not overwritten. */
  onPhoto: (photo: DraftCard["photo"]) => void;
  /** The card no longer exists on the server; drop it. */
  onGone: () => void;
}) {
  const t = useTranslations("submit");
  const tCatalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();

  const [touched, setTouched] = useState<ReadonlySet<CardFieldName>>(new Set());
  const [valueText, setValueText] = useState(() =>
    card.declaredValueCents === null
      ? ""
      : format.number(card.declaredValueCents / 100, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<OrderErrorKey | null>(null);

  const catalogText = (key: string) => (tCatalog.has(key as never) ? tCatalog(key as never) : null);
  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: catalog.currency });

  const update = (patch: Partial<DraftCard>) => onChange(normalizeCard({ ...card, ...patch }, catalog));
  const touch = (field: CardFieldName) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const problems = cardProblems(card, catalog);
  const errorFor = (field: CardFieldName) => {
    const problem = problems.find((p) => CARD_FIELD_OF[p] === field);
    if (!problem) return null;
    // A tier the declared value has outgrown is said at once: the customer
    // changed the value, not the tier, and would never blur the tier.
    if (!showAllProblems && !touched.has(field) && problem !== "overCap") return null;
    return t(`cards.problems.${problem}`);
  };

  const art = card.identifiedBy === "art";
  const named = (name: string) => (art ? t("cards.fields.optional", { label: name }) : name);
  const text = (
    field: CardFieldName,
    key: "brand" | "name" | "setName" | "cardNumber",
    max: number,
    name: string,
  ) => (
    <Field label={named(name)} invalid={!!errorFor(field)}>
      <FieldInput
        data-field={field}
        value={card[key] ?? ""}
        maxLength={max}
        onChange={(e) => update({ [key]: e.target.value === "" ? null : e.target.value })}
        onBlur={() => touch(field)}
        aria-invalid={errorFor(field) ? true : undefined}
      />
      <FieldError>{errorFor(field)}</FieldError>
    </Field>
  );

  const services = availableServices(card.signed, catalog);
  const tiers = tierChoices(card.service, card.declaredValueCents, catalog);
  const addOns = applicableAddOns(card.service, catalog);
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });
  const signedOnlyHidden = !card.signed && catalog.services.some((s) => s.requiresSigned);

  async function onSelect(file: File) {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      if (!(await ensureSaved())) {
        setPhotoError("generic");
        return;
      }
      const blob = await compressPhoto(file);
      const form = new FormData();
      form.set("cardId", card.id);
      form.set("file", blob, file.name);
      const result = await uploadPhoto(locale, form);
      if (result.ok) onPhoto({ id: result.data.photoId });
      else if (result.errorKey === "cardGone") onGone();
      else setPhotoError(result.errorKey);
    } catch (error) {
      setPhotoError(
        error instanceof Error && error.message === "photoTooLarge"
          ? "photoTooLarge"
          : error instanceof Error && error.message === "photoUnsupported"
            ? "photoType"
            : "generic",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onPhotoRemove() {
    if (!card.photo) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const result = await removePhoto(locale, card.photo.id);
      if (result.ok) onPhoto(null);
      else if (result.errorKey === "cardGone") onGone();
      else setPhotoError(result.errorKey);
    } catch {
      setPhotoError("generic");
    } finally {
      setPhotoBusy(false);
    }
  }

  const serviceError = errorFor("service");
  const tierError = errorFor("tier");

  return (
    <div>
      <FormSection
        number="01"
        heading={t("cards.sections.identification")}
        aside={t("cards.photo.optional")}
      >
        <div className="grid gap-5 sm:grid-cols-[148px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <PhotoInput
              previewUrl={card.photo ? `/api/photos/${card.photo.id}` : null}
              busy={photoBusy}
              onSelect={onSelect}
              onReject={() => setPhotoError("photoType")}
              onRemove={onPhotoRemove}
              label={t("cards.photo.label")}
              removeLabel={t("cards.photo.remove")}
              busyLabel={t("cards.photo.uploading")}
              hint={t("cards.photo.hint")}
            />
            {photoError && (
              <p role="alert" className="text-sm m-0 font-medium text-ink">
                {t(`errors.${photoError}`, { max: MAX_CARDS_PER_ORDER })}
              </p>
            )}
          </div>
          <div>
            <span className={groupLabel}>{t("cards.identification.label")}</span>
            <ChoiceCards
              label={t("cards.identification.label")}
              value={card.identifiedBy}
              onValueChange={(next) => update({ identifiedBy: next as IdentifiedBy })}
              options={[
                {
                  value: "customer",
                  title: t("cards.identification.customer"),
                  description: t("cards.identification.customerHint"),
                  meta: t("cards.identification.included"),
                },
                {
                  value: "art",
                  title: t("cards.identification.art"),
                  description: t("cards.identification.artHint"),
                  meta: t("cards.identification.fee", { fee: money(catalog.identificationCents) }),
                },
              ]}
            />
          </div>
        </div>
      </FormSection>

      <FormSection number="02" heading={t("cards.sections.details")}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {text("name", "name", CARD_TEXT_MAX, t("cards.fields.name"))}
          {text("brand", "brand", BRAND_MAX, t("cards.fields.brand"))}
          {text("setName", "setName", CARD_TEXT_MAX, t("cards.fields.setName"))}
          {text("cardNumber", "cardNumber", CARD_NUMBER_MAX, t("cards.fields.cardNumber"))}
          <Field label={named(t("cards.fields.year"))} invalid={!!errorFor("releaseYear")}>
            <FieldInput
              data-field="releaseYear"
              inputMode="numeric"
              maxLength={4}
              value={card.releaseYear === null ? "" : String(card.releaseYear)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                update({ releaseYear: digits === "" ? null : Number(digits) });
              }}
              onBlur={() => touch("releaseYear")}
              aria-invalid={errorFor("releaseYear") ? true : undefined}
            />
            <FieldError>{errorFor("releaseYear")}</FieldError>
          </Field>
          <Field label={named(t("cards.fields.language"))} invalid={!!errorFor("language")}>
            <FieldSelect
              data-field="language"
              value={card.language ?? ""}
              onChange={(e) => update({ language: e.target.value === "" ? null : e.target.value })}
              onBlur={() => touch("language")}
              aria-invalid={errorFor("language") ? true : undefined}
            >
              <option value="">{t("cards.fields.languagePlaceholder")}</option>
              {CARD_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageNames.of(code) ?? code}
                </option>
              ))}
            </FieldSelect>
            <FieldError>{errorFor("language")}</FieldError>
          </Field>
          <Field label={t("cards.fields.optional", { label: t("cards.fields.surface") })}>
            <FieldInput
              value={card.surface ?? ""}
              maxLength={SURFACE_MAX}
              onChange={(e) => update({ surface: e.target.value === "" ? null : e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Checkbox
            checked={card.signed}
            onCheckedChange={(signed) => update({ signed })}
            label={t("cards.fields.signed")}
            description={t("cards.fields.signedHint")}
          />
          <Checkbox
            checked={card.numbered}
            onCheckedChange={(numbered) => update({ numbered })}
            label={t("cards.fields.numbered")}
            description={t("cards.fields.numberedHint")}
          />
        </div>
      </FormSection>

      <FormSection number="03" heading={t("cards.sections.value")}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label={t("cards.fields.value", { currency: catalog.currency })}
            invalid={!!errorFor("value")}
            className="mb-0"
          >
            <FieldInput
              data-field="value"
              inputMode="decimal"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              onBlur={() => {
                touch("value");
                const cents = valueText.trim() === "" ? null : parseMoney(valueText);
                if (cents !== null) {
                  setValueText(
                    format.number(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                  );
                }
                update({ declaredValueCents: cents });
              }}
              aria-invalid={errorFor("value") ? true : undefined}
            />
            <FieldDescription>{t("cards.fields.valueHint")}</FieldDescription>
            <FieldError>{errorFor("value")}</FieldError>
          </Field>
        </div>
      </FormSection>

      <FormSection number="04" heading={t("cards.sections.service")}>
        <div data-field="service">
          <ChoiceCards
            label={t("cards.service.label")}
            columns={2}
            invalid={!!serviceError}
            value={card.service}
            onValueChange={(service) => {
              touch("service");
              update({ service, tierKey: null });
            }}
            options={services.map((s) => {
              const from = lowestTierCents(s.key, catalog);
              return {
                value: s.key,
                title: catalogText(`services.${s.key}.label`) ?? s.key,
                description: catalogText(`services.${s.key}.description`) ?? undefined,
                icon: <ServiceIcon service={s.key} />,
                metaLabel: from === null ? undefined : t("cards.service.from"),
                meta: from === null ? undefined : money(from),
              };
            })}
          />
          {signedOnlyHidden && (
            <p className="text-sm m-0 mt-2 text-muted">{t("cards.service.signedMore")}</p>
          )}
          {serviceError && (
            <p role="alert" className="text-sm m-0 mt-2 font-medium text-ink">
              {serviceError}
            </p>
          )}
        </div>

        {card.service !== null && (
          <div data-field="tier" className="mt-6">
            <span className={groupLabel}>{t("cards.service.tier")}</span>
            <ChoiceCards
              label={t("cards.service.tier")}
              invalid={!!tierError}
              value={card.tierKey}
              onValueChange={(tierKey) => {
                touch("tier");
                update({ tierKey });
              }}
              options={tiers.map((tier) => {
                const description = catalogText(`tiers.${tier.key}.description`);
                const limit =
                  tier.maxDeclaredValueCents === null
                    ? t("cards.service.anyValue")
                    : t("cards.service.upTo", { amount: money(tier.maxDeclaredValueCents) });
                return {
                  value: tier.key,
                  title: catalogText(`tiers.${tier.key}.label`) ?? tier.key,
                  description: description ? `${description} ${limit}` : limit,
                  meta: money(tier.amountCents),
                  metaDetail: t("total.turnaroundDays", { days: tier.turnaroundDays }),
                  disabled: tier.overCap,
                  disabledReason:
                    tier.overCap && tier.maxDeclaredValueCents !== null && card.declaredValueCents !== null
                      ? t("cards.service.overLimit", {
                          limit: money(tier.maxDeclaredValueCents),
                          value: money(card.declaredValueCents),
                        })
                      : undefined,
                };
              })}
            />
            {tierError && (
              <p role="alert" className="text-sm m-0 mt-2 font-medium text-ink">
                {tierError}
              </p>
            )}
          </div>
        )}

        {addOns.length > 0 && (
          <fieldset className="m-0 mt-6 min-w-0 border-0 p-0">
            <legend className={legendClass}>{t("cards.service.addOns")}</legend>
            <div className="grid gap-3">
              {addOns.map((addOn) => (
                <ChoiceCheckCard
                  key={addOn.key}
                  checked={card.addOnKeys.includes(addOn.key)}
                  onCheckedChange={(on) =>
                    update({
                      addOnKeys: on
                        ? [...card.addOnKeys, addOn.key]
                        : card.addOnKeys.filter((k) => k !== addOn.key),
                    })
                  }
                  title={catalogText(`addOns.${addOn.key}.label`) ?? addOn.key}
                  description={catalogText(`addOns.${addOn.key}.description`) ?? undefined}
                  meta={t("cards.service.addOnPrice", { price: money(addOn.amountCents) })}
                />
              ))}
            </div>
          </fieldset>
        )}
      </FormSection>
    </div>
  );
}
