"use client";
// 화면 머리글: 화면 이름 + 한 줄 설명. 화면 이동과 근거 자료 상태는 Sidebar가 맡는다.
import { usePathname } from "next/navigation";
import { NAV, NAV_GROUPS } from "./nav";

export function Header({ subtitle, title }: { subtitle: string; title?: string }) {
  const path = usePathname();
  const item = NAV.find((n) => n.href === path);
  const name = title ?? item?.label ?? "";
  const who = NAV_GROUPS.find((g) => g.id === item?.group)?.who;
  return (
    <header className="mb-6">
      {who && (
        <p className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${item?.group === "hq" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-indigo-50 text-indigo-700 ring-indigo-200"}`}>
          {who}
        </p>
      )}
      <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900">{name}</h1>
      <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-zinc-500">
        {/* 문장마다 줄을 나눠 문장 중간에서 줄이 넘어가지 않게 */}
        {subtitle.split(/(?<=다\.)\s+/).map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </p>
    </header>
  );
}

/** 판정 근거 자료(코드상 KB = Knowledge Base) 버전 설명. 사이드바 칩을 누르면 열린다. */
export function KbExplainer({ kb }: { kb?: "v1" | "v2" }) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-xs leading-relaxed text-zinc-700">
      <p>
        <b>판정 근거 자료</b> = 규칙 엔진이 판정할 때 근거로 쓰는 정부 발표 자료 묶음입니다(개발 문서의 &lsquo;KB&rsquo;는 Knowledge Base, 지식 베이스의 약자이며 은행 이름이 아닙니다). 문장마다 Fact ID가 붙어 있고, 판정 카드의 근거가 여기서 나옵니다.
      </p>
      <ul className="mt-2 space-y-1">
        <li className={kb === "v1" ? "font-semibold" : ""}>
          <b>v1</b> · 정부 발표 자료만: 4.1 가계부채 관리방안, 8.13 금융 종합대책의 보도자료와 FAQ.
        </li>
        <li className={kb === "v2" ? "font-semibold" : ""}>
          <b>v2</b> · v1 + 그 뒤에 나온 후속 문서: <b>8.28 행정지도</b>(전세대출 경과조치·증액 조건, Liner가 찾음)와 <b>10.20 인구감소지역 재지정</b>. 원본 대조 후 사람이 승인해
          반영했습니다.
        </li>
      </ul>
      <p className="mt-2 text-zinc-500">
        같은 질문도 근거 자료 버전에 따라 결론이 달라질 수 있습니다(예: 만기 12/20 전세대출 연장 — v1 본점 문의, v2 조건 충족 시 가능). Liner가 찾은 8.28 행정지도 덕분에 최신 정보가 필요한 질문 정답률이 33% → 100%(6문항 중 2개 → 6개)가 됐습니다. 정책 감시 화면에서 승인하면 v1 → v2로 바뀝니다.
      </p>
    </div>
  );
}
