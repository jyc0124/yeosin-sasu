// 해석 쟁점 6개(11/19 새 질문 검토에서 나온 것)를 Liner로 조사한다. 일회성 조사 스크립트.
// Search Agent 답은 비결정적·과잉 일반화가 확인됐으므로(data/liner_spike/REPORT.md) 그대로 쓰지 않는다.
// 결과는 data/liner_spike/interpret_1119/ 에 저장하고, 공식 원문 대조를 거친 것만 factsheet에 반영한다.
// 실행: npx tsx --env-file=.env scripts/research/interpret-1119.ts [Q1 Q3 ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { linerAgent, linerSearch } from "../../lib/liner";

const BASE = "2026년 4월 1일 금융위원회 「'26년도 가계부채 관리방안」(다주택자 수도권·규제지역 아파트 주담대 만기연장 제한, 4.17 시행)";
const BASE813 = "2026년 8월 13일 금융위원회 「부동산 시장 안정을 위한 금융 종합대책」(비거주 1주택자 전세대출 제한)과 2026.8.28 행정지도 「주택담보대출에 대한 리스크관리 기준」";
const RULE = "금융위원회·금융감독원·은행연합회·HUG·HF·SGI 등 공식 자료(보도자료, FAQ, 행정지도, 질의회신, 금융규제·법령해석포털 회신사례)에서 근거 문장을 찾아 문서명·날짜와 함께 인용해 주세요. 공식 근거가 없으면 '공식 근거 없음'이라고 분명히 답하고 추측하지 마세요.";

const QS: { id: string; agent: string; search: string[] }[] = [
  {
    id: "Q1",
    agent: `${BASE}의 만기연장 예외 '임차인이 있는 경우'에서 임차인은 담보 주택의 임차인만 해당하나요? 담보가 아닌 다른 보유 주택에 임차인이 있는 경우도 예외가 되나요? ${RULE}`,
    search: ["다주택자 만기연장 예외 임차인이 있는 경우 담보주택 임대차계약 종료일", "가계부채 관리방안 FAQ 임차인이 있는 경우 만기연장 허용범위"],
  },
  {
    id: "Q2",
    agent: `${BASE}의 임대차계약종료일 정의 중 '대책 시행일 전일(4.2~4.16)까지 체결되는 묵시적 갱신'에서 묵시적 갱신이 이루어지는 날은 계약 종료일인가요, 갱신거절 통지 기한(종료 2개월 전)이 지난 날인가요? 4.1 이전에 이미 묵시적 갱신이 성립한 계약은 어떻게 보나요? ${RULE}`,
    search: ["만기연장 제한 묵시적 갱신 4.16 유예기간 임대차계약종료일", "주택임대차보호법 묵시적 갱신 성립 시점 계약 종료 2개월 전"],
  },
  {
    id: "Q3",
    agent: `${BASE813}의 경과조치에서 '만기연장 시 증액하면 변경된 규정 적용'은 대출 전체에 적용되나요, 증액분에만 적용되나요? 이때 8.13 대책의 예외 사유(법적 의무 실거주, 임대차 승계, 보증금 미반환, 퇴거 일정 조정, 여신심사위원회 인정)가 적용되나요? ${RULE}`,
    search: ["비거주 1주택자 전세대출 만기연장 증액 변경된 규정 적용 경과조치", "주택담보대출에 대한 리스크관리 기준 행정지도 전세대출 증액 경과조치"],
  },
  {
    id: "Q4",
    agent: `${BASE}의 다주택자 판단 '세대 기준' 주택 수에서 세대의 범위는 무엇인가요? 세대를 분리한 배우자 명의 주택도 합산하나요? 부부 공동명의 1채는 몇 채로 세나요? ${RULE}`,
    search: ["다주택자 만기연장 제한 세대 기준 주택 수 세대원 범위 배우자", "가계부채 관리방안 FAQ 개인 임대사업자 세대 기준 판단"],
  },
  {
    id: "Q5",
    agent: `${BASE813}에서 비거주 1주택자 여부를 판단할 때 부부 공동명의 주택, 분양권·입주권, 주거용 오피스텔은 주택 수에 포함하나요? 8.13 본문·FAQ 또는 보증기관(HUG·HF·SGI) 기준이 있나요? ${RULE}`,
    search: ["비거주 1주택자 전세대출 분양권 입주권 주택 수 포함 여부", "전세대출보증 주택 수 산정 주거용 오피스텔 분양권 HUG 기준"],
  },
  {
    id: "Q6",
    agent: `${BASE}의 만기연장 예외 '임차인이 있는 경우'에서, 임대차계약이 끝났는데 새 계약 없이 임차인이 계속 거주하는 경우(묵시적 갱신 등)는 어떻게 보나요? 종료일은 언제로 보나요? ${RULE}`,
    search: ["다주택자 만기연장 임대차계약 종료 후 계속 거주 묵시적 갱신 종료일", "가계부채 관리방안 FAQ 묵시적 갱신 4.17 갱신거절 의사표명 매도"],
  },
];

async function main() {
  const only = process.argv.slice(2);
  const outDir = path.join(process.cwd(), "data", "liner_spike", "interpret_1119");
  await mkdir(outDir, { recursive: true });
  for (const q of QS.filter((x) => !only.length || only.includes(x.id))) {
    const searches = [];
    for (const s of q.search) {
      const rs = await linerSearch(s, { maxResults: 10 });
      searches.push({ query: s, results: rs });
    }
    // Search Agent는 초당 2회 제한·연결 끊김이 있어 순차 호출(lib/liner가 재시도)
    const agent = await linerAgent(q.agent);
    await writeFile(path.join(outDir, `${q.id}.json`), JSON.stringify({ id: q.id, question: q.agent, agent, searches }, null, 1));
    const off = agent.references.filter((r) => r.tier === 1);
    console.log(`\n## ${q.id}  (참조 ${agent.references.length}개, 공식 ${off.length}개)`);
    console.log(agent.text.slice(0, 1200));
    for (const r of off) console.log(`  [공식] ${r.title} | ${r.url}`);
    for (const s of searches) for (const r of s.results.filter((x) => x.tier === 1)) console.log(`  [검색·공식] ${r.title} | ${r.url}`);
  }
}
main();
