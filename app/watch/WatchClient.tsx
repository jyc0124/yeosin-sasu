"use client";
// 정책 감시 화면: 감시 실행 → 발견 문서 → 원본 확보 → 조항 구조화·원본 대조 → 영향 문항 → 승인(KB v2 적용)
import Link from "next/link";
import { useState } from "react";
import type { FoundDoc, QueryRun } from "@/lib/watch/discover";
import type { ImpactRow } from "@/lib/watch/impact";
import type { CheckedClause } from "@/lib/watch/structure";
import { Icon } from "../_components/Icon";
import { Badge } from "../_components/VerdictCard";
import { useKb } from "../_components/kbStore";
import { useJudge } from "../_components/viewStore";
import type { VerdictCode } from "@/lib/rules/types";

type Ev =
  | { type: "discovered"; runs: QueryRun[]; docs: FoundDoc[]; unregistered: number }
  | {
      type: "original";
      title: string;
      url: string;
      download: { ok: boolean; bytes?: number; ms: number; error?: string };
      hashMatch: boolean;
      changed: boolean;
      sections: { label: string; length: number }[];
      note: string;
    }
  | { type: "clauses"; clauses: CheckedClause[]; rejectedCount: number; ms: number; models: string[] }
  | { type: "impact"; total: number; changed: ImpactRow[] }
  | { type: "done"; ms: number; approvable: boolean; approvalNote?: string }
  | { type: "none"; message: string }
  | { type: "error"; stage: string; message: string };

type State = {
  discovered?: Extract<Ev, { type: "discovered" }>;
  original?: Extract<Ev, { type: "original" }>;
  clauses?: Extract<Ev, { type: "clauses" }>;
  impact?: Extract<Ev, { type: "impact" }>;
  done?: Extract<Ev, { type: "done" }>;
  message?: string;
  error?: string;
};

const STATUS_LABEL: Record<FoundDoc["status"], string> = { new: "새 문서", undated: "날짜 미상", known: "근거 자료에 반영됨", old: "이전 문서" };
const STATUS_STYLE: Record<FoundDoc["status"], string> = {
  new: "bg-indigo-600 text-white",
  undated: "bg-slate-200 text-slate-700",
  known: "bg-green-100 text-green-800",
  old: "bg-slate-100 text-slate-500",
};
const DIFF_LABEL: Record<CheckedClause["diff"], string> = { new: "새 Fact", same: "기존과 같음", review: "검토 필요", rejected: "원본 불일치" };

function Panel({ title, sub, children, open: initial = true }: { title: string; sub?: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-5 py-4 text-left">
        <span className="text-[16px] font-semibold text-zinc-900">{title}</span>
        {sub && <span className="text-[14px] text-zinc-500">{sub}</span>}
        <Icon name="chevron" className={`ml-auto h-4 w-4 text-zinc-400 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="border-t border-zinc-100 px-5 py-4">{children}</div>}
    </section>
  );
}

export function WatchClient() {
  const [kb, setKb] = useKb();
  const judge = useJudge();
  const [state, setState] = useState<State>({});
  const [running, setRunning] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [approved, setApproved] = useState(false);

  async function run() {
    setRunning(true);
    setApproved(false);
    setState({});
    let ended = false;
    try {
      const res = await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fresh, kb }) });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `서버 오류 (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Ev;
          setState((s) => {
            switch (ev.type) {
              case "discovered":
                return { ...s, discovered: ev };
              case "original":
                return { ...s, original: ev };
              case "clauses":
                return { ...s, clauses: ev };
              case "impact":
                return { ...s, impact: ev };
              case "done":
                return { ...s, done: ev };
              case "none":
                return { ...s, message: ev.message };
              case "error":
                return { ...s, error: ev.message };
            }
          });
          if (ev.type === "done" || ev.type === "none" || ev.type === "error") ended = true;
        }
        if (done) break;
      }
      if (!ended) throw new Error("응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message }));
    } finally {
      setRunning(false);
    }
  }

  const { discovered, original, clauses, impact } = state;
  const newDocs = discovered?.docs.filter((d) => d.status === "new") ?? [];
  const shownDocs = showAll ? (discovered?.docs ?? []) : (discovered?.docs.filter((d) => d.status === "new" || d.status === "known") ?? []);
  const newClauses = clauses?.clauses.filter((c) => c.diff === "new") ?? [];
  const otherClauses = clauses?.clauses.filter((c) => c.diff !== "new") ?? [];
  const transitional = newClauses.filter((c) => c.topic === "경과조치").length;

  const steps: { label: string; meta?: string; state: "done" | "now" | "todo" }[] = [
    { label: "Liner로 후속 문서 검색", meta: discovered ? `질의 ${discovered.runs.length}회` : undefined, state: discovered ? "done" : running ? "now" : "todo" },
    { label: "출처 신뢰도 · 새 문서 판별", meta: discovered ? `새 문서 ${newDocs.length}건` : undefined, state: discovered ? "done" : "todo" },
    { label: "원본 내려받기 · 해시 대조", meta: original ? (original.hashMatch ? "일치" : "미확인") : undefined, state: original ? "done" : discovered && running ? "now" : "todo" },
    { label: "조항 추출 · 인용문 원본 대조", meta: clauses ? `통과 ${clauses.clauses.length}/${clauses.clauses.length + clauses.rejectedCount}` : undefined, state: clauses ? "done" : original && running ? "now" : "todo" },
    { label: "결론이 바뀌는 판정 찾기", meta: impact ? `${impact.changed.length}개 유형` : undefined, state: impact ? "done" : clauses && running ? "now" : "todo" },
    { label: "담당자 승인 → 근거 자료 v2 적용", meta: approved ? "적용됨" : kb === "v2" ? "현재 v2" : undefined, state: approved ? "done" : impact && state.done && kb === "v1" ? "now" : "todo" },
  ];
  const doneCount = steps.filter((x) => x.state === "done").length;
  const rerunHref = impact?.changed[0] ? `/?q=${encodeURIComponent(impact.changed.find((c) => c.id === "B02")?.question ?? impact.changed[0].question)}` : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {/* 현재 적용 중인 판정 지식 (배포 카드) */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-zinc-500">현재 창구에 적용 중인 판정 지식</p>
              <p className="mt-1 flex items-center gap-2 text-[22px] font-bold tracking-tight text-zinc-900">
                <span className={`h-2.5 w-2.5 rounded-full ${kb === "v2" ? "bg-green-500" : "bg-amber-500"}`} />
                근거 자료 {kb}
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${kb === "v2" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
                  {kb === "v2" ? "후속 문서 반영" : "정부 발표 자료만"}
                </span>
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {kb === "v2" && (
                <button
                  type="button"
                  onClick={() => {
                    setKb("v1");
                    setApproved(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-[14px] font-medium text-zinc-700 hover:border-zinc-300"
                  title="승인한 후속 문서 반영을 취소하고 이전 판정 기준(v1)으로 되돌립니다. 감시 실행·승인으로 다시 반영할 수 있습니다"
                >
                  ↺ v1으로 되돌리기
                </button>
              )}
              <button
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                <Icon name="radar" className="h-4 w-4" />
                {running ? "감시 중…" : "감시 실행"}
              </button>
            </div>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-zinc-400">정부 발표 자료 (v1부터) · 보도자료·FAQ</dt>
              <dd className="mt-0.5 text-zinc-800">
                <span className="block">4.1 가계부채 관리방안</span>
                <span className="block">8.13 금융 종합대책</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-zinc-400">후속 문서 (v2)</dt>
              <dd className={`mt-0.5 ${kb === "v2" ? "text-zinc-800" : "text-zinc-400 line-through"}`}>
                <span className="block">8.28 행정지도 (Liner로 발견)</span>
                <span className="block">10.20 인구감소지역 재지정</span>
              </dd>
            </div>
          </dl>
          <label className="mt-3 flex items-center gap-1.5 text-[13px] text-zinc-500" title="끄면 10분 안의 같은 검색 결과를 재사용합니다">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
            캐시 없이 Liner를 새로 호출
          </label>
        </section>

        {judge && kb === "v2" && !discovered && !running && (
          <p className="rounded-xl bg-indigo-50/70 px-4 py-3 text-[14px] leading-relaxed text-indigo-950 ring-1 ring-indigo-100">
            <span className="mr-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[12px] font-semibold text-white">데모용</span>
            8.28 행정지도를 찾기 전으로 돌려 보기: <b>v1으로 되돌리기</b> → 창구에서 &ldquo;만기 12/20&rdquo; 질문(본점 문의) → 여기서 <b>감시 실행</b>·승인 → 같은 질문(조건 충족 시 가능)
          </p>
        )}

        {state.error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-[14px] text-rose-800 ring-1 ring-rose-200">{state.error}</p>}
        {state.message &&
          (kb === "v2" && !state.error ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-[15px] font-semibold text-green-800">이번 감시 검색에서 새 판정 규정 문서를 찾지 못했습니다</p>
              <p className="mt-1 text-[14px] leading-relaxed text-green-900/80">{state.message}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-zinc-100 px-4 py-3 text-[14px] text-zinc-700">{state.message}</p>
          ))}

        {/* 발견 문서 요약 (배포 상세 카드) */}
        {original && (
          <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-[0_2px_12px_rgba(11,124,110,0.08)]">
            <div className="bg-gradient-to-b from-indigo-50 to-white px-5 pt-5 pb-4">
              <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-700">
                <Icon name="spark" className="h-4 w-4" />
                Liner가 찾은 새 공식 문서
              </p>
              <p className="mt-1.5 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">{original.title}</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-[14px] sm:grid-cols-2">
              <div>
                <dt className="text-[12px] text-zinc-400">원본 확인</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-zinc-900">
                  <span className={`h-2 w-2 rounded-full ${original.hashMatch ? "bg-green-500" : "bg-amber-500"}`} />
                  {original.hashMatch ? "원본 해시 일치 (SHA-256)" : "원본 일치 미확인"}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-zinc-400">인용문 원본 대조</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">{clauses ? `${clauses.clauses.length}/${clauses.clauses.length + clauses.rejectedCount} 통과` : "진행 중…"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-zinc-400">새로 생긴 근거</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">
                  {clauses ? (
                    <>
                      {newClauses.length}개{transitional > 0 && <span className="text-zinc-500"> · 경과조치 {transitional}개</span>}
                    </>
                  ) : (
                    "진행 중…"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-zinc-400">결론이 바뀌는 판정</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">{impact ? `${impact.changed.length}개 유형 (테스트 ${impact.total}문항 중)` : "진행 중…"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-5 py-3">
              <a href={original.url} target="_blank" rel="noreferrer" className="text-[13px] text-zinc-500 underline decoration-zinc-300 hover:text-zinc-800">
                금융위 원본 파일 ↗
              </a>
              {original.download.ok && (
                <span className="text-[13px] text-zinc-400">
                  {(original.download.bytes! / 1024).toFixed(0)}KB · {(original.download.ms / 1000).toFixed(1)}초
                </span>
              )}
              {state.done && <span className="ml-auto text-[13px] text-zinc-400">전체 {(state.done.ms / 1000).toFixed(1)}초</span>}
            </div>
          </section>
        )}

        {/* 승인 */}
        {impact && state.done && (
          <section className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-5">
            <h2 className="text-[16px] font-semibold text-indigo-950">담당자 승인</h2>
            {kb === "v2" && !approved ? (
              <p className="mt-1.5 text-[14px] text-zinc-700">이미 근거 자료 v2가 적용되어 있습니다. 처음부터 보려면 위에서 v1으로 되돌린 뒤 다시 감시를 실행하세요.</p>
            ) : (
              <p className="mt-1.5 text-[14px] text-zinc-700">
                승인하면 판정 근거 자료가 <b>v2</b>(8.28 행정지도 반영)로 바뀌고, 아래 {impact.changed.length}개 유형의 질문은 새 결론으로 판정됩니다.
              </p>
            )}
            {judge && (
              <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-indigo-100">
                <b className="text-zinc-800">시제품 범위</b>: 원본을 미리 등록하고 규칙으로 옮겨 둔 문서 1건(8.28 행정지도)의 반영을 <b>이 브라우저에서</b> 전환해 보여 줍니다. 실제 운영에서는 새 문서마다 ① 원본 등록 ② 조항을 Fact로 정리 ③ 규칙 반영 ④ 테스트 재검증 ⑤ 담당자 승인 후 서버에서 전 지점 적용 순서로 넣습니다.
              </p>
            )}
            {state.done?.approvalNote && <p className={`mt-2 text-[14px] ${state.done.approvable ? "text-zinc-500" : "font-medium text-rose-700"}`}>{state.done.approvalNote}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {kb === "v1" && state.done?.approvable && (
                <button
                  onClick={() => {
                    setKb("v2");
                    setApproved(true);
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  승인하고 근거 자료 v2 적용
                </button>
              )}
              {rerunHref && (
                <Link href={rerunHref} className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-indigo-800 hover:bg-indigo-50">
                  창구에서 다시 판정하기 →
                </Link>
              )}
            </div>
            {approved && <p className="mt-3 text-[14px] font-semibold text-green-700">✓ 근거 자료 v2를 적용했습니다. 창구 판정에 바로 반영됩니다.</p>}
          </section>
        )}

        {impact && (
          <Panel title="결론이 바뀌는 판정" sub={`${impact.changed.length}개 유형 · 규칙 엔진으로 재판정`}>
            <ul className="divide-y divide-zinc-100">
              {impact.changed.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[14px]">
                  <span className="w-10 shrink-0 font-mono text-[12px] text-zinc-400">{r.id}</span>
                  <span className="min-w-0 flex-1 text-zinc-800">{r.question}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge code={r.v1 as VerdictCode} size="sm" />
                    <span className="text-zinc-400">→</span>
                    <Badge code={r.v2 as VerdictCode} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {clauses && (
          <Panel
            title="새로 생긴 근거"
            sub={`조항 ${newClauses.length}개 · Liner Router · ${clauses.ms < 50 ? "저장 결과" : `${(clauses.ms / 1000).toFixed(1)}초`}`}
            open={false}
          >
            <p className="mb-3 text-[14px] text-zinc-600">
              AI가 뽑은 조항 중 인용문이 원본에 그대로 있는 것만 보여 줍니다{clauses.rejectedCount > 0 && <> (원본에 없어 버린 추출 {clauses.rejectedCount}개)</>}.
            </p>
            <ul className="space-y-2">
              {newClauses.map((c, i) => (
                <ClauseItem key={i} c={c} />
              ))}
            </ul>
            {otherClauses.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] text-zinc-500">기존 지식과 같거나 대응 근거가 없는 조항 {otherClauses.length}개</summary>
                <ul className="mt-2 space-y-2">
                  {otherClauses.map((c, i) => (
                    <ClauseItem key={i} c={c} />
                  ))}
                </ul>
              </details>
            )}
          </Panel>
        )}

        {discovered && (
          <Panel title="Liner 검색 결과" sub={`질의 ${discovered.runs.length}회 · 문서 ${discovered.docs.length}건 · 새 문서 ${newDocs.length}건`} open={false}>
            <ul className="mb-4 space-y-1 text-[13px] text-zinc-600">
              {discovered.runs.map((r, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="w-24 shrink-0 font-mono text-zinc-400">{r.tool === "rest" ? "Search API" : "MCP legal"}</span>
                  <span className="min-w-0 flex-1 text-zinc-800">{r.q}</span>
                  <span>
                    {r.error ? <span className="text-rose-600">오류</span> : `신뢰 출처 ${r.trusted}/${r.total}`} · {r.ms < 50 ? "저장 결과" : `${(r.ms / 1000).toFixed(1)}초`}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1.5">
              {shownDocs.map((d) => (
                <li key={d.url} className={`flex flex-wrap items-start gap-2 rounded-lg px-2 py-1.5 text-[14px] ${d.originalId ? "bg-indigo-50 ring-1 ring-indigo-200" : ""}`}>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[12px] text-zinc-600">{d.tier === 1 ? "공식" : "언론"}</span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-words text-zinc-800 underline-offset-2 hover:underline">
                    {d.title}
                  </a>
                  {d.originalId && <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[12px] font-medium text-indigo-800">분석 대상</span>}
                  <span className="shrink-0 text-[12px] text-zinc-400">{d.date ?? "날짜 미상"}</span>
                </li>
              ))}
            </ul>
            {discovered.unregistered > 0 && (
              <p className="mt-2 text-[13px] text-amber-700">원본이 등록되지 않은 새 문서 {discovered.unregistered}건은 자동 분석하지 않습니다. 판정 규정과 관련 있는지 담당자가 확인하세요.</p>
            )}
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px] text-zinc-500 hover:text-zinc-800">
              {showAll ? "새 문서·반영 문서만 보기" : `날짜 미상·이전 문서까지 모두 보기 (${discovered.docs.length}건)`}
            </button>
          </Panel>
        )}
      </div>

      {/* 오른쪽: 진행 체크리스트 */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900">
            감시 진행
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-semibold text-zinc-600">
              {doneCount}/{steps.length}
            </span>
          </p>
          <ol className="mt-3 space-y-1.5">
            {steps.map((x) => (
              <li
                key={x.label}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] ${
                  x.state === "done" ? "bg-green-50/70 text-zinc-800" : x.state === "now" ? "bg-indigo-50 text-indigo-900" : "text-zinc-400"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    x.state === "done" ? "bg-green-500 text-white" : x.state === "now" ? "bg-indigo-100" : "bg-zinc-100"
                  }`}
                >
                  {x.state === "done" ? <Icon name="check" className="h-3 w-3" /> : <span className={`h-1.5 w-1.5 rounded-full ${x.state === "now" ? "animate-pulse bg-indigo-500" : "bg-zinc-300"}`} />}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{x.label}</span>
                {x.meta && <span className="shrink-0 text-[12px] text-zinc-500">{x.meta}</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-zinc-100 pt-3 text-[12px] leading-relaxed text-zinc-400">
            검색: Liner Search API·MCP search_legal · 조항 구조화: Liner Router · 판정·영향 분석: 규칙 엔진(코드). AI가 뽑은 조항은 원본 인용이 확인된 것만 쓰고, 판정 지식은 사람이 승인해야
            바뀝니다.
          </p>
        </div>
      </aside>
    </div>
  );
}

function ClauseItem({ c }: { c: CheckedClause }) {
  return (
    <li className="rounded-xl border border-zinc-200 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${c.diff === "new" ? "bg-indigo-600 text-white" : c.diff === "rejected" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
          {DIFF_LABEL[c.diff]}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
          {c.policy} · {c.topic}
        </span>
        <span className="text-green-700">✓ 인용문 원본 대조 통과</span>
        {c.match && (
          <span className="text-slate-400" title={c.match.text}>
            대응 {c.match.id} (유사도 {c.match.score})
          </span>
        )}
      </div>
      <p className="mt-1.5 border-l-2 border-indigo-300 pl-2 text-[14px] leading-relaxed text-zinc-900">“{c.quote}”</p>
      <p className="mt-1 text-[13px] text-zinc-500">
        <span className="font-medium">AI 요약(미검증)</span> · {c.summary}
      </p>
    </li>
  );
}
