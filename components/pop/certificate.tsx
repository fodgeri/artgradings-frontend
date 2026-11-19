import { useFormatter, useTranslations } from "next-intl";

import { Slab } from "@/components/slab/slab";
import { Link } from "@/i18n/navigation";
import type { Grade, PopCertificate } from "@/lib/pop/types";

type PublicCertificate = Extract<PopCertificate, { status: "public" }>;

/** The withdrawn view shows the number and nothing else: no card, grade or date. */
export function WithdrawnCertificate({ certNumber }: { certNumber: string }) {
  const t = useTranslations("cert.withdrawn");
  return (
    <div>
      <h1 className="font-serif text-display text-ink">{t("title")}</h1>
      <p className="mt-6 text-lead text-muted">{t("body", { number: certNumber })}</p>
    </div>
  );
}

export function Certificate({ cert, grades }: { cert: PublicCertificate; grades: Grade[] }) {
  const t = useTranslations("cert");
  const tg = useTranslations("catalog.grades");
  const categories = useTranslations("catalog.categories");
  const card = useTranslations("pop.card");
  const table = useTranslations("pop.table");
  const format = useFormatter();

  const categoryLabel = cert.category ? categories(`${cert.category}.label`) : "";
  const numeral = (key: PublicCertificate["cardGrade"]) => grades.find((g) => g.key === key)?.value;
  const cardValue = numeral(cert.cardGrade);
  const authenticOnly = cert.cardGrade === null && cert.cardAuthentication === "genuine";

  let slabGrade = card("noGrade");
  let slabLabel = "";
  if (cert.cardGrade && cardValue !== undefined) {
    slabGrade = format.number(cardValue);
    slabLabel = tg(`${cert.cardGrade}.label`);
  } else if (authenticOnly) {
    slabGrade = t("authenticMark");
    slabLabel = table("authentic");
  }

  const autographValue = numeral(cert.autographGrade);
  if (slabLabel === "" && cert.autographGrade && autographValue !== undefined) {
    slabGrade = format.number(autographValue);
    slabLabel = table("autograph");
  }

  const result = (value: string | null) =>
    value === "genuine" || value === "not_genuine" ? t(`authentication.${value}`) : t("unknownResult");

  const rows: { label: string; value: React.ReactNode }[] = [
    ...(cert.cardGrade ? [{ label: t("cardGrade"), value: tg(`${cert.cardGrade}.label`) }] : []),
    ...(cert.autographGrade ? [{ label: t("autographGrade"), value: tg(`${cert.autographGrade}.label`) }] : []),
    ...(cert.cardAuthentication !== null
      ? [{ label: t("authentication.card"), value: result(cert.cardAuthentication) }]
      : []),
    ...(cert.autographAuthentication !== null
      ? [{ label: t("authentication.autograph"), value: result(cert.autographAuthentication) }]
      : []),
    {
      label: t("gradedOn"),
      value: format.dateTime(new Date(cert.publishedAt), { dateStyle: "long" }),
    },
  ];

  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,320px)_1fr] md:items-start">
      <Slab
        data={{
          cert: cert.certNumber,
          category: categoryLabel,
          name: cert.cardName,
          year: cert.releaseYear === null ? "" : format.number(cert.releaseYear, { useGrouping: false }),
          set: cert.setName,
          number: cert.cardNumber,
          grade: slabGrade,
          label: slabLabel,
        }}
      />
      <div>
        <h1 className="font-serif text-display text-ink">{cert.cardName}</h1>
        <p className="mt-2 font-mono text-meta text-muted">{cert.certNumber}</p>
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ink">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-ink">
          <p>{t("graded", { count: cert.cardTotal })}</p>
          {cert.gradedHigher !== null ? <p>{t("gradedHigher", { count: cert.gradedHigher })}</p> : null}
        </div>
        <p className="mt-6">
          <Link
            href={`/pop-report/cards/${cert.cardId}`}
            className="text-gold-ink underline underline-offset-4"
          >
            {t("viewCard")}
          </Link>
        </p>
      </div>
    </div>
  );
}
