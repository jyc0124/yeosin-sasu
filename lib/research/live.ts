// 해석 쟁점 실시간 사전 조사(서버 전용): 쟁점의 검색 질의를 Liner Search API로 돌려 공식 출처를 모으고,
// 정책 감시와 같은 기준(lib/watch/discover classify)으로 '근거 자료에 이미 있는 문서'와 '새 공식 문서 후보'로 나눈다.
// Search Agent는 쓰지 않는다: 답변 문장은 비결정적이라 원문 대조 전에는 화면에 낼 수 없다(CLAUDE.md 원칙 3).
// 이 단계는 결론을 내리지 않는다. 새 공식 문서 후보가 있으면 원문 대조(정책 감시)로, 없으면 외부기관 문의로 넘긴다.
import { linerSearch } from "@/lib/liner";
import { classify, dateFromUrl, withDeadline } from "@/lib/watch/discover";
import { researchQueries } from "./history";

export interface ResearchDoc {
  url: string;
  title: string;
  hostname: string;
  date?: string;
  /** new = 8.13 이후 새 공식 문서 후보, known = 근거 자료에 이미 있는 문서, other = 그 밖의 공식 출처 */
  kind: "new" | "known" | "other";
  knownAs?: string;
}
export interface ResearchResult {
  gapId: string;
  queries: string[];
  sources: number; // 검색 결과 전체(중복 제거)
  official: number; // 공식 출처 수
  docs: ResearchDoc[]; // 공식 출처만, new → known → other 순
  ms: number;
  error?: string;
}

const key = (url: string) => {
  try {
    const u = new URL(url);
    return /getFile|displayFile|download/.test(u.pathname) ? `${u.hostname}${u.pathname}${u.search}` : `${u.hostname.replace(/^(www|m)\./, "")}${u.pathname}`;
  } catch {
    return url;
  }
};

export async function researchGap(gapId: string, topic: string, opts: { kb: "v1" | "v2"; ttlMs?: number }): Promise<ResearchResult> {
  const t0 = Date.now();
  const queries = researchQueries(gapId, topic);
  const all = new Map<string, true>();
  const official = new Map<string, ResearchDoc>();
  let error: string | undefined;
  await Promise.all(
    queries.map(async (q) => {
      try {
        const rs = await withDeadline(linerSearch(q, { maxResults: 10, ttlMs: opts.ttlMs, timeoutMs: 15_000, retries: 1 }), 20_000);
        for (const r of rs) {
          const k = key(r.url);
          all.set(k, true);
          if (r.tier !== 1 || official.has(k)) continue;
          const date = dateFromUrl(r.url) ?? (r.date || undefined);
          const c = classify(r.url, date);
          // 등록 원문(8.28 행정지도 등)은 근거 자료 v2에 이미 반영된 문서다
          const kind: ResearchDoc["kind"] = c.status === "known" || (c.originalId && opts.kb === "v2") ? "known" : c.status === "new" ? "new" : "other";
          official.set(k, { url: r.url, title: r.title, hostname: r.hostname, date, kind, knownAs: c.knownAs ?? (c.originalId ? "8.28 행정지도(근거 자료 v2)" : undefined) });
        }
      } catch (e) {
        error = (e as Error).message;
      }
    }),
  );
  const order = { new: 0, known: 1, other: 2 };
  const docs = [...official.values()].sort((a, b) => order[a.kind] - order[b.kind] || (b.date ?? "").localeCompare(a.date ?? ""));
  return { gapId, queries, sources: all.size, official: docs.length, docs, ms: Date.now() - t0, error };
}
