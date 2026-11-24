"use client";
// 정책 감시 ③ 보증기관 자료: 창구 화면 '보증기관 확인 자료'의 출처 목록과 개정 확인(공식 페이지 직접 대조, Liner 비용 없음).
import { useState } from "react";
import { Icon } from "../_components/Icon";
import { AGENCY_INFO, SOURCES, type Agency } from "@/lib/guarantor";
import type { CheckResult } from "@/lib/guarantor/check";

const fmt = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const TONE: Record<CheckResult["status"], string> = {
  same: "bg-green-50 text-green-800 ring-green-200",
  changed: "bg-amber-50 text-amber-900 ring-amber-300",
  error: "bg-rose-50 text-rose-800 ring-rose-200",
  skipped: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};
const LABEL: Record<CheckResult["status"], string> = { same: "변경 없음", changed: "변경 감지 · 검토 필요", error: "확인 실패", skipped: "확인 대상 없음" };

export function AgencyWatch() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ at: string; results: CheckResult[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const byId = new Map(res?.results.map((r) => [r.id, r]) ?? []);
  const have = SOURCES.filter((s) => s.kind !== "미확보");
  const groups = (["HF", "HUG", "SGI"] as Agency[]).map((a) => ({ a, list: SOURCES.filter((s) => s.agency === a) }));
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/guarantor", { method: "POST" });
      const j = (await r.json()) as { checkedAt?: string; results?: CheckResult[]; error?: string };
      if (!r.ok || !j.results) throw new Error(j.error ?? `서버 오류 (${r.status})`);
      setRes({ at: j.checkedAt!, results: j.results });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-zinc-900">창구 화면에 연결하는 보증기관 공개 자료 {have.length}건 · SGI는 미확보</p>
          <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
            판정 근거가 아니라 &lsquo;보증기관 확인 자료&rsquo;로만 보여 줍니다. 공식 페이지의 작성일·첨부 번호·본문을 기준값과 대조해 바뀌면 알립니다. 바뀐 내용은 본점이 검토한 뒤 발췌와 기준일을 갱신합니다.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:bg-zinc-300">
          <Icon name="radar" className="h-4 w-4" />
          {busy ? "확인 중…" : "지금 개정 확인"}
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800 ring-1 ring-rose-200">확인하지 못했습니다: {err}</p>}
      <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-inset ring-zinc-200">
        <p className="text-[14px] font-semibold text-zinc-800">보증기관이란</p>
        <p className="mt-1 text-[14px] leading-relaxed text-zinc-600">
          은행 전세대출은 대부분 아래 세 기관 중 한 곳의 보증서를 받아 나갑니다. 정부 규제상 가능해도 보증기관이 보증을 내 주지 않으면 대출이 나가지 않기 때문에, 창구는 보증기관 기준도 함께 확인합니다.
        </p>
      </div>
      <div className="mt-4 space-y-5">
        {groups.map(({ a, list }) => (
          <div key={a}>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-zinc-200 pb-1.5">
              <span className="text-[14px] font-bold text-zinc-900">{a}</span>
              <span className="text-[14px] font-semibold text-zinc-800">{AGENCY_INFO[a].name}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-600">{AGENCY_INFO[a].type}</span>
              <span className="basis-full text-[13px] text-zinc-500">{AGENCY_INFO[a].role}</span>
            </p>
            <ul className="divide-y divide-zinc-100">
              {list.map((s) => {
                const r = byId.get(s.id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                    {s.kind === "미확보" ? (
                      <span className="font-medium text-zinc-700">공개 기준 미확보</span>
                    ) : (
                      <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600">
                        {s.title}
                      </a>
                    )}
                    <span className="text-[13px] text-zinc-500">{s.asOf ? `문서 기준일 ${fmt(s.asOf)}` : s.asOfNote}</span>
                    {r && s.kind !== "미확보" && (
                      <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${TONE[r.status]}`} title={r.detail}>
                        {LABEL[r.status]}
                      </span>
                    )}
                    {r && s.kind !== "미확보" && r.status !== "same" && <p className="basis-full text-[13px] text-zinc-600">{r.detail}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {res && <p className="mt-2 text-[12px] text-zinc-400">확인 시각 {new Date(res.at).toLocaleString("ko-KR")}</p>}
    </section>
  );
}
