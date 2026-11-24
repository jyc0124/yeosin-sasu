// Liner 연결 확인: npx tsx --env-file=.env scripts/liner-smoke.ts
import { chatJson, linerSearch, filterTrusted, linerDomainSearch } from "../lib/liner";

async function main() {
  const t0 = Date.now();
  const j = await chatJson<{ module: string; houses: number | null }>(
    [
      { role: "system", content: "은행 창구 질문에서 정책 모듈과 보유 주택 수를 추출한다." },
      { role: "user", content: "서울 아파트 1채 갖고 있고 지방에서 전세 사는데 내년에 전세대출 연장 돼요?" },
    ],
    {
      name: "probe",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["module", "houses"],
        properties: { module: { type: "string", enum: ["M1_jeonse", "M2_renewal", "other"] }, houses: { type: ["integer", "null"] } },
      },
    },
    { routingStrategy: "balanced", useCache: false },
  );
  console.log("router.json_schema:", j, `${Date.now() - t0}ms`);

  const r = await linerSearch("주택담보대출에 대한 리스크 관리 기준 행정지도 금융위원회", { ttlMs: 1 });
  console.log("search: total", r.length, "trusted", filterTrusted(r).map((x) => `[${x.tier}] ${x.hostname} ${x.date ?? ""}`));

  const d = await linerDomainSearch("search_legal", "비거주 1주택자 전세대출 제한 예외", 5);
  console.log("mcp.search_legal:", d.map((x) => `[${x.tier}] ${x.hostname}`));
}
main().catch((e) => {
  console.error("FAIL", e.name, e.message, e.status ?? "", (e.body ?? "").slice(0, 300));
  process.exit(1);
});
