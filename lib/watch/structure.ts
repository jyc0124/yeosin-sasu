// ④ 조항 구조화(Liner Router) ⑤ 원문 대조·Fact 대응.
// Router가 뽑은 조항은 인용문이 원문에 그대로 있을 때만 통과한다(CLAUDE.md 원칙 3: 원문 대조 전에는 내보내지 않음).
import kb from "@/data/kb/facts.json";
import registry from "@/data/watch/registry.json";
import { chatJson, LinerError, type RouterModel } from "@/lib/liner";
import { quoteFound, similarity, squash } from "./text";

export const CLAUSE_TOPICS = ["적용대상", "예외", "증빙", "시행일", "경과조치"] as const;
export type ClauseTopic = (typeof CLAUSE_TOPICS)[number];

export interface Clause {
  topic: ClauseTopic;
  policy: "8.13" | "4.1";
  summary: string;
  quote: string;
}

export interface CheckedClause extends Clause {
  section: string;
  verified: boolean;
  match?: { id: string; kb: string; score: number; text: string };
  /** new = v2 Fact에 대응(이번 문서로 새로 알게 된 내용), same = v1 Fact와 같은 내용, review = 대응 Fact 없음 */
  diff: "new" | "same" | "review" | "rejected";
}

const SCHEMA = {
  name: "policy_clauses",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["clauses"],
    properties: {
      clauses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["topic", "policy", "summary", "quote"],
          properties: {
            topic: { type: "string", enum: [...CLAUSE_TOPICS] },
            policy: { type: "string", enum: ["8.13", "4.1"], description: "8.13 비거주 1주택자 전세대출 / 4.1 다주택자 주담대 만기연장" },
            summary: { type: "string", description: "창구 직원이 읽을 한 문장 요약. 원문에 없는 내용 금지" },
            quote: { type: "string", description: "근거가 되는 원문 구절을 글자 그대로 복사(20~120자). 고치거나 줄이지 말 것" },
          },
        },
      },
    },
  },
};

const SYSTEM = `너는 금융당국 행정지도 원문에서 은행 창구 판정에 필요한 조항만 뽑는 추출기다.
대상 정책은 두 가지뿐이다: (8.13) 비거주 1주택자 전세대출보증 신규·연장 제한, (4.1) 다주택자 수도권·규제지역 아파트 주담대 만기연장 제한.
주제(topic): 적용대상, 예외, 증빙, 시행일, 경과조치. 이 두 정책과 무관한 조항(이주비, 온투업, 생애최초 등)은 뽑지 않는다.
- quote는 원문 구절을 글자 그대로 복사한다. 원문에 띄어쓰기가 빠져 있어도 그대로 둔다. 원문에 없는 문장을 만들면 안 된다.
- summary는 그 구절이 말하는 내용만 한 문장으로 쓴다. 해석·추측을 더하지 않는다.
- 같은 내용을 중복해 뽑지 않는다. 최대 10개.`;

export type WatchOriginal = (typeof registry.originals)[number];
type FactRow = { id: string; text: string; kb: string; source: string; policy: string };
const FACTS = kb.facts as FactRow[];

/** 섹션마다 병렬로 Router를 부른다. 기본 Gemini(추론 low, 약 10초), 실패하면 GPT(low)로 한 번 더. */
export async function structureClauses(
  original: WatchOriginal,
  sections: { label: string; text: string }[],
  opts: { useCache?: boolean; timeoutMs?: number } = {},
): Promise<{ clauses: CheckedClause[]; ms: number; models: RouterModel[] }> {
  const t0 = Date.now();
  const plan: RouterModel[] = ["liner-gemini-router", "liner-gpt-router"];
  const models: RouterModel[] = [];
  const perSection = await Promise.all(
    sections.map(async (sec) => {
      let lastErr: unknown;
      for (const model of plan) {
        try {
          const out = await chatJson<{ clauses: Clause[] }>(
            [
              { role: "system", content: SYSTEM },
              { role: "user", content: `### ${sec.label}\n${sec.text}` },
            ],
            SCHEMA,
            { model, temperature: 0, reasoningEffort: "low", useCache: opts.useCache ?? true, timeoutMs: opts.timeoutMs ?? 30_000, retries: 0 },
          );
          models.push(model);
          // 스키마를 어긴 항목(필드 누락·형식 오류)은 버린다
          return (Array.isArray(out.clauses) ? out.clauses : []).filter(
            (c) =>
              c &&
              typeof c.quote === "string" &&
              typeof c.summary === "string" &&
              (CLAUSE_TOPICS as readonly string[]).includes(c.topic) &&
              (c.policy === "8.13" || c.policy === "4.1"),
          );
        } catch (e) {
          if (!(e instanceof LinerError)) throw e;
          lastErr = e;
        }
      }
      throw lastErr;
    }),
  );
  // 섹션 사이 중복(같은 인용) 제거
  const seen = new Set<string>();
  const clauses = perSection
    .flat()
    .filter((c) => {
      const k = squash(c.quote);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((c) => check(c, sections, original));
  return { clauses, ms: Date.now() - t0, models: [...new Set(models)] };
}

/** 원문 대조 + 기존 Fact 대응 (결정적, LLM 없음) */
const BASE_POLICY: Record<Clause["policy"], string> = { "8.13": "2026-08-13", "4.1": "2026-04-01" };

/** 같은 대책의 Fact만 후보로: 기존 발표 Fact + 이 문서 Fact 중 그 대책에 해당하는 것 */
function candidates(policy: Clause["policy"], factPolicy: Record<string, string[]>): FactRow[] {
  const own = new Set(factPolicy[policy] ?? []);
  return FACTS.filter((f) => f.policy === BASE_POLICY[policy] || own.has(f.id));
}

/** 대응 최소 유사도. 검증된 인용문만으로 계산하므로 요약보다 점수가 낮게 나온다 → 실측으로 정함(docs/RULES.md §6-2) */
export const MATCH_MIN = 0.25;

export function check(c: Clause, sections: { label: string; text: string }[], original: WatchOriginal = registry.originals[0]): CheckedClause {
  const sec = sections.find((s) => quoteFound(c.quote, s.text));
  if (!sec) return { ...c, section: "-", verified: false, diff: "rejected" };
  // 대응은 원문에서 확인된 인용문으로만 계산한다(AI 요약은 검증되지 않았으므로 쓰지 않음)
  const scored = candidates(c.policy, original.factPolicy)
    .map((f) => ({ f, score: similarity(c.quote, f.text) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const match =
    best && best.score >= MATCH_MIN ? { id: best.f.id, kb: best.f.kb, score: Math.round(best.score * 100) / 100, text: best.f.text } : undefined;
  const diff = !match ? "review" : match.id.startsWith(original.factPrefix) ? "new" : "same";
  return { ...c, section: sec.label, verified: true, match, diff };
}
