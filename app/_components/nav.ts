// 화면 목록(사이드바·머리글 공용). group = 누가 쓰는 화면인지(심사·첫 방문자가 역할을 헷갈리지 않게).
export const NAV_GROUPS = [
  { id: "judge", label: "심사위원용", who: "심사위원이 먼저 보는 화면" },
  { id: "branch", label: "지점 창구", who: "지점 직원이 쓰는 화면" },
  { id: "hq", label: "본점", who: "본점 담당자가 쓰는 화면" },
  { id: "ref", label: "참고 자료", who: "" },
] as const;

/** 이미 창구 판정(/) 화면에 있을 때 사이드바·로고를 누르면 같은 주소라 화면이 그대로다 → 이 이벤트로 새 질문 상태로 되돌린다 */
export const COPILOT_RESET = "loandesk:copilot-reset";

import { BETA } from "@/lib/beta";

const ALL_NAV = [
  { href: "/story", label: "Liner와 만든 이야기", icon: "spark", group: "judge" },
  { href: "/review", label: "심사 안내", icon: "scale", group: "judge" },
  { href: "/eval", label: "평가 결과", icon: "chart", group: "judge" },
  { href: "/", label: "창구 판정", icon: "desk", group: "branch" },
  { href: "/inquiries", label: "내 질의", icon: "question", group: "branch" },
  { href: "/hq", label: "질의 처리", icon: "building", group: "hq" },
  { href: "/watch", label: "정책 감시", icon: "radar", group: "hq" },
  { href: "/bank", label: "A은행 지침(가상)", icon: "doc", group: "ref" },
  { href: "/guide", label: "사용 안내", icon: "info", group: "ref" },
  { href: "/feedback", label: "의견 보내기", icon: "chat", group: "ref" },
] as const;

/** 베타 스위치가 꺼지면 '의견 보내기'는 메뉴에서 빠진다 */
export const NAV = ALL_NAV.filter((n) => BETA || n.href !== "/feedback");
