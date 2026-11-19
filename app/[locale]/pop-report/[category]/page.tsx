import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CategorySets } from "@/components/pop/category-sets";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { CATEGORY_KEYS, type CategoryKey } from "@/lib/pop/keys";
import { loadCategories, loadCategorySets } from "@/lib/pop/load";

function categoryKey(raw: string): CategoryKey | null {
  return CATEGORY_KEYS.find((k) => k === raw) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pop-report/[category]">): Promise<Metadata> {
  const key = categoryKey((await params).category);
  const t = await getTranslations("pop");
  if (!key) return { title: t("search.title") };
  const category = (await getTranslations("catalog.categories"))(`${key}.label`);
  return {
    title: t("category.title", { category }),
    description: t("category.metaDescription", { category }),
  };
}

export default async function PopCategoryPage({ params }: PageProps<"/[locale]/pop-report/[category]">) {
  // Allow-list before any query: an arbitrary segment never reaches the database.
  const key = categoryKey((await params).category);
  if (!key) notFound();

  const [categories, sets] = await Promise.all([loadCategories(), loadCategorySets(key)]);
  const category = categories.find((c) => c.key === key);
  if (!category || sets.length === 0) notFound();

  const t = await getTranslations("pop.category");
  const names = await getTranslations("catalog.categories");

  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[960px] flex-col gap-10">
          <header>
            <Link href="/pop-report" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              {t("back")}
            </Link>
            <h1 className="mt-4 font-serif text-display text-ink">
              {t("title", { category: names(`${key}.label`) })}
            </h1>
          </header>
          <CategorySets kind={category.kind} sets={sets} />
        </div>
      </Container>
    </Section>
  );
}
