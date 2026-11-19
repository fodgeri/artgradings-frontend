import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { PopulationTable } from "@/components/pop/population-table";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { isUuid } from "@/lib/uuid";
import { loadCategories, loadGrades, loadSet, loadSetCards } from "@/lib/pop/load";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pop-report/sets/[set]">): Promise<Metadata> {
  const id = (await params).set;
  const t = await getTranslations("pop");
  const set = isUuid(id) ? await loadSet(id) : null;
  if (!set) return { title: t("search.title") };
  return {
    title: t("set.title", { set: set.name }),
    description: t("set.metaDescription", { set: set.name }),
  };
}

export default async function PopSetPage({ params }: PageProps<"/[locale]/pop-report/sets/[set]">) {
  const id = (await params).set;
  if (!isUuid(id)) notFound();

  const set = await loadSet(id);
  if (!set) notFound();

  const [cards, grades, categories, t, names, format] = await Promise.all([
    loadSetCards(id),
    loadGrades(),
    loadCategories(),
    getTranslations("pop.set"),
    getTranslations("catalog.categories"),
    getFormatter(),
  ]);
  const era = set.kind === "tcg" ? set.series : null;
  const year = set.releaseYear === null ? null : format.number(set.releaseYear, { useGrouping: false });
  const meta = [era ?? year, set.language, set.code ? t("code", { code: set.code }) : null].filter(Boolean);

  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[960px] flex-col gap-10">
          <header>
            {/* An inactive category's page 404s (R4); say its name without linking. */}
            {categories.some((c) => c.key === set.category) ? (
              <Link
                href={`/pop-report/${set.category}`}
                className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {t("back", { category: names(`${set.category}.label`) })}
              </Link>
            ) : (
              <span className="text-sm text-muted">{t("back", { category: names(`${set.category}.label`) })}</span>
            )}
            <h1 className="mt-4 font-serif text-display text-ink">{set.name}</h1>
            {meta.length > 0 ? <p className="mt-2 text-muted">{meta.join(" · ")}</p> : null}
          </header>
          {cards.length === 0 ? (
            <p className="text-muted">{t("empty")}</p>
          ) : (
            <PopulationTable
              grades={grades}
              caption={t("tableCaption", { set: set.name })}
              rows={cards.map((c) => ({
                ...c,
                href: `/pop-report/cards/${c.id}`,
                label: [c.cardNumber, c.name, c.variant].filter(Boolean).join(" · "),
              }))}
            />
          )}
        </div>
      </Container>
    </Section>
  );
}
