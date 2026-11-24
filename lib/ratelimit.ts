// IP당 시간창 호출 제한. 서버리스 인스턴스별 메모리라 완전하지 않지만, 공개 데모 주소에서 Liner 비용이 새는 것을 막는 데는 충분하다.
export function makeLimiter(maxPerMin: number) {
  const hits = new Map<string, number[]>();
  const windowMs = 60_000;
  return function limited(req: Request): boolean {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    // 메모리 상한: 시간창이 지난 IP만 지운다
    if (hits.size > 5000) for (const [k, ts] of hits) if (now - ts[ts.length - 1] >= windowMs) hits.delete(k);
    return recent.length > maxPerMin;
  };
}
