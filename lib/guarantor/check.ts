// 보증기관 자료 개정 확인(정책 감시 ③): 공식 페이지를 직접 받아, 작성일·첨부 번호(업무지침) 또는 본문 구간의 해시를
// 기준값과 비교한다. Liner를 쓰지 않는다(비용 0). 바뀌었으면 '변경 감지 — 본점 검토 필요'로 알리고, 자동으로 고치지 않는다.
import { createHash } from "node:crypto";
import data from "@/data/guarantor/sources.json";
import baseline from "@/data/guarantor/baseline.json";

type Watch = { fetch: string; encoding: string; markers?: Record<string, string>; section?: [string, string] };
type Src = { id: string; title: string; agency: string; watch?: Watch; baseline?: Record<string, string> };

export interface CheckResult {
  id: string;
  title: string;
  agency: string;
  status: "same" | "changed" | "error" | "skipped";
  detail: string;
  observed?: Record<string, string>;
}

const text = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");

/** 페이지에서 비교할 값: 표시(작성일·첨부) 또는 본문 구간 해시 */
export function observe(html: string, w: Watch): Record<string, string> {
  const out: Record<string, string> = {};
  const t = text(html);
  for (const [k, re] of Object.entries(w.markers ?? {})) {
    const m = (k === "첨부" ? html : t).match(new RegExp(re));
    out[k] = m?.[1] ?? "(없음)";
  }
  if (w.section) {
    const a = t.indexOf(w.section[0]);
    const b = a >= 0 ? t.indexOf(w.section[1], a + w.section[0].length) : -1;
    const seg = a >= 0 && b > a ? t.slice(a, b) : "";
    out["본문"] = seg ? createHash("sha256").update(seg.replace(/\s+/g, "")).digest("hex").slice(0, 16) : "(구간 없음)";
  }
  return out;
}

export function compare(src: Src, obs: Record<string, string>, base: Record<string, string> | undefined): CheckResult {
  const head = { id: src.id, title: src.title, agency: src.agency, observed: obs };
  if (Object.values(obs).some((v) => v.startsWith("("))) return { ...head, status: "error", detail: "페이지 구조가 달라 비교할 구간을 찾지 못했습니다(개편 가능성). 직접 확인하세요." };
  if (!base) return { ...head, status: "error", detail: "기준값이 없습니다(npm run guarantor:check -- --baseline)." };
  const diff = Object.keys(obs).filter((k) => base[k] !== obs[k]);
  return diff.length
    ? { ...head, status: "changed", detail: `바뀜: ${diff.map((k) => `${k} ${base[k] ?? "-"} → ${obs[k]}`).join(", ")} — 본점 검토 후 발췌·기준일 갱신` }
    : { ...head, status: "same", detail: "기준값과 같음" };
}

export async function checkAll(opts: { timeoutMs?: number } = {}): Promise<CheckResult[]> {
  const srcs = data.sources as Src[];
  return Promise.all(
    srcs.map(async (src): Promise<CheckResult> => {
      if (!src.watch) return { id: src.id, title: src.title, agency: src.agency, status: "skipped", detail: "확인할 공식 문서 없음" };
      try {
        const res = await fetch(src.watch.fetch, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; loandesk-watch)" },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        });
        if (!res.ok) return { id: src.id, title: src.title, agency: src.agency, status: "error", detail: `HTTP ${res.status}` };
        const html = new TextDecoder(src.watch.encoding).decode(await res.arrayBuffer());
        const base = { ...(src.baseline ?? {}), ...((baseline as unknown as Record<string, Record<string, string>>)[src.id] ?? {}) };
        return compare(src, observe(html, src.watch), Object.keys(base).length ? base : undefined);
      } catch (e) {
        return { id: src.id, title: src.title, agency: src.agency, status: "error", detail: `받지 못함(${(e as Error).name})` };
      }
    }),
  );
}
