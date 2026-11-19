import "server-only";

import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

import { reportPopError } from "./errors";
import { CATEGORY_KEYS, GRADE_KEYS, type CategoryKey, type CategoryKind, type GradeKey } from "./keys";
import type {
  Grade,
  PopCard,
  PopCategory,
  PopCertificate,
  PopRecentCopy,
  PopSet,
  PopSetCard,
  PopSetSummary,
  Population,
} from "./types";

// The generated types mark every RETURNS TABLE column non-null; at runtime many
// are null. Rows are read as loose records and mapped defensively.
type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const reqStr = (v: unknown): string => (typeof v === "string" ? v : "");
const reqNum = (v: unknown): number => (typeof v === "number" ? v : 0);

function gradeKey(v: unknown): GradeKey | null {
  return typeof v === "string" && (GRADE_KEYS as readonly string[]).includes(v) ? (v as GradeKey) : null;
}

function categoryKey(v: unknown): CategoryKey | null {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v) ? (v as CategoryKey) : null;
}

function kindOf(v: unknown): CategoryKind | null {
  return v === "tcg" || v === "sports" ? v : null;
}

/** Reports an unknown grade key at most once per load call. */
function unknownGradeReporter(): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    reportPopError("population", "unknown_grade");
  };
}

function counts(v: unknown, onUnknown: () => void): Partial<Record<GradeKey, number>> {
  const out: Partial<Record<GradeKey, number>> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v)) {
      const key = gradeKey(k);
      if (!key) onUnknown();
      else if (typeof n === "number") out[key] = n;
    }
  }
  return out;
}

function population(r: Row, onUnknown: () => void): Population {
  return {
    gradeCounts: counts(r.grade_counts, onUnknown),
    authenticCount: reqNum(r.authentic_count),
    total: reqNum(r.total),
    autographCounts: counts(r.autograph_counts, onUnknown),
    autographTotal: reqNum(r.autograph_total),
  };
}

async function call(fn: string, args?: Record<string, unknown>): Promise<Row[]> {
  // Loosely typed on purpose: see the note on `Row`.
  const client = createPublicClient() as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;
  };
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`Pop RPC ${fn} failed${error.code ? ` (${error.code})` : ""}`);
  return Array.isArray(data) ? (data as Row[]) : [];
}

async function loadGradesUncached(): Promise<Grade[]> {
  const rows = await call("pop_grades");
  return rows.flatMap((r) => {
    const key = gradeKey(r.key);
    return key ? [{ key, value: Number(r.value) }] : [];
  });
}

async function loadCategoriesUncached(): Promise<PopCategory[]> {
  const rows = await call("pop_categories");
  let reported = false;
  return rows.flatMap((r) => {
    const key = categoryKey(r.key);
    const kind = kindOf(r.kind);
    if (!key && !reported) {
      reported = true;
      reportPopError("categories", "unknown_category");
    }
    return key && kind ? [{ key, kind, setCount: reqNum(r.set_count), total: reqNum(r.total) }] : [];
  });
}

async function loadCategorySetsUncached(category: string): Promise<PopSetSummary[]> {
  const rows = await call("pop_category_sets", { p_category: category });
  return rows.map((r) => ({
    id: reqStr(r.id),
    name: reqStr(r.name),
    code: str(r.code),
    language: str(r.language),
    releaseYear: num(r.release_year),
    series: str(r.series),
    cardCount: reqNum(r.card_count),
    total: reqNum(r.total),
  }));
}

async function loadSetUncached(id: string): Promise<PopSet | null> {
  const [r] = await call("pop_set", { p_set: id });
  const category = r && categoryKey(r.category);
  const kind = r && kindOf(r.kind);
  if (r && !category) reportPopError("set", "unknown_category");
  if (!r || !category || !kind) return null;
  return {
    id: reqStr(r.id),
    category,
    kind,
    name: reqStr(r.name),
    code: str(r.code),
    language: str(r.language),
    releaseYear: num(r.release_year),
    series: str(r.series),
    totalCards: num(r.total_cards),
  };
}

async function loadSetCardsUncached(id: string): Promise<PopSetCard[]> {
  const rows = await call("pop_set_cards", { p_set: id });
  const onUnknown = unknownGradeReporter();
  return rows.map((r) => ({
    ...population(r, onUnknown),
    id: reqStr(r.id),
    cardNumber: reqStr(r.card_number),
    name: reqStr(r.name),
    variant: str(r.variant),
  }));
}

async function loadCardUncached(id: string): Promise<PopCard | null> {
  const [r] = await call("pop_card", { p_card: id });
  const category = r && categoryKey(r.category);
  const kind = r && kindOf(r.kind);
  if (r && !category) reportPopError("card", "unknown_category");
  if (!r || !category || !kind) return null;
  return {
    ...population(r, unknownGradeReporter()),
    id: reqStr(r.id),
    setId: reqStr(r.set_id),
    setName: reqStr(r.set_name),
    setCode: str(r.set_code),
    category,
    kind,
    cardNumber: reqStr(r.card_number),
    name: reqStr(r.name),
    variant: str(r.variant),
    rarity: str(r.rarity),
    language: str(r.language),
    releaseYear: num(r.release_year),
    series: str(r.series),
  };
}

/** Follows merges to the live card id, or null when the card is unknown. */
async function resolveCardUncached(id: string): Promise<string | null> {
  const client = createPublicClient();
  const { data, error } = await client.rpc("pop_resolve_card", { p_card: id });
  if (error) throw new Error(`Pop RPC pop_resolve_card failed${error.code ? ` (${error.code})` : ""}`);
  return typeof data === "string" ? data : null;
}

async function loadCertificateUncached(certNumber: string): Promise<PopCertificate | null> {
  const [r] = await call("pop_certificate", { p_cert: certNumber });
  if (!r) return null;
  if (r.status === "withdrawn") return { status: "withdrawn", certNumber: reqStr(r.cert_number) };
  if (r.status !== "public") return null;
  // Printed on slabs: an unknown category must never turn a genuine certificate into a 404.
  const category = categoryKey(r.category);
  if (!category) reportPopError("certificate", "unknown_category");
  return {
    status: "public",
    certNumber: reqStr(r.cert_number),
    cardId: reqStr(r.card_id),
    cardName: reqStr(r.card_name),
    cardNumber: reqStr(r.card_number),
    variant: str(r.variant),
    setId: reqStr(r.set_id),
    setName: reqStr(r.set_name),
    category,
    releaseYear: num(r.release_year),
    language: str(r.language),
    service: str(r.service),
    cardGrade: gradeKey(r.card_grade),
    autographGrade: gradeKey(r.autograph_grade),
    cardAuthentication: str(r.card_authentication),
    autographAuthentication: str(r.autograph_authentication),
    publishedAt: reqStr(r.published_at),
    cardTotal: reqNum(r.card_total),
    gradedHigher: num(r.graded_higher),
  };
}

/** Never throws: the landing page must not break on a Pop Report outage. */
async function loadRecentCopiesUncached(limit: number): Promise<PopRecentCopy[]> {
  let rows: Row[];
  try {
    rows = await call("pop_recent_copies", { p_limit: limit });
  } catch {
    reportPopError("recentCopies", "rpc_failed");
    return [];
  }
  return rows.flatMap((r) => {
    const cardGrade = gradeKey(r.card_grade);
    const category = categoryKey(r.category);
    if (!category) reportPopError("recentCopies", "unknown_category");
    if (!cardGrade || !category) return [];
    return [
      {
        certNumber: reqStr(r.cert_number),
        cardId: reqStr(r.card_id),
        cardName: reqStr(r.card_name),
        cardNumber: reqStr(r.card_number),
        variant: str(r.variant),
        rarity: str(r.rarity),
        setName: reqStr(r.set_name),
        category,
        releaseYear: num(r.release_year),
        cardGrade,
        publishedAt: reqStr(r.published_at),
      },
    ];
  });
}

// Memoised per request: a page and its generateMetadata (and the components
// under them) share one RPC per argument instead of each issuing their own.
export const loadGrades = cache(loadGradesUncached);
export const loadCategories = cache(loadCategoriesUncached);
export const loadCategorySets = cache(loadCategorySetsUncached);
export const loadSet = cache(loadSetUncached);
export const loadSetCards = cache(loadSetCardsUncached);
export const loadCard = cache(loadCardUncached);
export const resolveCard = cache(resolveCardUncached);
export const loadCertificate = cache(loadCertificateUncached);
export const loadRecentCopies = cache(loadRecentCopiesUncached);
