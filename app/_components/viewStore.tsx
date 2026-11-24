"use client";
// 보기 모드: 창구 화면(기본) / 심사위원 설명 보기. docs/UI_REVAMP.md
// 창구 직원에게는 결론·할 일·고객 안내만, 심사위원에게는 Liner 역할·처리 시간·근거 코드·평가 수치까지 보여 준다.
// 제출 링크는 ?view=judge로 켜진 채 연다. 보는 사람 브라우저에만 저장하고, 저장소를 못 쓰면 이 탭 안에서만 유지한다.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export type ViewMode = "branch" | "judge";
const KEY = "loandesk.view";
const EVT = "loandesk:view";
let memory: ViewMode | undefined;

function fromUrl(): ViewMode | undefined {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "judge" || v === "branch" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function readView(): ViewMode {
  const u = fromUrl();
  if (u) {
    if (memory !== u) setView(u, false);
    return u;
  }
  try {
    const v = localStorage.getItem(KEY);
    if (v === "judge" || v === "branch") return v;
  } catch {
    // 아래 기본값
  }
  return memory ?? "branch";
}

export function setView(v: ViewMode, notify = true) {
  memory = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 저장 실패해도 이 탭에서는 이벤트로 반영
  }
  if (notify) window.dispatchEvent(new CustomEvent(EVT, { detail: v }));
}

export function useView(): [ViewMode, (v: ViewMode) => void] {
  const [v, set] = useState<ViewMode>("branch");
  useEffect(() => {
    set(readView());
    const onEvt = (e: Event) => set((e as CustomEvent<ViewMode>).detail);
    const onStorage = (e: StorageEvent) => e.key === KEY && set(readView());
    window.addEventListener(EVT, onEvt);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, onEvt);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [v, setView];
}

/** 심사위원 설명을 켰는지 */
export const useJudge = () => useView()[0] === "judge";

/** 심사위원 설명을 켰을 때만 보이는 부분 */
export function JudgeOnly({ children }: { children: React.ReactNode }) {
  return useJudge() ? <>{children}</> : null;
}

/** 심사 포인트 말풍선: 이 화면에서 무엇을 보면 되는지 한두 문장 */
export function JudgeNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  if (!useJudge()) return null;
  return (
    <p className={`flex gap-2 rounded-xl bg-violet-50 px-3.5 py-2.5 text-[14px] leading-relaxed text-violet-900 ring-1 ring-inset ring-violet-200 ${className}`}>
      <Icon name="info" className="mt-[3px] h-4 w-4 shrink-0 text-violet-600" />
      <span>
        <b className="mr-1 font-semibold">심사 포인트</b>
        {children}
      </span>
    </p>
  );
}

/** 사이드바 스위치 */
export function ViewSwitch({ compact }: { compact?: boolean }) {
  const [v, setV] = useView();
  const on = v === "judge";
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setV(on ? "branch" : "judge")}
      title="창구 직원 화면에서는 숨겨 둔 설명(Liner 역할, 처리 시간, 근거 코드, 평가 수치)을 보여 줍니다"
      className={
        compact
          ? `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-zinc-200 bg-white text-zinc-600"}`
          : `flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[14px] ${on ? "border-violet-300 bg-violet-50 text-violet-900" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"}`
      }
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-zinc-300"} ${compact ? "scale-75" : ""}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="font-semibold">심사위원 설명 보기</span>
    </button>
  );
  if (compact) return button;
  // 심사위원이 스위치를 끈 채 다니거나 ?view=judge 없이 들어와도, 켜 두기를 권하는 안내가 보이게 한다
  return (
    <div>
      {button}
      {on ? (
        <p className="mt-1 px-1 text-[12px] leading-snug text-zinc-400">끄면 창구 직원이 보는 화면입니다.</p>
      ) : (
        <p className="mt-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-[12px] leading-snug text-violet-800 ring-1 ring-inset ring-violet-200">
          <b className="font-semibold">심사위원이시면 켜 두세요.</b> Liner가 쓰인 곳·근거 번호·평가 수치가 함께 보입니다.
        </p>
      )}
    </div>
  );
}
