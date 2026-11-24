// 재시도·백오프·타임아웃이 있는 fetch 래퍼.
export class LinerError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "LinerError";
  }
}

export interface PostOptions {
  headers: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(status?: number) {
  return status === undefined || status === 429 || status >= 500;
}

export async function postText(url: string, body: unknown, opts: PostOptions): Promise<string> {
  const { headers, timeoutMs = 120_000, retries = 3 } = opts;
  let lastErr: LinerError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.ok) {
        // MCP는 HTTP 200 안에 JSON-RPC 레이트리밋 오류(-32003)를 담아 보낼 수 있다.
        if (text.includes('"code":-32003')) {
          lastErr = new LinerError("Liner rate limit (-32003)", 429, text.slice(0, 300));
        } else {
          return text;
        }
      } else {
        lastErr = new LinerError(`Liner HTTP ${res.status}`, res.status, text.slice(0, 500));
        if (!isRetryable(res.status)) throw lastErr;
      }
    } catch (e) {
      if (e instanceof LinerError && !isRetryable(e.status)) throw e;
      lastErr = e instanceof LinerError ? e : new LinerError(`Liner network error: ${(e as Error).message}`);
    }
    if (attempt < retries) await sleep(800 * 2 ** attempt + Math.random() * 300);
  }
  throw lastErr ?? new LinerError("Liner request failed");
}
