import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { Grade, Population } from "@/lib/pop/types";

export type PopulationRow = { id: string; href?: string; label: ReactNode } & Population;

const cell = "px-3 py-2 text-right font-mono tabular-nums";
const head = "text-[11px] uppercase tracking-[0.14em]";

/**
 * Columns are the grades that any row has a count for, highest first, then
 * Authentic (only if any row has one), then Total. A row with autograph copies
 * gets a sub-row on the same columns. Wide tables scroll inside their wrapper.
 */
export function PopulationTable({
  grades,
  rows,
  caption,
}: {
  grades: Grade[];
  rows: PopulationRow[];
  caption: string;
}) {
  const t = useTranslations("pop.table");
  const tg = useTranslations("catalog.grades");
  const format = useFormatter();

  const columns = grades
    .filter((g) =>
      rows.some((r) => (r.gradeCounts[g.key] ?? 0) > 0 || (r.autographCounts[g.key] ?? 0) > 0),
    )
    .sort((a, b) => b.value - a.value);
  const showAuthentic = rows.some((r) => r.authenticCount > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px] text-ink">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline text-muted">
            <th scope="col" className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
              {t("card")}
            </th>
            {columns.map((g) => (
              <th
                key={g.key}
                scope="col"
                className={cn(cell, head)}
              >
                {format.number(g.value)}
                <span className="sr-only"> {tg(`${g.key}.label`)}</span>
              </th>
            ))}
            {showAuthentic ? (
              <th scope="col" className={cn(cell, head)}>
                {t("authentic")}
              </th>
            ) : null}
            <th scope="col" className={cn(cell, head)}>
              {t("total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RowGroup
              key={row.id}
              row={row}
              columns={columns}
              showAuthentic={showAuthentic}
              autographLabel={t("autograph")}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowGroup({
  row,
  columns,
  showAuthentic,
  autographLabel,
}: {
  row: PopulationRow;
  columns: Grade[];
  showAuthentic: boolean;
  autographLabel: string;
}) {
  const format = useFormatter();
  const n = (v: number | undefined) => (v ? format.number(v) : "–");

  return (
    <>
      <tr className="border-b border-hairline-faint">
        <th scope="row" className="px-3 py-2 text-left font-normal">
          {row.href ? (
            <Link href={row.href} className="underline-offset-2 hover:underline">
              {row.label}
            </Link>
          ) : (
            row.label
          )}
        </th>
        {columns.map((g) => (
          <td key={g.key} className={cell}>
            {n(row.gradeCounts[g.key])}
          </td>
        ))}
        {showAuthentic ? <td className={cell}>{n(row.authenticCount)}</td> : null}
        <td className={cn(cell, "font-medium")}>{format.number(row.total)}</td>
      </tr>
      {row.autographTotal > 0 ? (
        <tr className="border-b border-hairline-faint text-muted">
          <th scope="row" className={cn("px-3 py-2 text-left text-[13px] font-normal", "pl-6")}>
            {autographLabel}
          </th>
          {columns.map((g) => (
            <td key={g.key} className={cell}>
              {n(row.autographCounts[g.key])}
            </td>
          ))}
          {showAuthentic ? <td className={cell}>–</td> : null}
          <td className={cn(cell, "font-medium")}>{format.number(row.autographTotal)}</td>
        </tr>
      ) : null}
    </>
  );
}
