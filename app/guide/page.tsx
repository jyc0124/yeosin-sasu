// 사용 안내: 은행 지점 직원이 1분 안에 "무엇을 도와주는 도구인지" 알 수 있게 한다.
import Link from "next/link";
import { Header } from "../_components/Header";
import { Icon } from "../_components/Icon";
import { VERDICT_STYLE, verdictLabel } from "../_components/labels";
import type { VerdictCode } from "@/lib/rules/types";
import testset from "@/data/eval/testset.json";
import { QUESTION_MAP } from "../_components/questionMap";
import { FIELD_BY_ID } from "../_components/fieldExamples";
import { JudgeNote } from "../_components/viewStore";

export const metadata = { title: "사용 안내 · 여신 사수" };

const MOMENTS: { icon: string; tone: string; when: string; get: string; href: string; cta: string }[] = [
  {
    icon: "desk",
    tone: "bg-indigo-50 text-indigo-600",
    when: "고객이 “이 대출 연장(신규) 되나요?”라고 물을 때",
    get: "가능·불가·조건 충족 시 가능 같은 결론과 그 근거가 된 정부 발표 자료 문장, 받아야 할 서류, 고객 안내 문구를 한 화면에 보여 줍니다. 판단에 필요한 사실이 빠졌으면 무엇을 고객에게 물어볼지 먼저 알려 줍니다.",
    href: "/",
    cta: "창구 판정",
  },
  {
    icon: "building",
    tone: "bg-violet-50 text-violet-600",
    when: "지점이 답하면 안 되는 건일 때 (지점 → 본점)",
    get: "여신심사위 사항이나 정부 발표 자료에 기준이 없는 쟁점은 확답하지 않고 ‘본점 질의’로 넘깁니다. 고객 상황·근거 조항·쟁점이 채워진 질의서가 자동으로 만들어지고, 본점이 승인한 해석은 다음에 같은 질문이 오면 바로 보입니다. 정부 발표 자료에 기준이 없는 부분은 판정 화면 오른쪽에 본점의 Liner 조사 기록과 고객에게 할 말이 함께 나옵니다.",
    href: "/inquiries",
    cta: "내 질의",
  },
  {
    icon: "radar",
    tone: "bg-sky-50 text-sky-600",
    when: "정부가 후속 지침을 냈을 때 (본점 담당자)",
    get: "본점 여신기획 담당자가 정부 발표 직후 등 필요할 때 버튼으로 실행합니다(매일 아침 자동 실행은 다음 단계). Liner로 후속 행정지도·고시를 찾아 원본과 대조하고, 승인하면 모든 지점의 판정 기준이 함께 바뀝니다. 지점 직원은 따로 할 일이 없습니다. 예: 8.28 행정지도의 전세대출 경과조치는 보도자료·FAQ에 없었습니다. 보증기관 공개 자료가 개정됐는지도 같은 화면에서 확인합니다.",
    href: "/watch",
    cta: "정책 감시",
  },
  {
    icon: "building",
    tone: "bg-emerald-50 text-emerald-600",
    when: "보증기관(HF·HUG·SGI) 기준을 물을 때",
    get: "정부 규제 판정과 별개로, 보증기관이 공개한 업무지침·상품 안내의 원문 발췌를 문서 기준일·공식 링크와 함께 보여 줍니다. 판정에는 쓰지 않으며, 기관을 모르면 기관부터 고르게 합니다. SGI는 공개 기준이 없어 상품설명서로 확인하라고 안내합니다.",
    href: "/?q=HUG%20%EC%A0%84%EC%84%B8%EB%8C%80%EC%B6%9C%EC%9D%84%20%EC%97%B0%EC%9E%A5%ED%95%98%EB%A9%B4%EC%84%9C%20%EB%B3%B4%EC%A6%9D%EA%B8%88%EB%A7%8C%20%EB%8A%98%EA%B3%A0%20%EB%8C%80%EC%B6%9C%EA%B8%88%EC%9D%80%20%EA%B7%B8%EB%8C%80%EB%A1%9C%EC%9E%85%EB%8B%88%EB%8B%A4.%20%EC%A6%9D%EC%95%A1%20%EB%B3%B4%EC%A6%9D%EA%B8%88%20%EB%82%A9%EB%B6%80%20%EC%A6%9D%EB%B9%99%EB%8F%84%20%EB%B0%9B%EC%95%84%EC%95%BC%20%ED%95%98%EB%82%98%EC%9A%94%3F%20HF%C2%B7SGI%EB%8F%84%20%EA%B0%99%EC%9D%80%20%EA%B8%B0%EC%A4%80%EC%9D%B8%EC%A7%80%20%EA%B5%AC%EB%B6%84%ED%95%B4%20%EC%A3%BC%EC%84%B8%EC%9A%94.",
    cta: "예시 보기",
  },
  {
    icon: "shield",
    tone: "bg-rose-50 text-rose-600",
    when: "고객이 규제를 피할 방법을 물을 때",
    get: "조기 연장·명의 이전 같은 회피 방법은 안내하지 않습니다. 대신 어떤 기준(만기일 등)으로 판단하는지만 알려 줍니다.",
    href: "/?q=%EC%A0%84%EC%84%B8%20%EB%A7%8C%EA%B8%B0%EA%B0%80%20%EB%82%B4%EB%85%84%201/5%EC%9D%B8%EB%8D%B0%2012%EC%9B%94%EC%97%90%20%EB%AF%B8%EB%A6%AC%20%EC%97%B0%EC%9E%A5%ED%95%98%EB%A9%B4%20%EA%B7%9C%EC%A0%9C%20%EC%95%88%20%EA%B1%B8%EB%A6%AC%EC%A3%A0%3F",
    cta: "예시 보기",
  },
];

const STEPS = [
  ["질문을 그대로 적기", "고객에게 들은 말을 메모하듯 적습니다. 이름·연락처 같은 개인정보는 넣지 마세요."],
  ["확인 항목에 한 번에 답하기", "결론이 갈리는 사실(세입자 계약 종류, 만기일 등)이 빠졌으면 확인할 항목을 보여 줍니다. 항목마다 고르거나 적고(고객도 모르면 ‘미확인’), [답변 반영하고 판정]으로 한 번에 다시 판정합니다."],
  ["판정 카드 읽기", "맨 위 결론(색과 한 단어) → 확인된 내용 → 고객에게 확인할 내용 → 본점·기관 확인이 필요한 내용 → 할 일 순서로 보면 됩니다. 결론에 전제가 붙으면 ‘전제’로 따로 표시합니다. 근거와 판정 과정은 ‘왜 이렇게 판단했나요?’를 누르면 펼쳐집니다."],
  ["잘못 읽힌 조건은 고치기", "‘이번 판단에 사용한 조건’에서 [조건 수정]을 누르고 틀린 항목만 바꾸면 다시 판정합니다. 이전 결과와 무엇이 달라졌는지 함께 보여 줍니다."],
  ["확답이 안 되면 본점으로", "심사위 상정·본점 문의 판정이면 카드 아래 [본점 질의서 작성]을, 확정 판정이 고객 상황과 맞지 않아 보이면 [본점에 재확인 요청]을 누릅니다."],
  ["본점이 이미 답한 쟁점이면 그대로", "같은 쟁점의 본점 해석이 있으면 판정 카드 아래에 함께 나옵니다. 그 안내 문구대로 처리하고, 내 질의 → 본점 해석 FAQ에서 키워드로 찾아볼 수도 있습니다."],
];

const VERDICTS: VerdictCode[] = ["허용", "조건부", "불허", "역질문", "심사위", "보류", "내부지침", "안내"];

// 테스트셋 45문항(정답 있음) + 현장 질문 예시(현재 판정 결과)
const BY_ID = new Map<string, { question: string; expected: string }>([
  ...testset.cases.map((c) => [c.id, c] as [string, { question: string; expected: string }]),
  ...[...FIELD_BY_ID.values()].map((e) => [e.id, { question: e.question, expected: e.expect }] as [string, { question: string; expected: string }]),
]);
const TOTAL = QUESTION_MAP.flatMap((p) => p.groups.flatMap((g) => g.items)).length;


export default function GuidePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Header subtitle="은행 지점 창구 직원이 대출 규제 질문(2026.8.13 전세대출·2026.4.1 만기연장)에 근거를 갖고 답하도록 돕는 도구입니다. 두 대책에 관한 질문이면 아래 예시에 없어도 자유롭게 물어볼 수 있습니다. 1분이면 다 읽습니다." />
      <JudgeNote className="mb-6">이 화면은 지점 직원용 사용법만 담았습니다. Liner가 하는 일과 비용, 후속 문서로 결론이 바뀐 과정(v1 → v2), 질문 숫자는 <Link href="/review" className="font-semibold underline">심사 안내</Link>에 있습니다.</JudgeNote>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
        <p className="text-[13px] font-semibold text-indigo-600">한 줄로</p>
        <p className="mt-1 text-[22px] font-bold leading-snug tracking-tight text-zinc-900">
          고객이 &ldquo;이 대출 되나요?&rdquo;라고 물을 때,
          <br className="hidden sm:block" /> 정부 발표 자료 근거와 함께 <span className="text-indigo-600">10초 안팎</span>에 판정을 보여 줍니다.
        </p>
      </section>

      <p className="mt-3 text-right text-[14px]">
        <a href="#questions" className="font-medium text-indigo-600 hover:underline">
          예시 질문 보기 ({TOTAL}개, 이 밖의 질문도 가능) ↓
        </a>
      </p>

      <h2 className="mt-10 text-[18px] font-semibold text-zinc-900">이럴 때 쓰세요</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {MOMENTS.map((m) => (
          <li key={m.when} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${m.tone}`}>
                <Icon name={m.icon} className="h-[18px] w-[18px]" />
              </span>
              <p className="text-[16px] font-semibold leading-snug text-zinc-900">
                {/* 괄호 부분(누가 쓰는지)은 다음 줄에 작게 */}
                {m.when.split(" (")[0]}
                {m.when.includes(" (") && <span className="mt-0.5 block text-[13px] font-medium text-zinc-500">({m.when.split(" (")[1]}</span>}
              </p>
            </div>
            <p className="mt-3 flex-1 text-[14px] leading-relaxed text-zinc-600">{m.get}</p>
            <Link href={m.href} className="mt-3 text-[14px] font-medium text-indigo-600 hover:underline">
              {m.cta} →
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-[18px] font-semibold text-zinc-900">어떤 질문까지 되나요?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-[13px] font-semibold text-indigo-600">범위</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900">두 대책 안의 질문이면 자유롭게</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">
              모든 대출 질문에 답하는 도구가 아닙니다. 지금 창구 혼선이 가장 큰 <b>8.13 비거주 1주택자 전세대출 제한</b>과 <b>4.1 다주택자 주담대 만기연장 제한</b> 두 가지를 깊게 다룹니다. 그 밖의 질문은 &lsquo;범위 밖&rsquo;으로 알려 줍니다.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-[13px] font-semibold text-indigo-600">예시에 없어도 됩니다</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900">고객 말 그대로 적으면 같은 규칙으로 판정</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">
              첫 화면과 아래 예시는 판정이 갈리는 대표 상황일 뿐입니다. 표현이 달라도, 처음 보는 상황이어도 같은 규칙으로 판정하고, 확실하지 않으면 확답하지 않고 고객 확인이나 본점 확인으로 넘깁니다.
            </p>
          </div>
        </div>
      </section>

      <h2 className="mt-10 text-[18px] font-semibold text-zinc-900">쓰는 법 (창구 판정)</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-[13px] font-semibold text-white">{i + 1}</span>
            <p className="mt-2 text-[15px] font-semibold text-zinc-900">{t}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{d}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-[18px] font-semibold text-zinc-900">판정 결과 읽는 법</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-zinc-50 text-[13px] text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">결과</th>
              <th className="px-4 py-2.5 font-medium">뜻</th>
              <th className="px-4 py-2.5 font-medium">창구에서 할 일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {VERDICTS.map((v) => (
              <tr key={v}>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ${VERDICT_STYLE[v].badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_STYLE[v].dot}`} />
                    {VERDICT_STYLE[v].label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-800">{VERDICT_STYLE[v].meaning}</td>
                <td className="px-4 py-2.5 text-zinc-600">{VERDICT_STYLE[v].action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-[16px] font-semibold text-zinc-900">다루는 범위</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-zinc-700">
            <li>8.13 대책: 비거주 1주택자 전세대출 제한(2027.1.1 시행)과 예외</li>
            <li>4.1 관리방안: 다주택자 수도권·규제지역 아파트 주담대 만기연장 제한과 예외</li>
            <li>두 대책의 시행일·경과조치·관련 정책 질문</li>
            <li>보증기관(HF·HUG) 공개 자료: 판정과 별개로 원문 발췌만 참고로 연결</li>
          </ul>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-[16px] font-semibold text-zinc-900">하지 않는 것</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-zinc-700">
            <li>대출 승인·거절의 최종 결정(은행 심사 절차를 대신하지 않음)</li>
            <li>금리·한도 계산, 위 두 대책 밖의 상품 안내</li>
            <li>보증기관 심사 결과 판단(보증 승인 여부는 보증기관 심사를 따름)</li>
            <li>규제를 피하는 방법 안내</li>
            <li>정부 발표 자료에 없는 내용 추측 — 모르면 &lsquo;본점 문의&rsquo;로 표시</li>
          </ul>
        </section>
      </div>

      <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-[16px] font-semibold text-zinc-900">화면에 나오는 말</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[9rem_1fr]">
          <dt className="font-semibold text-zinc-800">판정 근거 자료 v1·v2</dt>
          <dd className="leading-relaxed text-zinc-600">
            판정에 쓰는 정부 발표 자료 묶음의 판(版)입니다. v1은 보도자료·FAQ만, v2는 Liner가 찾은 8.28 행정지도(와 10.20 인구감소지역 재지정)를 더한 것입니다최신 지침이 반영되면 왼쪽 아래에 &lsquo;최신 정부 지침 반영&rsquo;으로 표시됩니다.
          </dd>
          <dt className="font-semibold text-zinc-800">근거 번호 (Fact ID)</dt>
          <dd className="leading-relaxed text-zinc-600">F813-01처럼 정부 발표 자료 문장마다 붙인 번호입니다. 판정 카드의 번호를 누르면 원본 파일의 해당 구절을 볼 수 있습니다.</dd>
          <dt className="font-semibold text-zinc-800">가상 A은행 지침</dt>
          <dd className="leading-relaxed text-zinc-600">정부가 &ldquo;금융회사가 판단하라&rdquo;고 맡긴 부분을 채우려고 만든 가상 내부 기준입니다. 실제 어느 은행의 기준도 아닙니다.{" "}
            <Link href="/bank" className="font-medium text-indigo-600 hover:underline">
              지침 전문 보기 →
            </Link></dd>
          <dt className="font-semibold text-zinc-800">보증기관 확인 자료</dt>
          <dd className="leading-relaxed text-zinc-600">전세대출에 보증서를 내 주는 기관(HF 한국주택금융공사·HUG 주택도시보증공사·SGI서울보증)이 공개한 기준의 원문 발췌입니다. 판정에는 쓰지 않고, 문서 기준일과 공식 링크를 함께 보여 줍니다.</dd>
          <dt className="font-semibold text-zinc-800">전제</dt>
          <dd className="leading-relaxed text-zinc-600">결론이 어떤 사실을 가정하고 나왔는지입니다. 예: 담보 지역을 모를 때 &lsquo;수도권·규제지역 아파트라는 전제의 결론&rsquo;. 전제가 다르면 결론도 달라지니 고객에게 확인하세요.</dd>
          <dt className="font-semibold text-zinc-800">기준일</dt>
          <dd className="leading-relaxed text-zinc-600">어느 날짜 기준으로 판정할지입니다. 시행일·경과조치가 날짜로 갈리므로, 상담 날짜가 아니라면 바꿔서 판정하세요.</dd>
        </dl>
      </section>

      <section id="questions" className="mt-10 scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold text-zinc-900">예시 질문 {TOTAL}개 — 이 밖의 질문도 자유롭게 물어보세요</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
              판정이 갈리는 대표 상황 {TOTAL}가지를 업무 주제별로 모은 <b>예시</b>입니다. 누르면 그 질문으로 바로 판정합니다. 이 질문들만 되는 게 아닙니다.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
          <p className="text-[16px] font-semibold text-zinc-900">2026.8.13 전세대출·2026.4.1 만기연장에 관한 질문이면 무엇이든 그대로 적으세요</p>
          <ul className="mt-2 space-y-1 text-[14px] leading-relaxed text-zinc-700">
            <li>
              <b>고객에게 들은 말을 메모하듯</b> 적으면 됩니다. 판정에 중요한 사실은 집 위치·종류, 주택 수(배우자 포함), 살아 본 적 있는지, 만기일·계약일·신청일입니다.
            </li>
            <li>
              <b>빠진 사실은 되묻습니다.</b> 결론이 갈리는 사실이 없으면 확인할 항목을 보여 주고, 항목별로 답하면 한 번에 이어서 판정합니다. 잘못 읽힌 조건은 [조건 수정]으로 고칩니다.
            </li>
            <li>
              <b>확실하지 않으면 확답하지 않습니다.</b> 정부 발표 자료에 기준이 없거나 규칙이 다루지 않는 사실(분양권·경매 등)이 있으면 &lsquo;본점 문의&rsquo;로 표시하고 본점 질의로 넘깁니다. 두 대책 밖의 질문은 범위 밖이라고 알려 줍니다.
            </li>
          </ul>
        </div>
        <div className="mt-4 space-y-6">
          {QUESTION_MAP.map((p) => (
            <div key={p.policy}>
              <p className="mb-2 text-[13px] font-semibold text-indigo-600">{p.policy}</p>
              {p.note && <p className="-mt-1 mb-2 text-[12px] text-zinc-500">{p.note}</p>}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {p.groups.map((g) => (
                  <div key={g.title} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-[15px] font-semibold text-zinc-900">{g.title}</p>
                    <p className="text-[13px] text-zinc-500">{g.desc}</p>
                    <ul className="mt-2 divide-y divide-zinc-100">
                      {g.items.map((it) => {
                        const c = BY_ID.get(it.id);
                        if (!c) return null;
                        const v = c.expected as VerdictCode;
                        return (
                          <li key={it.id}>
                            <Link href={`/?q=${encodeURIComponent(c.question)}`} title={c.question} className="group flex items-center gap-2 py-2 text-[14px]">
                              <span className="min-w-0 flex-1">
                                <span className="block text-zinc-800 group-hover:text-indigo-700">{it.label}</span>
                                <span className="block truncate text-[12px] text-zinc-400">&ldquo;{c.question}&rdquo;</span>
                              </span>
                              {v === ("OUT" as VerdictCode) && <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold text-zinc-600 ring-1 ring-zinc-300">범위 밖</span>}
                              {VERDICT_STYLE[v] && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${VERDICT_STYLE[v].badge}`}>{verdictLabel(v)}</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-zinc-400">오른쪽 표시는 기준일 2026.11.13·판정 근거 자료 v2에서의 정답 판정입니다(현장 질문 묶음은 11.22 현재 판정 결과). 기준일이나 근거 자료 버전을 바꾸면 결과가 달라질 수 있습니다.</p>
      </section>

      <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
        해커톤용 시제품입니다. 실제 고객 정보를 넣지 말고, 실제 업무 판단은 소속 은행의 기준과 여신심사 절차를 따르세요.
      </p>

      <div className="mt-8 text-center">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm hover:bg-indigo-700">
          예시 질문으로 시작하기 →
        </Link>
      </div>
    </main>
  );
}
