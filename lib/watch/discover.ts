// ① 발견 ② 선별: 감시 질의를 Liner Search API·MCP search_legal로 돌리고, 출처 신뢰도·날짜·기존 문서 여부로 분류한다.
import registry from "@/data/watch/registry.json";
import { linerDomainSearch, linerSearch, type TrustTier } from "@/lib/liner";

export type DocStatus = "new" | "known" | "old" | "undated";

export interface FoundDoc {
  url: string;
  title: string;
  hostname: string;
  tier: TrustTier;
  date?: string; // 등록 원문 날짜 > URL의 filePath=/YYYY/MM/DD > 검색 결과 date
  status: DocStatus;
  knownAs?: string;
  originalId?: string; // registry.originals와 일치
  foundBy: string[]; // "Search API: 질의" / "MCP search_legal: 질의"
}

export interface QueryRun {
  tool: "rest" | "search_legal";
  q: string;
  total: number;
  trusted: number;
  ms: number;
  error?: string;
}

type Original = (typeof registry.originals)[number];

const decode = (url: string) => {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
};

/** URL 경로의 날짜(예: better.fsc.go.kr ... filePath=/2026/08/28) */
export function dateFromUrl(url: string): string | undefined {
  const m = decode(url).match(/filePath=\/(\d{4})\/(\d{2})\/(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

/** 등록 원문과 일치: 정확한 호스트 + 디코딩한 URL에 모든 표지(날짜 경로·파일명)가 있어야 한다 */
export function matchOriginal(url: string): Original | undefined {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
  const u = decode(url);
  return registry.originals.find((o) => host === o.match.host && o.match.contains.every((c) => u.includes(c)));
}

/** 부분 문자열이되 뒤에 숫자가 이어지면 다른 문서(예: upperNo=87517 ≠ upperNo=875170) */
const hasToken = (url: string, token: string) => {
  const i = url.indexOf(token);
  return i >= 0 && !/\d/.test(url.charAt(i + token.length));
};

/**
 * 새 문서 = 지금 창구에 적용 중인 근거 자료(kb)에 아직 없는 문서.
 * v1: 8.13 이후 문서가 새 문서. v2: 그중 v2에 이미 반영한 문서(8.28 행정지도·10.20 재지정)는 '반영됨'(known).
 */
export function classify(url: string, date: string | undefined, kb: "v1" | "v2" = "v1", title = ""): Pick<FoundDoc, "status" | "knownAs" | "originalId"> {
  const known = registry.known.find((k) => k.match.some((m) => hasToken(url, m)));
  if (known) return { status: "known", knownAs: known.label };
  const orig = matchOriginal(url);
  const d = orig?.date ?? date;
  if (kb === "v2") {
    const r = registry.reflectedV2.find(
      (x) =>
        ("originalId" in x && x.originalId === orig?.id) ||
        ("match" in x && x.match?.some((m) => url.includes(m))) ||
        ("titleAll" in x && x.titleAll?.every((w) => title.includes(w)) && !!d && d >= (x.from ?? "")),
    );
    if (r) return { status: "known", knownAs: r.label, originalId: orig?.id };
  }
  if (!d) return { status: "undated", originalId: orig?.id };
  return { status: d > registry.kbV1Cutoff ? "new" : "old", originalId: orig?.id };
}

/** 같은 문서가 페이지 번호만 달리 잡히는 것 합치기 */
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    // 파일 다운로드 URL은 쿼리가 곧 문서 식별자
    if (/displayFile|getFile|download\.do|docViewer/.test(u.pathname)) {
      const keep = ["filePath", "orgFileName", "upperNo", "fileNo", "fileId"].map((k) => `${k}=${u.searchParams.get(k) ?? ""}`);
      return `${u.hostname}${u.pathname}?${keep.join("&")}`;
    }
    return `${u.hostname.replace(/^(www|m)\./, "")}${u.pathname}`;
  } catch {
    return url;
  }
}

/** 시간 제한: 넘기면 오류로 처리하고 다음 단계로 간다(라우트 전체 60초 제한 대비) */
export function withDeadline<T>(p: Promise<T>, ms: number, label = "시간 초과"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function discover(opts: { ttlMs?: number; deadlineMs?: number; kb?: "v1" | "v2" } = {}): Promise<{ runs: QueryRun[]; docs: FoundDoc[] }> {
  const kb = opts.kb ?? "v1";
  const ttlMs = opts.ttlMs ?? 10 * 60_000;
  const deadlineMs = opts.deadlineMs ?? 25_000;
  const byKey = new Map<string, FoundDoc>();

  const add = (r: { url: string; title: string; hostname: string; tier: TrustTier; date?: string | null }, by: string) => {
    if (r.tier === 0 || r.tier === 3) return; // SNS 제외, 기타 웹은 감시 대상 아님
    const key = dedupeKey(r.url);
    const date = dateFromUrl(r.url) ?? (r.date || undefined);
    const prev = byKey.get(key);
    if (prev) {
      if (!prev.foundBy.includes(by)) prev.foundBy.push(by);
      // 날짜를 아는 쪽을 남긴다(병렬 완료 순서에 따라 결과가 흔들리지 않게)
      if (!prev.date && date) Object.assign(prev, { date, ...classify(prev.url, date, kb, prev.title) });
      return;
    }
    byKey.set(key, { url: r.url, title: r.title, hostname: r.hostname, tier: r.tier, date, foundBy: [by], ...classify(r.url, date, kb, r.title) });
  };

  const plan = registry.queries.flatMap((qq) => qq.tools.map((tool) => ({ tool: tool as QueryRun["tool"], q: qq.q })));
  // REST는 병렬, MCP는 lib/liner/mcp의 직렬 큐를 탄다. 질의마다 시간 제한을 둔다.
  const runs = await Promise.all(
    plan.map(async ({ tool, q }): Promise<QueryRun> => {
      const t0 = Date.now();
      const run: QueryRun = { tool, q, total: 0, trusted: 0, ms: 0 };
      try {
        const res = await withDeadline(
          tool === "rest"
            ? linerSearch(q, { maxResults: 10, ttlMs, timeoutMs: 15_000, retries: 1 })
            : linerDomainSearch("search_legal", q, 10, ttlMs, { timeoutMs: 15_000, retries: 0 }),
          deadlineMs,
        );
        run.total = res.length;
        run.trusted = res.filter((r) => r.tier === 1 || r.tier === 2).length;
        for (const r of res) add(r, `${tool === "rest" ? "Search API" : "MCP search_legal"}: ${q}`);
      } catch (e) {
        run.error = (e as Error).message;
      }
      run.ms = Date.now() - t0;
      return run;
    }),
  ); // 결과 순서 = registry 순서

  const order: Record<DocStatus, number> = { new: 0, undated: 1, known: 2, old: 3 };
  const docs = [...byKey.values()].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      Number(!!b.originalId) - Number(!!a.originalId) ||
      a.tier - b.tier ||
      (b.date ?? "").localeCompare(a.date ?? ""),
  );
  return { runs, docs };
}
