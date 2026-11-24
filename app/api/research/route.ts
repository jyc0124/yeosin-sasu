// POST /api/research — 해석 쟁점(원문 공백 G-ID) Liner 사전 조사. 본점이 외부기관에 묻기 전에 먼저 돌린다.
// 요청: { gapIds: string[], kb?: "v1" | "v2" }  응답: { results: ResearchResult[] }
import { resolveGaps } from "@/lib/kb";
import { makeLimiter } from "@/lib/ratelimit";
import { researchGap } from "@/lib/research/live";

export const runtime = "nodejs";
export const maxDuration = 60;

// Liner 비용이 공개 주소에서 새지 않게 IP당 분당 호출을 제한한다
const limited = makeLimiter(Number(process.env.RESEARCH_RATE_PER_MIN ?? 15));

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { gapIds?: unknown; kb?: unknown };
  const ids = Array.isArray(body.gapIds) ? body.gapIds.filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  const gaps = resolveGaps(ids);
  if (!gaps.length) return Response.json({ error: "조사할 쟁점(G-ID)이 없습니다." }, { status: 400 });
  const kb = body.kb === "v1" ? "v1" : "v2";
  // 같은 쟁점은 10분 캐시(lib/liner 캐시): 데모에서 반복 클릭해도 비용이 늘지 않는다
  const results = await Promise.all(gaps.map((g) => researchGap(g.id, g.topic, { kb, ttlMs: 10 * 60_000 })));
  return Response.json({ results });
}
