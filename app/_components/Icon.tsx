// 선 아이콘 몇 개(외부 의존성 없이). 24px 그리드, stroke 1.75.
const P: Record<string, React.ReactNode> = {
  desk: (
    <>
      <path d="M4 5h16v10H4z" />
      <path d="M8 19h8M12 15v4" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12l5-5" />
    </>
  ),
  building: (
    <>
      <path d="M5 21V5l7-2v18M12 7l7 2v12" />
      <path d="M3 21h18M8 9h1M8 13h1M8 17h1M15 13h1M15 17h1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16M7 20h10M5 8h14" />
      <path d="M5 8l-2.5 6a3 3 0 0 0 5 0L5 8zM19 8l-2.5 6a3 3 0 0 0 5 0L19 8z" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  doc: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M4 5h16v11H9l-4 4v-4H4z" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[name]}
    </svg>
  );
}
