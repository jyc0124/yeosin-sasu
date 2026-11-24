// 베타 테스터 의견을 저장소(Upstash Redis)에서 내려받아 data/feedback/에 JSON·Markdown으로 저장한다.
// 실행: npm run feedback:export  (.env에 UPSTASH_REDIS_REST_URL/TOKEN 또는 KV_REST_API_URL/TOKEN 필요)
// data/feedback/는 실제 직원 의견이라 커밋하지 않는다(.gitignore).
import { mkdirSync, writeFileSync } from "node:fs";
import { feedbackStoreReady, listFeedback } from "../lib/feedback/store";

const RATING: Record<string, string> = { right: "맞아요", wrong: "틀렸어요", bank: "우리 은행 기준은 달라요", unsure: "애매해요" };

async function main() {
  if (!feedbackStoreReady()) {
    console.error("피드백 저장소 환경변수가 없습니다. .env에 UPSTASH_REDIS_REST_URL·UPSTASH_REDIS_REST_TOKEN(또는 KV_REST_API_URL·KV_REST_API_TOKEN)을 넣으세요.");
    process.exit(1);
  }
  const rows = (await listFeedback(5000)).sort((a, b) => a.at.localeCompare(b.at));
  mkdirSync("data/feedback", { recursive: true });
  writeFileSync("data/feedback/feedback.json", JSON.stringify(rows, null, 2));

  const count = (k: string) => rows.filter((r) => r.rating === k).length;
  const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    `# 베타 피드백 (${rows.length}건, 내려받은 시각 ${kst(new Date().toISOString())} KST)`,
    "",
    `판정 평가: 맞아요 ${count("right")} · 틀렸어요 ${count("wrong")} · 은행 기준 다름 ${count("bank")} · 애매해요 ${count("unsure")} · 일반 의견 ${rows.filter((r) => r.kind === "general").length}`,
    "",
  ];
  for (const r of rows) {
    lines.push(`## ${kst(r.at)} · ${r.kind === "general" ? "일반 의견" : `${RATING[r.rating ?? ""] ?? "-"} · 판정 ${r.verdict ?? "-"}`}${r.role ? ` · ${r.role}` : ""} · ${r.ua ?? ""}`);
    if (r.question) lines.push(`- 질문: ${r.question}`);
    for (const f of r.followUps ?? []) lines.push(`- 추가 확인: ${f}`);
    if (r.module || r.kb || r.asOf) lines.push(`- 주제 ${r.module ?? "-"} · 근거 자료 ${r.kb ?? "-"} · 기준일 ${r.asOf ?? "-"}`);
    lines.push(`- 의견: ${r.comment || "(없음)"}`, "");
  }
  writeFileSync("data/feedback/feedback.md", lines.join("\n"));
  console.log(`${rows.length}건 → data/feedback/feedback.md, feedback.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
