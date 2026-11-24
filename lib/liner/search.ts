// Liner Search API (REST). 스파이크 결론: date_range는 노이즈가 커서 쓰지 않고 date로 사후 정렬.
import { LINER_BASE, linerKey, isReplayMode } from "./config";
import { postText } from "./http";
import { cached, cacheKey } from "./cache";
import { trustTier, type TrustTier } from "./trust";

export interface SearchResult {
  title: string;
  url: string;
  hostname: string;
  description?: string;
  date?: string | null;
  tier: TrustTier;
}

export interface SearchOptions {
  maxResults?: number;
  includeKnowledge?: boolean; // Premium Data 포함 시 단가 2배
  ttlMs?: number;
  kind?: "web" | "scholar";
  timeoutMs?: number; // 기본 30초
  retries?: number; // 기본 3
}

export async function linerSearch(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  const { maxResults = 10, includeKnowledge = false, ttlMs, kind = "web", timeoutMs = 30_000, retries } = opts;
  const body = { query, max_results: maxResults, include_knowledge: includeKnowledge };
  const key = cacheKey(`search-${kind}`, body);
  return cached(
    key,
    async () => {
      const text = await postText(`${LINER_BASE}/tools/search/${kind}`, body, {
        headers: { "x-api-key": linerKey() },
        timeoutMs,
        retries,
      });
      const json = JSON.parse(text) as { results?: Omit<SearchResult, "tier">[] };
      return (json.results ?? []).map((r) => ({ ...r, tier: trustTier(r.url) }));
    },
    { ttlMs, replayOnly: isReplayMode() },
  );
}

/** 신뢰 등급 필터 + 최신순 정렬 */
export function filterTrusted(results: SearchResult[], minTier: 1 | 2 | 3 = 2): SearchResult[] {
  return results
    .filter((r) => r.tier !== 0 && r.tier <= minTier)
    .sort((a, b) => a.tier - b.tier || (b.date ?? "").localeCompare(a.date ?? ""));
}
