// 만든 이유(지점 직원의 고충 → Liner 강점에 맞춘 설계)와 모두에게 이득. /story·/review에서 같은 문장으로 쓴다(기획서 '만든 이유'와 같은 내용).
// 고충은 시중은행 지점 직원 커뮤니티에서 들은 그대로만 적는다(정량 근거가 없는 표현은 쓰지 않음).

const PAINS = [
  ["정부 대책은 계속 바뀌고", "세부 지침은 늦게 내려옴"],
  ["규정 찾기 · 본점 회신 대기", "퇴근이 늦어짐"],
  ["“이 대출 연장 되나요?”", "급한 고객에게 제때 답하지 못함"],
] as const;

// Liner가 잘하는 일 ↔ 이 문제에서 실제로 잰 값
const FIT = [
  ["출처가 붙는 검색", "인용 18/18 원문 대조 · 모든 근거에 문장 번호"],
  ["여러 문서를 찾아 읽는 조사", "보도자료 뒤 8.28 행정지도 발견 · 쟁점 9개 공식 출처 193건"],
  ["법령 검색(MCP)", "정책 감시에 search_legal"],
  ["업무에 넣는 API", "감시·질의서·쟁점 대장 안에서 · 판정 1건 $0.026"],
] as const;

export function WhyStart() {
  return (
    <div>
      <p className="text-[13px] font-semibold text-indigo-600">만든 이유</p>
      <p className="mt-1 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">지점 직원들의 고충에서 시작했습니다</p>
      <p className="mt-1 text-[14px] text-zinc-500">시중은행 지점 직원 커뮤니티에서 들은 이야기</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PAINS.map(([t, s]) => (
          <div key={t} className="rounded-xl bg-white p-3 ring-1 ring-rose-100">
            <p className="text-[15px] font-semibold text-zinc-900">{t}</p>
            <p className="mt-1 text-[14px] font-semibold text-rose-700">{s}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-700">
        답은 &lsquo;최신 공식 문서를 찾아 출처를 붙이되, 틀리게 단정하지 않는 것&rsquo;이었습니다. 이것은 <b className="text-indigo-700">Liner가 가장 잘하는 일</b>입니다. 그래서 처음부터 Liner의 강점이 가장 값진 곳, 출처와 최신성이 중요하고 오답 비용이 큰 금융 창구에 맞춰
        만들었습니다. 약점(단정)은 첫날 실험으로 재고 결론을 코드에 맡겼습니다.
      </p>
      <p className="mt-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-[15px] font-semibold leading-snug text-white">
        고객 상황만으로 보도자료에 없던 8.28 행정지도를 찾은 건 Liner였고, 그걸 API로 매일 돌릴 수 있습니다.
        <span className="mt-0.5 block text-[13px] font-normal text-indigo-100">같은 창구 질문으로 Liner 1/3 · ChatGPT 웹 검색 0/3 · 일반 웹 검색 0/3 (문서 이름을 알면 ChatGPT도 찾음) · 이 문서 한 건으로 정답률 33% → 100%</span>
      </p>
      <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-indigo-100">
        {FIT.map(([a, b], i) => (
          <div key={a} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-[14px] ${i % 2 ? "bg-indigo-50/40" : "bg-white"}`}>
            <span className="font-semibold text-indigo-700">{a}</span>
            <span className="text-zinc-700">{b}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-white px-4 py-3 text-[14px] leading-relaxed text-zinc-700 ring-1 ring-zinc-200">
        <b className="text-zinc-900">만든 사람</b> 저는 은행원이 아닙니다. 컨설팅, AI 교육, AI로 제품·서비스를 만들어 사업화하는 일을 하며 여러 조직의 현장 고충을 듣고 AI로 풀어 왔습니다. 지점 직원 커뮤니티에서 같은 질문이 반복되는 것을 보고,{" "}
        <b className="text-teal-700">혼자 판단하지 않고 현직 직원에게 네 번 검증받으며</b> 만들었습니다. — 장재영
      </p>
    </div>
  );
}

export function WinWin() {
  const rows = [
    ["지점 직원", "bg-teal-700", "근거가 붙은 답을 창구에서 바로", "본점 회신을 기다리는 일이 줄어듦"],
    ["Liner", "bg-indigo-600", "출처가 곧 가치인 금융 업무 안에서", "매일 쓰이는 API(판정 1건 $0.026)"],
    ["만든 사람", "bg-zinc-900", "은행마다 구축 + 규제 감시 구독", "같은 규제를 따르는 기관으로 확장"],
  ] as const;
  return (
    <div>
      <p className="text-[13px] font-semibold text-indigo-600">모두에게 이득</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {rows.map(([who, c, a, b]) => (
          <div key={who} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-white ${c}`}>{who}</span>
            <p className="mt-2 text-[15px] font-bold leading-snug text-zinc-900">{a}</p>
            <p className="mt-1 text-[13px] text-zinc-600">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
