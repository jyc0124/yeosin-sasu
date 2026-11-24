"use client";
// 고객 안내 문구: Liner Router가 쓰고 원문 대조 검증을 통과한 문장만 보여 준다. 판정 배지 표시 뒤에 따로 불러온다.
import { useEffect, useState } from "react";
import { Cited, Emph } from "./VerdictCard";
import { useJudge } from "./viewStore";

type Result = { verdict: string; sentences: { text: string; facts: string[]; source: "fact" | "card" }[]; rejected: number; model: string; ms: number };

const ASKS_HQ = /본점/;

/** hq: 승인된 본점 해석이 있으면 '본점 확인 후 안내' 문장을 빼고 회신의 창구 안내 문장을 앞에 둔다 */
export function ExplainPanel({ question, caseData, kb, verdict, order = [], hq }: { question: string; caseData: Record<string, unknown>; kb: string; verdict: string; order?: string[]; hq?: { id: string; script?: string } }) {
  const [state, setState] = useState<{ loading: boolean; data?: Result; error?: string }>({ loading: true });

  useEffect(() => {
    const ac = new AbortController();
    setState({ loading: true });
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, case: caseData, kb }),
      signal: ac.signal,
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `오류 (${r.status})`);
        // 서버가 다시 판정한 결과가 화면 카드와 다르면 문장을 쓰지 않는다
        if ((j as Result).verdict !== verdict) throw new Error("판정 카드와 기준이 달라 안내 문구를 표시하지 않습니다.");
        setState({ loading: false, data: j as Result });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ loading: false, error: e.message });
      });
    return () => ac.abort();
  }, [question, caseData, kb, verdict]);

  const [copied, setCopied] = useState(false);
  const judge = useJudge();
  const all = state.data?.sentences ?? [];
  const sentences = hq ? all.filter((x) => !ASKS_HQ.test(x.text)) : all;
  const dropped = all.length - sentences.length;
  const count = sentences.length + (hq?.script ? 1 : 0);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold text-zinc-700">
        고객에게 이렇게 말하세요
        {state.data && count > 0 && (
          <button
            type="button"
            onClick={() => {
              const text = [hq?.script, ...sentences.map((x) => x.text)].filter(Boolean).join(" ");
              navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
            }}
            className="order-last ml-auto rounded-lg border border-zinc-200 px-2.5 py-1 text-[13px] font-semibold text-zinc-700 hover:border-zinc-400"
          >
            {copied ? "복사했습니다" : "복사"}
          </button>
        )}
        <span className="text-[13px] font-normal text-zinc-400">
          {!judge ? (state.loading ? "· 작성 중…" : "") : state.loading
            ? "· Liner Router가 근거 문장을 고르는 중…"
            : state.data
              ? `· ${[hq?.script && "본점 해석 1문장", sentences.length > 0 && `판정 결론 + Liner가 정부 발표 자료에서 고른 문장 ${sentences.length}문장(새로 쓰지 않음)`].filter(Boolean).join(" · ") || "고른 문장 0"} · ${(state.data.ms / 1000).toFixed(1)}초`
              : ""}
        </span>
      </h3>
      {state.loading && <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-slate-100" />}
      {state.error && <p className="mt-2 text-sm text-slate-500">{state.error}</p>}
      {state.data && (
        <>
          {count > 0 ? (
            <ul className="mt-3 space-y-2">
              {hq?.script && (
                <li className="border-l-[3px] border-teal-300 pl-3 text-[16px] leading-relaxed text-zinc-900">
                  {hq.script}
                  <span className="ml-1 align-middle text-[12px] text-teal-700">본점 해석 {hq.id}</span>
                </li>
              )}
              {sentences.map((s, i) => (
                <li key={i} className="border-l-[3px] border-indigo-200 pl-3 text-[16px] leading-relaxed text-zinc-900">
                  <Cited ids={s.facts} order={order}>
                    <Emph text={s.text} />
                  </Cited>
                  {judge && s.source === "card" && <span className="ml-1 align-middle text-[12px] text-zinc-400">판정 카드</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-zinc-500">정부 발표 자료와 대조를 통과한 문장이 없습니다. 판정 카드의 결론으로 안내하세요.</p>
          )}
          {judge && dropped > 0 && <p className="mt-3 text-[12px] text-zinc-400">본점 해석이 있어 &lsquo;본점 확인 후 안내&rsquo; 문장 {dropped}개를 뺐습니다.</p>}
          {judge && state.data.rejected > 0 && (
            <p className="mt-3 text-[12px] text-zinc-400">정부 발표 자료와 맞지 않아 뺀 문장 {state.data.rejected}개(근거 밖 내용·숫자, 판정과 어긋난 단정 등)</p>
          )}
        </>
      )}
    </section>
  );
}
