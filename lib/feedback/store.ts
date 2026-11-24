// 베타 테스터 피드백 저장. Upstash Redis(Vercel Marketplace) REST API를 쓴다(의존성 없음).
// 환경변수가 없으면(로컬 개발 등) 서버 로그에만 남긴다.
export interface FeedbackRecord {
  id: string;
  at: string; // ISO 시각
  kind: "verdict" | "general";
  rating?: "right" | "wrong" | "bank" | "unsure"; // bank = 판정은 맞지만 테스터 은행의 기준(서류·절차)이 가상 A은행 지침과 다름
  comment: string;
  role?: string; // 테스터가 고른 직무(선택)
  question?: string;
  followUps?: string[];
  verdict?: string;
  module?: string;
  kb?: string;
  asOf?: string;
  page?: string;
  ua?: "mobile" | "desktop";
}

const KEY = "feedback:v1";

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const feedbackStoreReady = () => redis() !== null;

async function call(cmd: (string | number)[]) {
  const r = redis();
  if (!r) throw new Error("피드백 저장소 환경변수가 없습니다.");
  const res = await fetch(r.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${r.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`피드백 저장소 오류 (${res.status})`);
  return ((await res.json()) as { result: unknown }).result;
}

export async function saveFeedback(rec: FeedbackRecord): Promise<"stored" | "logged"> {
  // 저장소가 있어도 로그는 남긴다(저장 실패 시 복구용)
  console.log(`[feedback] ${JSON.stringify(rec)}`);
  if (!redis()) return "logged";
  await call(["LPUSH", KEY, JSON.stringify(rec)]);
  return "stored";
}

export async function listFeedback(limit = 1000): Promise<FeedbackRecord[]> {
  const rows = (await call(["LRANGE", KEY, 0, limit - 1])) as string[];
  return rows.map((s) => JSON.parse(s) as FeedbackRecord);
}
