// M1 — 8.13 비거주 1주택자 전세대출 제한 (docs/RULES.md §2)
import { D, fmt, today } from "./dates";
import { isCapital } from "./houses";
import { countFor, decide, scopesDiffer, SCOPES } from "./scope";
import type { KbVersion, M1Case, Verdict } from "./types";
import { Card } from "./verdict";

const EXCEPTION_Q = "예외 사유 해당 여부: ① 법적 의무로 실거주 예정(토허구역 매수 등) ② 임대차 승계 조건부 취득 ③ 임대인 보증금 미반환 ④ 퇴거 일정 조정(단기) ⑤ 그 밖의 불가피한 비거주(근무지 변경 등, 여신심사위원회 인정 필요)";

export function judgeM1(c: M1Case, kb: KbVersion): Verdict {
  const card = new Card("M1", kb);

  // 예외① 법적 의무 실거주(F813-07)는 '비거주 1주택자' 제한의 예외다 → 1주택이 확인됐거나 대상자임을 전제한 질문에만 쓴다.
  // 주택 수를 세기 전에 허용하면 다주택자(현행 전세대출보증 제한, F813-10)까지 허용으로 새어 나간다.
  const legalObligation = () => {
    card.step("S0 예외①", "법적 의무로 실거주 예정 → 비거주 1주택자 제한의 예외로 허용", ["F813-07"]);
    card.oblige("실거주 시점에 전세대출을 종료하는 조건입니다.").doc("법적 실거주 의무 증빙(토지거래허가서 등)", "보유 주택 임대차계약서");
    return card.done("허용", "법적 의무로 실거주 예정인 경우 전세대출 신규·연장이 허용됩니다. 실거주 시점에 전세대출을 종료하는 조건입니다.");
  };
  if (c.exception === "legal_obligation" && c.targetAsserted) return legalObligation();

  if (!c.targetAsserted) {
    // S1 주택 수
    const ctx = { kb, asOf: c.asOf ?? today() };
    // 8.13 주택 수 = 부부합산(+산정 예외). 범위를 붙여 말한 수('세대 1주택' 등)도 여기서 반영한다(lib/rules/scope.ts)
    const sc = countFor(c, "R813", ctx);
    const hc = { ...(sc.hc ?? { evals: [], counted: [] }), count: sc.count };
    for (const e of hc.evals) if (e.reason) card.step("S1 주택 수", e.reason, e.facts);
    for (const e of hc.evals) if (e.status === "counted" && e.reason) card.cond(e.reason);
    if (hc.blocking) {
      const b = hc.blocking;
      // 판정을 막은 주택을 마지막 단계로 남긴다(질의서·FAQ 키가 '마지막 주택'이 아니라 결정 사유를 가리키도록)
      card.step("S1 주택 수 결정", b.reason, b.facts);
      if (b.status === "hold") return card.ask(b.question ?? "").done("보류", `${b.reason}. 본점 확인이 필요합니다.`);
      if (b.status === "committee") return card.done("심사위", `${b.reason}. 지점이 단독으로 확정할 수 없습니다.`);
      if (b.status === "ask") return card.ask(b.question ?? "").doc(...b.docs).done("역질문", b.plain ?? b.reason);
      if (b.status === "check") card.latest().cond(b.reason);
    }
    // 예외①은 '세입자 있는 집을 샀다'는 사실 자체가 그 1주택이다 → 주택 수를 모르면 1주택으로 보고, 다른 주택이 있으면 안 된다는 조건을 단다
    if (hc.count === undefined && c.exception === "legal_obligation") {
      card.step("S1 주택 수", "주택 수 언급 없음 → 법적 의무로 실거주할 그 집 1채로 보고 판단", ["F813-01", "F813-10"]);
      card.cond("부부합산 보유 주택이 이 집 1채일 때의 판정입니다. 다른 주택이 있으면 다주택자라 전세대출보증이 제한됩니다(F813-10).");
      card.ask("이번에 산 집 외에 본인·배우자 명의 주택이 더 있나요? (있으면 다주택자 제한)");
      return legalObligation();
    }
    if (hc.count === undefined) {
      return card
        .step("S1 주택 수", "부부합산 주택 수 모름", ["F813-01"])
        .ask("본인과 배우자 명의 주택이 모두 몇 채인가요? (부부합산)")
        .done("역질문", "부부합산 보유 주택 수를 먼저 확인해야 합니다.");
    }
    const excludedDocs = hc.evals.filter((e) => e.status === "excluded").flatMap((e) => e.docs);
    if (hc.count === 0) {
      const excl = hc.evals.filter((e) => e.status === "excluded");
      card.step("S1 주택 수", "산정 주택 0채 → 무주택", ["F813-01", "F813-11"]).doc(...excludedDocs);
      const why = excl.length ? `${excl.map((e) => e.plain ?? `${e.reason}.`).join(" ")} ` : "";
      return card.done("허용", `${why}주택 수 산정상 무주택이라 비거주 1주택자 규제 대상이 아닙니다.`, ["F813-04"]);
    }
    if (hc.count >= 2) {
      card.step("S1 주택 수", `부부합산 ${hc.count}채 → 다주택자`, ["F813-01", "F813-10"]);
      // 8.13 예외 사유(①~⑤)는 비거주 1주택자 제한의 예외라 다주택자 제한을 풀지 못한다
      if (c.exception && c.exception !== "none") card.fact("F813-07").cond("질문의 예외 사유(법적 의무 실거주·승계 등)는 비거주 1주택자 제한의 예외라, 다주택자 전세대출보증 제한에는 적용되지 않습니다.");
      return card
        .cond("비거주 1주택자 규제가 아니라 기존 다주택자 전세대출보증 제한이 적용됩니다.")
        .done("불허", `부부합산 ${hc.count}주택이라 1주택자가 아닙니다. 다주택자는 현재도 전세대출보증이 제한됩니다.`);
    }
    card.step("S1 주택 수", "부부합산 1주택", ["F813-01"]);
    if (c.exception === "legal_obligation") return legalObligation();
    if (c.otherHouseholdHouses) {
      card.step("S1 주택 수", `본인·배우자 외 세대원(부모 등) 명의 주택 ${c.otherHouseholdHouses}채 → 8.13 제한은 부부합산이라 세지 않음`, ["F813-01"]);
      card.cond(`부모 등 본인·배우자가 아닌 가족 명의 주택은 8.13 비거주 1주택자 제한의 주택 수(부부합산)에 넣지 않습니다.`);
    }

    // 가족(본인·배우자의 직계존비속)에게 임대하면 지역·유형과 무관하게 대상이 아니다(F813-02) → 소재지보다 먼저 본다
    if (c.tenantIsFamily && c.leasedOut !== false) {
      card.step("S3 임대", "가족(본인·배우자의 직계존비속)에게 임대", ["F813-02"]);
      return card.doc("가족관계증명서", "임대차계약서").done("허용", "가족에게 임대한 경우는 규제 대상이 아닙니다.");
    }
    // '26.12.31까지 만기가 오는 연장 건은 대상자 여부와 무관하게 종전 규정이다(F828-01) → 실거주 등을 묻기 전에 결론을 낸다
    // 신규도 같다: '26.12.31까지 신청했거나 임대차계약+계약금 납부·전산 접수를 마쳤으면 종전 규정(F828-02) → 대상 여부를 묻지 않는다
    const newOld = c.action === "new" && ((c.applicationDate && c.applicationDate <= D.TRANSITION_LAST) || c.contractAndDepositBy1231 || c.bankIntakeBy1231);
    if (kb === "v2" && newOld) {
      card.cond("비거주 1주택자에 해당하는지와 관계없이 이번 신규 신청은 종전 규정이 적용됩니다.");
      const early = timing(c, kb, card, false);
      if (early) return early;
    }
    if (kb === "v2" && c.action !== "new" && c.maturityDate && c.maturityDate <= D.TRANSITION_LAST) {
      card.cond("비거주 1주택자에 해당하는지와 관계없이 이번 연장은 종전 규정으로 심사합니다.");
      const early = timing(c, kb, card, false);
      if (early) return early;
    }

    // S2 대상 주택 요건
    const h = hc.counted[0] ?? c.houses?.[0] ?? {};
    if (h.isApt === false) {
      card.step("S2 주택 유형", "아파트 아님", ["F813-01"]);
      return card.done("허용", "규제 대상은 수도권·규제지역 아파트 1주택자입니다. 아파트가 아니면 대상이 아닙니다.");
    }
    if (h.region && !isCapital(h.region)) {
      if (h.regulated === undefined) {
        card.step("S2 소재지", `${h.region}: 비수도권. 현재 규제지역 지정 여부 확인 필요`, ["F813-01", "G-07"]).latest();
        return card
          .cond("최신 규제지역 지정 현황을 확인하세요. 규제지역이 아니면 규제 대상이 아닙니다.", ratioText(c))
          .done("조건부", `${h.region} 소재 주택은 규제지역일 때만 대상입니다. 현재 지정 현황을 확인해야 합니다.`, ["F813-11"]);
      }
      if (h.regulated === false) {
        card.step("S2 소재지", `${h.region}: 비수도권·비규제지역`, ["F813-01", "F813-11"]);
        return card
          .cond(ratioText(c))
          .done("허용", "수도권·규제지역 밖의 주택이라 비거주 1주택자 규제 대상이 아닙니다.");
      }
    }
    if (h.isApt === undefined || h.region === undefined) {
      return card
        .step("S2 대상 주택", "소재지 또는 주택 유형 모름", ["F813-01"])
        .ask("보유 주택의 소재지(시도)와 유형(아파트 여부)은?")
        .done("역질문", "보유 주택이 수도권·규제지역 아파트인지 먼저 확인해야 합니다.");
    }
    card.step("S2 대상 주택", `${h.region} 아파트 → 대상 주택`, ["F813-01"]);
    // 8.13 이전부터 있던 제한(F813-10)은 이번 규제와 별개로 적용된다
    card.fact("F813-10").cond("별도로, 투기·투기과열지역 아파트를 3억 원 초과로 취득(효력 발생일 이후 매매계약)했다면 8.13 이전부터의 전세대출보증 제한 대상입니다.");

    // S3 임대 요건
    if (c.tenantIsFamily) {
      card.step("S3 임대", "가족(본인·배우자의 직계존비속)에게 임대", ["F813-02"]);
      return card.doc("가족관계증명서", "임대차계약서").done("허용", "가족에게 임대한 경우는 규제 대상이 아닙니다.");
    }
    // 임차인이 가족이 아니라고 했으면(예: 처제·형제자매) 가족 임대 예외가 아님을 드러낸다(F813-02는 직계존비속만)
    if (c.tenantIsFamily === false) card.fact("F813-02").cond("임차인이 본인·배우자의 직계존비속(부모·자녀)이 아니어서 가족 임대 예외에 해당하지 않습니다(형제자매·처제 등은 직계가 아님).");
    if (c.leasedOut === false) {
      card.step("S3 임대", "임대 중 아님", ["F813-01"]);
      return card.done("허용", "보유 주택을 임대하고 있지 않으면 규제 대상이 아닙니다.");
    }
    // 실거주 이력이 있으면 임대 여부와 무관하게 대상이 아니다(요건 ⑴~⑶ 모두 충족해야 대상, F813-03) → 임대 여부를 묻지 않는다
    if (c.leasedOut === undefined && c.everLived === true) {
      card.step("S4 실거주", "본인 또는 배우자 실거주 이력 있음(임대 여부와 무관)", ["F813-03"]);
      if (kb === "v2") card.fact("F828-03");
      if (kb === "v2" && (c.increase !== undefined || c.action || c.loanAmount || c.newLoanAmount)) companions(c, card);
      return card
        .doc("실거주 이력 증빙(어떤 서류를 인정하는지는 정부 발표 자료에 없음 → 본점 확인)")
        .done("허용", "본인이나 배우자가 하루라도 실거주했으면 비거주 1주택자가 아닙니다. 실거주 이력 증빙을 받으세요.");
    }
    if (c.leasedOut === undefined) {
      return card
        .step("S3 임대", "임대 여부 모름", ["F813-01"])
        .ask("보유 주택을 지금 임대하고 있나요? 임차인이 가족(본인·배우자의 부모·자녀)인가요?")
        .done("역질문", "보유 주택의 임대 여부를 확인해야 합니다.");
    }
    card.step("S3 임대", "임대 중(가족 아님 또는 미확인)", ["F813-01"]);
    // 가족 임대면 대상이 아니다(F813-02). 모르면 '가족 아님'을 전제로 진행하되 화면에 드러내고 묻는다.
    // 단, 실거주 이력이 있으면 그것만으로 대상이 아니므로(F813-03, 요건 ⑴~⑶ 모두 충족해야 대상) 묻지 않는다
    const askFamily = () => {
      if (c.tenantIsFamily !== undefined) return;
      card.fact("F813-02").cond("임차인이 가족(본인·배우자의 부모·자녀)이 아닌 경우를 전제로 한 판정입니다.");
      card.ask("임차인이 본인·배우자의 직계존비속(부모·자녀)인가요? (가족이면 규제 대상이 아닙니다)");
    };

    // S4 실거주 요건
    // 실제로 살았다는데 증빙이 전입 기록뿐: 어떤 서류를 인정하는지 정부 자료에 없다(G-01) → 보류
    if (c.livedEvidence === "move_in_record_only" || c.livedEvidence === "unverified_docs") {
      askFamily();
      card.step("S4 실거주", c.livedEvidence === "unverified_docs" ? "실거주했다고 하나 증빙이 정부 발표 자료에 정해지지 않은 서류뿐" : "실거주했다고 하나 증빙이 전입신고 기록뿐(보조 서류 없음)", ["F813-03", "F828-03", "G-01"].filter((f) => kb === "v2" || !f.startsWith("F828")));
      if (c.action !== "new" && !c.maturityDate) card.ask("전세대출 만기일은 언제인가요? ('26.12.31까지 만기면 종전 규정으로 심사합니다)");
      return card
        .cond("A은행 지침 제4조: 관리비·공과금 납부 내역 등 보조 서류가 하나라도 있으면 실거주 이력으로 확인합니다.")
        .done("보류", c.livedEvidence === "unverified_docs"
          ? "실거주 이력은 증빙해야 하지만(F828-03), 어떤 서류를 인정하는지는 정부 발표 자료에 정해져 있지 않습니다. 제출 서류로 인정할지 본점 확인이 필요합니다."
          : "실거주 이력 증빙으로 전입신고 기록만 인정하는지 정부 발표 자료에 기준이 없습니다. 보조 서류가 없으면 본점 질의가 필요합니다.");
    }
    // 전입신고만 하고 실제로는 안 살았다: 기준은 '실거주'이므로 실거주 이력 없음으로 본다(F813-03)
    if (c.livedEvidence === "move_in_only") {
      askFamily();
      card.step("S4 실거주", "전입신고만 하고 실제로는 안 삶 → 실거주 아님", ["F813-03"]);
      card.cond("전입신고만 하고 실제로 살지 않았다면 실거주로 볼 수 없습니다(기준은 '하루라도 실거주').");
    } else if (c.everLived === true) {
      card.step("S4 실거주", "본인 또는 배우자 실거주 이력 있음", ["F813-03"]);
      if (kb === "v2") card.fact("F828-03");
      return card
        .doc("실거주 이력 증빙(어떤 서류를 인정하는지는 정부 발표 자료에 없음 → 본점 확인)")
        .done("허용", "본인이나 배우자가 하루라도 실거주했으면 비거주 1주택자가 아닙니다. 실거주 이력 증빙을 받으세요.");
    }
    if (c.livedEvidence !== "move_in_only") askFamily();
    // 예외 사유(②~⑤)가 질문에 분명하면, 대상자여도 그 예외로 결론이 난다 → 실거주 이력은 확인 항목으로만 두고 예외 판단으로 간다
    if (c.everLived === undefined && c.livedEvidence !== "move_in_only" && c.exception && c.exception !== "none") {
      card.step("S4 실거주", "본인·배우자 실거주 이력 확인 안 됨 → 대상자여도 질문의 예외 사유로 판단", ["F813-01", "F813-03"]);
      card.ask("본인 또는 배우자가 그 주택에 하루라도 실거주한 적이 있나요? (있으면 애초에 규제 대상이 아닙니다)");
    } else if (c.everLived === undefined && c.livedEvidence !== "move_in_only") {
      card.step("S4 실거주", "본인·배우자 실거주 이력 확인 안 됨", ["F813-01", "F813-03"]);
      card.ask("본인 또는 배우자가 그 주택에 하루라도 실거주한 적이 있나요?");
      // 예외 사유를 묻는다면 그 근거(F813-07 예외 ①~⑤)도 카드에 남긴다
      if (c.exception === undefined) card.ask(EXCEPTION_Q).fact("F813-07");
      if (c.maturityDate === undefined && c.applicationDate === undefined) card.ask("전세대출 만기일(또는 신규 신청 예정일)은?");
      // 질문에 나온 예외 사유는 버리지 않는다: 비거주 1주택자에 해당해도 그 예외로 가능한 범위를 함께 보여 준다(F813-07)
      const viaException: Partial<Record<NonNullable<M1Case["exception"]>, string>> = {
        succession: "비거주 1주택자에 해당하더라도, 임대차 승계 조건부로 취득했다면(예외②) 승계한 임대차계약 종료일까지 연장할 수 있습니다.",
        deposit_unreturned: "비거주 1주택자에 해당하더라도, 임대인이 보증금을 돌려주지 않아 상환이 어렵다면(예외③) 연장할 수 있습니다.",
        short_extension: "비거주 1주택자에 해당하더라도, 퇴거 일정 조정이 필요하면(예외④) 단기 연장(예: 6개월 이내)이 가능합니다.",
        other_inevitable: "비거주 1주택자에 해당하더라도, 근무지 변경 등 불가피한 비거주는(예외⑤) 여신심사위원회가 인정하면 허용됩니다.",
      };
      if (c.exception && viaException[c.exception] && !(c.action === "new" && !c.maturityDate && RENEWAL_ONLY.has(c.exception))) card.fact("F813-07").cond(viaException[c.exception]!);
      return card.done("역질문", "비거주 1주택자 해당 여부를 판단하려면 실거주 이력부터 확인해야 합니다. 해당하면 '27.1.1 이후 원칙적으로 제한됩니다.", ["F813-06", "F813-09"]);
    }
    else card.step("S4 실거주", c.livedEvidence === "move_in_only" ? "실거주 이력 없음 → 비거주 1주택자" : "본인·배우자 모두 실거주 이력 없음 → 비거주 1주택자", ["F813-01"]);
  } else {
    // 질문이 '비거주 1주택자'를 전제해도, 질문에 나온 사실이 대상 요건을 깨면 사실이 우선한다(F813-02·03)
    if (c.tenantIsFamily === true && c.leasedOut !== false) {
      card.step("S3 임대", "가족(본인·배우자의 직계존비속)에게 임대 → 전제와 달리 대상 아님", ["F813-02"]);
      return card.doc("가족관계증명서", "임대차계약서").done("허용", "가족(본인·배우자의 직계존비속)에게 임대한 경우는 규제 대상이 아닙니다.");
    }
    if (c.everLived === true) {
      card.step("S4 실거주", "본인 또는 배우자 실거주 이력 있음 → 전제와 달리 대상 아님", ["F813-03"]);
      if (kb === "v2") card.fact("F828-03");
      return card.doc("실거주 이력 증빙(어떤 서류를 인정하는지는 정부 발표 자료에 없음 → 본점 확인)").done("허용", "본인이나 배우자가 하루라도 실거주했으면 비거주 1주택자가 아닙니다. 실거주 이력 증빙을 받으세요.");
    }
    card.step("S0 대상자", "비거주 1주택자에 해당한다는 전제로 판단(보유 주택·실거주 사실은 확인하지 않음)", ["F813-01"]);
  }

  // S5 시행 시점
  const s5 = timing(c, kb, card, true);
  if (s5) return s5;

  // S6 예외
  return exceptions(c, card, kb);
}

/** targetKnown: 비거주 1주택자 해당이 확정됐나(S4까지 거쳤거나 질문이 전제). 아니면 '해당하면 ~'으로 쓴다 */
function timing(c: M1Case, kb: KbVersion, card: Card, targetKnown: boolean): Verdict | undefined {
  const mat = c.maturityDate;
  const app = c.applicationDate;
  const early = c.plannedRenewalDate && mat && c.plannedRenewalDate <= D.TRANSITION_LAST && mat > D.TRANSITION_LAST;
  if (!mat && !app && !c.contractAndDepositBy1231 && !c.bankIntakeBy1231) {
    if (kb === "v1") {
      card.step("S5 시행 시점", "만기일·신청일 모름 → 신규 규정('27.1.1) 가정", ["F813-09"]);
      card.cond("'26.12.31 이전 만기·신청 건에 어떤 규정을 적용할지는 보도자료·FAQ에 없습니다(시행일만 공표).");
      return undefined;
    }
    // 예외 ②③④는 연장에만 있는 사유다 → 신규 신청 경과조치는 보여 주지 않는다
    const renewal = c.action === "renewal" || c.exception === "succession" || c.exception === "deposit_unreturned" || c.exception === "short_extension";
    const isNew = c.action === "new";
    card.step("S5 시행 시점", "만기일·신청일 모름 → 신규 규정('27.1.1) 가정", ["F813-09", ...(isNew ? [] : ["F828-01"]), ...(renewal ? [] : ["F828-02"])]);
    if (!isNew) card.cond("만기가 '26.12.31 이전이면 이 규제와 관계없이 종전 규정으로 연장 심사합니다(연장하면서 증액하면 신규 규정 적용).");
    if (!renewal) card.cond("새로 신청하는 건은 '26.12.31까지 임대차계약·계약금 납부나 은행 대출 신청 접수를 마쳤으면 종전 규정을 적용할 수 있습니다.");
    return undefined;
  }

  if (kb === "v1") {
    const boundary =
      (mat && mat <= D.TRANSITION_LAST) || (app && app <= D.TRANSITION_LAST) || c.contractAndDepositBy1231 || c.bankIntakeBy1231 || early;
    if (boundary) {
      card.step("S5 시행 시점", "시행일('27.1.1)만 공표, 기준 시점(만기·신청·계약)은 공표 자료에 없음", ["F813-09", "G-02"]);
      return card
        .latest()
        .done("보류", "보도자료·FAQ에는 시행일만 있고 이 건에 어떤 기준 시점을 적용할지 나와 있지 않습니다. 후속 지침 확인이 필요합니다.");
    }
    card.step("S5 시행 시점", `기준일이 '27.1.1 이후 → 신규 규정`, ["F813-09"]);
    return undefined;
  }

  // kb v2: 8.28 행정지도 경과조치
  // 증액을 위한 대환: 연장인지 신규인지 정부 자료에 없다(G-15) → 두 경우를 나눠 보여 주고 확정하지 않는다
  if (c.refinance) {
    card.step("S5 경과조치", "대출금 증액을 위한 대환 → 만기연장인지 신규 취급인지 정부 발표 자료에 없음", ["F828-01", "F828-02", "G-15"]);
    card
      .basis("연장으로 보면", "만기가 '26.12.31까지면 종전 규정이지만, 대출금액을 증액하면 변경된 규정을 적용합니다.", ["F828-01"])
      .basis("신규로 보면", "'27.1.1 이후 신청분부터 변경된 규정입니다. '26.12.31까지 계약금 납부·전산 접수를 마쳤으면 종전 규정을 적용할 수 있습니다.", ["F828-02"]);
    companions(c, card);
    return card
      .cond("어느 쪽이든 대출금액을 늘리면 변경된 규정 적용 대상이 됩니다. 대환을 어느 쪽으로 볼지는 본점에 확인하세요.")
      .done("보류", "증액을 위한 대환을 만기연장으로 볼지 신규 취급으로 볼지 정부 발표 자료에 없습니다. 본점 확인 후 안내하세요.");
  }
  if (c.action !== "new" && mat) {
    if (mat <= D.TRANSITION_LAST) {
      card.step("S5 경과조치", `만기 ${fmt(mat)}: '26.12.31까지 만기도래 → 종전 규정 (기준: 만기도래일)`, ["F828-01"]);
      if (c.increase === true) {
        // 증액분은 변경 규정이 적용되므로, 어떤 예외 사유면 되는지(F813-07 ①~⑤)를 확인 항목으로 보여 준다
        if (c.exception === undefined) card.ask(EXCEPTION_Q).fact("F813-07");
        card.step("S5 증액", `연장하면서 대출금액 증액${amounts(c)} → 변경된 규정 적용`, ["F828-01"]);
        companions(c, card);
        const known = targetKnown || c.targetAsserted;
        // 예외⑤(불가피한 비거주)는 증액이어도 여신심사위원회가 인정해야 한다(F813-07⑤·F813-08) → 지점이 조건부로 확답하지 않는다
        if (c.exception === "other_inevitable") return exceptions(c, card, kb);
        // 대상자이고 예외 사유가 없다고 확인됐으면, 묻는 그대로(증액 연장)는 불가다. '증액 없이 연장'은 대안으로 조건에 남긴다
        if (known && c.exception === "none") {
          return card
            .fact("G-12")
            .cond("증액 없이 연장하면 만기가 '26.12.31까지라 종전 규정으로 심사합니다.", INC_SCOPE)
            .done("불허", `대출금액을 늘리면${amounts(c)} 변경된 규정이 적용됩니다. 비거주 1주택자이고 예외 사유가 없어 증액 연장은 할 수 없습니다.`);
        }
        const who = known ? "비거주 1주택자라" : "비거주 1주택자에 해당하면";
        // 조건부 = 예외 사유(①~⑤) 증빙을 조건으로 증액 가능. 배지만 보고 '증액이 된다'로 읽지 않도록 결론 첫 문장에 조건을 먼저 쓴다
        return card
          .fact("G-12")
          .cond("증액 연장은 예외 사유(①~⑤)가 확인되고 증빙을 받을 때만 가능합니다. 예외 사유가 없으면 증액 연장은 불가입니다.", "증액 없이 연장하면 종전 규정으로 심사합니다.", INC_SCOPE)
          .done("조건부", `증액 연장은 예외 사유가 확인될 때만 됩니다. 대출금액을 늘리면${amounts(c)} 변경된 규정이 적용되는데, ${who} 예외 사유가 없으면 증액 연장을 할 수 없습니다. 증액 없이 연장하면 만기가 '26.12.31까지라 종전 규정으로 심사합니다.`);
      }
      if (c.increase === undefined) card.ask("연장하면서 전세대출 금액을 늘리나요? (임차보증금이 아니라 대출금액 기준)");
      if (c.depositIncrease) companions(c, card);
      const depositOnly = c.depositIncrease && c.increase === false;
      if (depositOnly) card.step("S5 증액", "임차보증금만 증액, 대출금액은 그대로 → 증액 연장 아님(기준은 대출금액)", ["F828-01"]);
      return card
        .cond(
          "전세대출 금액을 늘리지 않는 조건입니다(대출금액을 증액하면 변경된 규정 적용).",
          "규정 적용 기준일은 전세대출 만기도래일입니다. 다음 만기('27년 이후 도래)부터는 신규 규제가 적용된다고 안내하세요.",
        )
        .done(
          "조건부",
          depositOnly
            ? "임차보증금만 늘고 대출금액은 그대로라 '증액 연장'이 아닙니다. '26.12.31까지 만기가 돌아오는 건이라 종전 규정으로 연장 심사합니다."
            : "'26.12.31까지 만기가 돌아오는 건은 종전 규정으로 연장 심사합니다. 단, 대출금액을 증액하면 변경된 규정이 적용됩니다.",
        );
    }
    card.step("S5 경과조치", `만기 ${fmt(mat)}: '27.1.1 이후 만기 → 신규 규정 (기준: 만기도래일)${early ? " (만기 전 조기 연장해도 기준은 만기일)" : ""}`, ["F828-01", "F813-09"]);
    card.cond(`경과조치는 '26.12.31까지 만기가 도래하는 건에만 적용됩니다(기준: 만기도래일). 이 건의 만기는 ${fmt(mat)}입니다.`);
    if (c.increase === true || c.depositIncrease) companions(c, card);
    return undefined;
  }
  if (c.action === "new" || app || c.contractAndDepositBy1231 || c.bankIntakeBy1231) {
    if (app && app <= D.TRANSITION_LAST) {
      card.step("S5 경과조치", `신청 ${fmt(app)}: 시행일 전 신청 → 종전 규정`, ["F828-02"]);
      return card.done("조건부", "'26.12.31까지 신청하는 신규 전세대출은 종전 규정이 적용됩니다.");
    }
    if (c.contractAndDepositBy1231 || c.bankIntakeBy1231) {
      card.step("S5 경과조치", "'26.12.31까지 임대차계약+계약금 납부 또는 전산 접수 → 종전 규정 적용 가능", ["F828-02"]);
      return card
        .doc(...(c.contractAndDepositBy1231 ? ["임대차계약서('26.12.31 이전 체결)", "계약금 납부 증명(이체 내역 등)"] : ["전산 대출신청 접수 내역"]))
        .done("조건부", "'26.12.31까지 임대차계약을 맺고 계약금을 냈다면, '27년에 신청해도 종전 규정을 적용할 수 있습니다. 증명 서류를 받으세요.");
    }
    card.step("S5 경과조치", "'27.1.1 이후 신청 → 신규 규정", ["F828-02"]);
  }
  return undefined;
}

/**
 * '27.1.1 1주택자 전세대출 보증비율(F813-11): 수도권·규제지역 70%, 그 외 80%.
 * 지역은 **전셋집** 소재지로 본다(같은 표의 무주택자 비율에도 지역 구분이 있어 보유 주택 소재지일 수 없음 — 해석, RULES §7).
 */
function ratioText(c: M1Case): string {
  if (!c.rentalRegion) return "'27.1.1부터 1주택자 전세대출 보증비율은 전셋집이 수도권·규제지역이면 70%, 그 외 80%입니다.";
  const inArea = isCapital(c.rentalRegion) || c.rentalRegulated === true;
  if (!inArea && c.rentalRegulated === undefined) return "'27.1.1부터 1주택자 전세대출 보증비율은 전셋집이 규제지역이면 70%, 아니면 80%입니다.";
  return `'27.1.1부터 1주택자 전세대출 보증비율은 ${inArea ? "70%(전셋집이 수도권·규제지역)" : "80%(전셋집이 수도권·규제지역 밖)"}입니다.`;
}

const INC_SCOPE = "변경된 규정을 대출 전체에 적용하는지 증액분에만 적용하는지는 정부 발표 자료에 없습니다. 본점에 확인하세요.";
const LIMIT = 200_000_000;

// 억·만 단위로 딱 떨어지지 않는 금액(예: 200,000,001원)은 반올림하지 않고 원 단위 그대로(경계 금액이 '2억원'으로 보이면 안 됨)
const won = (n: number) =>
  n % 10_000 !== 0 ? `${n.toLocaleString("ko-KR")}원` : n >= 100_000_000 && n % 1_000_000 === 0 ? `${+(n / 100_000_000).toFixed(2)}억원` : `${(n / 10_000).toLocaleString("ko-KR")}만원`;
function amounts(c: M1Case): string {
  if (c.loanAmount && c.newLoanAmount) return `(${won(c.loanAmount)} → ${won(c.newLoanAmount)})`;
  if (c.newLoanAmount) return `(${won(c.newLoanAmount)}으로)`;
  return "";
}

/** 1주택자 전세대출 DSR 기준(F828-11): 판정·설명이 같은 업권 기준을 쓰도록 한 곳에서 정한다. 업권을 모르면 은행권(이 앱은 은행 지점용). */
function dsrCap(c: M1Case): { cap: number; text: string } {
  return c.lenderSector === "nonbank" ? { cap: 50, text: "비은행권 50%" } : { cap: 40, text: "은행권 40%" };
}

/**
 * 같은 전세대출에 함께 적용되는 다른 규제(8.28 행정지도에 함께 실린 기존 대책):
 * 유주택자 전세대출 한도 2억원(F828-09·10)과 1주택자 전세대출 DSR(F828-11·12).
 * 둘 다 수도권·규제지역 전셋집이 대상이고, 같은 집 계속 거주 연장은 종전 기준·증액은 변경 기준이다.
 */
function companions(c: M1Case, card: Card) {
  const known = c.rentalRegion !== undefined;
  const inArea = known ? isCapital(c.rentalRegion!) || c.rentalRegulated === true : undefined;
  if (known && !isCapital(c.rentalRegion!) && c.rentalRegulated === undefined) card.fact("G-07");
  if (inArea === false && c.rentalRegulated === false) {
    card.basis("함께 보는 규제", "전셋집이 수도권·규제지역이 아니라 유주택자 전세대출 한도(2억원)와 1주택자 전세대출 DSR 대상이 아닙니다.", ["F828-09", "F828-11"]);
    return;
  }
  const where = inArea ? "" : "전셋집이 수도권·규제지역이면 ";
  const changes = c.increase === true || c.action === "new" || c.refinance || (c.action === "renewal" && c.sameHome === false);
  if (changes) {
    const over = c.newLoanAmount && c.newLoanAmount > LIMIT ? ` 늘린 뒤 금액 ${won(c.newLoanAmount)}은 한도 2억원을 넘습니다.` : "";
    card.basis("유주택자 전세대출 한도 2억원", `${where}대출금액을 늘리면 변경된 규정이 적용되어 한도가 2억원입니다(배우자 보유 주택 포함 유주택자).${over}`, ["F828-09", "F828-10"]);
    card.basis("1주택자 전세대출 DSR", `${where}신규 취급·증액이면 차주단위 DSR(${dsrCap(c).text}, 스트레스 DSR 포함)을 적용합니다. 버팀목 등 정책 전세대출은 제외입니다.`, ["F828-11", "F828-12"]);
  } else {
    card.basis("유주택자 전세대출 한도 2억원", `${where}같은 집에 계속 살며 대출금액 그대로 연장하면, 그 집의 최초 임대차계약이 '25.9.7까지였던 경우 종전 한도까지 됩니다.`, ["F828-09", "F828-10"]);
    card.basis("1주택자 전세대출 DSR", `${where}같은 집에 계속 살며 대출금액 그대로 연장하면 DSR을 적용하지 않습니다.`, ["F828-11", "F828-12"]);
  }
  if (c.sameHome === false) card.cond("다른 집으로 이사하며 받는 전세대출은 '계속 거주 연장'이 아니므로 한도·DSR은 신규 기준으로 봅니다.");
  if (!known && changes) card.ask("고객이 사는 전셋집의 소재지(시도)는? (수도권·규제지역이면 한도 2억원·DSR 적용)");
}

/** 만기가 '27.1.1 이후라 경과조치(종전 규정)를 못 쓰는 연장 건: 결론 앞에 그 이유를 붙인다(기준: 만기도래일, F828-01) */
function lateLead(c: M1Case, kb: KbVersion): string {
  if (kb !== "v2" || c.action === "new" || !c.maturityDate || c.maturityDate <= D.TRANSITION_LAST || c.refinance) return "";
  return `만기가 ${fmt(c.maturityDate)}로 '27.1.1 이후라 경과조치(종전 규정)를 적용할 수 없습니다. `;
}

/** 예외 ②승계 ③보증금 미반환 ④퇴거 일정 조정은 원문(F813-07)상 '연장'에만 있다 → 신규 신청에는 쓸 수 없다 */
const RENEWAL_ONLY = new Set<string>(["succession", "deposit_unreturned", "short_extension"]);
const EXC_NAME: Record<string, string> = { succession: "임대차 승계(예외②)는", deposit_unreturned: "보증금 미반환(예외③)은", short_extension: "퇴거 일정 조정(예외④)은" };

function exceptions(c: M1Case, card: Card, kb: KbVersion): Verdict {
  // 기존 대출 만기일이 함께 나오면 연장 건으로 본다(연장 전용 예외 + 만기일 = 연장 신호가 둘)
  if (c.action === "new" && !c.maturityDate && c.exception && RENEWAL_ONLY.has(c.exception)) {
    // 연장 전용 예외가 신규로 읽혔다: 실제 신규면 불가, 실은 기존 대출 연장이면 그 예외로 가능 → 단정하지 않고 묻는다(가능 쪽으로 새지 않음)
    card.step("S6 예외", `${EXC_NAME[c.exception]} 연장에만 인정되는 예외 → 신규 신청이면 적용 불가`, ["F813-06", "F813-07"]);
    return card
      .ask("지금 있는 전세대출을 연장하는 건인가요, 새로 받는 전세대출인가요? (연장이면 이 예외로 가능, 신규면 적용 불가)")
      .cond("법적 의무 실거주(예외①)나 여신심사위원회가 인정하는 불가피한 비거주(예외⑤)에 해당하면 신규도 가능합니다.")
      .done("역질문", `${lateLead(c, kb)}${EXC_NAME[c.exception]} 기존 전세대출을 연장할 때만 인정되는 예외라, 비거주 1주택자가 새로 받는 전세대출에는 적용되지 않습니다. 연장 건인지 확인하세요.`);
  }
  switch (c.exception) {
    case "succession":
      card.step("S6 예외②", "임대차 승계 조건부 취득", kb === "v2" ? ["F813-07", "F828-05"] : ["F813-07"]);
      if (kb === "v2") card.cond("승계 시점에 유효한 임대차계약만 인정");
      return card
        .cond("승계한 임대차계약의 종료일까지만 연장")
        .doc("매매계약서(승계 조건)", "승계한 임대차계약서")
        .done("조건부", "승계한 세입자의 계약이 끝날 때까지 연장할 수 있습니다.");
    case "deposit_unreturned":
      card.step("S6 예외③", "임대인 보증금 미반환", ["F813-07"]);
      if (kb === "v2") card.fact("F828-04").doc("보증금 미반환 증빙 중 하나: 내용증명, 반환보증 이행청구, 임차권등기명령, 소송·경매");
      else card.doc("보증금 미반환 증빙(증빙 종류는 공표 자료에 명시 없음)");
      return card
        .cond("A은행 지침 제5조 2항: 연장 기간은 1년 이내로 하고, 만기 때 진행 상황을 다시 확인합니다.")
        .done("조건부", "보증금을 돌려받지 못해 상환이 어려우면 만기연장이 허용됩니다. 미반환 증빙을 받으세요.");
    case "short_extension":
      card.step("S6 예외④", "퇴거 예정이나 일정 조정 필요", ["F813-07"]);
      return card
        .cond("A은행 지침 제5조 1항: 퇴거 예정일 확인 서류를 받고 6개월 이내, 1회만 연장합니다(정부 자료는 '예: 6개월 내'로 예시만 듦).")
        .doc("퇴거 예정일 확인 서류(A은행 지침: 새 임대차계약서, 이사 일정 확인서 등)")
        .done("조건부", "퇴거 일정 조정이 필요하면 단기 연장(예: 6개월 이내)이 가능합니다.");
    case "other_inevitable":
      card.step("S6 예외⑤", "그 밖의 비거주 불가피성 → 여신심사위 판단", ["F813-07", "F813-08"]);
      return card
        .cond("FAQ의 인정 예시는 '매매계약 후 갑작스러운 근무지 변경'입니다. 예시와 같은 유형이어도 결과는 여신심사위원회가 정합니다.")
        .doc("불가피성 증빙(A은행 지침 제3조: 근무지 변경이면 발령 공문·재직증명·매매계약일과 발령일 선후 자료, 질병·요양·부양이면 진단서·요양 확인서·가족관계증명서)")
        .done("심사위", "불가피하게 살지 못한 사정은 여신심사위원회가 인정해야 합니다. 지점이 확답하지 말고 상정 서류를 준비하세요.");
    case "none":
      card.step("S6 예외", "예외 사유 없음", ["F813-06", "F813-07"]);
      return card.done("불허", `${lateLead(c, kb)}비거주 1주택자이고 예외 사유가 없어 전세대출 신규·연장이 제한됩니다.`);
    default:
      card.step("S6 예외", "예외 사유 미확인 → 원칙 제한", ["F813-06", "F813-07"]);
      return card
        .ask(EXCEPTION_Q)
        .cond("규제 회피 방법(조기 연장 등)은 안내하지 않습니다.")
        .done("불허", `${lateLead(c, kb)}비거주 1주택자는 원칙적으로 전세대출 신규·연장이 제한됩니다. 예외 사유에 해당하는지 확인하세요.`);
  }
}

/**
 * 규제별 신규 신청 경과조치(F828-10·12): 기준일까지 신청했거나, 임대차계약+계약금 납부 또는 전산 신청 접수를 마쳤으면 종전 규정.
 * 기준일은 data/kb/house_scopes.json(newCutoff). 셋 중 하나라도 기준일 이전이면 종전, 모두 기준일 뒤면 변경 규정, 모르면 undefined.
 */
function oldRuleForNew(c: M1Case, reg: "R907" | "RDSR"): { old?: boolean; why: string; facts: string[] } {
  const cut = (SCOPES[reg] as { newCutoff?: string }).newCutoff!;
  const facts = (SCOPES[reg] as { newCutoffFacts?: string[] }).newCutoffFacts ?? [];
  const dates: [string, string | undefined][] = [["신청", c.applicationDate], ["임대차계약·계약금 납부", c.leaseDepositDate], ["전산 신청 접수", c.intakeDate]];
  const before = dates.find(([, d]) => d && d <= cut);
  if (before) return { old: true, why: `${before[0]} ${fmt(before[1]!)} — 기준일 ${fmt(cut)}까지 마쳐 종전 규정(경과조치)`, facts };
  if (dates.some(([, d]) => d)) {
    const known = dates.filter(([, d]) => d).map(([k, d]) => `${k} ${fmt(d!)}`).join(", ");
    const allKnown = dates.every(([, d]) => d);
    return { old: allKnown ? false : (c.applicationDate && c.applicationDate > cut ? false : undefined), why: `${known} — 기준일 ${fmt(cut)} 이후`, facts };
  }
  return { old: undefined, why: "", facts };
}

/**
 * 다른 규제(한도 2억원·DSR)가 신청 그대로를 확정적으로 막으면, 8.13 판정이 무엇이든(역질문·보류·조건부·심사위·허용)
 * 묻는 그대로는 불허다. 8.13 쪽 결론과 확인 항목은 '함께 보는 규제'로 남긴다(규제는 서로 독립 — 하나라도 막으면 막힘).
 */
/** 가능 쪽 결론(허용·조건부)인데 남은 답 하나로 불가가 될 수 있으면 '고객 확인 필요'로 둔다. 8.13 결론은 조건으로 남긴다 */
function askBeforeAllow(v: Verdict, head: string): Verdict {
  if (v.verdict !== "허용" && v.verdict !== "조건부") return v;
  return { ...v, verdict: "역질문", headline: `${v.headline} 단, ${head}` };
}

function blockBy(v: Verdict, head: string, trace: Verdict["trace"], facts: string[], gaps: string[], cond: string): Verdict {
  if (v.verdict === "불허") return { ...v, conditions: [...v.conditions, cond], facts, gaps, trace };
  const m813 = v.verdict === "허용" ? v.headline : `[8.13 비거주 1주택자 제한: ${v.verdict}] ${v.headline}`;
  return {
    ...v,
    verdict: "불허",
    headline: `${head} ${v.verdict === "허용" ? v.headline : ""}`.trim(),
    conditions: [cond, ...(v.verdict === "허용" ? [] : [m813]), ...v.conditions],
    questions: v.questions.map((q) => (q.startsWith("(참고)") ? q : `(참고) ${q}`)),
    facts,
    gaps,
    trace,
  };
}

/**
 * 유주택자 전세대출 한도 2억원(F828-09)을 판정에 반영한다(8.13 대상 여부와 별개 규제).
 * 신청 금액이 2억원을 넘고, 전셋집이 수도권·규제지역이고, 주택을 보유했고(배우자 포함, 주택 수 산정 예외와 무관 — F401-15),
 * 같은 집 계속 거주·무증액 연장(F828-10 종전 한도)이 아니면 → 그 금액으로는 취급할 수 없다.
 * 8.13 결론이 허용(또는 신규의 조건부)이어도 신청 금액 그대로는 불허. 연장 증액의 조건부·불허·보류 등이면 조건으로만 덧붙인다.
 */
export function applyLimit(c: M1Case, v: Verdict, kb: KbVersion): Verdict {
  // 한도를 검사할 금액: 신규·증액은 그 후 금액, 무증액 연장은 연장하는 현재 대출금액(한도는 연장에도 적용 — F828-10 '종전 한도까지'는 예외 조건)
  const amount = c.newLoanAmount ?? (c.action === "renewal" && c.increase !== true ? c.loanAmount : undefined);
  if (kb !== "v2" || !amount || amount <= LIMIT) return v;
  // 한도 2억원의 '유주택자' = 차주 + 배우자 보유 주택(주택 수 산정 예외 없음, F828-09·F401-15)
  const owns = (countFor(c, "R907", { kb, asOf: c.asOf ?? today() }).count ?? 0) >= 1 || c.targetAsserted;
  const inArea = c.rentalRegion ? isCapital(c.rentalRegion) || c.rentalRegulated === true : undefined;
  // 전세대출 만기연장은 보통 같은 집 계약 갱신 → 다른 집이라고 나온 경우만 제외(모르면 같은 집으로 보고 최초 계약일을 묻는다)
  const keepRenewal = c.action === "renewal" && c.increase !== true && c.sameHome !== false;
  const keepsOld = keepRenewal && c.firstLeaseBy0907 === true;
  // 신규 신청 경과조치('25.9.7까지 신청·계약+계약금·전산 접수, F828-10)
  const tr = c.action === "new" ? oldRuleForNew(c, "R907") : { old: undefined, why: "", facts: [] as string[] };
  if (tr.old === true) {
    return { ...v, conditions: [...v.conditions, `유주택자 전세대출 한도 2억원: ${tr.why}이라 종전 한도를 적용합니다.`], facts: [...new Set([...v.facts, "F828-09", ...tr.facts])], trace: [...v.trace, { step: "한도", result: `경과조치: ${tr.why}`, facts: ["F828-10"] }] };
  }
  if (!owns || inArea === false || keepsOld) return v;
  const amt = won(amount);
  const what = c.newLoanAmount ? "신청 금액" : "연장 금액";
  const why = c.newLoanAmount ? "" : (keepRenewal ? "(같은 집 최초 임대차계약이 '25.9.7 이후라 종전 한도 유지 대상 아님)" : "(같은 집 계속 거주 무증액 연장이 아니라 종전 한도 유지 대상 아님)");
  // 같은 집 무증액 연장인데 최초 임대차계약일을 모르면: 그 날짜가 종전 한도 유지 여부를 정한다 → 묻는다(막지 않음)
  if (keepRenewal && c.firstLeaseBy0907 === undefined && inArea !== undefined) {
    const q = "지금 전셋집의 최초 임대차계약을 2025.9.7까지 체결했나요? (그렇다면 종전 한도까지 연장, 아니면 유주택자 한도 2억원 적용)";
    // 이 날짜 하나로 가능 ↔ 불가가 뒤집히므로 가능 쪽 결론(허용·조건부)은 확정하지 않는다(관대한 오류 방지)
    return askBeforeAllow({ ...v, questions: v.questions.includes(q) ? v.questions : [...v.questions, q], conditions: [...v.conditions, `연장 금액 ${amt}은 유주택자 전세대출 한도 2억원을 넘습니다. 같은 집의 최초 임대차계약이 '25.9.7까지였을 때만 종전 한도까지 연장할 수 있습니다.`], facts: [...new Set([...v.facts, "F828-09", "F828-10"])] }, `같은 집의 최초 임대차계약이 '25.9.7 이후면 연장 금액 ${amt}은 유주택자 전세대출 한도 2억원을 넘어 그대로는 연장할 수 없습니다. 최초 임대차계약일을 확인하세요.`);
  }
  if (inArea === undefined) {
    const q = "고객이 사는 전셋집의 소재지(시도)는? (수도권·규제지역이면 한도 2억원·DSR 적용)";
    const out = { ...v, questions: v.questions.includes(q) ? v.questions : [...v.questions, q], conditions: [...v.conditions, `전셋집이 수도권·규제지역이면 ${what} ${amt}은 유주택자 전세대출 한도 2억원을 넘습니다.`], facts: [...new Set([...v.facts, "F828-09"])] };
    // 이 답 하나로 가능 ↔ 불가가 뒤집히므로, 가능 쪽 결론(허용·조건부)은 확정하지 않고 고객 확인으로 둔다(관대한 오류 방지)
    return askBeforeAllow(out, `전셋집이 수도권·규제지역이면 ${what} ${amt}은 유주택자 전세대출 한도 2억원을 넘어 그대로는 취급할 수 없습니다. 전셋집 소재지를 확인하세요.`);
  }
  const trace = [...v.trace, { step: "한도", result: `유주택자·수도권·규제지역 전셋집 → 한도 2억원, ${what} ${amt} 초과${why}`, facts: ["F828-09", "F828-10"] }];
  const facts = [...new Set([...v.facts, "F828-09", "F828-10"])];
  // 한도는 8.13과 별개 규제 → 신청 금액 그대로는 어떤 8.13 결론이든 불가(blockBy)
  return blockBy(v, `${what} ${amt}은 유주택자 전세대출 한도 2억원을 넘어 그대로는 취급할 수 없습니다${why}.`, trace, facts, v.gaps, "한도 2억원 이내 금액이면 다른 규제(아래) 판단에 따릅니다.");
}

/**
 * 1주택자 전세대출 DSR(F828-11·12)을 판정에 반영한다(8.13 대상 여부와 별개 규제).
 * 질문에 DSR 비율이 나오고, 신규·증액이며, 전셋집이 수도권·규제지역이고, 주택을 보유했으면(세대 기준 1주택 — 세대 정의는 F401-20),
 * 은행권 40%(비은행권 50%)를 넘으면 그 조건으로는 취급할 수 없다. 버팀목·협약 전세대출은 제외(질문에 나오면 추출기가 OUT·조건으로).
 * 같은 집 계속 거주 무증액 연장은 DSR 미적용(F828-12).
 */
export function applyDsr(c: M1Case, v: Verdict, kb: KbVersion): Verdict {
  if (kb !== "v2" || c.dsrRatio === undefined) return v;
  // DSR 미적용은 '기존 주택에 계속 거주하며' 무증액 연장할 때만(F828-12) → 다른 집으로 옮기며 연장하면 적용
  const changes = c.action === "new" || c.increase === true || c.refinance || (c.action === "renewal" && c.sameHome === false);
  // '1주택자'는 세대 기준(F828-11). 같은 세대 가족 명의 주택은 세대원이면 넣는다(F401-20, decide)
  const hh = countFor(c, "RDSR", { kb, asOf: c.asOf ?? today() });
  const d = decide(hh);
  if (d.applies === false) {
    if (!changes || (hh.count === 0 && hh.alt === undefined)) return v;
    return {
      ...v,
      conditions: [...v.conditions, `1주택자 전세대출 DSR은 세대 기준입니다. ${d.text} 질문의 DSR ${c.dsrRatio}%로 이 규정을 적용하지 않습니다.`, ...(d.premise ? [d.premise] : [])],
      facts: [...new Set([...v.facts, "F828-11", ...(hh.alt !== undefined ? ["F401-20"] : [])])],
    };
  }
  const owns = hh.count === 1 || (countFor(c, "R907", { kb, asOf: c.asOf ?? today() }).count ?? 0) >= 1 || c.targetAsserted;
  const inArea = c.rentalRegion ? isCapital(c.rentalRegion) || c.rentalRegulated === true : undefined;
  if (!changes || !owns || inArea === false) return v;
  if (c.policyLoan === true) return { ...v, conditions: [...v.conditions, "버팀목·협약 등 정책 목적 전세대출이라 1주택자 전세대출 DSR을 적용하지 않습니다."], facts: [...new Set([...v.facts, "F828-11"])] };
  const tr = c.action === "new" ? oldRuleForNew(c, "RDSR") : { old: undefined, why: "", facts: [] as string[] };
  if (tr.old === true) return { ...v, conditions: [...v.conditions, `1주택자 전세대출 DSR: ${tr.why}이라 종전 규정입니다.`], facts: [...new Set([...v.facts, "F828-11", ...tr.facts])] };
  const { cap, text: capText } = dsrCap(c);
  if (inArea === undefined) {
    const q = "고객이 사는 전셋집의 소재지(시도)는? (수도권·규제지역이면 한도 2억원·DSR 적용)";
    const out = { ...v, questions: v.questions.includes(q) ? v.questions : [...v.questions, q] };
    // DSR이 이미 기준을 넘으면 소재지 하나로 가능 ↔ 불가가 갈린다 → 가능 쪽 결론을 확정하지 않는다
    if (c.dsrRatio > cap) return askBeforeAllow({ ...out, conditions: [...out.conditions, `전셋집이 수도권·규제지역이면 차주단위 DSR ${c.dsrRatio}%가 ${capText}를 넘어 취급할 수 없습니다.`], facts: [...new Set([...out.facts, "F828-11"])] }, `전셋집이 수도권·규제지역이면 차주단위 DSR ${c.dsrRatio}%가 ${capText}를 넘어 그대로는 취급할 수 없습니다. 전셋집 소재지를 확인하세요.`);
    return out;
  }
  if (c.dsrRatio <= cap) return { ...v, conditions: [...v.conditions, `1주택자 전세대출 DSR ${c.dsrRatio}%는 ${capText} 이내입니다.`], facts: [...new Set([...v.facts, "F828-11"])] };
  const trace = [...v.trace, { step: "DSR", result: `1주택자·수도권·규제지역 전셋집 신규·증액 → 차주단위 DSR ${capText}, 산출 ${c.dsrRatio}% 초과`, facts: ["F828-11", "F828-12"] }];
  const facts = [...new Set([...v.facts, "F828-11", "F828-12", ...(hh.alt !== undefined ? ["F401-20"] : [])])];
  const gaps = v.gaps;
  const policy = c.policyLoan === false ? " 일반 상품이라 정책 목적 전세대출 제외에 해당하지 않습니다." : c.policyLoan === undefined ? " (버팀목·협약 등 정책 목적 전세대출이면 DSR을 적용하지 않습니다.)" : "";
  const out = blockBy(v, `차주단위 DSR ${c.dsrRatio}%가 ${capText}를 넘어 이 조건으로는 전세대출을 취급할 수 없습니다.${policy}`, trace, facts, gaps, "DSR이 기준 이내가 되면 다른 규제(아래) 판단에 따릅니다.");
  return d.premise ? { ...out, conditions: [...out.conditions, d.premise], documents: [...new Set([...out.documents, "주민등록등본·가족관계증명서(세대원 관계 확인)"])] } : out;
}

/**
 * 규제별 주택 수(lib/rules/scope.ts): 8.13 제한·한도 2억원·1주택자 DSR은 주택 수를 세는 범위가 다르다.
 * 범위에 따라 실제로 수가 달라지거나(가족 명의 주택), 질문이 범위를 붙여 수를 말했으면 카드에 규제별로 보여 준다.
 */
/**
 * 함께 보는 규제 설명(한도 2억원·DSR)이 판정 중간에 끝난 경로(대상 주택 확인 전 역질문, 8.13 비대상 허용 등)에서 빠지지 않게 한다.
 * 현장 검토(11/22): "증액 연장 최대 2억원 맞나요?"에 보유 주택 소재지만 묻고 한도에는 답하지 않았다.
 * 설명(basis)과 결과 카드에 바로 보이는 조건 한 줄만 붙인다 — 판정 코드·질문은 바꾸지 않는다(한도로 막는 판정은 applyLimit이 따로 한다).
 */
export function limitInfo(c: M1Case, v: Verdict, kb: KbVersion): Verdict {
  if (kb !== "v2" || v.verdict === "불허") return v;
  if (v.basis?.some((b) => b.label === "유주택자 전세대출 한도 2억원")) return v;
  const changes = c.increase === true || c.action === "new" || c.refinance || (c.action === "renewal" && c.sameHome === false);
  if (!changes) return v;
  const owns = (countFor(c, "R907", { kb, asOf: c.asOf ?? today() }).count ?? 0) >= 1 || c.targetAsserted;
  if (!owns) return v;
  const inArea = c.rentalRegion ? isCapital(c.rentalRegion) || c.rentalRegulated === true : undefined;
  if (inArea === false && c.rentalRegulated === false) return v;
  const where = inArea ? "" : "전셋집이 수도권·규제지역일 때, ";
  const over = c.newLoanAmount && c.newLoanAmount > LIMIT ? ` 늘린 뒤 금액 ${won(c.newLoanAmount)}은 한도 2억원을 넘습니다.` : "";
  const basis = [
    ...(v.basis ?? []),
    { label: "유주택자 전세대출 한도 2억원", text: `${where}대출금액을 늘리거나 새로 받으면 변경된 규정이 적용되어 한도가 2억원입니다(배우자 보유 주택 포함 유주택자).${over}`, facts: ["F828-09", "F828-10"] },
    { label: "1주택자 전세대출 DSR", text: `${where}신규 취급·증액이면 차주단위 DSR(${dsrCap(c).text}, 스트레스 DSR 포함)을 적용합니다. 버팀목 등 정책 전세대출은 제외입니다.`, facts: ["F828-11", "F828-12"] },
  ];
  // 금액을 모르면 applyLimit이 조건을 남기지 않으므로, 묻는 말(한도)에 대한 답을 접힌 설명이 아니라 조건 줄에도 둔다
  const line = `${where}대출금액을 늘리거나 새로 받으면 유주택자 한도 2억원과 DSR(${dsrCap(c).text})을 적용합니다.`;
  const conditions = v.conditions.some((x) => x.includes("한도 2억원")) ? v.conditions : [...v.conditions, line];
  return { ...v, basis, conditions, facts: [...new Set([...v.facts, "F828-09", "F828-10", "F828-11", "F828-12"])] };
}

export function withScopes(c: M1Case, v: Verdict, kb: KbVersion): Verdict {
  if (kb !== "v2") return v;
  const ctx = { kb, asOf: c.asOf ?? today() };
  const regs = ["R813", "R907", "RDSR"] as const;
  if (!scopesDiffer(c, [...regs], ctx) && !c.countClaims?.length) return v;
  const items = regs.map((r) => {
    const sc = countFor(c, r, ctx);
    return { label: `주택 수 — ${SCOPES[r].label}`, text: decide(sc).text, facts: SCOPES[r].facts };
  });
  return { ...v, basis: [...(v.basis ?? []), ...items], facts: [...new Set([...v.facts, ...items.flatMap((i) => i.facts)])] };
}

/**
 * 같은 질문에 8.13 제한과 다른 규제(한도 2억원·1주택자 DSR)가 함께 나오면, 8.13 쪽 결론에 규제 이름을 붙인다.
 * (예: DSR을 묻는데 '비수도권 주택은 규제지역일 때만 대상'이 라벨 없이 나오면 DSR도 보유 주택 소재지를 보는 것처럼 읽힌다 —
 *  DSR의 1주택자는 보유 주택 소재지와 무관, F828-11)
 */
export function labelMain(c: M1Case, v: Verdict): Verdict {
  const multi = c.dsrRatio !== undefined || (c.newLoanAmount !== undefined && c.newLoanAmount > LIMIT);
  if (!multi || /^(신청 금액|차주단위 DSR|세대 범위|\[8\.13|8\.13 )/.test(v.headline)) return v;
  return { ...v, headline: `[8.13 비거주 1주택자 제한] ${v.headline}` };
}

/**
 * 전세대출은 보증을 거친다. 정부 규제(8.13·한도·DSR)는 그대로 판정하되, 같은 세대 가족(본인·배우자 외) 명의 주택이 있으면
 * 보증기관 내규가 그 주택을 합산하는지(기존 다주택자 보증 제한 포함)는 공개 자료에 없음(G-14)을 조건으로 드러낸다.
 * 판정은 바꾸지 않는다 — 보증 적격성은 보증기관이 따로 심사하고, 그 기준을 묻는 질문은 기준 답변(G-14 → 보류)이 맡는다.
 * (11/22 측정: 판정을 보류로 바꾸면 정부 규제만 묻는 질문까지 보류가 돼 보수적 오류가 늘었다)
 */
export function guarantorFamily(c: M1Case, v: Verdict): Verdict {
  if (v.verdict !== "허용" && v.verdict !== "조건부") return v;
  const fam = (c.houses ?? []).filter((h) => h.owner === "household").length + (c.otherHouseholdHouses ?? 0);
  if (!fam) return v;
  const note = `같은 세대 가족 명의 주택 ${fam}채를 보증기관(HUG·HF·SGI) 내규가 주택 수에 합산하는지는 공개 자료에 없습니다. 보증 심사에서 확인하세요.`;
  return {
    ...v,
    conditions: v.conditions.includes(note) ? v.conditions : [...v.conditions, note],
    gaps: [...new Set([...v.gaps, "G-14"])],
  };
}
