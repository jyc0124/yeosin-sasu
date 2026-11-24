"use client";
// 앱 뼈대의 왼쪽 사이드바: 화면 이동 + 현재 판정 근거 자료(내부 명칭 KB) 상태. 좁은 화면에서는 위쪽 가로 막대로 바뀐다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { hqTodo, useBranchUpdates, useHq } from "./hqStore";
import { useKb } from "./kbStore";
import { Icon } from "./Icon";
import { LogoTile } from "./Logo";
import { KbExplainer } from "./Header";
import { COPILOT_RESET, NAV as ALL_NAV, NAV_GROUPS } from "./nav";
import { useView, ViewSwitch } from "./viewStore";

export function Sidebar() {
  const path = usePathname();
  const [kb] = useKb();
  const pending = useHq().inquiries.filter(hqTodo).length;
  const updates = useBranchUpdates().length;
  const [open, setOpen] = useState(false);
  const judge = useView()[0] === "judge";
  // 심사위원용 화면(이야기·평가 결과)은 심사위원 설명을 켰을 때만 메뉴에 보인다(주소로는 열림)
  const NAV = ALL_NAV.filter((n) => judge || n.group !== "judge");
  // 같은 주소(/)를 다시 누르면 Next.js는 화면을 다시 그리지 않는다 → 창구 판정을 첫 화면으로 되돌리라고 알린다
  const onNav = (href: string) => () => {
    if (href === "/" && path === "/") window.dispatchEvent(new Event(COPILOT_RESET));
  };

  const kbChip = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="group flex w-full items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.03)] hover:border-zinc-300"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kb === "v2" ? "bg-green-500" : "bg-amber-500"}`} />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-zinc-900">{judge ? `판정 근거 자료 ${kb}` : kb === "v2" ? "최신 정부 지침 반영" : "후속 지침 미반영"}</span>
        <span className="block text-[12px] leading-snug text-zinc-500">
          {!judge ? (
            kb === "v2" ? "8.28 행정지도 · 10.20 재지정까지" : "4.1·8.13 정부 발표 자료만"
          ) : kb === "v2" ? (
            <>
              정부 발표 자료 + 8.28 행정지도
              <br />+ 10.20 인구감소지역 재지정
            </>
          ) : (
            "4.1·8.13 정부 발표 자료만"
          )}
        </span>
      </span>
      <Icon name="info" className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
    </button>
  );

  const groups = NAV_GROUPS.filter((g) => NAV.some((n) => n.group === g.id));
  const navGroup = (g: (typeof NAV_GROUPS)[number]) => (
    <div key={g.id} className={g.id === "judge" ? "rounded-xl bg-violet-50/70 p-1.5 ring-1 ring-violet-200" : ""}>
      <p className="px-2.5 pb-1 text-[12px] font-medium text-zinc-400">{g.label}</p>
      <div className="space-y-0.5">
        {NAV.filter((n) => n.group === g.id).map((n) => {
          const active = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNav(n.href)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] ${
                active ? "bg-white font-semibold text-indigo-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-indigo-100" : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900"
              }`}
            >
              <Icon name={n.icon} className={`h-[18px] w-[18px] ${active ? "text-indigo-600" : "text-zinc-400"}`} />
              {n.label}
              {n.href === "/inquiries" && updates > 0 && (
                <span className="ml-auto rounded-full bg-green-600 px-1.5 text-[12px] font-semibold leading-5 text-white" title="본점 회신·진행 소식">
                  {updates}
                </span>
              )}
              {n.href === "/hq" && pending > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[12px] font-semibold leading-5 text-white">{pending}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* 넓은 화면: 고정 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-zinc-200/80 bg-[#f4f4f2] px-3 py-4 lg:flex">
        <Link href="/" onClick={onNav("/")} className="block px-2 pt-1 pb-1.5">
          <LogoTile size="lg" />
          <span className="mt-2.5 block text-[19px] font-bold leading-tight tracking-tight text-zinc-900">여신 사수</span>
          <span className="mt-1.5 block text-[14px] leading-snug text-zinc-700">규정 막힐 때 바로 묻는 대출 규제 사수</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-zinc-500">가상 A은행 · 주담대·전세대출</span>
        </Link>

        <nav className="mt-5 space-y-4">{groups.filter((g) => g.id !== "judge").map(navGroup)}</nav>

        <div className="mt-auto space-y-3 pt-4">
          {/* 심사위원용 메뉴는 지점·본점 메뉴 아래 빈 공간에 둔다: 역할(지점·본점) 메뉴가 먼저 보이게 */}
          {groups.filter((g) => g.id === "judge").map(navGroup)}
          {open && <KbExplainer kb={kb} />}
          {kbChip}
          <ViewSwitch />
          <p className="px-1 text-[12px] leading-relaxed text-zinc-400">
            <span className="block">정부 발표 자료와 가상 사례로 만든</span>
            <span className="block">판정 보조 도구입니다.</span>
            <Link href="/bank" className="underline decoration-zinc-300 hover:text-zinc-600">
              &lsquo;A은행 지침&rsquo;
            </Link>
            은 가상 기준입니다.
          </p>
        </div>
      </aside>

      {/* 좁은 화면: 위쪽 막대 */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-[#f4f4f2]/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <LogoTile />
          <span className="text-[14px] font-semibold text-zinc-900">여신 사수</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${kb === "v2" ? "bg-green-500" : "bg-amber-500"}`} />
            {judge ? `근거 자료 ${kb}` : kb === "v2" ? "최신 지침 반영" : "후속 지침 미반영"}
          </button>
          <ViewSwitch compact />
        </div>
        <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNav(n.href)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${path === n.href ? "bg-indigo-600 text-white" : "text-zinc-600"}`}
            >
              {n.label}
              {n.href === "/hq" && pending > 0 && <span className="ml-1 text-rose-500">●</span>}
              {n.href === "/inquiries" && updates > 0 && <span className="ml-1 text-green-600">●</span>}
            </Link>
          ))}
        </nav>
        {open && (
          <div className="mt-2">
            <KbExplainer kb={kb} />
          </div>
        )}
      </div>
    </>
  );
}
