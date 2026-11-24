// POST /api/guarantor — 보증기관 공개 자료 개정 확인(정책 감시 ③). 공식 페이지를 받아 기준값과 비교한다(Liner 비용 없음).
// 판정 기준은 바꾸지 않는다. 바뀌었으면 본점이 발췌·기준일을 검토한 뒤 data/guarantor를 갱신한다.
import { checkAll } from "@/lib/guarantor/check";
import { makeLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;
const limited = makeLimiter(Number(process.env.GUARANTOR_RATE_PER_MIN ?? 6));

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
  const results = await checkAll({ timeoutMs: 20_000 });
  return Response.json({ checkedAt: new Date().toISOString(), results });
}
