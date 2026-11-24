// 질문 → 규칙 엔진 입력(Case). Liner Router json_schema 1회 호출 + 코드 정규화.
import { chatJson, LinerError, type ChatOptions, type RouterModel } from "@/lib/liner";

export const EXTRACT_MODELS: RouterModel[] = ["liner-gpt-router", "liner-gemini-router"];
import { extractSystemPrompt } from "./prompt";
import { EXTRACT_SCHEMA, type RawExtraction } from "./schema";
import { normalize, type Normalized } from "./normalize";
import { groundExtraction, relevantUnmodeled } from "./ground";
import { parsePartialJson } from "./partial";

export interface ExtractInput {
  question: string;
  /** 역질문에 대한 창구 직원의 추가 답변(순서대로). 원 질문과 합쳐 다시 추출한다. */
  followUps?: string[];
  asOf: string;
}

export interface Extraction extends Normalized {
  raw: RawExtraction;
  /** 원문 대조로 다시 추출했다면 1차 결과 */
  first?: RawExtraction;
  model: RouterModel;
  ms: number;
}

export function composeQuestion(question: string, followUps: string[] = []): string {
  const extra = followUps.map((f) => f.trim()).filter(Boolean);
  if (!extra.length) return question.trim();
  return `${question.trim()}\n\n[추가 확인 내용]\n${extra.map((f) => `- ${f}`).join("\n")}`;
}

/** onPartial: 1차 추출을 스트리밍으로 받는 동안 지금까지 확실한 부분(화면 '읽는 중' 표시용, 판정에 쓰지 않음) */
export async function extractCase(
  input: ExtractInput,
  { onPartial, ...opts }: ChatOptions & { budgetMs?: number; onPartial?: (raw: unknown) => void } = {},
): Promise<Extraction> {
  const t0 = Date.now();
  const messages = [
    { role: "system" as const, content: extractSystemPrompt(input.asOf) },
    { role: "user" as const, content: composeQuestion(input.question, input.followUps) },
  ];
  // liner-claude-router는 이 스키마(nullable 항목 60여 개)를 400으로 거절한다(2026-11-13 확인).
  // 기본은 GPT 라우터, 실패하면 Gemini 라우터로 한 번 더 시도한다.
  const models = opts.model ? [opts.model] : EXTRACT_MODELS;
  const errors: string[] = [];
  for (const model of models) {
    // 시간 예산(budgetMs)을 넘겼으면 다음 모델로 넘어가지 않는다
    if (errors.length && opts.budgetMs && Date.now() - t0 > opts.budgetMs / 2) break;
    let raw: RawExtraction;
    try {
      const onDelta = onPartial ? (text: string) => onPartial(parsePartialJson(text)) : undefined;
      raw = await chatJson<RawExtraction>(messages, EXTRACT_SCHEMA, { temperature: 0, ...opts, model, onDelta });
    } catch (e) {
      // Liner 호출 실패만 다음 모델로 넘긴다. 코드 오류는 그대로 던진다.
      if (!(e instanceof LinerError)) throw e;
      errors.push(`${model}: ${e.message}`);
      continue;
    }
    // 규칙 밖 사실이 있으면 판정 근거 자료와 대조해 한 번 더 추출한다(lib/extract/ground.ts).
    // 실패하면(시간·Liner 오류) 1차 결과로 판정한다 — 1차 결과도 규칙 밖 사실을 보류로 처리하므로 안전 방향.
    let first: RawExtraction | undefined;
    let groundMode: "fast" | "full" | undefined;
    const grounding = process.env.LOANDESK_NO_GROUND !== "1" && !(opts.budgetMs && Date.now() - t0 > opts.budgetMs * 0.6);
    if (grounding) {
      try {
        const g = await groundExtraction(messages[0].content, messages[1].content, raw, { ...opts, model });
        if (g) {
          first = raw;
          raw = g.raw;
          groundMode = g.mode;
        }
      } catch (e) {
        if (!(e instanceof LinerError)) throw e;
      }
    }
    const n = normalize(raw);
    if (n.case) n.case.asOf = input.asOf;
    if (first) n.warnings.push(`규칙 밖 사실을 판정 근거 자료와 대조함(${groundMode === "fast" ? "결정만" : "전체 다시 추출"}; 1차: ${relevantUnmodeled(first).map((f) => f.fact).join(", ")})`);
    return { ...n, raw, first, model, ms: Date.now() - t0 };
  }
  throw new LinerError(`조건 추출 실패 — ${errors.join(" / ")}`);
}

export { normalize } from "./normalize";
export type { RawExtraction } from "./schema";
