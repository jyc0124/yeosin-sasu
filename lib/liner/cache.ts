// 응답 캐시. 개발 환경은 .cache/liner, Vercel은 /tmp(쓰기 가능한 유일한 경로).
// 데모 재생용 고정 응답은 data/demo_cache 에 커밋해 두고 재생 모드에서 우선 사용한다.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// LOANDESK_CACHE_DIR: 평가에서 캐시 없이 다시 호출할 때(같은 질문 반복 시 흔들림 측정) 빈 폴더를 지정한다
const RUNTIME_DIR = process.env.LOANDESK_CACHE_DIR ? path.resolve(process.env.LOANDESK_CACHE_DIR) : process.env.VERCEL ? "/tmp/liner-cache" : path.join(process.cwd(), ".cache", "liner");
const DEMO_DIR = path.join(process.cwd(), "data", "demo_cache");

export function cacheKey(kind: string, payload: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
  return `${kind}_${h}`;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await readJson<T>(path.join(DEMO_DIR, `${key}.json`))) ?? readJson<T>(path.join(RUNTIME_DIR, `${key}.json`));
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNTIME_DIR, `${key}.json`), JSON.stringify(value, null, 1));
  } catch {
    // 캐시 실패는 기능에 영향 없음
  }
}

/** 캐시 우선 실행. ttlMs가 지나면 다시 호출한다(감시 기능은 짧은 TTL 사용). */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; replayOnly?: boolean } = {},
): Promise<T> {
  const hit = await cacheGet<{ at: number; value: T }>(key);
  if (hit && (opts.replayOnly || !opts.ttlMs || Date.now() - hit.at < opts.ttlMs)) return hit.value;
  if (opts.replayOnly) throw new Error(`재생 모드인데 캐시가 없습니다: ${key}`);
  const value = await fn();
  await cacheSet(key, { at: Date.now(), value });
  return value;
}
