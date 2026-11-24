// POST /api/feedback — 베타 테스터 의견 저장. 판정 결과에 대한 의견(kind=verdict)과 일반 의견(kind=general).
// 개인정보로 보이는 내용은 저장하지 않고 돌려보낸다.
import { randomUUID } from "node:crypto";
import { findPii } from "@/lib/hq/guard";
import { makeLimiter } from "@/lib/ratelimit";
import { saveFeedback, type FeedbackRecord } from "@/lib/feedback/store";

export const runtime = "nodejs";

const limited = makeLimiter(Number(process.env.FEEDBACK_RATE_PER_MIN ?? 20));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const RATINGS = ["right", "wrong", "bank", "unsure"] as const;

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "잠시 뒤 다시 보내 주세요." }, { status: 429 });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const kind = b.kind === "general" ? "general" : "verdict";
  const rating = RATINGS.find((r) => r === b.rating);
  const comment = str(b.comment, 2000) ?? "";
  if (kind === "verdict" && !rating) return Response.json({ error: "평가를 골라 주세요." }, { status: 400 });
  if (kind === "general" && !comment) return Response.json({ error: "의견을 적어 주세요." }, { status: 400 });
  const pii = findPii(comment);
  if (pii.length) return Response.json({ error: `개인정보로 보이는 내용(${pii.join(", ")})이 있어 보낼 수 없습니다. 지우고 다시 보내 주세요.` }, { status: 400 });

  const followUps = Array.isArray(b.followUps) ? b.followUps.filter((f): f is string => typeof f === "string").slice(0, 10).map((f) => f.slice(0, 500)) : undefined;
  const ua = req.headers.get("user-agent") ?? "";
  const rec: FeedbackRecord = {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    rating,
    comment,
    role: str(b.role, 40),
    question: str(b.question, 1000),
    followUps,
    verdict: str(b.verdict, 40),
    module: str(b.module, 10),
    kb: str(b.kb, 4),
    asOf: str(b.asOf, 10),
    page: str(b.page, 100),
    ua: /Mobi|Android|iPhone|KAKAOTALK/i.test(ua) ? "mobile" : "desktop",
  };
  try {
    await saveFeedback(rec);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(`[feedback] 저장 실패: ${(e as Error).message}`);
    return Response.json({ error: "저장하지 못했습니다. 잠시 뒤 다시 보내 주세요." }, { status: 502 });
  }
}
