// Liner Router API (OpenAI 호환 chat/completions).
// 역할: 조건 추출(json_schema), 역질문·설명 문장 생성. 판정은 하지 않는다(규칙 엔진 담당).
import { LINER_BASE, linerKey, isReplayMode } from "./config";
import { postText, LinerError } from "./http";
import { cached, cacheKey } from "./cache";

export type RouterModel = "liner-claude-router" | "liner-gpt-router" | "liner-gemini-router" | "liner-mark";
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ChatOptions {
  model?: RouterModel;
  routingStrategy?: "cost" | "balanced" | "quality";
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;
  /**
   * 응답을 스트리밍으로 받으며 지금까지 받은 본문 전체를 넘긴다(화면에 '읽는 중' 조건을 먼저 보여 주려고).
   * 캐시에 있으면 호출되지 않는다. 스트리밍이 실패하면 일반 호출(재시도 포함)로 다시 받는다.
   */
  onDelta?: (textSoFar: string) => void;
  /** 요청 1회 타임아웃(기본 90초)·네트워크 재시도 횟수(기본 3). API 경로는 함수 제한 시간 안에 끝나도록 줄인다. */
  timeoutMs?: number;
  retries?: number;
}

interface ChatResponse {
  model?: string;
  choices: { message: { content: string | null } }[];
  usage?: Record<string, number>;
}

/** 스트리밍 1회(재시도 없음). SSE의 delta.content를 이어 붙여 일반 응답과 같은 모양으로 돌려준다. */
async function streamOnce(body: Record<string, unknown>, o: ChatOptions): Promise<ChatResponse> {
  const res = await fetch(`${LINER_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${linerKey()}` },
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
  });
  if (!res.ok || !res.body) throw new LinerError(`Liner HTTP ${res.status} (stream)`, res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let model: string | undefined;
  let usage: Record<string, number> | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    let grew = false;
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const d = JSON.parse(data) as { model?: string; usage?: Record<string, number>; choices?: { delta?: { content?: string | null } }[] };
        model = d.model ?? model;
        usage = d.usage ?? usage;
        const c = d.choices?.[0]?.delta?.content;
        if (c) {
          text += c;
          grew = true;
        }
      } catch {
        // 깨진 줄은 건너뛴다(다음 줄에서 이어짐)
      }
    }
    if (grew) o.onDelta?.(text);
  }
  if (!text) throw new LinerError("Liner stream: 빈 응답");
  return { model, usage, choices: [{ message: { content: text } }] };
}

async function complete(body: Record<string, unknown>, useCache: boolean, o: ChatOptions = {}): Promise<ChatResponse> {
  const plain = async () =>
    JSON.parse(
      await postText(`${LINER_BASE}/chat/completions`, body, {
        headers: { Authorization: `Bearer ${linerKey()}` },
        timeoutMs: o.timeoutMs ?? 90_000,
        retries: o.retries,
      }),
    ) as ChatResponse;
  // 스트리밍이 실패하면 일반 호출로(재시도·백오프는 postText). 캐시 키는 스트리밍 여부와 무관(같은 body).
  const call = o.onDelta
    ? async () => {
        try {
          return await streamOnce(body, o);
        } catch (e) {
          // 시간 초과는 다시 기다리지 않는다(API 함수 제한 시간 보호). 그 밖(스트리밍 미지원·끊김·5xx)은 일반 호출로.
          const name = (e as Error).name;
          if (name === "TimeoutError" || name === "AbortError") throw new LinerError(`Liner timeout (stream): ${(e as Error).message}`);
          return plain();
        }
      }
    : plain;
  if (!useCache) return call();
  return cached(cacheKey("router", body), call, { replayOnly: isReplayMode() });
}

function buildBody(messages: ChatMessage[], o: ChatOptions) {
  const body: Record<string, unknown> = {
    model: o.model ?? "liner-claude-router",
    messages,
    temperature: o.temperature ?? 0,
  };
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (o.routingStrategy) body.routing_strategy = o.routingStrategy;
  if (o.reasoningEffort) body.reasoning_effort = o.reasoningEffort;
  return body;
}

export async function chat(messages: ChatMessage[], o: ChatOptions = {}): Promise<string> {
  const res = await complete(buildBody(messages, o), o.useCache ?? true, o);
  return res.choices?.[0]?.message?.content ?? "";
}

/** JSON Schema 구조화 출력. 파싱 실패 시 1회 재시도. */
export async function chatJson<T>(
  messages: ChatMessage[],
  schema: { name: string; schema: Record<string, unknown>; strict?: boolean },
  o: ChatOptions = {},
): Promise<T> {
  const body = {
    ...buildBody(messages, o),
    response_format: {
      type: "json_schema",
      json_schema: { name: schema.name, schema: schema.schema, strict: schema.strict ?? true },
    },
  };
  for (let i = 0; i < 2; i++) {
    const res = await complete(i === 0 ? body : { ...body, temperature: 0.1 }, (o.useCache ?? true) && i === 0, o);
    const content = res.choices?.[0]?.message?.content ?? "";
    try {
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
    } catch {
      /* 재시도 */
    }
  }
  throw new LinerError("Router 구조화 출력 파싱 실패");
}
