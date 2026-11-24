// Liner MCP (Streamable HTTP, JSON-RPC tools/call).
// Search Agent는 초당 2회 제한 + 연결 끊김이 있어 전역 직렬 큐로 호출한다.
import { LINER_MCP_URL, linerKey, isReplayMode } from "./config";
import { LinerError, postText } from "./http";
import { cached, cacheKey } from "./cache";
import { trustTier, type TrustTier } from "./trust";

type Json = Record<string, unknown>;

function parseSse(raw: string): Json {
  const t = raw.trimStart();
  if (t.startsWith("{")) return JSON.parse(t);
  const dataLines = raw.split(/\r?\n/).filter((l) => l.startsWith("data:"));
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(dataLines[i].slice(5).trim());
      if (obj && (obj.result || obj.error)) return obj;
    } catch {
      /* 다음 줄 */
    }
  }
  throw new LinerError("MCP 응답을 해석할 수 없습니다", undefined, raw.slice(0, 300));
}

let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
const MIN_GAP_MS = 700;

/** 전역 직렬 큐: 동시에 여러 요청이 와도 하나씩, 최소 간격을 두고 실행 */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastCallAt = Date.now();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

export async function mcpCall(tool: string, args: Json, timeoutMs = 120_000, retries?: number): Promise<string> {
  const raw = await serial(() =>
    postText(
      LINER_MCP_URL,
      { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } },
      {
        headers: { Authorization: `Bearer ${linerKey()}`, Accept: "application/json, text/event-stream" },
        timeoutMs,
        retries,
      },
    ),
  );
  const msg = parseSse(raw) as { result?: { content?: { type: string; text: string }[]; isError?: boolean }; error?: Json };
  if (msg.error) throw new LinerError(`MCP error: ${JSON.stringify(msg.error).slice(0, 300)}`);
  const text = msg.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (msg.result?.isError) throw new LinerError(`MCP tool error: ${text.slice(0, 300)}`);
  return text;
}

export interface AgentReference {
  title: string;
  url: string;
  hostname: string;
  date?: string | null;
  tier: TrustTier;
}
export interface AgentAnswer {
  text: string;
  references: AgentReference[];
  requestId?: string;
}

type AgentEvent = { type: string; delta?: string; data?: { references?: Omit<AgentReference, "tier">[] }; message_metadata?: { request_id?: string } };

export function parseAgentEvents(text: string): AgentAnswer {
  const events = JSON.parse(text) as AgentEvent[];
  const seen = new Set<string>();
  const references: AgentReference[] = [];
  let out = "";
  let requestId: string | undefined;
  for (const e of events) {
    if (e.type === "start") requestId = e.message_metadata?.request_id;
    if (e.type === "text-delta" && e.delta) out += e.delta;
    for (const r of e.data?.references ?? []) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        references.push({ ...r, tier: trustTier(r.url) });
      }
    }
  }
  return { text: out.trim(), references, requestId };
}

export type AgentTool = "search_agent" | "quick_answer_agent" | "deep_research_agent";

/** Search Agent 호출. 결과는 비결정적이므로 캐시해 두고, 반드시 원문 대조 후 사용한다. */
export async function linerAgent(
  question: string,
  opts: { tool?: AgentTool; ttlMs?: number } = {},
): Promise<AgentAnswer> {
  const tool = opts.tool ?? "search_agent";
  const args = { messages: [{ role: "user", content: question }] };
  return cached(
    cacheKey(`agent-${tool}`, args),
    async () => parseAgentEvents(await mcpCall(tool, args, 180_000)),
    { ttlMs: opts.ttlMs, replayOnly: isReplayMode() },
  );
}

/** 도메인 검색 도구(search_legal 등). 결과 형식은 REST 검색과 같다. */
export async function linerDomainSearch(
  tool: "search_web" | "search_legal" | "search_finance",
  query: string,
  limit = 10,
  ttlMs?: number,
  net: { timeoutMs?: number; retries?: number } = {},
): Promise<AgentReference[]> {
  const args = { query, limit };
  return cached(
    cacheKey(`mcp-${tool}`, args),
    async () => {
      const json = JSON.parse(await mcpCall(tool, args, net.timeoutMs ?? 60_000, net.retries)) as { results?: Omit<AgentReference, "tier">[] };
      return (json.results ?? []).map((r) => ({ ...r, tier: trustTier(r.url) }));
    },
    { ttlMs, replayOnly: isReplayMode() },
  );
}
