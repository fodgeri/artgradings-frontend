"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { CATEGORY_KEYS, GRADE_KEYS } from "@/lib/pop/keys";
import { isEmptySearch, type PopSearch } from "@/lib/pop/search-params";

/** A plain GET form: it works without JavaScript and every search is a shareable URL. */
export function SearchForm({ search }: { search: PopSearch }) {
  const t = useTranslations("pop.search.form");
  const kinds = useTranslations("catalog.kinds");
  const categories = useTranslations("catalog.categories");
  const grades = useTranslations("catalog.grades");
  const table = useTranslations("pop.table");

  return (
    <form method="get" role="search" className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t("q")} className="sm:col-span-2 lg:col-span-4">
        <FieldInput
          name="q"
          type="search"
          maxLength={100}
          defaultValue={search.q}
          placeholder={t("qPlaceholder")}
        />
      </Field>
      <Field label={t("kind")}>
        <FieldSelect name="kind" defaultValue={search.kind ?? ""}>
          <option value="">{t("any")}</option>
          <option value="tcg">{kinds("tcg.label")}</option>
          <option value="sports">{kinds("sports.label")}</option>
        </FieldSelect>
      </Field>
      <Field label={t("category")}>
        <FieldSelect name="category" defaultValue={search.category ?? ""}>
          <option value="">{t("any")}</option>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {categories(`${key}.label`)}
            </option>
          ))}
        </FieldSelect>
      </Field>
      <Field label={t("year")}>
        <FieldInput
          name="year"
          type="number"
          inputMode="numeric"
          min={1880}
          max={2100}
          defaultValue={search.year ?? ""}
        />
      </Field>
      <Field label={t("grade")}>
        <FieldSelect name="grade" defaultValue={search.grade ?? ""}>
          <option value="">{t("any")}</option>
          {GRADE_KEYS.map((key) => (
            <option key={key} value={key}>
              {grades(`${key}.label`)}
            </option>
          ))}
          <option value="authentic">{table("authentic")}</option>
        </FieldSelect>
      </Field>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
        <Button type="submit">{t("submit")}</Button>
        {!isEmptySearch(search) && (
          <Link href="/pop-report" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("clear")}
          </Link>
        )}
      </div>
    </form>
  );
}
