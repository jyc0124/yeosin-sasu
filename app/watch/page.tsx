import { Header } from "../_components/Header";
import { Icon } from "../_components/Icon";
import { WatchClient } from "./WatchClient";
import { AgencyWatch } from "./AgencyWatch";
import { GapResearchBoard } from "../_components/GapResearch";
import { JudgeNote } from "../_components/viewStore";

export const metadata = { title: "정책 감시 · 여신 사수" };

// 이 화면의 두 가지 Liner 조사가 무엇이 다른지 먼저 보여 준다(본점 담당자·심사위원이 헷갈리지 않게)
const KINDS = [
  {
    href: "#watch-run",
    no: "①",
    icon: "radar",
    title: "후속 문서 감시",
    what: "8.13·4.1 대책 뒤에 나온 정부 후속 문서(행정지도·고시 등) 전체",
    when: "매일 아침·정부 발표 직후 실행이 목표 (지금은 담당자가 버튼으로 실행)",
    effect: "승인하면 근거 자료가 바뀌고 모든 지점의 판정이 함께 바뀝니다",
    effectTone: "text-indigo-700",
  },
  {
    href: "#gap-research",
    no: "②",
    icon: "spark",
    title: "해석 쟁점 대장",
    what: "정부 발표 자료에 기준이 없어 ‘본점 문의’가 되는 쟁점(지점 질의로 새로 열린 것 포함)",
    when: "지점 질의가 쌓일 때, 외부기관에 묻기 전",
    effect: "판정은 바뀌지 않습니다. 쟁점을 조사·회신하고, 새 문서를 찾으면 ①로 반영합니다",
    effectTone: "text-zinc-700",
  },
  {
    href: "#agency-watch",
    no: "③",
    icon: "building",
    title: "보증기관 자료",
    what: "전세대출 보증기관(HF·HUG·SGI)의 공개 업무지침·상품 기준. SGI는 공개 기준이 없어 '미확보'로 표시(창구 화면 '보증기관 확인 자료'의 출처)",
    when: "주기적으로, 기관 공지·지침 개정 때",
    effect: "판정은 바뀌지 않습니다. 개정되면 본점이 검토해 발췌·기준일을 갱신합니다",
    effectTone: "text-zinc-700",
  },
] as const;

export default function WatchPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <Header subtitle="본점 여신기획 담당자가 세 가지를 관리합니다. ① 정부 후속 문서를 찾아 판정 기준을 바꾸는 감시, ② 기준이 없는 쟁점을 생길 때부터 닫힐 때까지 관리하는 대장, ③ 창구에 참고로 보여 주는 보증기관 공개 자료의 개정 확인입니다." />
        <JudgeNote className="mb-6">Liner Search API와 MCP(search_legal)가 정부 후속 문서를 찾고, 원본 파일과 대조한 뒤 담당자가 승인해야만 판정 기준이 바뀝니다. 8.28 행정지도를 이렇게 찾아 결론이 바뀐 질문이 4개입니다. v1으로 되돌려 다시 실행해 볼 수 있습니다. ③ 보증기관 자료는 Liner Search API로 HF 업무지침 등을 찾았고, 개정 확인은 공식 페이지를 직접 대조해 Liner 비용이 들지 않습니다.</JudgeNote>
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KINDS.map((k) => (
            <a key={k.no} href={k.href} className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-indigo-300">
              <p className="flex items-center gap-2 text-[16px] font-semibold text-zinc-900">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <Icon name={k.icon} className="h-4 w-4" />
                </span>
                {k.no} {k.title}
                <span className="ml-auto text-[13px] font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100">바로 가기 ↓</span>
              </p>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-zinc-400">찾는 것</dt>
                  <dd className="break-keep text-zinc-800">{k.what}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-zinc-400">언제</dt>
                  <dd className="break-keep text-zinc-800">{k.when}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-zinc-400">판정에</dt>
                  <dd className={`break-keep font-semibold ${k.effectTone}`}>{k.effect}</dd>
                </div>
              </dl>
            </a>
          ))}
        </div>
        <h2 id="watch-run" className="mb-3 flex scroll-mt-6 items-center gap-1.5 text-[18px] font-semibold text-zinc-900">
          <Icon name="radar" className="h-4 w-4 text-indigo-600" />① 후속 문서 감시
        </h2>
        <WatchClient />
        <GapResearchBoard />
        <h2 id="agency-watch" className="mt-10 mb-3 flex scroll-mt-6 items-center gap-1.5 text-[18px] font-semibold text-zinc-900">
          <Icon name="building" className="h-4 w-4 text-indigo-600" />③ 보증기관 자료
        </h2>
        <AgencyWatch />
      </div>
    </main>
  );
}
