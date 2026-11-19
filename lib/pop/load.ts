import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

import { reportPopError } from "./errors";
import { GRADE_KEYS, type CategoryKey, type CategoryKind, type GradeKey } from "./keys";
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

function counts(v: unknown): Partial<Record<GradeKey, number>> {
  const out: Partial<Record<GradeKey, number>> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v)) {
      const key = gradeKey(k);
      if (key && typeof n === "number") out[key] = n;
    }
  }
  return out;
}

function population(r: Row): Population {
  return {
    gradeCounts: counts(r.grade_counts),
    authenticCount: reqNum(r.authentic_count),
    total: reqNum(r.total),
    autographCounts: counts(r.autograph_counts),
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

export async function loadGrades(): Promise<Grade[]> {
  const rows = await call("pop_grades");
  return rows.flatMap((r) => {
    const key = gradeKey(r.key);
    return key ? [{ key, value: Number(r.value) }] : [];
  });
}

export async function loadCategories(): Promise<PopCategory[]> {
  const rows = await call("pop_categories");
  return rows.map((r) => ({
    key: r.key as CategoryKey,
    kind: r.kind as CategoryKind,
    setCount: reqNum(r.set_count),
    total: reqNum(r.total),
  }));
}

export async function loadCategorySets(category: string): Promise<PopSetSummary[]> {
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

export async function loadSet(id: string): Promise<PopSet | null> {
  const [r] = await call("pop_set", { p_set: id });
  if (!r) return null;
  return {
    id: reqStr(r.id),
    category: r.category as CategoryKey,
    kind: r.kind as CategoryKind,
    name: reqStr(r.name),
    code: str(r.code),
    language: str(r.language),
    releaseYear: num(r.release_year),
    series: str(r.series),
    totalCards: num(r.total_cards),
  };
}

export async function loadSetCards(id: string): Promise<PopSetCard[]> {
  const rows = await call("pop_set_cards", { p_set: id });
  return rows.map((r) => ({
    ...population(r),
    id: reqStr(r.id),
    cardNumber: reqStr(r.card_number),
    name: reqStr(r.name),
    variant: str(r.variant),
  }));
}

export async function loadCard(id: string): Promise<PopCard | null> {
  const [r] = await call("pop_card", { p_card: id });
  if (!r) return null;
  return {
    ...population(r),
    id: reqStr(r.id),
    setId: reqStr(r.set_id),
    setName: reqStr(r.set_name),
    setCode: str(r.set_code),
    category: r.category as CategoryKey,
    kind: r.kind as CategoryKind,
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
export async function resolveCard(id: string): Promise<string | null> {
  const client = createPublicClient();
  const { data, error } = await client.rpc("pop_resolve_card", { p_card: id });
  if (error) throw new Error(`Pop RPC pop_resolve_card failed${error.code ? ` (${error.code})` : ""}`);
  return typeof data === "string" ? data : null;
}

export async function loadCertificate(certNumber: string): Promise<PopCertificate | null> {
  const [r] = await call("pop_certificate", { p_cert: certNumber });
  if (!r) return null;
  if (r.status === "withdrawn") return { status: "withdrawn", certNumber: reqStr(r.cert_number) };
  if (r.status !== "public") return null;
  return {
    status: "public",
    certNumber: reqStr(r.cert_number),
    cardId: reqStr(r.card_id),
    cardName: reqStr(r.card_name),
    cardNumber: reqStr(r.card_number),
    variant: str(r.variant),
    setId: reqStr(r.set_id),
    setName: reqStr(r.set_name),
    category: r.category as CategoryKey,
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
export async function loadRecentCopies(limit: number): Promise<PopRecentCopy[]> {
  let rows: Row[];
  try {
    rows = await call("pop_recent_copies", { p_limit: limit });
  } catch {
    reportPopError("recentCopies", "rpc_failed");
    return [];
  }
  return rows.flatMap((r) => {
    const cardGrade = gradeKey(r.card_grade);
    if (!cardGrade) return [];
    return [
      {
        certNumber: reqStr(r.cert_number),
        cardId: reqStr(r.card_id),
        cardName: reqStr(r.card_name),
        cardNumber: reqStr(r.card_number),
        variant: str(r.variant),
        rarity: str(r.rarity),
        setName: reqStr(r.set_name),
        category: r.category as CategoryKey,
        releaseYear: num(r.release_year),
        cardGrade,
        publishedAt: reqStr(r.published_at),
      },
    ];
  });
}
