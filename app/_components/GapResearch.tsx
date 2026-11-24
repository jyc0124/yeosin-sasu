"use client";
// 해석 쟁점(정부 발표 자료에 없는 부분, G-ID)을 Liner Search API로 다시 조사한다. 본점 화면(정책 감시·질의 처리) 공용.
// 지점은 직접 조사하지 않는다(해석은 본점 역할). 지점 판정 카드는 원문 대조를 마친 조사 기록만 창구 문장으로 보여 준다.
// - 결과는 공식 출처 문서 목록뿐이다. Search Agent 답변 문장은 쓰지 않는다(CLAUDE.md 원칙 3).
// - 조사 결과는 판정을 바꾸지 않는다. 새 문서 후보는 본점이 정책 감시에서 원문 대조 후 근거 자료에 반영한다.
// - 조사 결과는 이 브라우저에 남겨 정책 감시·질의 처리 화면에서 이어 본다(데모: hqStore와 같은 저장 방식).
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { ResearchResult } from "@/lib/research/live";
import Link from "next/link";
import { allGaps } from "@/lib/kb";
import { buildLedger, STATUS_LABEL, TAB_OF, type IssueStatus, type IssueTab } from "@/lib/hq/ledger";
import { useHq } from "./hqStore";
import { lastResearch } from "@/lib/research/history";
import { useKb } from "./kbStore";
import { useJudge } from "./viewStore";

const KEY = "loandesk:gap-research";

export interface SavedResearch {
  at: string; // ISO
  by: "본점";
  result: ResearchResult;
}

function readAll(): Record<string, SavedResearch> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, SavedResearch>;
  } catch {
    return {};
  }
}

export function savedResearch(gapId: string): SavedResearch | undefined {
  return readAll()[gapId];
}

function save(results: ResearchResult[], by: SavedResearch["by"]) {
  try {
    const all = readAll();
    const at = new Date().toISOString();
    for (const r of results) all[r.gapId] = { at, by, result: r };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export async function runResearch(gapIds: string[], kb: "v1" | "v2", by: SavedResearch["by"]): Promise<ResearchResult[]> {
  const res = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gapIds, kb }) });
  const json = (await res.json().catch(() => ({}))) as { results?: ResearchResult[]; error?: string };
  if (!res.ok || !json.results) throw new Error(json.error ?? "조사에 실패했습니다.");
  save(json.results, by);
  return json.results;
}

export const fmtAt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 조사 결과: 새 문서 후보 여부 한 줄 + 쟁점별 공식 문서 목록 */
export function ResearchDocs({ results, compact = false }: { results: ResearchResult[]; compact?: boolean }) {
  const newDocs = results.flatMap((r) => r.docs.filter((d) => d.kind === "new"));
  return (
    <div className="space-y-3">
      <p className={`text-[14px] font-semibold ${newDocs.length ? "text-amber-800" : "text-teal-800"}`}>
        {newDocs.length
          ? `새 공식 문서 후보 ${newDocs.length}건을 찾았습니다.`
          : "8.13 이후 새로 나온 공식 문서는 찾지 못했습니다."}
      </p>
      {results.map((r) => (
        <div key={r.gapId} className="text-[13px]">
          <p className="text-zinc-500">
            <span className="font-mono">{r.gapId}</span> · 출처 {r.sources}건 중 공식 {r.official}건 · {(r.ms / 1000).toFixed(1)}초{r.error ? ` · 일부 검색 실패(${r.error})` : ""}
          </p>
          <ul className="mt-1 space-y-1">
            {r.docs.slice(0, compact ? 4 : 6).map((d) => (
              <li key={d.url} className="flex gap-1.5">
                <span className={`h-fit shrink-0 rounded px-1.5 text-[11px] font-semibold ${d.kind === "new" ? "bg-amber-100 text-amber-800" : d.kind === "known" ? "bg-teal-100 text-teal-800" : "bg-zinc-100 text-zinc-500"}`}>
                  {d.kind === "new" ? "새 문서 후보" : d.kind === "known" ? "근거 자료에 있음" : "공식"}
                </span>
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-zinc-700 underline decoration-zinc-300 hover:text-zinc-900" title={d.title}>
                  {d.knownAs ?? d.title}
                </a>
                {d.date && <span className="shrink-0 text-zinc-400">{d.date}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 본점 정책 감시 ②: 쟁점 대장. 질의·FAQ·조사 결과에서 쟁점 상태를 계산해 진행 중 / 본점 해석 운영 / 해소됨으로 나눈다. */
const ORDER: IssueStatus[] = ["review", "candidate", "waiting", "researched", "open", "hq", "resolved"];
const TABS: { id: IssueTab; label: string; desc: string }[] = [
  { id: "active", label: "진행 중", desc: "본점이 처리할 쟁점입니다. 위에서부터 급한 순서입니다." },
  { id: "hq", label: "본점 해석으로 운영 중", desc: "정부 기준은 아직 없고, 본점이 승인한 해석(사례 FAQ)으로 지점이 안내하는 쟁점입니다. 정부 문서가 나오면 해소되고, 근거 자료가 바뀌면 재확인으로 돌아옵니다." },
  { id: "resolved", label: "해소됨", desc: "정부 후속 문서가 근거 자료에 반영되어 판정 기준이 생긴 쟁점입니다." },
];

export function GapResearchBoard() {
  const judge = useJudge();
  const [kb] = useKb();
  const hq = useHq();
  const [tab, setTab] = useState<IssueTab>("active");
  const [live, setLive] = useState<Record<string, SavedResearch>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const init: Record<string, SavedResearch> = {};
    for (const g of allGaps()) {
      const x = savedResearch(g.id);
      if (x) init[g.id] = x;
    }
    setLive(init);
  }, []);

  const ledger = buildLedger({
    gaps: allGaps(),
    inquiries: hq.inquiries,
    faqs: hq.faqs,
    kb,
    history: (id) => lastResearch(id),
    live: (id) => {
      const x = live[id];
      return x && { at: x.at, official: x.result.official, newDocs: x.result.docs.filter((d) => d.kind === "new").length };
    },
  }).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.origin === b.origin ? 0 : a.origin === "inquiry" ? -1 : 1));
  const count = (t: IssueTab) => ledger.filter((i) => TAB_OF[i.status] === t).length;
  const list = ledger.filter((i) => TAB_OF[i.status] === tab);
  const newCount = ledger.filter((i) => i.origin === "inquiry").length;

  const run = async (key: string, gapId: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const [result] = await runResearch([gapId], kb, "본점");
      setLive((l) => ({ ...l, [gapId]: { at: new Date().toISOString(), by: "본점", result } }));
      setShown((s) => ({ ...s, [key]: true }));
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  return (
    <section id="gap-research" className="mt-10 scroll-mt-6">
      <h2 className="flex items-center gap-1.5 text-[18px] font-semibold text-zinc-900">
        <Icon name="spark" className="h-4 w-4 text-teal-700" />② 해석 쟁점 대장
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
        정부 발표 자료에 기준이 없어 판정이 &lsquo;본점 문의&rsquo;로 가는 쟁점을 생길 때부터 닫힐 때까지 관리합니다.{judge && " 쟁점 상태가 바뀌어도 판정은 바뀌지 않습니다."}
      </p>
      {/* 쟁점이 어디서 오고 어떻게 닫히는지 */}
      <ol className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
        <li className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
          <b className="text-zinc-800">1. 쟁점이 생기면</b>
          {judge && <p className="mt-0.5 leading-relaxed text-zinc-600">개발하며 정리한 쟁점에 더해, 지점이 &lsquo;규칙에 없는 사실&rsquo;(분양권·입주권 등)로 질의하면 그 사실마다 <b>새 쟁점이 자동으로 열립니다</b>. 질의는 해당 쟁점에 자동으로 붙습니다.</p>}
        </li>
        <li className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
          <b className="text-zinc-800">2. 본점이 처리하면</b>
          {judge && <p className="mt-0.5 leading-relaxed text-zinc-600">Liner로 공식 자료를 조사합니다. 없으면 질의에 본점 해석으로 회신하고, 승인하면 <b>&lsquo;본점 해석으로 운영 중&rsquo;</b>으로 옮겨 사례 FAQ로 다른 지점에도 보입니다.</p>}
        </li>
        <li className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
          <b className="text-zinc-800">3. 정부 기준이 나오면</b>
          {judge && <p className="mt-0.5 leading-relaxed text-zinc-600">① 후속 문서 감시로 원문 대조·승인하면 <b>&lsquo;해소됨&rsquo;</b>으로 옮겨집니다. 그 쟁점의 FAQ는 바뀐 근거로 다시 확인하라고 표시됩니다.</p>}
        </li>
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[15px] font-semibold ${tab === t.id ? "border-teal-700 text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {t.label} <span className="ml-0.5 rounded-full bg-zinc-100 px-1.5 text-[12px] text-zinc-600">{count(t.id)}</span>
          </button>
        ))}
        {newCount > 0 && <span className="ml-auto pb-2 text-[13px] text-zinc-500">지점 질의로 새로 열린 쟁점 {newCount}개</span>}
      </div>
      <p className="mt-2 text-[13px] text-zinc-500">{TABS.find((t) => t.id === tab)!.desc}</p>

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-[14px] text-zinc-500">이 단계의 쟁점이 없습니다.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          {list.map((i) => {
            const st = STATUS_LABEL[i.status];
            const saved = live[i.gapId];
            return (
              <li key={i.id} className={`min-w-0 rounded-xl border bg-white p-4 ${i.status === "resolved" ? "border-zinc-200" : "border-teal-200"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[13px] font-semibold text-zinc-500">{i.id}</span>
                  {i.origin === "inquiry" && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">지점 질의로 새로 열림</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${st.tone}`}>{st.label}</span>
                </div>
                <p className="mt-1.5 break-keep text-[14px] font-medium text-zinc-900">{i.topic}</p>
                <p className="mt-1 text-[13px] text-zinc-600">
                  <span className="text-zinc-400">다음 할 일</span> {st.next}
                </p>
                <dl className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-[12px] text-zinc-600">
                  {i.inquiries.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-zinc-400">지점 질의</dt>
                      <dd className="min-w-0">
                        <Link href="/hq" className="text-indigo-700 hover:underline">
                          {i.inquiries.length}건
                        </Link>{" "}
                        · 회신 대기 {i.inquiries.filter((q) => q.status !== "answered").length}건
                        {i.firstSeen && <> · 처음 {fmtAt(i.firstSeen)}</>}
                        <span className="block truncate text-zinc-500" title={i.inquiries[0].question}>
                          &ldquo;{i.inquiries[0].question}&rdquo;
                        </span>
                      </dd>
                    </div>
                  )}
                  {i.faqs.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-zinc-400">본점 해석</dt>
                      <dd className="min-w-0">
                        {i.faqs.map((f) => (
                          <span key={f.id} className="block truncate" title={f.conclusion}>
                            <span className="font-mono">{f.id}</span> {f.needsReview && <b className="text-rose-700">재확인 필요 </b>}
                            {f.conclusion}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-zinc-400">Liner 조사</dt>
                    <dd className="min-w-0">
                      {i.research
                        ? `${i.research.verified ? "원문 대조 완료" : "최근 조사"} ${fmtDate(i.research.at)} · 공식 출처 ${i.research.official}건${i.research.newDocs ? ` · 새 문서 후보 ${i.research.newDocs}건` : " · 공식 기준 없음"}`
                        : "아직 없음"}
                    </dd>
                  </div>
                </dl>
                {i.status !== "resolved" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(i.id, i.gapId)}
                      disabled={busy[i.id]}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      <Icon name="radar" className="h-3.5 w-3.5" />
                      {busy[i.id] ? "조사 중…" : i.research ? "Liner로 다시 조사" : "Liner로 조사"}
                    </button>
                    {saved && (
                      <button type="button" onClick={() => setShown((s) => ({ ...s, [i.id]: !s[i.id] }))} className="text-[12px] text-zinc-500 hover:text-zinc-800">
                        {shown[i.id] ? "출처 목록 접기" : "출처 목록 보기"}
                      </button>
                    )}
                  </div>
                )}
                {errors[i.id] && <p className="mt-2 text-[13px] text-rose-700">{errors[i.id]}</p>}
                {saved && shown[i.id] && (
                  <div className="mt-3 border-t border-teal-100 pt-3">
                    <ResearchDocs results={[saved.result]} compact />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const fmtDate = (s: string) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
