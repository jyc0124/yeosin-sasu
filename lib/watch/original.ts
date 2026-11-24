// ③ 원본 확보: 발견한 URL의 파일을 실제로 내려받아 저장본과 SHA-256을 비교한다.
// 같으면 미리 추출해 둔 텍스트를 쓴다(PDF·HWP 실시간 추출은 하지 않음 — PLAN 범위 조정 규칙 2).
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import registry from "@/data/watch/registry.json";
import { sliceSection } from "./text";

type Original = (typeof registry.originals)[number];

export interface OriginalResult {
  id: string;
  title: string;
  url: string;
  download: { ok: boolean; bytes?: number; sha256?: string; ms: number; error?: string };
  hashMatch: boolean;
  changed: boolean; // 내려받은 파일이 저장본과 다름 → 분석 중단
  sections: { label: string; text: string }[];
  note: string;
}

export const getOriginal = (id: string): Original | undefined => registry.originals.find((o) => o.id === id);

const MAX_BYTES = 20 * 1024 * 1024;

async function download(url: string, host: string, timeoutMs: number) {
  const t0 = Date.now();
  try {
    if (!url.startsWith("https://")) return { ok: false, ms: 0, error: "https가 아닌 주소" };
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "loandesk-copilot/0.1" } });
    // 리다이렉트로 다른 호스트에 갔으면 받지 않는다
    if (new URL(res.url).hostname.replace(/^www\./, "") !== host) return { ok: false, ms: Date.now() - t0, error: "다른 호스트로 이동됨" };
    if (!res.ok) return { ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return { ok: false, ms: Date.now() - t0, error: "파일이 너무 큼" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return { ok: false, ms: Date.now() - t0, error: "파일이 너무 큼" };
    return { ok: true, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: (e as Error).name === "TimeoutError" ? "시간 초과" : (e as Error).message };
  }
}

export async function fetchOriginal(o: Original, url: string, opts: { timeoutMs?: number; skipDownload?: boolean } = {}): Promise<OriginalResult> {
  const dl = opts.skipDownload ? { ok: false, ms: 0, error: "재생 모드: 다운로드 생략" } : await download(url, o.match.host, opts.timeoutMs ?? 15_000);
  const hashMatch = dl.ok && dl.sha256 === o.sha256;
  const full = await fs.readFile(path.join(process.cwd(), o.text), "utf8");
  const sections = o.sections.flatMap((s) => {
    const text = sliceSection(full, s.start, s.end);
    return text ? [{ label: s.label, text: text.trim() }] : [];
  });
  const changed = dl.ok && !hashMatch;
  const note = hashMatch
    ? "발견한 URL의 파일이 저장된 원본과 같습니다(SHA-256 일치). 저장본에서 추출한 텍스트를 씁니다."
    : changed
      ? "발견한 파일이 저장본과 다릅니다. 문서가 정정됐을 수 있어 분석을 멈춥니다. 담당자가 새 원본을 받아 등록해야 합니다."
      : opts.skipDownload
        ? "재생 모드: 다운로드를 생략하고 저장본 텍스트를 씁니다(원본 일치는 이번 실행에서 확인하지 않음)."
        : `원본을 내려받지 못했습니다(${dl.error}). 저장본 텍스트로 분석하되 원본 일치가 확인되지 않아 승인할 수 없습니다.`;
  return { id: o.id, title: o.title, url, download: dl, hashMatch, changed, sections: changed ? [] : sections, note };
}
