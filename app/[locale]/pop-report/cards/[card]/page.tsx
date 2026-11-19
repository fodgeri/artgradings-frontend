import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { CardDetails } from "@/components/pop/card-details";
import { PopulationTable } from "@/components/pop/population-table";
import { Slab } from "@/components/slab/slab";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { isUuid } from "@/lib/uuid";
import { loadCard, loadCategories, loadGrades, resolveCard } from "@/lib/pop/load";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pop-report/cards/[card]">): Promise<Metadata> {
  const id = (await params).card;
  const t = await getTranslations("pop");
  const card = isUuid(id) ? await loadCard(id) : null;
  if (!card) return { title: t("search.title") };
  return {
    title: t("card.title", { name: card.name }),
    description: t("card.metaDescription", { name: card.name, set: card.setName }),
  };
}

export default async function PopCardPage({ params }: PageProps<"/[locale]/pop-report/cards/[card]">) {
  const { locale, card: id } = await params;
  if (!isUuid(id)) notFound();

  const card = await loadCard(id);
  if (!card) {
    // A merged card's old address follows the merge to the surviving card.
    const resolved = await resolveCard(id);
    if (resolved && resolved !== id) {
      return redirect({ href: `/pop-report/cards/${resolved}`, locale: resolveLocale(locale) });
    }
    notFound();
  }

  const [grades, activeCategories, t, categories, tg, format] = await Promise.all([
    loadGrades(),
    loadCategories(),
    getTranslations("pop.card"),
    getTranslations("catalog.categories"),
    getTranslations("catalog.grades"),
    getFormatter(),
  ]);
  const categoryLabel = categories(`${card.category}.label`);
  const highest = grades
    .filter((g) => (card.gradeCounts[g.key] ?? 0) > 0)
    .sort((a, b) => b.value - a.value)[0];

  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[960px] flex-col gap-10">
          <div className="grid gap-10 md:grid-cols-[minmax(0,320px)_1fr] md:items-start">
            <Slab
              data={{
                category: categoryLabel,
                name: card.name,
                year: card.releaseYear === null ? "" : format.number(card.releaseYear, { useGrouping: false }),
                set: card.setName,
                number: card.cardNumber,
                rarity: card.rarity ?? undefined,
                grade: highest ? format.number(highest.value) : t("noGrade"),
                label: highest ? tg(`${highest.key}.label`) : categoryLabel,
              }}
            />
            <CardDetails card={card} categoryLinkable={activeCategories.some((c) => c.key === card.category)} />
          </div>
          <PopulationTable
            grades={grades}
            caption={t("tableCaption", { name: card.name })}
            rows={[{ ...card, label: card.name }]}
          />
        </div>
      </Container>
    </Section>
  );
}
