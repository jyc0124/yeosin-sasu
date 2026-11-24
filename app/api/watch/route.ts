// POST /api/watch — 정책 변경 감시(F2). NDJSON 스트림으로 단계별 결과를 보낸다.
//   {"type":"discovered", runs, docs, unregistered}  ① Liner Search API·MCP search_legal 감시 질의 ② 신뢰도·날짜·기존 문서 분류
//   {"type":"original", ...}                          ③ 새 문서 원본 다운로드·해시 대조 (다르면 여기서 멈춤)
//   {"type":"clauses", clauses, rejectedCount, ...}   ④ Router 조항 구조화 ⑤ 원본 대조 통과분만·Fact 대응
//   {"type":"impact", total, changed}                 ⑥ KB v1→v2로 판정이 바뀌는 문항(규칙 엔진)
//   {"type":"done", ms, approvable, approvalNote}     ⑦ 승인 가능 여부(원본 일치 + 새 조항 있음)
//   {"type":"none", message} | {"type":"error", stage, message}
// 승인 자체는 화면에서 한다: 지식 버전을 v2로 바꾸고 창구 화면에서 다시 판정.
import { isReplayMode } from "@/lib/liner";
import { makeLimiter } from "@/lib/ratelimit";
import { discover, withDeadline } from "@/lib/watch/discover";
import { impact } from "@/lib/watch/impact";
import { fetchOriginal, getOriginal } from "@/lib/watch/original";
import { structureClauses } from "@/lib/watch/structure";

export const runtime = "nodejs";
export const maxDuration = 60;

// 함수 제한(60초) 안에서 오류 이벤트까지 보낼 수 있도록 전체 예산을 55초로 잡는다
const BUDGET_MS = 55_000;

// 감시는 Liner 호출이 많아 더 엄격하게 제한한다
const limited = makeLimiter(Number(process.env.WATCH_RATE_PER_MIN ?? 4));

export async function POST(req: Request) {
  if (limited(req)) return Response.json({ error: "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { fresh?: unknown; kb?: unknown };
  // 지금 창구에 적용 중인 근거 자료: 이 버전에 이미 반영된 문서는 새 문서로 세지 않는다
  const kb = body.kb === "v2" ? "v2" : "v1";
  const replay = isReplayMode();
  // fresh=true면 검색·Router 캐시를 쓰지 않고 실제로 호출한다(재생 모드에서는 무시)
  const fresh = body.fresh === true && !replay;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {
          // 연결 끊김
        }
      };
      const t0 = Date.now();
      const left = () => BUDGET_MS - (Date.now() - t0);
      let stage = "감시 질의";
      try {
        const { runs, docs } = await discover({ ttlMs: fresh ? 1 : undefined, deadlineMs: 25_000, kb });
        const unregistered = docs.filter((d) => d.status === "new" && !d.originalId);
        send({ type: "discovered", runs, docs, unregistered: unregistered.length });

        const failed = runs.filter((r) => r.error).length;
        if (failed === runs.length) {
          send({ type: "error", stage, message: "감시 질의가 모두 실패했습니다. Liner 연결 상태를 확인한 뒤 다시 실행하세요. (새 문서가 없다는 뜻이 아닙니다)" });
          return;
        }

        const target = docs.find((d) => d.status === "new" && d.originalId);
        if (!target) {
          const reflected = docs.filter((d) => d.status === "known" && d.knownAs?.includes("v2에 반영"));
          const parts = [
            kb === "v2"
              ? `지금 적용 중인 근거 자료 v2 이후에 새로 나온 판정 규정 문서는 찾지 못했습니다. 감시 질의 ${runs.length}회로 공식 출처 문서 ${docs.length}건을 확인했습니다.${reflected.length ? ` 이미 v2에 반영된 문서: ${reflected.map((d) => d.knownAs!.split(" — ")[0]).filter((x, i, a) => a.indexOf(x) === i).join(", ")}.` : ""}`
              : "근거 자료 기준일 이후의 새 공식 문서 중 원본이 등록된 판정 규정 문서를 찾지 못했습니다.",
          ];
          if (unregistered.length) parts.push(`원본이 등록되지 않은 새 문서 ${unregistered.length}건은 담당자 확인이 필요합니다.`);
          if (failed) parts.push(`감시 질의 ${failed}건이 실패해 결과가 불완전할 수 있습니다.`);
          send({ type: "none", message: parts.join(" ") });
          return;
        }

        stage = "원본 확보";
        const original = getOriginal(target.originalId!)!;
        // 원본 파일은 Liner가 아니라 정부 사이트에서 직접 받는다 → 재생 모드에서도 실제로 받아 해시를 대조한다(재생은 Liner 응답만).
        // 네트워크 없이 시연해야 하면 LOANDESK_DEMO_OFFLINE=1(그때는 '원본 일치 미확인'으로 정직하게 표시)
        const orig = await fetchOriginal(original, target.url, { skipDownload: replay && process.env.LOANDESK_DEMO_OFFLINE === "1", timeoutMs: Math.max(3_000, Math.min(15_000, left() - 25_000)) });
        send({ type: "original", ...orig, sections: orig.sections.map((s) => ({ label: s.label, length: s.text.length })) });
        if (orig.changed || orig.sections.length === 0) {
          send({ type: "none", message: orig.changed ? orig.note : "등록된 원본에서 분석할 조항을 찾지 못했습니다(등록 정보 확인 필요)." });
          return;
        }

        stage = "조항 구조화";
        const s = await withDeadline(
          structureClauses(original, orig.sections, { useCache: !fresh, timeoutMs: Math.max(5_000, Math.min(30_000, left() - 3_000)) }),
          Math.max(1_000, left() - 2_000),
          "조항 구조화 시간 초과",
        );
        // 원본 대조에 실패한 AI 추출은 화면에 내보내지 않는다(CLAUDE.md 원칙 3) — 건수만 알린다
        const verified = s.clauses.filter((c) => c.verified);
        send({ type: "clauses", clauses: verified, rejectedCount: s.clauses.length - verified.length, ms: s.ms, models: s.models });

        stage = "영향 분석";
        send({ type: "impact", ...impact() });

        const newCount = verified.filter((c) => c.diff === "new").length;
        const approvable = (orig.hashMatch || replay) && newCount > 0;
        const approvalNote = approvable
          ? replay && !orig.hashMatch
            ? "재생 모드: 원본 일치는 저장본 기준입니다."
            : undefined
          : !orig.hashMatch
            ? "원본 일치가 확인되지 않아 승인할 수 없습니다. 원본을 다시 받아 확인하세요."
            : "원본 대조를 통과한 새 조항이 없어 승인할 내용이 없습니다.";
        send({ type: "done", ms: Date.now() - t0, approvable, approvalNote });
      } catch (e) {
        console.error("[watch]", stage, (e as Error).name, (e as Error).message);
        send({ type: "error", stage, message: `${stage} 중 오류가 발생했습니다${(e as Error).message.includes("시간 초과") ? "(시간 초과)" : ""}. 잠시 후 다시 시도해 주세요.` });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
