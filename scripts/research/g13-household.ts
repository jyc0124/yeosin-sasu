// G-13(세대 기준 주택 수의 세대 범위) 공식 근거 조사. 일회성. Search Agent 답은 그대로 쓰지 않고 공식 원문 인용만 검토한다.
// 실행: npx tsx --env-file=.env scripts/research/g13-household.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { linerAgent, linerSearch } from "../../lib/liner";

const Q = `은행업감독업무시행세칙(주택담보대출 LTV·DTI 관련 별표) 또는 금융위원회·금융감독원 FAQ에서 주택 수를 '세대 기준'으로 셀 때 '세대'의 정의는 무엇인가요? 주민등록표상 같은 세대를 이루는 직계존속(부모)·직계비속 명의 주택도 차주의 보유 주택 수에 합산하나요? 세대 분리된 배우자는요? 2025.10.15 대책의 '1주택자 전세대출 DSR(세대 기준)'과 2026.4.1 다주택자 만기연장 제한(세대 기준)에도 같은 정의가 쓰이나요? 공식 문서명·조항·날짜와 함께 원문 문장을 인용해 주세요. 공식 근거가 없으면 '공식 근거 없음'이라고 답하고 추측하지 마세요.`;
const SEARCH = ["은행업감독업무시행세칙 세대 정의 주민등록표 직계존비속 주택 수 합산", "주택담보대출 세대 기준 주택수 산정 세대원 부모 합산 금융위 FAQ"];

async function main() {
  const searches = [];
  for (const s of SEARCH) searches.push({ query: s, results: await linerSearch(s, { maxResults: 10 }) });
  const agent = await linerAgent(Q);
  const out = path.join(process.cwd(), "data", "liner_spike", "g13");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "R10.json"), JSON.stringify({ id: "R10", question: Q, agent, searches }, null, 1));
  console.log(agent.text);
  for (const r of agent.references.filter((x) => x.tier === 1)) console.log(`  [공식] ${r.title} | ${r.url}`);
  for (const s of searches) for (const r of s.results.filter((x) => x.tier === 1)) console.log(`  [검색·공식] ${r.title} | ${r.url} :: ${(r as { snippet?: string }).snippet?.slice(0, 200) ?? ""}`);
}
main();
