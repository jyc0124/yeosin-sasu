// 현장 질문 세트 v1(data/field_questions_v1.md)에서 판정 근거 자료에 없는 쟁점을 Liner로 조사한다. 일회성 조사 스크립트.
// Search Agent 답은 그대로 쓰지 않는다(data/liner_spike/REPORT.md). 공식 원문 대조를 거친 것만 factsheet에 반영한다.
// 실행: npx tsx --env-file=.env scripts/research/field-1121.ts [R1 R2 ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { linerAgent, linerSearch } from "../../lib/liner";

const B813 = "2026년 8월 13일 금융위원회 「부동산 시장 안정을 위한 금융 종합대책」(비거주 1주택자 전세대출 제한, 2027.1.1 시행)과 2026.8.28 행정지도 「주택담보대출에 대한 리스크관리 기준」";
const B401 = "2026년 4월 1일 금융위원회 「'26년도 가계부채 관리방안」(다주택자 수도권·규제지역 아파트 주담대 만기연장 제한)";
const RULE = "금융위원회·금융감독원·은행연합회·HUG(주택도시보증공사)·HF(한국주택금융공사)·SGI서울보증 등 공식 자료(보도자료, FAQ, 행정지도, 상품설명서, 보증규정, 질의회신, 금융규제·법령해석포털 회신사례)에서 근거 문장을 찾아 문서명·날짜와 함께 인용해 주세요. 보증기관별로 다르면 기관별로 나눠 주세요. 공식 근거가 없으면 '공식 근거 없음'이라고 분명히 답하고 추측하지 마세요.";

const QS: { id: string; agent: string; search: string[] }[] = [
  { id: "R1", agent: `${B813}의 경과조치에서, 기존 전세대출을 대출금 증액을 위해 다른 대출로 갈아타는 '대환'은 만기연장으로 보나요, 신규 취급으로 보나요? ${RULE}`,
    search: ["전세대출 대환 신규취급 만기연장 구분 행정지도", "전세자금대출 증액 대환 경과조치 종전 규정"] },
  { id: "R2", agent: `전세대출보증 심사에서 주택 수는 누구까지 합산하나요(차주 본인, 배우자, 세대원, 동거하는 부모)? 1주택자가 주택을 가진 부모와 같은 전셋집에 함께 살면 2주택으로 보나요? ${B813}의 '부부합산' 기준과 보증기관 내규 기준이 어떻게 다른지도 알려주세요. ${RULE}`,
    search: ["전세자금대출보증 주택보유수 산정 세대원 부부합산 HUG HF SGI", "전세대출 부모 동거 세대원 주택 보유 1주택 판단"] },
  { id: "R3", agent: `${B401}에서 다주택자 여부는 '세대 기준'으로 판단하고 차주(세대기준) 동의 후 주택소유확인시스템(HOMS)으로 확인합니다. 이때 세대는 주민등록등본상 세대원 전원인가요? 같은 등본의 자녀, 자녀의 배우자, 손자의 주택도 합산하나요? 정보조회 동의는 누구에게 받나요? ${RULE}`,
    search: ["다주택자 만기연장 세대 기준 세대원 범위 주택소유확인시스템 동의", "주택담보대출 세대 기준 주택 수 산정 세대원 직계비속 배우자"] },
  { id: "R4", agent: `상속으로 받은 주택이 ${B401}의 만기연장 제한에서 주택 수 산정 제외라면, 전세대출보증 심사(8.13 비거주 1주택자 제한 포함)나 주택 구입 목적 주담대(다주택자 LTV 등)에서도 주택 수에서 제외되나요? ${RULE}`,
    search: ["상속주택 주택수 산정 제외 전세대출보증 다주택자 주담대 LTV", "가계부채 관리방안 FAQ 주택 수 산정 예외 다른 대출규제 적용"] },
  { id: "R5", agent: `HUG·HF·SGI 전세자금대출보증을 연장하면서 임차보증금만 늘고 대출금은 그대로일 때, 증액된 보증금의 납부 증빙(영수증·이체내역)을 받아야 하나요? 기관별로 알려주세요. ${RULE}`,
    search: ["전세자금대출보증 연장 보증금 증액 증빙 HUG", "전세대출 연장 보증금 증액 대출금 동일 영수증 HF SGI"] },
  { id: "R6", agent: `전세자금대출의 '잔금지급일로부터 3개월 이내' 요건은 대출 신청, 보증 신청, 보증서 발급, 대출 실행 중 어느 시점까지를 말하나요? 주택도시기금 버팀목 전세대출과 은행재원 전세대출(HUG·HF·SGI 보증)별로 알려주세요. ${RULE}`,
    search: ["전세자금대출 잔금지급일 3개월 이내 신청 기준 HUG 버팀목", "전세대출 잔금일 이후 3개월 이내 보증신청 HF 전세자금보증"] },
  { id: "R7", agent: `HUG 전세자금대출보증을 연장할 때 임차보증금이 줄면 줄어든 금액만큼 대출을 상환해야 하나요? 상환액은 어떻게 계산하나요(보증한도·보증금의 80% 등)? HF·SGI도 알려주세요. ${RULE}`,
    search: ["전세자금대출 연장 보증금 감액 일부상환 HUG", "전세대출 보증금 감액 재계약 상환 금액 계산 HF"] },
  { id: "R8", agent: `전세자금대출 승인(보증 승인) 후 실행 전에 신용대출을 추가로 받으면 어떤 항목(DSR, 보증한도, 소득 대비 부채 등)을 다시 심사하나요? 신규·연장, HUG·HF·SGI별로 알려주세요. ${RULE}`,
    search: ["전세대출 승인 후 실행 전 신용대출 DSR 재심사", "전세자금대출 1주택자 DSR 2026 행정지도 신용대출"] },
  { id: "R9", agent: `전세자금대출(보증) 만기연장 심사와 약정은 만기 몇 개월 전부터 할 수 있나요? 연장 약정을 미리 해도 연장 효력 발생일(처리일)은 원래 만기일인가요? 규제 적용 기준일은 무엇인가요(약정일, 신청일, 만기도래일)? HUG·HF·SGI별로 알려주세요. ${RULE}`,
    search: ["전세자금대출보증 연장 신청 기간 만기 전 HUG", "전세대출 만기연장 경과조치 만기도래 기준 행정지도 26.12.31"] },
];

async function main() {
  const only = process.argv.slice(2);
  const outDir = path.join(process.cwd(), "data", "liner_spike", "field_1121");
  await mkdir(outDir, { recursive: true });
  for (const q of QS.filter((x) => !only.length || only.includes(x.id))) {
    const searches = [];
    for (const s of q.search) searches.push({ query: s, results: await linerSearch(s, { maxResults: 10 }) });
    const agent = await linerAgent(q.agent);
    await writeFile(path.join(outDir, `${q.id}.json`), JSON.stringify({ id: q.id, question: q.agent, agent, searches }, null, 1));
    const off = agent.references.filter((r) => r.tier === 1);
    console.log(`\n## ${q.id}  (참조 ${agent.references.length}개, 공식 ${off.length}개)`);
    console.log(agent.text.slice(0, 1500));
    for (const r of off) console.log(`  [공식] ${r.title} | ${r.url}`);
    for (const s of searches) for (const r of s.results.filter((x) => x.tier === 1)) console.log(`  [검색·공식] ${r.title} | ${r.url}`);
  }
}
main();
