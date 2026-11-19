import {
  CATEGORY_KEYS,
  GRADE_KEYS,
  type CategoryKey,
  type CategoryKind,
  type GradeKey,
} from "./keys";

export const POP_PAGE_SIZE = 24;
export const POP_MAX_PAGE = 100;
export const POP_MAX_QUERY = 100;

const KINDS: readonly CategoryKind[] = ["tcg", "sports"];

export type PopSearch = {
  q: string;
  kind?: CategoryKind;
  category?: CategoryKey;
  year?: number;
  grade?: GradeKey | "authentic";
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(list: readonly T[], v: string | undefined): T | undefined {
  return list.find((item) => item === v);
}

function integer(v: string | undefined, min: number, max: number): number | undefined {
  if (v === undefined || !/^\d{1,5}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/** URL params are hostile input: only allow-listed values survive. */
export function parsePopSearch(params: Params): PopSearch {
  const search: PopSearch = {
    q: (first(params, "q") ?? "").trim().slice(0, POP_MAX_QUERY).trim(),
    page: integer(first(params, "page"), 1, POP_MAX_PAGE) ?? 1,
  };
  const kind = oneOf(KINDS, first(params, "kind"));
  if (kind) search.kind = kind;
  const category = oneOf(CATEGORY_KEYS, first(params, "category"));
  if (category) search.category = category;
  const year = integer(first(params, "year"), 1880, 2100);
  if (year !== undefined) search.year = year;
  const grade = oneOf([...GRADE_KEYS, "authentic"] as const, first(params, "grade"));
  if (grade) search.grade = grade;
  return search;
}

export function isEmptySearch(s: PopSearch): boolean {
  return !s.q && !s.kind && !s.category && s.year === undefined && !s.grade;
}

export function toSearchParams(s: PopSearch): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.kind) p.set("kind", s.kind);
  if (s.category) p.set("category", s.category);
  if (s.year !== undefined) p.set("year", String(s.year));
  if (s.grade) p.set("grade", s.grade);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}

export function toMeiliFilter(s: PopSearch): string[] {
  const f: string[] = [];
  if (s.kind) f.push(`kind = "${s.kind}"`);
  if (s.category) f.push(`category = "${s.category}"`);
  if (s.year !== undefined) f.push(`release_year = ${s.year}`);
  if (s.grade) f.push(`grades_present = "${s.grade}"`);
  return f;
}
