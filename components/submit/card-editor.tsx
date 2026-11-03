"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { removePhoto, uploadPhoto } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldInput, FieldSelect } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
  availableTiers,
  cardProblems,
  normalizeCard,
} from "@/lib/orders/card-rules";
import type { OrderErrorKey } from "@/lib/orders/errors";
import type { Catalog, DraftCard, IdentifiedBy } from "@/lib/orders/types";
import { parseMoney } from "@/lib/money";
import { compressPhoto } from "@/lib/photos/compress";

type FieldName =
  | "releaseYear" | "brand" | "language" | "name" | "setName" | "cardNumber"
  | "value" | "service" | "tier";

const FIELD_OF: Record<CardProblem, FieldName> = {
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

/**
 * One card's form. Every edit passes through `normalizeCard`, so the card the
 * parent holds is always internally consistent. `saved` says an earlier save
 * of this card has landed: the photo needs a stored card to hang from.
 */
export function CardEditor({
  card,
  catalog,
  saved,
  onChange,
  onPhoto,
  onRemove,
  onGone,
}: {
  card: DraftCard;
  catalog: Catalog;
  saved: boolean;
  onChange: (card: DraftCard) => void;
  /** Sets only the photo, so edits made during an upload are not overwritten. */
  onPhoto: (photo: DraftCard["photo"]) => void;
  onRemove: () => void;
  /** The card no longer exists on the server; drop it. */
  onGone: () => void;
}) {
  const t = useTranslations("submit");
  const tCatalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();

  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
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

  const label = (key: string) => (tCatalog.has(key as never) ? tCatalog(key as never) : key);
  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: catalog.currency });

  const update = (patch: Partial<DraftCard>) => onChange(normalizeCard({ ...card, ...patch }, catalog));
  const touch = (field: FieldName) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  const problems = cardProblems(card, catalog);
  const errorFor = (field: FieldName) => {
    if (!touched.has(field)) return null;
    const problem = problems.find((p) => FIELD_OF[p] === field);
    return problem ? t(`cards.problems.${problem}`) : null;
  };

  const art = card.identifiedBy === "art";
  const named = (name: string) => (art ? t("cards.fields.optional", { label: name }) : name);
  const text = (
    field: FieldName,
    key: "brand" | "name" | "setName" | "cardNumber",
    max: number,
    name: string,
  ) => (
    <Field label={named(name)} invalid={!!errorFor(field)}>
      <FieldInput
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
  const tiers = availableTiers(card.service, card.declaredValueCents, catalog);
  const addOns = applicableAddOns(card.service, catalog);
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });
  const identificationFee = money(catalog.identificationCents);

  async function onSelect(file: File) {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
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

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-4 flex flex-col gap-2">
        <span className="font-mono text-label uppercase text-muted">
          {t("cards.identification.label")}
        </span>
        <SegmentedControl
          label={t("cards.identification.label")}
          value={card.identifiedBy}
          onValueChange={(next) => update({ identifiedBy: next as IdentifiedBy })}
          options={[
            { value: "customer", label: t("cards.identification.customer") },
            { value: "art", label: t("cards.identification.art", { fee: identificationFee }) },
          ]}
        />
        {art && <p className="text-sm text-muted">{t("cards.identification.artHint")}</p>}
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={named(t("cards.fields.year"))} invalid={!!errorFor("releaseYear")}>
          <FieldInput
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
        {text("brand", "brand", BRAND_MAX, t("cards.fields.brand"))}
        <Field label={named(t("cards.fields.language"))} invalid={!!errorFor("language")}>
          <FieldSelect
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
        {text("name", "name", CARD_TEXT_MAX, t("cards.fields.name"))}
        {text("setName", "setName", CARD_TEXT_MAX, t("cards.fields.setName"))}
        {text("cardNumber", "cardNumber", CARD_NUMBER_MAX, t("cards.fields.cardNumber"))}
        <Field label={t("cards.fields.optional", { label: t("cards.fields.surface") })}>
          <FieldInput
            value={card.surface ?? ""}
            maxLength={SURFACE_MAX}
            onChange={(e) => update({ surface: e.target.value === "" ? null : e.target.value })}
          />
        </Field>
      </div>

      <div className="mb-4 flex flex-col gap-3">
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

      <Field label={t("cards.fields.value", { currency: catalog.currency })} invalid={!!errorFor("value")}>
        <FieldInput
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

      <div className="mb-4 flex flex-col gap-2">
        <span className="font-mono text-label uppercase text-muted">{t("cards.service.label")}</span>
        <SegmentedControl
          label={t("cards.service.label")}
          value={card.service ?? ""}
          onValueChange={(service) => {
            touch("service");
            update({ service, tierKey: null });
          }}
          options={services.map((s) => ({ value: s.key, label: label(`services.${s.key}.label`) }))}
          className="flex-wrap"
        />
        {errorFor("service") && (
          <p role="alert" className="text-sm font-medium text-ink">
            {errorFor("service")}
          </p>
        )}
      </div>

      {card.service !== null && (
        <Field label={t("cards.service.tier")} invalid={!!errorFor("tier")}>
          <FieldSelect
            value={tiers.some((x) => x.key === card.tierKey) ? (card.tierKey ?? "") : ""}
            onChange={(e) => update({ tierKey: e.target.value === "" ? null : e.target.value })}
            onBlur={() => touch("tier")}
            aria-invalid={errorFor("tier") ? true : undefined}
          >
            <option value="">{t("cards.service.tierPlaceholder")}</option>
            {tiers.map((tier) => (
              <option key={tier.key} value={tier.key}>
                {t("cards.service.tierOption", {
                  label: label(`tiers.${tier.key}.label`),
                  price: money(tier.amountCents),
                  turnaround: t("total.turnaroundDays", { days: tier.turnaroundDays }),
                })}
              </option>
            ))}
          </FieldSelect>
          <FieldError>{errorFor("tier")}</FieldError>
        </Field>
      )}

      {addOns.length > 0 && (
        <fieldset className="mb-4 flex flex-col gap-3">
          <legend className="mb-2 font-mono text-label uppercase text-muted">
            {t("cards.service.addOns")}
          </legend>
          {addOns.map((addOn) => {
            const descriptionKey = `addOns.${addOn.key}.description`;
            const price = money(addOn.amountCents);
            return (
              <Checkbox
                key={addOn.key}
                checked={card.addOnKeys.includes(addOn.key)}
                onCheckedChange={(on) =>
                  update({
                    addOnKeys: on
                      ? [...card.addOnKeys, addOn.key]
                      : card.addOnKeys.filter((k) => k !== addOn.key),
                  })
                }
                label={label(`addOns.${addOn.key}.label`)}
                description={
                  tCatalog.has(descriptionKey as never)
                    ? t("cards.service.addOnWithDescription", {
                        description: tCatalog(descriptionKey as never),
                        price,
                      })
                    : t("cards.service.addOnPrice", { price })
                }
              />
            );
          })}
        </fieldset>
      )}

      <div className="mb-2 flex flex-col gap-2">
        <PhotoInput
          previewUrl={card.photo ? `/api/photos/${card.photo.id}` : null}
          disabled={!saved}
          busy={photoBusy}
          onSelect={onSelect}
          onRemove={onPhotoRemove}
          label={t("cards.photo.label")}
          removeLabel={t("cards.photo.remove")}
        />
        {!saved && <p className="text-sm text-muted">{t("cards.photo.hint")}</p>}
        {photoError && (
          <p role="alert" className="text-sm font-medium text-ink">
            {t(`errors.${photoError}`, { max: MAX_CARDS_PER_ORDER })}
          </p>
        )}
      </div>

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t("cards.remove")}
        </Button>
      </div>
    </div>
  );
}
