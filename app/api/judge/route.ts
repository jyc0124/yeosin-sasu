// POST /api/judge — 질문 → 조건 추출(Liner Router) → 규칙 엔진 판정 → 근거 원문.
// 응답: NDJSON 스트림. 한 줄에 이벤트 하나.
//   {"type":"partial", raw}   ← 조건 추출 중간 결과(지금까지 확실한 부분, 화면 '읽는 중' 표시용, 판정에 쓰지 않음)
//   {"type":"extracted", module, case, assumptions, warnings, model, ms}
//   {"type":"verdict", verdict, facts, gaps, compare?}   ← compare: 다른 KB 버전 판정이 다를 때(타임머신)
//   {"type":"out_of_scope", message}
//   {"type":"error", stage, message}   ← 스트림이 이 이벤트 없이 끝나면 클라이언트는 오류로 처리
import { answerBasis } from "@/lib/basis";
import { extractCase } from "@/lib/extract";
import { isDate } from "@/lib/extract/normalize";
import { resolveFacts, resolveGaps } from "@/lib/kb";
import { judge, type KbVersion, type Verdict } from "@/lib/rules";
import { today } from "@/lib/rules/dates";
import { makeLimiter } from "@/lib/ratelimit";
import { findPii } from "@/lib/hq/guard";
import { agencyRefs } from "@/lib/guarantor";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  question?: unknown;
  followUps?: unknown;
  asOf?: unknown;
  kb?: unknown;
}

const MAX_LEN = 1000;

// 공개 배포 주소에서 Liner 호출 비용이 새지 않도록 IP당 분당 호출 수를 제한한다.
// 은행 지점은 여러 직원이 같은 외부 IP로 나가는 경우가 많아 1인 기준보다 넉넉하게 둔다.
const limited = makeLimiter(Number(process.env.JUDGE_RATE_PER_MIN ?? 40));

function parse(body: Body) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return { error: "question이 비어 있습니다." };
  const followUps = Array.isArray(body.followUps) ? body.followUps.filter((f): f is string => typeof f === "string") : [];
  if (question.length + followUps.join("").length > MAX_LEN) return { error: `질문은 ${MAX_LEN}자 이내로 입력하세요.` };
  // 질문은 외부 API(Liner)로 나간다: 개인정보로 보이면 보내지 않는다
  const pii = findPii(question, ...followUps);
  if (pii.length) return { error: `개인정보로 보이는 내용(${pii.join(", ")})이 있어 판정하지 않았습니다. 지우고 다시 적어 주세요.` };
  if (body.asOf !== undefined && !isDate(body.asOf)) return { error: "asOf는 YYYY-MM-DD 형식의 실제 날짜여야 합니다." };
  const asOf = (body.asOf as string | undefined) ?? today();
  const kb: KbVersion = body.kb === "v1" ? "v1" : "v2";
  return { question, followUps, asOf, kb };
}

const OUT_MESSAGE =
  "여신 사수의 판정 범위(8.13 비거주 1주택자 전세대출 제한·4.1 다주택자 주담대 만기연장 제한과 같은 행정지도의 전세대출 한도·DSR) 밖의 질문이라 판정하지 않습니다. 보증기관(HUG·HF·SGI)별 서류·심사 기준처럼 공개된 정부 발표 자료에 기준이 없는 실무는 보증기관 상품 규정과 본점에서 확인하세요.";

const card = (v: Verdict) => ({ ...v, factRefs: resolveFacts(v.facts), gapRefs: resolveGaps(v.gaps) });

/** 항목별 답변 카드·조건 수정이 보낸 글(app/_components/answerItems composeAnswers·composeCorrection의 머리말) */
const answeredCase = (followUps: string[]) => followUps.some((f) => /^(고객에게 확인한 답|조건 정정)\(새 질문 아님/.test(f.trim()));

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const input = parse(body);
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
  if (limited(req)) return Response.json({ error: "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {
          // 클라이언트가 연결을 끊은 경우
        }
      };
      let stage = "조건 추출";
      // 보증기관 확인 자료(판정 근거 아님): 질문에 보증기관·보증 실무 주제가 있으면 공개 자료 발췌를 함께 보낸다(lib/guarantor, LLM 없음)
      const agency = agencyRefs([input.question, ...input.followUps].join("\n"));
      const withAgency = agency ? { agency } : {};
      try {
        // maxDuration(60초) 안에 끝나도록: 요청당 20초, 재시도 1회, 1차 모델이 25초 넘게 실패하면 2차 생략
        // 중간 결과는 0.3초에 한 번, 바뀌었을 때만 보낸다
        let lastAt = 0;
        let lastJson = "";
        const onPartial = (raw: unknown) => {
          if (!raw || Date.now() - lastAt < 300) return;
          const j = JSON.stringify(raw);
          if (j === lastJson) return;
          lastAt = Date.now();
          lastJson = j;
          send({ type: "partial", raw });
        };
        const ex = await extractCase(input, { timeoutMs: 20_000, retries: 1, budgetMs: 50_000, onPartial });
        stage = "판정";
        send({
          type: "extracted",
          module: ex.module,
          case: ex.case ?? (ex.module === "Q" && ex.basis ? { module: "Q", ...ex.basis } : undefined),
          assumptions: ex.assumptions,
          warnings: ex.warnings,
          model: ex.model,
          ms: ex.ms,
        });
        if (ex.module === "Q" && ex.basis) {
          // 기준 질문: 코드가 근거를 고르고, Router가 그 근거로만 문장을 쓰고, 원문 대조를 통과한 문장만 보인다(lib/basis)
          stage = "근거 조회";
          const b = await answerBasis(ex.basis, { kb: input.kb, asOf: input.asOf, timeoutMs: 20_000 });
          send({ type: "verdict", asOf: input.asOf, ...card(b.card), ...withAgency });
        } else if (!ex.case) {
          // 범위 밖이어도 질문 일부가 범위 안 주제와 겹치면 그 부분은 정부 발표 자료 기준으로 답한다(나머지는 판정하지 않음)
          const related = (ex.related ?? []).map((topic) => ({ asOf: input.asOf, ...card(judge({ module: "M0", topic, asOf: input.asOf, kb: input.kb })) }));
          // 고정 주제가 없고 범위 안 요소만 태그로 왔으면 그 부분을 근거 조회로 답한다
          if (!related.length && ex.basis) {
            stage = "근거 조회";
            // 질문 원문을 넘겨 '대상이 다른 기준'(예: 무주택 질문에 1주택자 기준)을 가려낸다(lib/basis holderNote).
            // 주 판정 경로에는 쓰지 않는다: 문장만으로 읽는 보유 상태는 여러 사람·여러 집이 섞인 질문에서 불안정하다
            const context = [input.question, ...input.followUps].join("\n");
            const b = await answerBasis(ex.basis, { kb: input.kb, asOf: input.asOf, timeoutMs: 20_000, context });
            // 범위 밖 질문의 '범위 안 부분'은 고객과 대상이 같은 기준이 있을 때만 보인다(무주택 질문에 1주택자 기준을 답처럼 내지 않게)
            if (b.card.basis?.some((x) => !x.note)) related.push({ asOf: input.asOf, ...card(b.card) });
          }
          send({
            type: "out_of_scope",
            message: OUT_MESSAGE,
            ...(related.length ? { related } : {}),
            ...withAgency,
          });
        } else if (ex.asksCriteria && ex.basis && !answeredCase(input.followUps)) {
          // 고객 사실이 있어도 기준 자체를 묻는 질문: 기준 답변(근거 조회 + 원문 대조)을 주 카드로, 고객 건 판정은 함께 보여 준다
          stage = "근거 조회";
          const b = await answerBasis(ex.basis, { kb: input.kb, asOf: input.asOf, timeoutMs: 20_000 });
          const caseCard = { asOf: input.asOf, ...card(judge({ ...ex.case, kb: input.kb })) };
          send({ type: "verdict", asOf: input.asOf, ...card(b.card), also: caseCard, ...withAgency });
        } else if (ex.asksCriteria && ex.basis) {
          // 직원이 고객에게 확인한 답(또는 조건 정정)을 보냈다 = 이제 이 고객 건의 결론을 원한다 → 고객 건 판정을 주 카드로,
          // 처음 물은 기준 설명은 근거가 있을 때만 함께 보여 준다(기준 질문으로 시작했다는 이유로 '본점 문의'에 머물지 않게)
          stage = "근거 조회";
          const main = judge({ ...ex.case, kb: input.kb });
          const b = await answerBasis(ex.basis, { kb: input.kb, asOf: input.asOf, timeoutMs: 20_000 }).catch(() => undefined);
          const crit = b && b.card.basis?.length ? { asOf: input.asOf, ...card(b.card) } : undefined;
          send({ type: "verdict", asOf: input.asOf, ...card(main), ...(crit ? { also: crit } : {}), ...withAgency });
        } else {
          const main = judge({ ...ex.case, kb: input.kb });
          const other = judge({ ...ex.case, kb: input.kb === "v2" ? "v1" : "v2" });
          // 같은 고객 건의 다른 규제(M1+M2)
          const also = ex.also ? { asOf: input.asOf, ...card(judge({ ...ex.also, kb: input.kb })) } : undefined;
          send({
            type: "verdict",
            asOf: input.asOf,
            ...card(main),
            compare: other.verdict !== main.verdict ? card(other) : undefined,
            ...(also ? { also } : {}),
            ...withAgency,
          });
        }
      } catch (e) {
        // 키·내부 응답 본문은 내보내지 않는다
        console.error("[judge]", stage, (e as Error).name, (e as Error).message);
        send({ type: "error", stage, message: `${stage} 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.` });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
