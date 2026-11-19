import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { GRADE_KEYS } from "@/lib/pop/keys";
import { toSearchParams, type PopSearch } from "@/lib/pop/search-params";
import type { Grade } from "@/lib/pop/types";
import type { PopCardDocument } from "@/lib/search/documents";
import type { PopSearchResult } from "@/lib/search/query";

function highestGrade(hit: PopCardDocument, grades: Grade[]) {
  for (const key of [...GRADE_KEYS].reverse()) {
    const count = hit.grade_counts[key];
    const grade = grades.find((g) => g.key === key);
    if (count && grade) return { grade, count };
  }
  return null;
}

function pageHref(search: PopSearch, page: number) {
  const query = Object.fromEntries(toSearchParams({ ...search, page }));
  return { pathname: "/pop-report", query };
}

export function SearchResults({
  result,
  search,
  grades,
}: {
  result: PopSearchResult;
  search: PopSearch;
  grades: Grade[];
}) {
  const t = useTranslations("pop.search.results");
  const gradeNames = useTranslations("catalog.grades");
  const format = useFormatter();

  if (result.status === "unavailable") {
    return <p role="status" className="text-muted">{t("unavailable")}</p>;
  }
  if (result.hits.length === 0) {
    return <p role="status" className="text-muted">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="font-mono text-label uppercase text-muted">{t("count", { count: result.total })}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {result.hits.map((hit) => {
          const top = highestGrade(hit, grades);
          return (
            <li key={hit.id}>
              <Link
                href={`/pop-report/cards/${hit.id}`}
                className="focus-ring flex h-full flex-col gap-1 rounded-card border border-hairline bg-surface-raised p-4 transition-colors hover:border-gold-line"
              >
                <span className="font-serif text-h3 text-ink">{hit.name}</span>
                <span className="text-sm text-muted">
                  {[
                    hit.set_name,
                    t("number", { number: hit.card_number }),
                    hit.variant,
                    hit.release_year === null ? null : String(hit.release_year),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="mt-2 text-sm text-ink">{t("total", { count: hit.total })}</span>
                <span className="text-sm text-muted">
                  {top ? (
                    t("highest", {
                      grade: `${format.number(top.grade.value)} ${gradeNames(`${top.grade.key}.label`)}`,
                      count: format.number(top.count),
                    })
                  ) : (
                    t("noGrades")
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {result.pages > 1 && (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4 text-sm">
          {result.page > 1 ? (
            <Link href={pageHref(search, result.page - 1)} rel="prev" className="underline underline-offset-4">
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">{t("page", { page: result.page, pages: result.pages })}</span>
          {result.page < result.pages ? (
            <Link href={pageHref(search, result.page + 1)} rel="next" className="underline underline-offset-4">
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
