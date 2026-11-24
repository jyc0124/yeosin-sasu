"use client";
// 현재 적용 중인 지식 버전(KB). 정책 감시에서 승인하면 v2가 된다.
// 보는 사람 브라우저에만 저장한다(데모용 상태). 저장소를 못 쓰면 기본값 v2.
import { useEffect, useState } from "react";
import type { KbVersion } from "@/lib/rules/types";

const KEY = "loandesk.kb";
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 이 탭 안에서는 바꾼 값을 유지한다
let memory: KbVersion | undefined;
const EVT = "loandesk:kb";

/** 저장된 지식 버전을 지금 읽는다(렌더 상태를 기다리지 않음) */
export function readKb(): KbVersion {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "v1" || v === "v2") return v;
  } catch {
    // 아래 기본값
  }
  return memory ?? "v2";
}

export function setKb(kb: KbVersion) {
  memory = kb;
  try {
    localStorage.setItem(KEY, kb);
  } catch {
    // 저장 실패해도 이 탭에서는 이벤트로 반영
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: kb }));
}

export function useKb(): [KbVersion, (kb: KbVersion) => void] {
  const [kb, set] = useState<KbVersion>("v2");
  useEffect(() => {
    set(readKb());
    const onEvt = (e: Event) => set((e as CustomEvent<KbVersion>).detail);
    const onStorage = (e: StorageEvent) => e.key === KEY && set(readKb());
    window.addEventListener(EVT, onEvt);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, onEvt);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [kb, setKb];
}
