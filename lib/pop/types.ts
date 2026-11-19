import type { CategoryKey, CategoryKind, GradeKey } from "./keys";

export type Grade = { key: GradeKey; value: number };

export type Population = {
  gradeCounts: Partial<Record<GradeKey, number>>;
  authenticCount: number;
  total: number;
  autographCounts: Partial<Record<GradeKey, number>>;
  autographTotal: number;
};

export type PopCategory = { key: CategoryKey; kind: CategoryKind; setCount: number; total: number };

export type PopSetSummary = {
  id: string;
  name: string;
  code: string | null;
  language: string | null;
  releaseYear: number | null;
  series: string | null;
  cardCount: number;
  total: number;
};

export type PopSet = {
  id: string;
  category: CategoryKey;
  kind: CategoryKind;
  name: string;
  code: string | null;
  language: string | null;
  releaseYear: number | null;
  series: string | null;
  totalCards: number | null;
};

export type PopSetCard = Population & {
  id: string;
  cardNumber: string;
  name: string;
  variant: string | null;
};

export type PopCard = Population & {
  id: string;
  setId: string;
  setName: string;
  setCode: string | null;
  category: CategoryKey;
  kind: CategoryKind;
  cardNumber: string;
  name: string;
  variant: string | null;
  rarity: string | null;
  language: string | null;
  releaseYear: number | null;
  series: string | null;
};

export type PopCertificate =
  | { status: "withdrawn"; certNumber: string }
  | {
      status: "public";
      certNumber: string;
      cardId: string;
      cardName: string;
      cardNumber: string;
      variant: string | null;
      setId: string;
      setName: string;
      category: CategoryKey;
      releaseYear: number | null;
      language: string | null;
      service: string | null;
      cardGrade: GradeKey | null;
      autographGrade: GradeKey | null;
      cardAuthentication: string | null;
      autographAuthentication: string | null;
      publishedAt: string;
      cardTotal: number;
      gradedHigher: number | null;
    };

export type PopRecentCopy = {
  certNumber: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  variant: string | null;
  rarity: string | null;
  setName: string;
  category: CategoryKey;
  releaseYear: number | null;
  cardGrade: GradeKey;
  publishedAt: string;
};
