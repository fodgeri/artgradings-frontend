import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { PopCard } from "@/lib/pop/types";

/** The facts about a card, as a definition list. Absent optional fields leave no line. */
export function CardDetails({
  card,
  categoryLinkable = true,
}: {
  card: PopCard;
  /** False when the category page would 404 (an inactive category): plain text then. */
  categoryLinkable?: boolean;
}) {
  const t = useTranslations("pop.card");
  const categories = useTranslations("catalog.categories");

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t("number"), value: card.cardNumber },
    ...(card.variant ? [{ label: t("variant"), value: card.variant }] : []),
    ...(card.rarity ? [{ label: t("rarity"), value: card.rarity }] : []),
    {
      label: t("set"),
      value: (
        <Link href={`/pop-report/sets/${card.setId}`} className="underline-offset-4 hover:underline">
          {card.setName}
        </Link>
      ),
    },
    {
      label: t("category"),
      value: categoryLinkable ? (
        <Link href={`/pop-report/${card.category}`} className="underline-offset-4 hover:underline">
          {categories(`${card.category}.label`)}
        </Link>
      ) : (
        categories(`${card.category}.label`)
      ),
    },
    ...(card.releaseYear !== null ? [{ label: t("year"), value: String(card.releaseYear) }] : []),
    ...(card.language ? [{ label: t("language"), value: card.language }] : []),
  ];

  return (
    <div>
      <h1 className="font-serif text-display text-ink">{card.name}</h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ink">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
