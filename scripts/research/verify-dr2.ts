// deep research #1 결과 재확인 — 2026.10.20 인구감소지역 재지정 목록 (일회성 조사 스크립트)
import { linerSearch } from "../../lib/liner";
const qs = [
  "행정안전부 고시 제2026-61호 인구감소지역 92개 목록",
  "2026 인구감소지역 재지정 92곳 새로 지정 해제 지역",
  "2026년 10월 인구감소관심지역 18곳 명단",
];
async function main() {
  for (const q of qs) {
    const rs = await linerSearch(q, { maxResults: 10 });
    console.log(`\n### ${q}`);
    for (const r of rs) console.log(`- [t${r.tier}] ${r.title} | ${r.url} | ${r.date ?? ""}\n    ${(r.description ?? "").replace(/\s+/g, " ").slice(0, 400)}`);
  }
}
main();
