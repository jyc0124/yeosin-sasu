// Liner와 만든 이야기: 심사위원이 가장 먼저 보는 화면. Liner의 특징이 에이전트를 어떻게 낳고 키웠는지 5막으로 보여 준다.
// 3초 안에 보이게: 막마다 제목 · 그림 하나 · 한 줄, 문단은 '자세히'로 접는다.
// 숫자는 모두 다른 화면·문서에 이미 있는 실측값이다(docs/PITCH.md 'Liner 서사', docs/PROPOSAL.md §3~5, /eval).
import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "../_components/Header";
import { Icon } from "../_components/Icon";
import { BeforeAfter, Flow, Mark, More, StackBar, Stat } from "../_components/Viz";
import { WhyStart, WinWin } from "../_components/Why";

export const metadata = { title: "Liner와 만든 이야기 · 여신 사수" };

function Bars({ rows }: { rows: [string, number, boolean?][] }) {
  return (
    <div className="space-y-1.5">
      {rows.map(([t, v, ours]) => (
        <div key={t} className="flex items-center gap-2">
          <span className={`w-36 shrink-0 text-[13px] ${ours ? "font-bold text-zinc-900" : "text-zinc-600"}`}>{t}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full rounded-full ${ours ? "bg-indigo-600" : "bg-zinc-300"}`} style={{ width: `${v}%` }} />
          </div>
          <span className={`w-14 shrink-0 text-right text-[14px] font-bold tabular-nums ${ours ? "text-indigo-700" : "text-zinc-500"}`}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

type Act = { no: string; when: string; title: string; one: string; apis: string[]; visual: ReactNode; more: string[]; link?: { href: string; label: string } };

const ACTS: Act[] = [
  {
    no: "1막",
    when: "출발",
    title: "창구의 답은 보도자료 밖에 있었다",
    one: "LLM에게 맡겨 보니, 정부 발표 자료를 다 줘도 열에 셋은 틀렸습니다.",
    apis: [],
    visual: (
      <Bars
        rows={[
          ["LLM에게 질문만", 24.4],
          ["LLM + 정부 발표 자료", 71.1],
          ["여신 사수", 100, true],
        ]}
      />
    ),
    more: [
      "창구 직원은 규정을 찾는 것보다 '이 고객에게 어느 규정이 언제부터 적용되나'에서 막힙니다. 그 답은 보도자료·FAQ가 아니라 나중에 나온 행정지도에 있는 경우가 많았습니다.",
      "필요한 것은 더 똑똑한 답이 아니라, 최신 문서를 찾아오고 틀리게 단정하지 않는 구조였습니다. (테스트 질문 45개 기준)",
    ],
  },
  {
    no: "2막",
    when: "11.13 탄생",
    title: "$0.13짜리 Liner 실험이 뼈대를 정했다",
    one: "고객 상황만으로 보도자료에 없던 8.28 행정지도를 찾은 건 Liner였고, 그걸 API로 매일 돌릴 수 있습니다. 강점과 약점도 이때 함께 봤습니다.",
    apis: ["Search Agent", "Search API", "MCP"],
    visual: (
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="flex flex-col items-start gap-1.5">
          <Mark kind="ok">찾기에 강함 · 출처 붙은 최신 문서, 1,000회 $1</Mark>
          <Mark kind="bad">단정하기에 약함 · 요약이 실행마다 다름</Mark>
        </div>
        <span className="text-center text-[20px] font-bold text-zinc-300">→</span>
        <div className="rounded-xl bg-indigo-600 px-4 py-3 text-center text-white">
          <p className="text-[15px] font-bold">찾기·읽기는 Liner</p>
          <p className="text-[15px] font-bold">결론은 코드</p>
        </div>
      </div>
    ),
    more: [
      "Liner Search Agent에 창구 질문을 그대로 던지자, 참조 목록에 보도자료·FAQ 어디에도 없던 8.28 행정지도가 있었습니다. 전세대출 경과조치가 바로 그 문서에 있었습니다.",
      "창구는 문서 이름을 모르고 고객 상황만 압니다. 같은 창구 질문으로 다시 비교했을 때(11.22) 행정지도를 찾은 것은 Liner(1/3)뿐이었고, ChatGPT 웹 검색·일반 웹 검색은 0/3이었습니다. 문서 이름을 알면 ChatGPT도 찾습니다. 차이는 처음 찾는 힘과, 그걸 API로 매일 자동 감시할 수 있다는 데(검색 1,000회 $1) 있습니다.",
      "같은 실험에서 Search Agent가 같은 질문에도 실행마다 다르게 답하고 원문에 없는 내용을 단정하는 것을 봤습니다. 그래서 요약은 판정에 쓰지 않고 원문과 대조하기로 했습니다.",
      "실험 전체 비용 $0.13(검색 28회 + Search Agent 4회). 기록: data/liner_spike/REPORT.md",
    ],
    link: { href: "/eval", label: "Liner 특성 → 설계 표" },
  },
  {
    no: "3막",
    when: "성장",
    title: "Liner가 앞·뒤·바깥을 맡다",
    one: "엔진은 그대로 두고 Liner가 찾은 문서 한 건만 넣었더니 정답률이 이렇게 바뀌었습니다.",
    apis: ["Router", "Search API", "MCP"],
    visual: <BeforeAfter label="최신 정보가 필요한 질문 정답률" before={33} after={100} beforeLabel="문서 전" afterLabel="문서 후" />,
    more: [
      "앞(읽기): Liner Router가 고객 말에서 판정 조건을 뽑습니다. 그 조건으로 테스트 45/45, 표현 바꾼 질문 28/28, 추출 오류로 틀린 판정 0.",
      "바깥(찾기): 그 발견을 정책 감시로 만들어 버튼 한 번으로 다시 돌립니다(API라 매일 돌릴 수 있음). 원본 해시와 인용 18/18을 대조하고, 담당자가 승인해야 반영됩니다(1회 약 $0.008).",
      "본점 업무까지: 정부 자료에 기준이 없는 쟁점은 외부기관에 묻기 전에 Liner로 공식 출처부터 찾습니다(1건 2~3초, $0.002).",
    ],
    link: { href: "/watch", label: "정책 감시에서 재현하기" },
  },
  {
    no: "4막",
    when: "11.21 ~ 11.24 진화",
    title: "현장이 묻고, Liner로 답을 넓혔다",
    one: "현직 직원의 질문과 검토를 받을 때마다 Liner로 근거를 찾아 넓히고, 많이 시험했습니다.",
    apis: ["Search Agent", "Search API", "Router 스트리밍", "credits API"],
    visual: (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value="577" label="시험한 질문" />
        <Stat value="0" label="위험 오류" sub="새 상황 질문 41개" tone="green" />
        <Stat value="193" label="공식 출처" sub="현장 쟁점 9개 조사" />
        <Stat value="8건" label="보증기관 문서" sub="검토 다음 날 연결" />
      </div>
    ),
    more: [
      "현장 질문 쟁점 9개를 기관별로 조사해 참조 454건 중 공식 출처 193건을 걸렀고, 여기서 '모르면 말하지 않는' 범위가 정해졌습니다.",
      "credits API로 사용액을 바로 확인하며, 평가마다 정한 비용 상한 안에서 577문항을 반복 시험했습니다. 조건을 읽는 대로 보여 줘 첫 반응은 약 2.6초입니다.",
      "현직자 검토를 받은 다음 날, Liner 검색($0.018)과 공식 사이트 확인으로 보증기관 공식 문서 8건을 찾아 창구에 연결하고 개정 감시까지 붙였습니다.",
      "검토 의견은 16개로 나눠 반영 8 · 일부 5 · 못 함 3을 이유와 함께 직원에게 돌려보냈고, 11.24 재확인에서 \"사용성이 많이 좋아졌다\"는 답을 받았습니다. 남은 지적 1건은 같은 날 고쳤습니다.",
      "부족한 부분(보증기관·은행별 기준)은 엔진이 아니라 공개되지 않은 자료에서 옵니다. 현직 직원들은 \"은행 내규·보증기관 자료가 들어가면 단계적으로 테스트하면서 실무에 사용해 볼 만하다\"고 했고, 은행 보안 문제도 함께 해결하며 진행해야 한다고 했습니다.",
      "제출 전(11.23)에는 Codex에게 규칙 코드를 두 번 독립 검토받아, 안 되는 대출이 '가능'으로 나올 수 있던 드문 경로 11곳을 막았습니다. 저장된 평가 3,497건은 Liner를 다시 부르지 않고 판정만 다시 돌려 확인했습니다($0).",
    ],
    link: { href: "/review#numbers", label: "질문 숫자 한눈에 보기" },
  },
  {
    no: "5막",
    when: "지금, 그리고 다음",
    title: "고객 상황만 말해도, 그 행정지도 조항으로 답한다",
    one: "같은 고객 질문 6개를, 문서 이름 없이 고객 상황만으로 물었을 때:",
    apis: [],
    visual: (
      <div className="space-y-3">
        <StackBar
          name="ChatGPT (웹 검색 켬)"
          segs={[
            { n: 2, label: "맞음", tone: "ok" },
            { n: 3, label: "부분", tone: "part" },
            { n: 1, label: "위험 오답", tone: "bad" },
          ]}
          note="8.28 행정지도 인용 0/6"
        />
        <StackBar
          name="여신 사수"
          strong
          segs={[
            { n: 5, label: "맞음", tone: "ok" },
            { n: 1, label: "되물음", tone: "none" },
            { n: 0, label: "위험", tone: "bad" },
          ]}
          note="8.28 행정지도 근거 5/6"
        />
      </div>
    ),
    more: [
      "창구 직원은 문서 이름을 모릅니다. 고객 질문만으로 그 문서를 찾아온 것은 Liner였고, 여신 사수는 그 원문을 대조·승인해 규칙으로 넣어 두었습니다. (11.22, 각 1회)",
      "다음은 은행 내규와 보증기관 지침 전문입니다. 같은 흐름(Liner로 찾고 → 원문과 대조하고 → 사람이 승인하고 → 코드가 판정)으로 넓힙니다.",
      "판정의 중심인 정부 규제는 모든 은행에 같고, 은행마다 다른 서류·기간·절차는 내규 파일로 분리했습니다(실제 은행에 넣을 때는 규칙의 일부 수치를 그 은행 기준으로 맞추고 다시 검증). 전국 은행 점포 5,523곳('25.9월말, 금융위)이 같은 규제를 같은 날 적용해야 합니다. 창구 판정 1건 Liner 비용은 약 $0.026입니다.",
    ],
    link: { href: "/", label: "창구 판정 해 보기" },
  },
];

export default function StoryPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Header title="Liner와 만든 이야기" subtitle="Liner의 특징이 이 에이전트를 어떻게 낳고 키웠는지 5막으로 정리했습니다. 숫자는 모두 실측값입니다." />

      {/* 한 줄 */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <p className="text-[13px] font-semibold tracking-wide text-indigo-100">한 줄로</p>
        <p className="mt-2 text-[28px] font-bold leading-snug tracking-tight sm:text-[34px]">
          Liner가 찾고, 사람이 확인하고,
          <br />
          코드가 판정한다.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["33% → 100%", "문서 한 건의 효과"],
              ["위험 오류 0", "새 상황 질문 41개"],
              ["0/6 ↔ 5/6", "고객 질문만으로 행정지도 근거"],
              ["$0.026", "판정 1건 Liner 비용"],
            ] as const
          ).map(([v, l]) => (
            <div key={v} className="rounded-xl bg-white/10 px-3 py-3 ring-1 ring-white/20">
              <p className="text-[20px] font-bold tracking-tight">{v}</p>
              <p className="mt-0.5 text-[12px] text-indigo-100">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 만든 이유: 지점 직원의 고충 → Liner 강점에 맞춘 설계 */}
      <section className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
        <WhyStart />
      </section>

      {/* 구조 한 장 */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="mb-3 text-[13px] font-semibold text-zinc-500">에이전트의 구조</p>
        <Flow
          steps={[
            { title: "Liner가 찾고", sub: "새 정부 문서 · 고객 말 읽기", tone: "liner" },
            { title: "사람이 확인하고", sub: "원문 대조 · 본점 담당자 승인", tone: "human" },
            { title: "코드가 판정한다", sub: "같은 조건 = 같은 판정", tone: "code" },
          ]}
        />
      </section>

      {/* 5막 한눈에 */}
      <nav className="mt-6 grid grid-cols-5 gap-1.5">
        {ACTS.map((a, i) => (
          <a key={a.no} href={`#act${i + 1}`} className="rounded-xl bg-white px-2 py-2.5 text-center ring-1 ring-zinc-200 transition hover:ring-indigo-300">
            <p className="text-[13px] font-bold text-indigo-600">{a.no}</p>
            <p className="mt-0.5 hidden text-[12px] leading-tight text-zinc-500 sm:block">{a.when}</p>
          </a>
        ))}
      </nav>

      {/* 5막 */}
      <ol className="relative mt-6 space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-px before:bg-indigo-200">
        {ACTS.map((a, i) => (
          <li key={a.no} id={`act${i + 1}`} className="relative scroll-mt-6 pl-14">
            <span className="absolute top-0 left-0 grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-[13px] font-bold text-white ring-4 ring-white">{a.no}</span>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold text-indigo-600">{a.when}</span>
                {a.apis.map((x) => (
                  <span key={x} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
                    Liner {x}
                  </span>
                ))}
              </div>
              <h2 className="mt-1 text-[20px] font-bold leading-snug tracking-tight text-zinc-900">{a.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-zinc-600">{a.one}</p>
              <div className="mt-4">{a.visual}</div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4">
                <More>
                  {a.more.map((m) => (
                    <p key={m}>{m}</p>
                  ))}
                </More>
                {a.link && (
                  <Link href={a.link.href} className="mt-2 text-[13px] font-medium text-indigo-600 hover:underline">
                    {a.link.label} →
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Liner가 맡은 일 */}
      <section className="mt-10">
        <h2 className="text-[18px] font-semibold text-zinc-900">그래서 지금, Liner가 맡은 일</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["desk", "읽기", "Router", "고객 말 → 판정 조건 · 첫 반응 약 2.6초"],
              ["radar", "찾기", "Search API · MCP", "정책 감시 · 본점 쟁점 · 보증기관 자료"],
              ["chart", "관리", "credits API", "평가마다 비용 상한 · 전체 $123.53"],
            ] as const
          ).map(([icon, t, api, d]) => (
            <div key={t} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100">
                  <Icon name={icon} className="h-4 w-4 text-indigo-600" />
                </span>
                <span className="text-[17px] font-bold text-zinc-900">{t}</span>
                <span className="text-[12px] font-medium text-indigo-600">{api}</span>
              </p>
              <p className="mt-2 text-[14px] leading-snug text-zinc-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-[14px] font-semibold text-white">결론(가능·불가 등)은 Liner가 아니라 규칙 엔진(코드)이 내립니다</p>
        <More label="한계도 설계에 넣었습니다">
          <p>Liner Search Agent의 요약은 실행마다 달랐고, 공개되지 않은 자료(SGI 심사 기준, 은행 내규)는 검색으로도 찾을 수 없었습니다. 그래서 Liner가 찾은 것은 원문과 대조하고 사람이 승인한 뒤에만 판정에 씁니다.</p>
        </More>
      </section>

      <section className="mt-8">
        <WinWin />
      </section>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["/watch", "정책 감시에서 재현", "Liner가 행정지도를 찾아 판정이 바뀌는 과정"],
            ["/review", "심사 안내", "왜 만들었나 · Liner의 일과 비용 · 질문 숫자"],
            ["/eval", "평가 결과", "ChatGPT 비교 · 처음 보는 질문"],
          ] as const
        ).map(([href, t, d]) => (
          <Link key={href} href={href} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 transition hover:bg-indigo-50">
            <p className="text-[15px] font-semibold text-indigo-700">{t} →</p>
            <p className="mt-1 text-[13px] text-indigo-900/60">{d}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
