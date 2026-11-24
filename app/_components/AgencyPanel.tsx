"use client";
// 보증기관 확인 자료(현장 피드백 11/22 ③): 판정과 별개로, 보증기관(HF·HUG)이 공개한 기준 원문 발췌를 연결한다.
// 판정 코드·결론에는 영향이 없다. 기관을 특정하지 못한 질문은 기관을 먼저 고르게 한다(누르면 화면에서만 걸러짐, 다시 판정 없음).
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import type { Agency, AgencyRefs } from "@/lib/guarantor";

const AG_STYLE: Record<Agency, string> = {
  HF: "bg-sky-50 text-sky-800 ring-sky-200",
  HUG: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  SGI: "bg-zinc-100 text-zinc-700 ring-zinc-300",
};
const fmt = (d: string) => `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

export function AgencyPanel({ refs, open: initial }: { refs: AgencyRefs; open?: boolean }) {
  const [pick, setPick] = useState<Agency | null>(refs.agencies.length === 1 ? refs.agencies[0] : null);
  const unknownAgency = refs.agencies.length === 0;
  const shown = refs.excerpts.filter((e) => !pick || e.src.agency === pick);
  const missing = refs.missing.filter((m) => !pick || m.agency === pick);
  return (
    <details open={initial || undefined} className="group rounded-2xl border border-sky-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Icon name="building" className="h-4 w-4 text-sky-700" />
        <span className="text-[15px] font-semibold text-zinc-900">보증기관 확인 자료</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-600">판정에 쓰지 않음</span>
        {refs.agencies.map((a) => (
          <span key={a} className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${AG_STYLE[a]}`}>
            {a}
          </span>
        ))}
        <Icon name="chevron" className="ml-auto h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-sky-100 px-4 pt-3 pb-4">
        <p className="text-[14px] leading-relaxed text-zinc-600">
          전세대출은 보증기관(HF 한국주택금융공사·HUG 주택도시보증공사·SGI서울보증)의 보증서를 받아 나갑니다. 정부 규제 판정과 별개로, 보증기관이 공개한 기준의 원문입니다. 상품별 취급 여부·한도는 보증기관 심사와 본점 기준을 따르세요.
        </p>

        {unknownAgency && (
          <div className="rounded-xl bg-orange-50/70 px-3 py-2.5 ring-1 ring-inset ring-orange-200">
            <p className="text-[14px] font-semibold text-orange-800">어느 보증기관 상품인가요? 기관마다 기준이 다릅니다.</p>
            <div role="radiogroup" aria-label="보증기관" className="mt-2 flex flex-wrap gap-1.5">
              {(["HF", "HUG", "SGI"] as Agency[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={pick === a}
                  onClick={() => setPick(pick === a ? null : a)}
                  className={`rounded-full border px-3 py-1 text-[14px] ${pick === a ? "border-indigo-600 bg-indigo-600 font-semibold text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400"}`}
                >
                  {a === "HF" ? "HF 주택금융공사" : a === "HUG" ? "HUG 주택도시보증공사(버팀목 포함)" : "SGI 서울보증"}
                </button>
              ))}
            </div>
          </div>
        )}

        {shown.length > 0 ? (
          <ul className="space-y-2.5">
            {shown.map((e) => (
              <li key={e.id} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-500">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ring-1 ring-inset ${AG_STYLE[e.src.agency]}`}>{e.src.agency}</span>
                  <span className="font-medium text-zinc-800">{e.src.title}</span>
                  <span>· {e.where}</span>
                </div>
                <blockquote className="mt-2 whitespace-pre-line border-l-2 border-sky-300 pl-3 text-[14px] leading-relaxed text-zinc-800">{e.quote}</blockquote>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                  <span>{e.src.asOf ? `문서 기준일 ${fmt(e.src.asOf)}` : e.src.asOfNote}</span>
                  <a href={e.src.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-500">
                    공식 게시 페이지 ↗
                  </a>
                  {e.src.file && (
                    <a href={e.src.file} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-500">
                      원문 파일 ↗
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-zinc-500">{pick ? `${pick}의 공개 자료에서 이 질문과 관련된 발췌를 찾지 못했습니다.` : "관련 발췌를 찾지 못했습니다."}</p>
        )}

        {missing.map((m) => (
          <p key={m.id} className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <b className="font-semibold">{m.agencyName}</b>: 공식 공개 기준을 확보하지 못했습니다. 상품설명서·본점 기준으로 확인하세요.
          </p>
        ))}

        <p className="text-[12px] text-zinc-400">
          자료 확인일 {fmt(refs.checkedAt)} · 본점이{" "}
          <Link href="/watch#agency-watch" className="underline">
            정책 감시
          </Link>
          에서 개정 여부를 확인합니다.
        </p>
      </div>
    </details>
  );
}
