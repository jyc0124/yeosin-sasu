// 심사 안내: 사용 안내(지점 직원용)에서 심사위원용 설명을 옮겨 모은 화면. 왜 만들었나 → 예시를 고른 기준 → v1→v2 → Liner API의 일·비용 → 질문 숫자.
import Link from "next/link";
import { Header } from "../_components/Header";
import { Flow, Mark, More, Stat } from "../_components/Viz";
import { WhyStart, WinWin } from "../_components/Why";

export const metadata = { title: "심사 안내 · 여신 사수" };

// 질문 숫자 한눈에 보기: 화면·기획서에 나오는 질문 개수가 여러 개라 헷갈리지 않게 한곳에 모은다(출처: docs/PROPOSAL.md §3·§4, 평가 결과 화면).
// field: 현장 의견으로 고친 줄. 강조 배경과 함께 고치기 전 → 고친 뒤로 보여 준다
type NumRow = { name: string; n: string; what: string; result: string; tone?: "good" | "warn" | "plain"; field?: { before: string; after: string } };
const NUM_GROUPS: { title: string; desc: string; rows: NumRow[] }[] = [
  {
    title: "만들고 고칠 때 쓴 질문",
    desc: "보면서 규칙을 만들거나 고친 질문입니다. 다 맞히는 것이 기본입니다.",
    rows: [
      { name: "테스트 질문", n: "45", what: "직접 정답을 정한 실무 쟁점 질문. 규칙 엔진을 이 질문들로 만들었습니다.", result: "45/45 · 위험 오류 0", tone: "good" },
      { name: "└ 그중 최신 정보가 필요한 질문", n: "6", what: "8.28 행정지도가 있어야 답할 수 있는 질문(45개 안에 포함)", result: "v1 2/6 → v2 6/6 (Liner 효과)", tone: "good" },
      { name: "현장 질문", n: "14", what: "지점 직원 커뮤니티에서 여러 직원이 실제로 물은 질문을 현직자가 일반화해 추린 10개 주제(1~5번 범위 안, 6~10번 보증기관 실무라 범위 밖). 이어 묻는 질문까지 나누면 14문항. 약점을 찾아 일반 규칙으로 고쳤습니다.", result: "", field: { before: "범위 안 9개 중 정답 2", after: "14개 모두 묻는 말에 직접 답함(직접 채점)" } },
      { name: "예시 질문 목록", n: "56", what: "이 화면 아래의 예시 목록. 테스트 질문 45 + 현장 질문 중 11을 모은 것이라 새 측정 세트가 아닙니다.", result: "—", tone: "plain" },
    ],
  },
  {
    title: "테스트 질문 밖의 질문",
    desc: "테스트 질문 밖에서도 통하는지 확인한 질문입니다. 결과를 본 뒤 그 질문만 맞게 고치지 않고 일반 규칙으로 고쳤고, 일부(새 상황 20개)는 고치기 전에 떼어 둔 검증용입니다.",
    rows: [
      { name: "표현 바꾼 질문", n: "28", what: "테스트 질문과 같은 상황을 다른 말로 물은 질문", result: "28/28", tone: "good" },
      { name: "처음 보는 새 상황 질문", n: "41", what: "테스트 밖 새 상황. 21개는 첫 측정(16/21) 뒤 일반 규칙을 고쳤고, 20개는 고치기 전에 떼어 둔 검증용", result: "41/41 · 틀린 확답 0", tone: "good" },
      { name: "외부 출제 질문", n: "50", what: "Codex가 정부 발표 자료만 보고 새로 낸 어려운 질문(사실 여러 개·날짜 경계·규제 겹침), Codex가 원문과 대조해 채점. 결과를 본 뒤 위험 오류 2건을 일반 규칙으로 고쳤고, 같은 50문항을 ‘판정만 다시 하기’로 돌려 위험 오류 0을 확인했습니다. 새 질문으로 다시 재지는 않았습니다.", result: "위험 오류 2 → 0(고친 뒤) · Codex 채점 36/50(고치기 전)", tone: "plain" },
    ],
  },
  {
    title: "다른 방법과 같은 질문으로 비교",
    desc: "같은 질문을 다른 방법에 넣어 결과를 견줬습니다.",
    rows: [
      { name: "LLM만 / LLM + 정부 발표 자료", n: "45", what: "테스트 질문 45개를 LLM이 직접 판정", result: "24.4% / 71.1% ↔ 여신 사수 100%", tone: "plain" },
      { name: "ChatGPT 일반 채팅", n: "10", what: "테스트 질문 중 10개(추론 High, 필요하면 스스로 웹 검색)", result: "정답 5 · 부분 3 · 오답 2 ↔ 여신 사수 10/10", tone: "plain" },
      { name: "ChatGPT 웹 검색 켬", n: "6", what: "고객 상황만 말한 질문(현장 3 + 창구 3)", result: "ChatGPT 맞음 2 · 부분 3 · 위험 1 ↔ 여신 사수 맞음 5 · 되물음 1 · 위험 0", tone: "plain" },
    ],
  },
  {
    title: "현직 직원이 직접 써 본 검토",
    desc: "숫자로 세지 않은 정성 검토입니다. 지적받은 점은 고쳐서 결과를 돌려보내고, 다시 써 보게 해 확인받았습니다.",
    rows: [
      { name: "현직 지점 직원 검토(11.22, 커뮤니티 소속 1명)", n: "3", what: "직원 커뮤니티의 실제 질문 3건을 넣어 봄. 조건이 덜 주어졌거나 보증기관 기준이 필요한 질문이라, 확답 대신 확인할 곳을 안내했습니다(직원은 오답률로 세지 않음).", result: "", field: { before: "지적: 보증기관 자료·조건 부족 등", after: "다음 날(11.23) 화면·기능에 반영" } },
      { name: "의견 반영·회신(11.23)", n: "16", what: "검토 의견 16개를 하나씩 처리해 결과를 돌려보냄. 항목별로 한 번에 답하기·조건만 고쳐 다시 판정·무주택 질문에 1주택자 기준이 섞이던 경로 차단·보증기관 공식 문서 연결 등.", result: "", field: { before: "의견 16개", after: "반영 8 · 일부 5 · 못 함 3(이유와 함께 회신)" } },
      { name: "다시 써 본 재확인(11.24, 같은 직원)", n: "3", what: "고친 화면을 다시 써 봄. 항목별 답변·조건 수정, 무주택 전세 질문은 ‘좋아짐’. 담보 소재지를 입력하기 전에 ‘불가’가 먼저 보이던 점 1건을 지적받음.", result: "", field: { before: "“사용성이 많이 좋아졌다” · 남은 지적 1건", after: "당일(11.24) 반영: 소재지 모르면 ‘고객 확인 필요’로 먼저 묻기" } },
    ],
  },
];
const TONE_CLS = { good: "text-emerald-700", warn: "text-amber-700", plain: "text-zinc-700" } as const;

function NumbersAtAGlance() {
  return (
    <section id="numbers" className="mt-10 scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-[18px] font-semibold text-zinc-900">질문 숫자 한눈에 보기</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">화면과 기획서에 나오는 질문 개수를 한곳에 모았습니다. 세트마다 1회 실행했고, 정답은 직접 정했습니다.</p>
      <div className="mt-4 rounded-xl bg-indigo-50 p-4 ring-1 ring-inset ring-indigo-100 sm:p-5">
        <p className="text-[13px] font-semibold text-indigo-600">이렇게 만들고 검증했습니다</p>
        <p className="mt-1 text-[17px] font-bold leading-snug text-zinc-900">질문 577개로 시험하고, 지점 직원 커뮤니티의 현장 질문과 현직 직원의 검토를 받을 때마다 고쳤습니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["577문항", "으로 시험", "테스트 45 · 표현 바꾼 28 · 새 상황 41 · 외부 출제 7차례 410 · 현장 14 · 현장 변형 14 · 사용자 점검 25"],
              ["위험 오류 0", "새 상황 질문 41개", "안 되는 대출을 된다고 답한 경우가 없습니다. 모르면 확답하지 않고 고객 확인·본점 확인으로 넘깁니다."],
              ["현장 질문", "으로 고침", "지점 직원 커뮤니티에서 여러 직원이 실제로 물은 질문을 세 번 반영했습니다. 설계 때 반복되는 쟁점 유형(테스트 질문 15개), 11.21 현직자가 추린 현장 질문(10개 주제·14문항), 11.22 현직 직원의 직접 사용 검토(커뮤니티 실제 질문 3건, 커뮤니티의 실제 답과 비교). 검토 의견 16개는 반영 결과를 이유와 함께 돌려보내 11.24에 다시 확인받았습니다(\"사용성이 많이 좋아졌다\")."],
            ] as const
          ).map(([big, small, d]) => (
            <div key={big} className="rounded-lg bg-white p-3 ring-1 ring-indigo-100">
              <p className="text-[18px] font-bold text-indigo-700">
                {big} <span className="text-[13px] font-semibold text-zinc-600">{small}</span>
              </p>
              <More>
                <p>{d}</p>
              </More>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-800">
          <b>한 줄로:</b> 만들 때 쓴 테스트 질문 45개는 모두 맞히고, 테스트 밖 69개(표현 바꾼 28 + 새 상황 41)도 모두 맞혔습니다. 새 상황 41개 중 21개는 첫 측정(16/21) 뒤 일반 규칙을 고쳤고, 20개는 고치기 전에 떼어 둔 검증용입니다. 외부가 낸 어려운 50개에서 나온 위험 오류 2건은 일반 규칙으로 고쳐 0건이 됐고, 나머지는 대부분 확답 대신 본점 확인으로 안내한 경우입니다(정답 72%는 고치기 전).
        </p>
        <More label="정부 기준 밖의 질문은?">
          <p>보증기관·은행별 내부 기준이 필요한 질문은 그 기준이 공개돼 있지 않아 확답 대신 확인할 곳(본점·보증기관)과 공식 문서를 안내합니다. 은행 내규와 보증기관 지침이 들어오면 같은 방식으로 판정 범위를 넓힐 수 있습니다.</p>
        </More>
      </div>
      <div className="mt-5 space-y-6">
        {NUM_GROUPS.map((g, gi) => (
          <div key={g.title}>
            <p className="text-[15px] font-semibold text-zinc-900">
              <span className="mr-1.5 text-indigo-600">{gi + 1}.</span>
              {g.title}
            </p>
            <p className="text-[13px] text-zinc-500">{g.desc}</p>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {g.rows.map((r) => (
                <li key={r.name} className={`grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[13rem_1fr_15rem] sm:items-baseline ${r.field ? "bg-emerald-50/70" : ""}`}>
                  <div>
                    <p className="flex items-baseline gap-2">
                      <span className="min-w-[2.5rem] text-[20px] font-bold tabular-nums text-zinc-900">{r.n}</span>
                      <span className="text-[14px] font-semibold text-zinc-800">{r.name}</span>
                    </p>
                    {r.field && <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">현장 의견 반영</span>}
                  </div>
                  <p className="line-clamp-3 text-[12px] leading-relaxed text-zinc-500" title={r.what}>{r.what}</p>
                  {r.field ? (
                    <div className="text-[13px] leading-snug">
                      <p className="text-zinc-500">{r.field.before}</p>
                      <p className="mt-0.5 font-bold text-emerald-700">→ {r.field.after}</p>
                    </div>
                  ) : (
                    <p className={`text-[14px] font-semibold leading-snug ${TONE_CLS[r.tone ?? "plain"]}`}>{r.result}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-zinc-500">
        자세한 문항별 결과는{" "}
        <Link href="/eval" className="font-medium text-indigo-600 hover:underline">
          평가 결과
        </Link>
        에 있습니다.
      </p>
    </section>
  );
}

export default function ReviewPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Header subtitle="심사위원이 궁금해할 설명을 모았습니다. 왜 만들었는지, 예시를 어떻게 골랐는지, Liner가 무엇을 했고 얼마가 들었는지, 질문을 몇 개로 어떻게 시험했는지입니다. 지점 직원용 사용법은 사용 안내에 있습니다." />
      <nav className="mb-6 flex flex-wrap gap-2 text-[13px]">
        {(
          [
            ["#why", "왜 만들었나"],
            ["#v1v2", "v1 → v2"],
            ["#liner", "Liner API가 하는 일"],
            ["#numbers", "질문 숫자"],
            ["#field", "현장 의견 반영"],
            ["#ask", "되묻고 다시 판정"],
            ["#audit", "Codex 독립 검토"],
            ["#next", "다음 단계"],
          ] as const
        ).map(([h, t]) => (
          <a key={h} href={h} className="rounded-full bg-white px-3 py-1 font-medium text-zinc-700 ring-1 ring-zinc-200 hover:text-indigo-700 hover:ring-indigo-200">
            {t}
          </a>
        ))}
        <Link href="/story" className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700 ring-1 ring-violet-200">
          Liner와 만든 이야기 →
        </Link>
      </nav>

      <section id="why" className="scroll-mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
        <WhyStart />
        <p className="mt-6 text-[13px] font-semibold text-indigo-600">걸리는 시간</p>
        <p className="mt-1 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">창구 질문 하나가 위로 올라갈 때마다 며칠씩 늘어납니다</p>
        <p className="mt-4 text-[13px] font-semibold text-zinc-500">지금은</p>
        <div className="mt-1.5">
          <Flow
            steps={[
              { title: "지점 · 동료 문의", sub: "수 분 ~ 30분" },
              { title: "본점 질의", sub: "공지만으로 답이 안 나올 때(꽤 많음)" },
              { title: "외부기관 문의", sub: "HUG·국토부 게시판 문의 → 회신 2~3일", tone: "human" },
            ]}
          />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-indigo-600">여신 사수와 함께</p>
        <div className="mt-1.5">
          <Flow
            steps={[
              { title: "창구에서 바로", sub: "정부 발표 자료로 답이 나오면 10초 안팎", tone: "liner" },
              { title: "본점에 한 번에", sub: "쟁점이 정리된 질의서 자동 작성", tone: "liner" },
              { title: "다른 지점도 재사용", sub: "본점 해석이 같은 쟁점 카드에", tone: "liner" },
            ]}
          />
        </div>
        <p className="mt-2 text-[12px] text-zinc-400">현재 소요 시간은 현직 지점 직원 1명 응답 기준입니다. 시간 단축 효과는 재지 않았습니다.</p>
        <div className="mt-6">
          <WinWin />
        </div>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[13px] font-semibold text-indigo-600">왜 이 두 대책인가</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat value="6만 건" label="8.13 영향권 전세대출" sub="9.3조 원" />
            <Stat value="1.2만 건" label="4.1 대상 주담대" sub="2026년 만기 도래" />
          </div>
          <p className="mt-2 text-[14px] font-semibold text-zinc-900">드문 예외가 아니라 매일 오는 질문</p>
          <More>
            <p>출처: 금융위 8.13 대책 본문. 예외만 8가지가 넘고, 핵심 판단은 은행 여신심사위에 맡겨져 직원 커뮤니티에 같은 질문이 반복됩니다.</p>
          </More>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[13px] font-semibold text-indigo-600">첫 화면 예시 7개를 고른 기준</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["보도자료에 답이 없음", "사실 하나로 결론이 뒤집힘", "지점이 확답하면 안 됨", "회피 방법을 물음"].map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[13px] font-medium text-zinc-700">
                {t}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[14px] font-semibold text-zinc-900">막히는 이유와 판정 결과가 겹치지 않게 고른 대표</p>
          <More>
            <p>많이 묻는 순서가 아닙니다. 이 7개만 답하는 게 아니라, 같은 규칙으로 표현이 다른 질문도 판정합니다(개발에 쓴 테스트 질문 45개, 개발에 쓰지 않은 표현 바꾼 질문 28개, 처음 보는 새 상황 질문 41개 모두 정답).</p>
          </More>
        </div>
      </div>
      <section id="v1v2" className="mt-10 scroll-mt-6 rounded-2xl border border-indigo-100 bg-white p-6">
        <p className="text-[13px] font-semibold text-indigo-600">판정 근거 자료 v1 → v2</p>
        <h2 className="mt-1 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">Liner가 찾은 후속 문서 하나로, &lsquo;모르겠다&rsquo;던 질문에 답할 수 있게 됐습니다</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {(
            [
              ["v1", "8.13 대책 발표", "보도자료·FAQ로 판정 기준을 만들었습니다. 전세대출 경과조치(이미 받은 대출은 언제부터 막히나)는 여기에 없었습니다."],
              ["", "2주 뒤 8.28 행정지도", "실제 집행 기준인 경과조치·증액 조건이 보도자료가 아닌 별도 사이트(금융규제·법령해석포털)에 올라왔습니다."],
              ["Liner", "정책 감시가 찾아냄", "Liner가 이 문서를 찾았습니다(처음엔 Search Agent, 지금은 Search API·MCP로 재현). 원본 파일과 대조해 인용 18개가 모두 일치했습니다."],
              ["v2", "담당자 승인 후 반영", "사람이 승인한 뒤에만 판정 기준에 들어갑니다. 정책 감시 화면에서 이 과정을 다시 볼 수 있습니다."],
            ] as const
          ).map(([tag, t, d]) => (
            <li key={t} className={`rounded-xl p-4 ring-1 ${tag === "Liner" ? "bg-indigo-50 ring-indigo-200" : "bg-zinc-50 ring-zinc-200"}`}>
              {tag && <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${tag === "Liner" ? "bg-indigo-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>{tag}</span>}
              <p className={`text-[15px] font-semibold text-zinc-900 ${tag ? "mt-2" : ""}`}>{t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <p className="text-[13px] text-zinc-500">최신 정보가 필요한 질문 정답률</p>
            <p className="mt-1 text-[24px] font-bold tracking-tight text-zinc-900">
              33% <span className="text-zinc-400">→</span> <span className="text-indigo-600">100%</span>
            </p>
            <p className="text-[12px] text-zinc-400">6문항 중 2개 → 6개 · 새로 맞힌 4문항은 오른쪽과 같음</p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <p className="text-[13px] text-zinc-500">전체 테스트 질문 정답률(정답이 정해진 45문항)</p>
            <p className="mt-1 text-[24px] font-bold tracking-tight text-zinc-900">
              91% <span className="text-zinc-400">→</span> <span className="text-indigo-600">100%</span>
            </p>
            <p className="text-[12px] text-zinc-400">45문항 중 41개 → 45개 · 결론이 바뀐 4문항 모두 8.28 행정지도가 근거 · 현장 질문 예시는 정답 검수 전이라 넣지 않음</p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <p className="text-[13px] text-zinc-500">ChatGPT(일반 채팅)와 같은 질문 비교</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900">ChatGPT는 8.28 행정지도를 찾지 못했습니다</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">그래서 증액 조건을 빠뜨리고(B02), 만기 전 미리 연장하는 방법을 제안했습니다(C07).</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4">
          <More>
            <p>v1은 이 질문들에 틀린 답 대신 &lsquo;본점 문의(정부 발표 자료에 답 없음)&rsquo;로 멈췄고, v2에서 근거 있는 확정 판정이 됐습니다. 두 정답률은 같은 4문항의 효과를 분모만 달리 센 것입니다. 판정 자체는 규칙 엔진이 내리고, 여기서 Liner는 후속 문서를 찾아오는 &lsquo;정책 감시자&rsquo;입니다. 이와 별도로 모든 질문의 조건 추출과 고객 안내 문구도 Liner Router가 맡습니다(아래 &lsquo;Liner API가 하는 일&rsquo;). 수치는 직접 만든 테스트 질문 기준이며, v2에
          함께 넣은 10.20 인구감소지역 재지정은 다른 조사로 찾고 Liner로 확인했습니다.</p>
          </More>
          <p className="mt-2 flex gap-3 text-[13px]">
            <Link href="/watch" className="font-medium text-indigo-600 hover:underline">
              정책 감시에서 재현 보기 →
            </Link>
            <Link href="/eval" className="font-medium text-indigo-600 hover:underline">
              평가 결과 →
            </Link>
          </p>
        </div>
      </section>

      <section id="liner" className="mt-10 scroll-mt-6">
        <h2 className="text-[18px] font-semibold text-zinc-900">Liner API가 하는 일</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">판정은 규칙 엔진(코드)이 내리고, Liner는 질문을 읽고·근거를 설명하고·새 정책 문서를 찾아옵니다.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["Liner Router", "모델 API (GPT·Gemini 라우팅)", "고객 말 읽기 · 안내 문구", "창구 판정 · 정책 감시", "고객 질문에서 판정 조건(주택 수, 만기일, 세입자 등)을 뽑습니다. 읽는 대로 화면에 보여 줘 2~3초 안에 반응합니다. 기준·정의를 묻는 질문에는 코드가 고른 정부 발표 자료로만 답 문장을 쓰고, 규칙에 없는 사정이 나오면 정부 발표 자료와 대조해 한 번 더 읽습니다. 고객 안내 문구와 찾아온 행정지도의 조항 정리도 합니다. 모든 문장은 정부 발표 자료와 대조를 통과해야 화면에 나옵니다."],
              ["Liner Search API", "웹 검색", "새 정부 문서 · 쟁점 · 보증기관 자료 찾기", "정책 감시 · 질의 처리 · 보증기관 자료", "보도자료 뒤에 나온 후속 지침(8.28 행정지도 등)을 찾습니다. 정부 자료에 기준이 없는 쟁점은 본점이 외부기관에 묻기 전에 공식 출처부터 찾습니다(1건 2~3초). 공식 출처만 남기도록 출처 신뢰도로 거릅니다. 보증기관 공개 자료(HF 전세자금보증 업무지침 등)도 이렇게 찾았습니다."],
              ["Liner MCP", "search_legal 도구", "법령 쪽 교차 확인", "정책 감시", "법령·행정지도 쪽으로 같은 문서를 한 번 더 찾아 교차 확인합니다."],
              ["규칙 엔진", "코드 (LLM 아님)", "판정 · 받을 서류", "창구 판정", "가능·불가 같은 판정과 받을 서류를 정합니다. 추출된 조건이 같으면 항상 같은 판정이 나옵니다."],
            ] as const
          ).map(([name, kind, one, where, what]) => (
            <div key={name} className={`rounded-2xl p-4 ring-1 ${name === "규칙 엔진" ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white ring-zinc-200"}`}>
              <p className={`text-[16px] font-bold ${name === "규칙 엔진" ? "text-white" : "text-zinc-900"}`}>
                {name} <span className={`text-[12px] font-medium ${name === "규칙 엔진" ? "text-zinc-300" : "text-zinc-400"}`}>{kind}</span>
              </p>
              <p className={`mt-1.5 text-[15px] font-semibold ${name === "규칙 엔진" ? "text-white" : "text-indigo-700"}`}>{one}</p>
              <p className={`text-[12px] ${name === "규칙 엔진" ? "text-zinc-300" : "text-zinc-500"}`}>화면: {where}</p>
              {name !== "규칙 엔진" ? (
                <More>
                  <p>{what}</p>
                </More>
              ) : (
                <p className="mt-2 text-[13px] text-zinc-300">{what}</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-5 text-[15px] font-semibold text-zinc-900">적은 비용, 큰 차이</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value="$0.13" label="8.28 행정지도를 찾은 첫 실험" />
          <Stat value="33% → 100%" label="그 문서 하나의 효과" />
          <Stat value="$0.026" label="창구 판정 1건" />
          <Stat value="$123.53" label="개발·평가·시연 전체" sub="6,264회, 11.22 기준" tone="zinc" />
        </div>
        <More>
          <p>첫 실험은 검색 28회 + Search Agent 4회였습니다. 창구 판정 1건은 조건 추출 + 고객 안내이고 2026.11.22 실측입니다. 전체 사용액의 대부분은 처음 보는 질문 수백 개로 반복 평가한 비용입니다.</p>
        </More>
      </section>

      <section id="field" className="mt-10 scroll-mt-6 rounded-2xl border border-emerald-200 bg-white p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-emerald-700">현장 의견을 받아 고친 기록</p>
        <h2 className="mt-1 text-[18px] font-bold text-zinc-900">현장이 묻고, 지적하면 고치고, 고친 결과를 돌려보내 다시 확인받았습니다</h2>
        <p className="mt-1 text-[14px] text-zinc-600">지점 직원 커뮤니티에서 여러 직원이 실제로 묻고 답한 질문으로 만들고 고쳤습니다. 현직 직원의 사용 검토는 의견 16개로 나눠 하나씩 대조했고, 반영한 것·일부만 한 것·못 한 것을 이유와 함께 돌려보낸 뒤 다시 확인받았습니다. 고칠 때마다 저장된 평가를 다시 판정해 기존 판정이 흔들리지 않은 것도 확인했습니다.</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ["설계", "15", "커뮤니티에서 반복되는 쟁점 유형을 다시 쓴 테스트 질문", "45개 중 15개"],
              ["11.21", "14", "커뮤니티에서 실제로 오간 질문을 현직자가 추린 현장 질문", "10개 주제 · 이어 묻는 질문 포함"],
              ["11.22", "3", "현직 직원이 커뮤니티의 실제 질문을 직접 넣어 본 검토", "커뮤니티의 실제 답과 비교"],
              ["11.23", "16", "사용 후기·UI 수정안을 항목별로 대조해 직원에게 회신", "반영 8 · 일부 5 · 못 함 3(이유 포함)", "의견"],
              ["11.24", "3", "직원이 고친 화면을 다시 써 본 재확인", "세 가지 모두 '좋아짐' · 남은 지적 1건 당일 반영", "가지"],
            ] as const
          ).map(([when, n, what, sub, unit = "문항"]) => (
            <li key={when} className="rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-100">
              <p className="text-[12px] font-semibold text-emerald-700">{when}</p>
              <p className="mt-0.5 text-[24px] font-bold leading-none tabular-nums text-emerald-800">{n}<span className="ml-1 text-[13px] font-semibold text-emerald-700">{unit}</span></p>
              <p className="mt-1.5 text-[13px] font-semibold leading-snug text-zinc-800">{what}</p>
              <p className="text-[12px] text-zinc-500">{sub}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[13px] font-semibold text-zinc-700">현장 의견으로 바뀐 것</p>
        <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {(
            [
              ["11.21 현장 질문", "범위 안 9개 중 정답 2, 나머지는 부분 답·오답", "약점을 일반 규칙으로 고쳐 14개 모두 묻는 말에 직접 답함(직접 채점, 현직자 정답 검수 전)"],
              ["11.22 검토 · 같은 등본 가족 주택", "자녀·손자 주택을 합산하는지 답하지 못함", "개선 확인 · 직원 커뮤니티의 실제 답과 핵심 일치"],
              ["11.22 검토 · 보증기관 정보", "HF·HUG 기준은 직원이 따로 찾아야 함", "보증기관 공식 문서 원문을 판정 옆에 연결, 개정은 정책 감시가 확인"],
              ["11.22 검토 · 조건이 부족한 질문", "필요한 사실이 빠지면 결론을 내지 못함", "결론이 갈리는 사실을 항목별로 묻고, 답을 넣으면 다시 판정해 바뀐 점을 표시"],
              ["11.22 검토 · 화면 용어", "내부 항목명이 화면에 보임", "창구에서 쓰는 말로 바꿈"],
              ["11.22 검토 · 결론의 전제", "무주택 고객에게 1주택자 기준을 답처럼 냄 · 담보 지역을 모르는데 '불가'", "잘못된 경로 차단 · 지역을 모르면 결론의 전제를 밝히고 되물음"],
              ["11.22 검토 · 증액 한도 질문", "'증액 연장 최대 2억원?'에 보유 주택 소재지만 묻고 한도에는 답하지 못함", "결과의 '주의'에 '증액·신규면 한도 2억원·DSR 적용'을 바로 표시(결론은 여전히 8.13 대상 확인부터)"],
              ["11.22 의견 · 등기부등본·서류 스캔", "주소·서류를 직원이 직접 확인", "들어갈 자리를 정해 다음 단계 계획으로 기록(아래 '다음 단계')"],
              ["11.24 재확인 · 담보 지역 미입력", "항목별 답하기·조건 수정·무주택 질문은 '좋아짐' · 담보 지역을 안 넣었는데 맨 위에 '불가'", "지역을 모르면 '고객 확인 필요' + 지역별 결론(수도권·규제지역 불가 / 그 밖 가능)을 함께 표시"],
            ] as const
          ).map(([k, before, after]) => (
            <li key={k} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[12rem_1fr_1.3fr] sm:items-baseline">
              <p className="text-[13px] font-semibold text-zinc-800">{k}</p>
              <p className="text-[13px] text-zinc-500">{before}</p>
              <p className="text-[14px] font-semibold leading-snug text-emerald-700">→ {after}</p>
            </li>
          ))}
        </ul>
        <More>
          <p>현장 질문은 지점 직원 커뮤니티에서 여러 직원이 실제로 물은 질문을 현직자가 일반화해 보내 준 10개 주제(이어 묻는 질문까지 14문항)입니다. 틀린 질문만 맞게 고치지 않고 일반 규칙으로 고친 뒤, 새 상황 질문 41개로 다시 확인했습니다(41/41).</p>
          <p>질문과 고충은 현직 직원들이 모인 지점 직원 커뮤니티에서 왔고, 그 커뮤니티에 속한 현직 시중은행 지점 직원 한 명이 의견을 전해 주며 직접 써 보고 검토했습니다. 총평: &ldquo;정부 정책은 잘 설명하는 편이지만, 보증기관과 은행별 정보가 부족해 심도 있는 실무 답변까지는 어려워 보입니다.&rdquo; 보증기관·은행 내부 기준은 공개돼 있지 않아, 지금은 공식 문서 연결과 확인할 곳 안내로 대신합니다.</p>
          <p>11.23에는 받은 의견을 16개로 나눠 반영 8 · 일부 반영 5 · 아직 못 함 3으로 정리하고, 못 한 이유(판정 순서를 크게 바꿔야 함, 정부 자료에 기준이 없음 등)까지 적어 직원에게 보냈습니다. 11.24 재확인에서 직원은 항목별 답하기·조건 수정과 무주택 질문이 &ldquo;확실히 좋아졌다&rdquo;, &ldquo;사용성이 많이 좋아졌다&rdquo;고 답했고, 남은 지적 1건(담보 지역을 모르는데 &lsquo;불가&rsquo;가 먼저 보임)은 같은 날 고쳤습니다.</p>
        </More>
      </section>

      <section id="ask" className="mt-10 scroll-mt-6 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-emerald-700">일반 LLM과 다른 점</p>
        <h2 className="mt-1 text-[18px] font-bold text-zinc-900">모르는 사실은 짐작하지 않고 묻고, 답을 받으면 다시 판정합니다</h2>
        <p className="mt-1 text-[14px] text-zinc-600">결론이 갈리는 사실만 골라 묻습니다. 고객 답을 칸에 넣으면 조건으로 읽어 같은 규칙으로 다시 판정하고, 무엇이 바뀌어 결론이 달라졌는지 카드 위에 보여 줍니다.</p>
        <div className="mt-3">
          <Flow
            steps={[
              { title: "결론이 갈리는 사실만 질문", sub: "예: 갱신청구권 행사냐, 합의 재계약이냐", tone: "code" },
              { title: "고객 답을 칸에 입력", sub: "선택지·날짜·미확인, 문장 그대로도 가능", tone: "human" },
              { title: "Liner가 조건으로 읽기", sub: "답 칸 → 판정 조건", tone: "liner" },
              { title: "다시 판정 + 바뀐 점 표시", sub: "담보 (없음) → 서울·아파트 아님 / 불가 → 가능", tone: "code" },
            ]}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Mark kind="ok">엔진이 묻는 질문 58종 칸 구조 모두 점검</Mark>
          <Mark kind="ok">나눈 칸의 답이 조건으로 읽히는지 실제 호출로 확인</Mark>
          <Mark kind="ok">답 안 한 조건이 결론을 바꿀 수 있으면 &lsquo;가능&rsquo; 대신 다시 질문</Mark>
        </div>
        <More>
          <p>한 질문에 사실이 여럿이면 칸을 나눴습니다(예: 담보 소재지 / 아파트 여부, 만기일 / 현재 대출금액 / 늘리려는 금액). 나눈 칸의 답이 조건으로 제대로 읽히는지 실제 Liner 호출로 확인했고, 10칸짜리 사례도 포함했습니다.</p>
          <p>이 점검에서 찾은 문제 3건을 고쳤습니다. ① 답하지 않은 담보 지역이 결론을 바꿀 수 있는데 &lsquo;가능&rsquo;을 내던 경로는 먼저 되묻도록 바꿨습니다. ② 예외 사유를 모두 &ldquo;없음&rdquo;으로 답해도 읽히지 않던 문제는 조건으로 반영했습니다. ③ 기준을 묻는 질문은 답을 다 해도 &lsquo;본점 문의&rsquo;에 머물렀는데, 이제 답한 조건으로 판정합니다.</p>
          <p>저장된 평가 결과를 다시 판정해 보니, 의도한 1건(지역을 모르면 되묻기) 말고는 판정이 바뀌지 않았습니다. 다만 이 대화형 흐름 전체를 대량으로 평가하지는 않았습니다.</p>
        </More>
      </section>

      <section id="audit" className="mt-10 scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-indigo-600">제출 전 Codex(AI) 독립 검토 (11.23, 2회)</p>
        <h2 className="mt-1 text-[18px] font-bold text-zinc-900">안 되는 대출이 &lsquo;가능&rsquo;으로 나올 수 있던 드문 경로 11곳을 찾아 막았습니다</h2>
        <p className="mt-1 text-[14px] text-zinc-600">Codex가 규칙 코드를 독립적으로 읽고 위험한 조합을 찾았습니다. 지적마다 규칙 엔진에 직접 넣어 실제로 재현되는지 확인한 뒤, 그 질문만이 아니라 같은 유형 전체를 막는 일반 규칙으로 고쳤습니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Stat value="11곳" label="찾아서 막은 경로" sub="1차 5 · 2차 6" tone="green" />
          <Stat value="3,497건" label="저장된 평가 다시 판정" sub="Liner $0 · 주요 세트 판정 그대로" />
          <Stat value="518개" label="자동 테스트 통과" sub="막은 경로마다 테스트 추가" />
        </div>
        <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {(
            [
              ["→ 불가 · 인정 기간 축소", "rose", "다주택자가 실거주 의무 예외를 내세움 · 이사하며 연장하는데 DSR 초과 · 상가 임대사업용인데 세대 2주택 + 주택 수 확인 동의 거부 · 법인 주택 보유 조회는 안 되지만 다주택으로 확인됨 · 지난 만기 전에 끝난 임대차 예외 · 4.2 이후 등록임대 계약은 최대 2년만 인정"],
              ["→ 고객 확인 필요", "amber", "연장인지 신규인지 모름 · 최초 임대차계약일 모름(한도 2억원 여부) · 만기일·갱신일을 '4월'로만 앎(4.16 경계) · DSR이 기준을 넘는데 전셋집 소재지 모름"],
              ["→ 심사위 상정", "zinc", "증액 연장에 '불가피한 비거주' 예외를 내세움"],
            ] as const
          ).map(([to, tone, what]) => (
            <li key={to} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:items-baseline">
              <p className={`text-[14px] font-bold ${tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-zinc-700"}`}>
                <span className="text-[12px] font-medium text-zinc-400">가능 </span>
                {to}
              </p>
              <p className="text-[13px] leading-relaxed text-zinc-600">{what}</p>
            </li>
          ))}
        </ul>
        <More>
          <p>저장된 평가 결과 3,497건을 조건 추출은 그대로 두고 판정만 다시 돌렸습니다. 테스트 질문 45개·외부 출제·현장 질문·처음 보는 질문의 판정은 하나도 바뀌지 않았습니다. 바뀐 것은 개발용 질문 3개입니다: 1개는 정답이 됐고, 1개는 &lsquo;조건 충족 시 가능&rsquo;에서 &lsquo;고객 확인 필요&rsquo;로 바뀌었고, 1개는 &lsquo;불가&rsquo;가 됐습니다. 마지막 1개는 고객이 &ldquo;1채임을 입증&rdquo;한다고 했는데 조건 추출이 주택 수를 2로 잘못 읽은 문항이라 오답이지만, 위험한 쪽이 아니라 엄격한 쪽 오류입니다.</p>
          <p>한계: 검토할 때마다 더 드문 조합이 나왔으므로, 남은 경로가 없다고 말하지 않습니다. 판정은 추출된 조건이 같으면 항상 같지만, 조건 추출(LLM)은 같은 질문을 가끔 다르게 읽습니다. 그래서 결론을 뒤집을 수 있는 사실이 빠졌거나 불확실하면 &lsquo;가능&rsquo; 대신 먼저 묻도록 만들었습니다.</p>
        </More>
      </section>

      <section id="next" className="mt-10 scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-indigo-600">현장 피드백으로 정한 다음 단계</p>
        <h2 className="mt-1 text-[18px] font-bold text-zinc-900">창구 서류 업무까지: 주소 → 등기부등본, 소득 서류 스캔</h2>
        <p className="mt-1 text-[14px] text-zinc-600">들어갈 자리는 이미 있습니다. 서류에서 읽은 값도 고객 말에서 뽑은 값과 같은 조건 칸에 들어가 같은 규칙으로 판정됩니다.</p>
        <div className="mt-3">
          <Flow
            steps={[
              { title: "서류에서 읽기", sub: "등기부: 소재지·아파트·소유자·지분 / 소득 서류", tone: "liner" },
              { title: "직원이 확인", sub: "'조건 수정' 화면에서 확인·수정", tone: "human" },
              { title: "코드가 판정", sub: "지금과 같은 규칙", tone: "code" },
            ]}
          />
        </div>
        <More label="왜 지금은 만들지 않았나">
          <p>등기부등본 발급은 공개 API가 없어 유료 대행 계약과 발급 수수료가 필요하고, 실제 주소·서류는 실제 개인정보입니다. 또 결론을 가르는 세대 전체 주택 수는 등기부 한 장으로 알 수 없습니다(주택소유확인 같은 별도 조회 필요).</p>
          <p>단계: ① 가상 서류로 조건 채우기 → ② 은행 내부망의 등기 조회·주택소유확인·서류 스캔 시스템과 연결. 서류에서 읽은 값도 직원이 확인한 뒤에만 판정에 씁니다.</p>
        </More>
      </section>

      <NumbersAtAGlance />

      <p className="mt-6 text-[13px] leading-relaxed text-zinc-500">
        개발 문서에 나오는 &lsquo;KB&rsquo;는 Knowledge Base(지식 베이스)의 약자로, 화면에서는 &lsquo;판정 근거 자료 v1·v2&rsquo;라고 부릅니다. 은행 이름이 아닙니다.
      </p>
    </main>
  );
}
