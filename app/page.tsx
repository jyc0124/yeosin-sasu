import testset from "@/data/eval/testset.json";
import { FIELD_BY_ID } from "./_components/fieldExamples";
import { today } from "@/lib/rules/dates";

// 데모 녹화용 고정 기준일. 조건 추출 지시문에 기준일이 들어가 캐시 열쇠가 날짜마다 달라지므로, 재생 캐시를 만든 날짜로 고정한다.
const demoAsOf = () => (/^\d{4}-\d{2}-\d{2}$/.test(process.env.LOANDESK_DEMO_ASOF ?? "") ? process.env.LOANDESK_DEMO_ASOF : undefined);
import { Copilot, type Example } from "./_components/Copilot";

// 기본 판정 기준일(오늘, KST)이 빌드 시점에 굳지 않도록 요청마다 렌더링한다
export const dynamic = "force-dynamic";

// 데모용 예시: 판정 유형이 고르게 보이도록 고른 테스트셋 문항. featured는 첫 화면 카드로 크게 보여 준다.
const EXAMPLES: (Omit<Example, "question"> & { id: string })[] = [
  { id: "B02", label: "만기 12/20 전세대출 연장", icon: "spark", hard: "보도자료·FAQ에 답이 없음", desc: "답은 2주 뒤 나온 8.28 행정지도에 있습니다. Liner가 찾아 반영한 경과조치로 판정합니다", featured: true },
  { id: "A02", label: "세입자 재계약 기준 연장", icon: "question", hard: "사실 하나로 결론이 뒤집힘", desc: "갱신청구권이냐 합의 재계약이냐에 따라 가능·불가가 갈려, 판정 전에 먼저 되묻습니다", featured: true },
  { id: "C05", label: "발령으로 못 산 집", icon: "building", hard: "지점이 확답하면 안 됨", desc: "여신심사위가 정할 사항입니다. 확답하지 않고 상정 서류와 본점 질의서를 준비합니다", featured: true },
  { id: "C07", label: "만기 전에 미리 연장하면?", icon: "shield", hard: "고객이 회피 방법을 물음", desc: "회피 방법은 안내하지 않고, 판단 기준이 만기일이라는 점과 확인할 예외만 알려 줍니다", featured: true },
  { id: "FQ4-1", label: "상속으로 2주택이 된 고객", icon: "check", hard: "현장 질문 · 예외 주택", desc: "상속받은 집은 주택 수에서 빠집니다. 다주택자가 아니면 만기연장 제한 대상이 아닙니다", featured: true },
  { id: "FQ1-1", label: "보증금만 오르고 대출은 그대로", icon: "chart", hard: "현장 질문 · '증액'의 뜻", desc: "행정지도의 기준은 대출금액 증액입니다. 보증금만 올랐으면 증액 연장이 아니라 종전 규정으로 연장 심사합니다", featured: true },
  { id: "FQ5-1", label: "같은 등본 가족 집도 합산?", icon: "scale", hard: "현장 질문 · 정부 기준이 일부만 있음", desc: "세대 기준은 정부 자료에 있지만 범위의 일부는 없습니다. 확인된 기준과 쟁점을 나눠 본점 질의로 넘깁니다", featured: true },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const byId = new Map(testset.cases.map((c) => [c.id, c]));
  const examples: Example[] = EXAMPLES.flatMap(({ id, ...e }) => {
    const c = byId.get(id);
    const f = FIELD_BY_ID.get(id);
    return c ? [{ ...e, question: c.question, expect: c.expected }] : f ? [{ ...e, question: f.question, expect: f.expect }] : [];
  });

  return (
    <main className="min-h-screen">
      <Copilot examples={examples} defaultAsOf={demoAsOf() ?? today()} initialQuestion={typeof q === "string" ? q.slice(0, 1000) : undefined} />
    </main>
  );
}
