import "server-only";
import type { PopSearch } from "@/lib/pop/search-params";
import { POP_PAGE_SIZE, toMeiliFilter } from "@/lib/pop/search-params";
import { searchClient } from "./client";
import type { PopCardDocument } from "./documents";
import { reportSearchError } from "./errors";
import { POP_INDEX } from "./settings";

export type PopSearchResult =
  | { status: "ok"; hits: PopCardDocument[]; total: number; page: number; pages: number }
  | { status: "unavailable" };

export async function searchPopCards(s: PopSearch): Promise<PopSearchResult> {
  const client = searchClient();
  if (!client) return { status: "unavailable" };
  try {
    const res = await client.index<PopCardDocument>(POP_INDEX).search(s.q, {
      filter: toMeiliFilter(s),
      sort: s.q ? undefined : ["total:desc"],
      hitsPerPage: POP_PAGE_SIZE,
      page: s.page,
    });
    return {
      status: "ok",
      hits: res.hits as PopCardDocument[],
      total: res.totalHits,
      page: res.page,
      pages: res.totalPages,
    };
  } catch {
    reportSearchError("query", "search_failed");
    return { status: "unavailable" };
  }
}
