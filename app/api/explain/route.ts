// POST /api/explain — 판정 카드의 고객 안내 문구(Liner Router 작성 → 원문 대조 검증 통과분만).
// 입력: { question, case, kb }. 카드는 클라이언트가 보낸 것을 믿지 않고 서버가 규칙 엔진으로 다시 판정해 만든다.
// 출력: { sentences: [{text, facts}], rejected, model, ms }  — 탈락 문장 내용은 내보내지 않는다(CLAUDE.md 원칙 3).
import { explain } from "@/lib/explain";
import { findPii } from "@/lib/hq/guard";
import { isDate } from "@/lib/extract/normalize";
import { makeLimiter } from "@/lib/ratelimit";
import { judge, type Case, type KbVersion } from "@/lib/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

const limited = makeLimiter(Number(process.env.EXPLAIN_RATE_PER_MIN ?? 40));
const MAX_BODY = 20_000;

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  let body: { question?: unknown; case?: unknown; kb?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  const c = body.case as Case | undefined;
  if (!question || !c || typeof c !== "object" || !["M0", "M1", "M2"].includes((c as Case).module)) {
    return Response.json({ error: "question과 case가 필요합니다." }, { status: 400 });
  }
  // 질문은 외부 API(Liner)로 나간다: /api/judge와 같이 개인정보로 보이면 보내지 않는다
  const pii = findPii(question);
  if (pii.length) return Response.json({ error: `개인정보로 보이는 내용(${pii.join(", ")})이 있어 안내 문구를 만들지 않았습니다.` }, { status: 400 });
  if (c.asOf !== undefined && !isDate(c.asOf)) return Response.json({ error: "case.asOf 형식 오류" }, { status: 400 });
  const kb: KbVersion = body.kb === "v1" ? "v1" : "v2";

  try {
    const card = judge({ ...c, kb });
    const e = await explain({ question, card }, { timeoutMs: 25_000 });
    return Response.json({
      verdict: card.verdict,
      sentences: e.sentences.map((s) => ({ text: s.text, facts: s.facts, source: s.source })),
      rejected: e.rejected,
      model: e.model,
      ms: e.ms,
    });
  } catch (err) {
    console.error("[explain]", (err as Error).name, (err as Error).message);
    return Response.json({ error: "안내 문구를 만들지 못했습니다. 판정 카드를 기준으로 안내하세요." }, { status: 502 });
  }
}
