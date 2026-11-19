import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CategoryTiles } from "@/components/pop/category-tiles";
import { SearchForm } from "@/components/pop/search-form";
import { SearchResults } from "@/components/pop/search-results";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { loadCategories, loadGrades } from "@/lib/pop/load";
import { isEmptySearch, parsePopSearch, type PopSearch } from "@/lib/pop/search-params";
import { searchPopCards } from "@/lib/search/query";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pop.search");
  return { title: t("title"), description: t("metaDescription") };
}

/** Grades are needed only to name a hit's best grade, so the degraded states never wait on them. */
async function Results({ search }: { search: PopSearch }) {
  const result = await searchPopCards(search);
  const grades = result.status === "ok" && result.hits.length > 0 ? await loadGrades() : [];
  return <SearchResults result={result} search={search} grades={grades} />;
}

/** Always fresh: the search is per-request and counts change with every published grade. */
export default async function PopReportPage({ searchParams }: PageProps<"/[locale]/pop-report">) {
  const search = parsePopSearch(await searchParams);
  const t = await getTranslations("pop");
  const empty = isEmptySearch(search);

  return (
    <Section>
      <Container>
        <div className="mx-auto flex max-w-[960px] flex-col gap-10">
          <header>
            <h1 className="font-serif text-display text-ink">{t("search.title")}</h1>
            <p className="mt-6 text-lead text-muted">{t("search.lead")}</p>
          </header>
          <SearchForm search={search} />
          {empty ? (
            <div>
              <h2 className="sr-only">{t("category.browseTitle")}</h2>
              <CategoryTiles categories={await loadCategories()} />
            </div>
          ) : (
            <Results search={search} />
          )}
        </div>
      </Container>
    </Section>
  );
}
