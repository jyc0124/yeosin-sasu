// 여신 사수 로고: 앞에 선 지점 직원(오른쪽)과 뒤에서 받쳐 주는 사수(왼쪽), 사수 옆 인증 체크 = 검증된 전문가.
// app/icon.svg(브라우저 탭)와 같은 모양이다.
export function LogoMark({ className = "", stroke = 2 }: { className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="15.5" cy="6.5" r="3" />
        <path d="M10.5 20v-1.5a5 5 0 0 1 10 0V20" />
        <circle cx="8" cy="10" r="2.5" />
        <path d="M3.5 20v-1a4.5 4.5 0 0 1 7.6-3.2" />
      </g>
      <circle cx="3.4" cy="5.6" r="2.4" fill="currentColor" />
      <path d="M2.25 5.65l.8.8 1.55-1.55" fill="none" stroke="#0b7c6e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 남색 타일에 얹은 로고 */
export function LogoTile({ size = "sm" }: { size?: "sm" | "lg" }) {
  return size === "lg" ? (
    <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-[0_2px_6px_rgba(10,101,90,0.25)]">
      <LogoMark className="h-10 w-10" stroke={1.8} />
    </span>
  ) : (
    <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
      <LogoMark className="h-[18px] w-[18px]" stroke={2.2} />
    </span>
  );
}
