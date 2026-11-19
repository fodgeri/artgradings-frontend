import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldInput } from "@/components/ui/field";
import { getPathname } from "@/i18n/navigation";

/** A plain GET form: it works without JavaScript and `/cert?number=` normalises and redirects. */
export function CertLookupForm({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations("cert.form");
  const locale = useLocale();
  return (
    <form method="get" action={getPathname({ href: "/cert", locale })} role="search" className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field label={t("number")} className="flex-1">
        <FieldInput
          name="number"
          required
          maxLength={64}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={defaultValue}
          placeholder={t("placeholder")}
        />
      </Field>
      <Button type="submit">{t("submit")}</Button>
    </form>
  );
}
