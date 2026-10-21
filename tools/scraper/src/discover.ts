import { z } from "zod";
import type { PoliteFetcher } from "./fetcher";

export const SITE_ORIGIN = "https://www.godzillatcgdb.com";

const SearchResultSchema = z.looseObject({
  id: z.number().int(),
  parent_id: z.number().int().nullable(),
  set_number: z.string(),
  card_number: z.string(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

const SEARCH_CACHE_KEY = "search.json";

/**
 * Lists every base (non-variant) card by replaying the site's own search request with empty
 * filters. The card search page POSTs its form back to `/search` and receives JSON. Variants are
 * not in this list; they are read from each base card page's `allPrints` data.
 */
export async function discoverBaseCards(
  fetcher: PoliteFetcher,
): Promise<SearchResult[]> {
  let body = await fetcher.readCache(SEARCH_CACHE_KEY);
  if (body === null) {
    const page = await fetcher.get(`${SITE_ORIGIN}/search`);
    const token = /"csrfToken":"([^"]+)"/.exec(page)?.[1];
    if (!token) throw new Error("Could not find the CSRF token on /search");
    const form = new URLSearchParams({
      _token: token,
      text: "",
      strength: "",
      strength_search_type: "equal",
      rank: "",
      rank_search_type: "equal",
    });
    body = await fetcher.postForm(`${SITE_ORIGIN}/search`, form, {
      "x-csrf-token": token,
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json",
    });
    await fetcher.writeCache(SEARCH_CACHE_KEY, body);
  }
  return z.array(SearchResultSchema).parse(JSON.parse(body));
}
