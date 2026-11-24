// M2 — 4.1 다주택자 수도권·규제지역 APT 주담대 만기연장 제한 (docs/RULES.md §3)
import { addMonths, addYears, D, fmt, maxDate, minDate, today } from "./dates";
import { evalHouse, isCapital, type HouseCount } from "./houses";
import { countFor, decide, SCOPES } from "./scope";
import type { ISODate, KbVersion, M2Case, Tenant, Verdict } from "./types";
import { Card } from "./verdict";

const EXCEPTION_Q = "만기연장 예외 사유: 임차인이 있는지(계약 기간), 등록임대사업자인지, 법적 의무(전매제한·실거주의무)가 있는지, 4.1 이전에 연장을 통보받았는지";
const PUBLIC_Q = "공익 목적 법인(민간임대리츠·공익법인)인가요? (그렇다면 제한의 예외입니다)";
/** 이미 임차인 이야기가 나온 건은 '다른' 예외 사유만 묻는다 */
const OTHER_EXCEPTION_Q = "다른 만기연장 예외 사유: 등록임대사업자인지, 법적 의무(전매제한·실거주의무)가 있는지, 4.1 이전에 연장을 통보받았는지";

interface Candidate {
  label: string;
  end?: ISODate; // 연장 가능 종료일(모르면 undefined)
  endText: string; // 화면 표기
  limited: boolean; // 기간이 제한되는 성격(자진말소·통보 등)
  facts: string[];
  docs: string[];
}

export function judgeM2(c: M2Case, kb: KbVersion): Verdict {
  const v = judgeM2Core(c, kb);
  // 담보 소재지를 모른 채 '불허'가 나오면, 담보가 수도권 밖 비규제지역일 때 결론이 뒤집힌다 → 확인 항목에 올린다(F401-02)
  // 담보 소재지·유형: collateral이 비어 있으면 담보로 표시된 주택, 그것도 없으면 본인 명의로 나온 유일한 주택(주담대 담보일 수밖에 없음)에서 찾는다
  const own = (c.houses ?? []).filter((h) => !h.owner || h.owner === "self");
  const colH = c.houses?.find((h) => h.isCollateral) ?? (own.length === 1 ? own[0] : undefined);
  const col = { region: c.collateral?.region ?? colH?.region, isApt: c.collateral?.isApt ?? colH?.isApt };
  if (v.verdict === "불허" && (!col.region || col.isApt === undefined) && !v.questions.some((q) => q.includes("소재지")))
    return {
      ...v,
      // 현장 피드백(11/24): 소재지를 모르는데 맨 위에 '불가'가 뜨면 전제 설명이 있어도 확정 결론으로 읽힌다
      // → 판정은 '고객 확인 필요'(역질문)로 두고, 소재지별 결론은 갈림길 답(branches.ts)으로 함께 보여 준다
      verdict: "역질문",
      headline: `담보 주택의 ${col.isApt === true ? "소재지" : "소재지·아파트 여부"}를 확인해야 결론이 납니다. 수도권·규제지역 아파트이면: ${v.headline}`,
      // 현장 피드백(11/22): 담보 지역·유형을 확인하기 전에 '불가'만 보이면 확정 결론처럼 읽힌다 → 전제를 결론 바로 아래에 밝힌다
      premise: col.isApt === false ? undefined : "담보가 수도권·규제지역 아파트라는 전제의 결론입니다. 담보가 수도권 밖 비규제지역이거나 아파트가 아니면 이 제한 대상이 아닙니다.",
      // 아파트인 건 이미 알면 소재지만 묻는다(문장에 '아파트'가 있으면 답변 칸이 아파트 여부·소재지 두 칸으로 나뉜다 — answerItems)
      questions: [
        ...v.questions,
        col.isApt === true
          ? "담보 주택의 소재지(시군구)는? (수도권 밖 비규제지역이면 이번 제한 대상이 아닙니다)"
          : "담보 주택의 소재지(시군구)와 아파트 여부는? (수도권 밖 비규제지역이거나 아파트가 아니면 이번 제한 대상이 아닙니다)",
      ],
    };
  return v;
}

function judgeM2Core(c: M2Case, kb: KbVersion): Verdict {
  const card = new Card("M2", kb);

  // T1 대출 용도
  if (c.loanPurpose === "interim" || c.loanPurpose === "relocation") {
    card.step("T1 용도", c.loanPurpose === "interim" ? "중도금대출" : "이주비대출", ["F401-05"]);
    return card.done("허용", "중도금·이주비 대출은 만기연장 제한 대상에서 제외됩니다.");
  }
  // 주택 수를 범위를 붙여 말했거나(countClaims) 동의를 거부했으면 '주택 수 확인'으로 넘기지 않고 일반 경로로 판정한다
  if (c.loanPurpose === "commercial" && c.houseCount === undefined && !c.countClaims?.length && !c.consentRefused && (c.houses ?? []).every((h) => h.isCollateral)) {
    card.step("T1 용도", "상가 등 비주택 임대사업용 주담대", ["F401-16"]);
    return card
      .ask("차주의 세대 기준 보유 주택 수는?")
      .done("조건부", "상가 등 임대사업용이어도 수도권·규제지역 아파트 담보이고 차주가 다주택자이면 제한 대상입니다. 주택 수를 확인하세요.");
  }
  if (c.loanPurpose) card.step("T1 용도", `${{ general: "일반", living: "생활안정자금", commercial: "임대사업용" }[c.loanPurpose]} 주담대 → 제한 대상 용도`, ["F401-05"]);

  // 담보 주택 자체가 주택 예외(F401-03 8가지)면, 주택 수와 관계없이 그 담보 대출은 만기연장 제한 대상에서도 예외다
  // (401본 2-(1): "보유 주택 수 산정시 제외하고, 만기연장 제한 대상 주택에서도 예외 인정")
  // 담보 = collateral + 보유 목록에서 담보로 표시된 주택(isCollateral)의 정보(태그·지역·취득 시 기준시가)를 합친 것
  const colHouse = c.houses?.find((h) => h.isCollateral);
  const colAll = colHouse || c.collateral ? { ...(colHouse ?? {}), ...Object.fromEntries(Object.entries(c.collateral ?? {}).filter(([, v]) => v !== undefined)), tags: [...new Set([...(colHouse?.tags ?? []), ...(c.collateral?.tags ?? [])])] } : undefined;
  if (colAll && (colAll.tags.length || (colHouse && colAll.sigungu))) {
    const e = evalHouse({ ...colAll, label: colAll.label ?? "담보 주택" }, "M2", { kb, asOf: c.asOf ?? today() });
    if (e.status === "excluded") {
      card.step("T1 담보 주택 예외", `${e.reason} — 담보 주택 자체가 예외 주택`, e.facts);
      if (e.provisional) card.oblige(e.provisional);
      return card.doc(...e.docs).done(e.provisional ? "조건부" : "허용", `담보 주택이 예외 주택이라(${e.reason.replace(/^.*?: /, "").replace(/ → .*$/, "")}) 주택 수와 관계없이 이 담보 대출은 만기연장 제한 대상에서 제외됩니다. 증빙을 받으세요.`);
    }
    if (e.status === "committee") {
      card.step("T1 담보 주택 예외", e.reason, e.facts);
      return card.done("심사위", `${e.reason}. 담보 주택이 예외에 준하는지는 여신심사위원회가 판단합니다.`);
    }
    if (e.status === "hold") {
      card.step("T1 담보 주택 예외", e.reason, e.facts);
      return card.ask(e.question ?? "").done("보류", `${e.reason}. 본점 확인이 필요합니다.`);
    }
    if (e.status === "ask") {
      card.step("T1 담보 주택 예외", e.reason, e.facts);
      return card.ask(e.question ?? "").doc(...e.docs).done("역질문", e.plain ?? e.reason);
    }
    if (e.reason) card.step("T1 담보 주택 예외", e.reason, e.facts);
  }

  // 주택보유현황 심사 동의(F828-08): 만기연장 때 차주(세대기준) 동의를 받아 HOMS로 주택 수를 확인한다.
  // 동의서 제출(법인은 확약)을 거부하면 주택 수를 확인할 수 없고, 원문은 '만기연장 불허'라고 정한다 → 예외 사유 주장과 무관하게 불허
  if (c.consentRefused) {
    card.step("T2 주택보유현황 심사", "차주가 주택보유 확인 동의(법인은 확약)를 거부", ["F828-08", "F401-17"]);
    return card.done("불허", "주택보유현황 확인 동의(법인은 확약)를 거부하면 만기연장을 불허합니다. 예외 사유가 있어도 주택 보유 확인이 먼저입니다.");
  }

  let whyCounted: string[] = [];
  // T2 대상 차주
  let landlord = c.borrowerType === "individual_landlord" || c.borrowerType === "corporate_landlord";
  // 개인 임대사업자는 세대 기준 주택 수로도 판단된다(F401-01). 세대 주택이 2채 이상이면 임대사업자인지(주된 영업)와 무관하게 다주택자다
  // → 주된 영업(내부지침) 질문보다 주택 수를 먼저 본다. 주택 수를 모르거나 1채 이하일 때만 주된 영업이 결론을 가른다
  if (c.borrowerType === "individual_landlord" && c.landlordMainBusiness === undefined) {
    const pre = r401(c, kb);
    if (pre.count !== undefined && pre.count >= 2 && !pre.blocking) {
      card.step("T2 차주", `세대 기준 ${pre.count}채 → 임대사업자인지(주된 영업)와 무관하게 다주택자`, ["F401-01", "F401-18"]);
      landlord = false;
    }
  }
  if (landlord) {
    if (c.landlordMainBusiness === undefined) {
      card.step("T2 차주", "임대사업자 해당 여부(주된 영업) 판단 필요", ["F401-01", "F401-18", "G-06"]);
      return card
        .doc("사업자등록증명", "직전 연도 부가세 과세표준증명 또는 종합소득세 신고서(신규 사업자는 생략)")
        .cond(
          "A은행 지침 제2조: 직전 연도 신고서상 부동산임대업 수입이 전체의 50% 이상이면 임대사업자로 봅니다. 주택·상가 임대 수입은 합산하므로 상가 임대 수입이 대부분이어도 해당될 수 있습니다.",
          "신고서가 없는 신규 사업자는 사업자등록증의 주업태로 판단하고, 다음 결산 후 다시 확인합니다(A은행 지침 제2조 3항).",
          "개인은 세대 기준으로 주택 수를 판단합니다.",
        )
        .done("내부지침", "임대업이 '주된 영업'인지는 금융회사 내부 기준(매출액 등)으로 판단합니다. A은행 지침 제2조를 확인하세요.");
    }
    if (c.landlordMainBusiness === "rental") {
      // HOMS 조회 불가는 '다주택자가 아님'을 다른 서류로 입증하는 절차다(F401-17) → 이미 다주택으로 확인됐으면 제한 판단으로 간다
      if (c.borrowerType === "corporate_landlord" && c.homsAvailable === false && !((r401(c, kb).count ?? 0) >= 2)) {
        card.step("T2 차주", "법인 임대사업자, HOMS 조회 불가", ["F401-17"]);
        return card
          .doc("자산보유내역서", "세무자료(종합부동산세 신고서 등)", "다주택자 아님 확약서")
          .cond("동의서·확약을 거부하면 만기연장 불허", "적발 시 기한이익상실 등 불이익")
          .done("조건부", "HOMS 조회가 안 되면 자산보유내역서·세무자료로 다주택자가 아님을 입증하고 확약받습니다.");
      }
      card.step("T2 차주", "임대사업자 → 제한 대상 차주", ["F401-01"]);
    }
  }
  if (!landlord || c.landlordMainBusiness === "other") {
    // (주택 수로 다주택자인 개인 임대사업자도 여기서 세대 기준으로 센다)
    const hc = r401(c, kb);
    const sc = countFor(c, "R401", { kb, asOf: c.asOf ?? today() });
    if (sc.claimed || c.houses?.some((h) => h.owner === "separated" || h.owner === "household")) card.basis(`주택 수 — ${SCOPES.R401.label}`, decide(sc).text, SCOPES.R401.facts);
    for (const e of hc.evals) if (e.reason && e !== hc.blocking) card.step("T2 주택 수", e.reason, e.facts);
    // 고객이 물은 주택이 예외가 안 돼 주택 수에 들어가면, 그 이유를 결론 문장 첫머리에 둔다(고객 안내의 핵심)
    whyCounted = hc.evals.filter((e) => e.status === "counted" && e.plain).map((e) => e.plain!);
    // 주택 수에 포함된 이유(증여·광역시 구 등)는 창구가 고객에게 설명해야 하므로 카드에 노출
    for (const e of hc.evals) if (e.status === "counted" && e.reason) card.cond(e.reason);
    if (hc.blocking) {
      const b = hc.blocking;
      // 판정을 막은 주택을 마지막 단계로 남긴다(질의서·FAQ 키가 '마지막 주택'이 아니라 결정 사유를 가리키도록)
      card.step("T2 주택 수 결정", b.reason, b.facts);
      if (b.status === "hold") return card.ask(b.question ?? "").done("보류", `${b.reason}. 본점 확인이 필요합니다.`);
      if (b.status === "committee") return card.done("심사위", `${b.reason}. 지점이 단독으로 확정할 수 없습니다.`);
      if (b.status === "ask") return card.ask(b.question ?? "").doc(...b.docs).done("역질문", b.plain ?? b.reason);
      if (b.status === "check") card.latest().cond(b.reason);
    }
    if (hc.count === undefined) {
      return card.step("T2 주택 수", "세대 기준 주택 수 모름", ["F401-01"]).ask("세대 기준 보유 주택 수는?").done("역질문", "세대 기준 주택 수를 먼저 확인해야 합니다.");
    }
    // 같은 세대 가족 명의 주택 때문에 다주택자 여부가 갈리면세대원 명의면 넣는다(세대 정의 F401-20) — 관계 확인을 카드에 드러낸다
    const dd = decide(sc);
    if (dd.premise) {
      card.step("T2 주택 수 결정", dd.text, ["F401-01", "F401-20"]);
      card.basis(`주택 수 — ${SCOPES.R401.label}`, dd.text, SCOPES.R401.facts).fact("F401-20").cond(dd.premise).doc("주민등록등본·가족관계증명서(세대원 관계 확인)");
    }
    const excl = hc.evals.filter((e) => e.status === "excluded");
    if (hc.count <= 1 && excl.length && c.houseCountIsMinimum && !c.conditionalDisposal) {
      // 질문은 '다주택'이라고만 했다 → 2채로 세면 제외 후 1채지만, 실제로 3채 이상이면 여전히 다주택자
      card.step("T2 주택 수", `정확한 세대 주택 수 모름('다주택'). 2채로 보면 제외 후 ${hc.count}채`, ["F401-01"]);
      card.doc(...excl.flatMap((e) => e.docs));
      return card
        .cond("세대 기준 보유 주택이 제외 주택 포함 2채일 때만 해당(3채 이상이면 여전히 다주택자)")
        .ask("세대 기준 보유 주택이 모두 몇 채인가요?")
        .done("조건부", `${excl.map((e) => e.plain ?? `${e.reason}.`).join(" ")} 그 밖의 보유 주택이 1채뿐이면 다주택자가 아니어서 제한 대상이 아닙니다.`);
    }
    if (hc.count <= 1 || c.conditionalDisposal) {
      card.step("T2 주택 수", c.conditionalDisposal ? "처분조건부 1주택자" : `산정 주택 ${hc.count}채 → 다주택자 아님`, ["F401-01"]);
      card.doc(...excl.flatMap((e) => e.docs));
      const why = excl.length ? `${excl.map((e) => e.plain ?? `${e.reason}.`).join(" ")} ` : "";
      if (!c.conditionalDisposal) card.fact("F401-20").cond("배우자 등 세대원 명의 주택까지 합친 세대 기준 주택 수입니다. 세대원 명의 주택이 더 있으면 결론이 달라집니다.");
      const prov = excl.flatMap((e) => (e.provisional ? [e.provisional] : []));
      if (prov.length && !c.conditionalDisposal) return card.oblige(...prov).done("조건부", `${why}다주택자가 아니므로 만기연장 제한 대상이 아닙니다.`);
      return card.done("허용", `${why}다주택자가 아니므로 만기연장 제한 대상이 아닙니다.`);
    }
    card.step("T2 주택 수", `세대 기준 ${hc.count}채 → 다주택자`, ["F401-01"]);
  }

  // T3·T4 담보·시행 시기 (쟁점 없는 질문 규칙)
  const noIssue =
    !c.collateral && !c.maturityDate && !c.tenant && !c.registeredRental && !c.legalObligationEnd && !c.legalObligation && c.notifiedBy0401 === undefined &&
    c.publicInterest === undefined && c.otherException === undefined && !(c.houses ?? []).some((h) => h.tags?.length || h.sigungu) &&
    (!c.loanPurpose || c.loanPurpose === "general");
  if (noIssue) {
    card.step("T3 담보", "담보·만기·예외 정보 없음", ["F401-01", "F401-02", "F401-12"]);
    // 역질문 항목(주택 수 제외·증여·대출 종류·예외 ①~⑥)의 근거
    card.fact("F401-03", "F401-04", "F401-05", "F401-06", "F401-07", "F401-08", "F401-09", "F401-10", "F401-11");
    return card
      .ask("담보 주택의 소재지와 아파트 여부(수도권·규제지역 아파트인가요?)", "세대 기준 주택 수와 각 주택의 취득 경위(상속·증여 등)", "대출 종류(일반 주담대·생활안정자금·중도금·이주비)", "4.1 기준 약정서상 만기일", EXCEPTION_Q)
      .done("역질문", "다주택자 만기연장은 담보·만기·예외 사유에 따라 결론이 달라집니다. 아래 항목을 확인하세요.");
  }
  const col = c.collateral;
  if (col && (col.isApt === false || (col.region && !isCapital(col.region) && col.regulated === false))) {
    card.step("T3 담보", "수도권·규제지역 아파트 아님", ["F401-02"]);
    return card.done("허용", "담보가 수도권·규제지역 아파트가 아니므로 이번 만기연장 제한 대상이 아닙니다.");
  }
  if (!col || col.isApt === undefined || !col.region) {
    card.cond("담보가 수도권·규제지역 아파트인 경우를 전제로 한 판정입니다.");
  } else if (!isCapital(col.region) && col.regulated === undefined) {
    // 비수도권 담보는 규제지역 지정 여부가 결론을 가른다(G-07). 지정 여부를 모르면 확정 불허를 내지 않는다(M1 S2와 같은 처리)
    card.step("T3 담보", `${col.region}: 비수도권. 현재 규제지역 지정 여부 확인 필요`, ["F401-02", "G-07"]);
    return card
      .latest()
      .cond(`${col.region} 소재 담보가 현재 규제지역이 아니면 이번 만기연장 제한 대상이 아닙니다.`, "규제지역이면 다주택자 만기연장은 원칙 불허이고, 임차인·등록임대 등 예외 사유를 확인해야 합니다.")
      .ask("담보 주택 소재지가 현재 규제지역(조정대상지역·투기과열지구)으로 지정돼 있나요?", EXCEPTION_Q)
      .done("조건부", `${col.region} 소재 담보는 현재 규제지역일 때만 제한 대상입니다. 지정 현황을 확인해야 합니다.`);
  }
  card.step("T3 담보", "수도권·규제지역 아파트 담보(또는 전제)", ["F401-02"]);

  let mat = c.maturityDate;
  // 다음 만기를 묻는 경우의 지난 만기: 다음 만기는 이보다 뒤다 → 그 전에 끝난 예외는 다음 만기연장의 근거가 될 수 없다
  let prevMat: ISODate | undefined;
  // 만기를 '4월'처럼 달만 알면(15일로 채운 추정 날짜) '26.4.16 경계의 어느 쪽인지 알 수 없다 → 종전·제한을 확정하지 않는다
  if (mat && !c.asksNextMaturity && (c.approxDates ?? []).includes(mat) && mat.slice(0, 7) === D.OLD_RULE_LAST_0401.slice(0, 7)) {
    card.step("T4 시행 시기", `만기를 ${Number(mat.slice(5, 7))}월로만 앎 → '26.4.16 이전·이후에 따라 종전 규정·제한이 갈림`, T4F(kb));
    return card
      .ask("대출 약정서상 만기일은 정확히 며칠인가요? ('26.4.16까지면 종전 규정, 4.17부터면 이번 제한 적용)")
      .cond("만기가 '26.4.16까지였으면 종전 규정으로 연장됐고, '26.4.17 이후면 이번 만기연장 제한이 적용됩니다.")
      .done("역질문", "만기가 '26년 4월이면 4.16까지인지 4.17 이후인지에 따라 결론이 갈립니다. 약정서상 정확한 만기일을 확인하세요.");
  }
  if (mat && mat <= D.OLD_RULE_LAST_0401) {
    if (c.asksNextMaturity) {
      // 지난 만기에 한 연장은 종전 규정이지만, 그 다음 만기는 '26.4.17 이후라 이번 제한이 적용된다
      card.step("T4 시행 시기", `지난 만기 ${fmt(mat)} ≤ '26.4.16 → 그때 연장은 종전 규정. 다음 만기는 '26.4.17 이후 → 제한 적용`, T4F(kb));
      card.cond(`지난 연장(만기 ${fmt(mat)})은 종전 규정으로 처리됐지만, 다음 만기는 '26.4.17 이후라 이번 제한이 적용됩니다.`);
      prevMat = mat;
      mat = undefined;
    } else {
      card.step("T4 시행 시기", `만기 ${fmt(mat)} ≤ '26.4.16 → 종전 규정`, T4F(kb));
      return card
        .cond("다음 만기('26.4.17 이후)부터는 이번 만기연장 제한이 적용됩니다.")
        .done("허용", "'26.4.16까지 만기가 도래한 건은 종전 규정을 적용합니다.");
    }
  } else {
    card.step("T4 시행 시기", mat ? `만기 ${fmt(mat)} → '26.4.17 이후 만기, 제한 적용` : "만기 모름 → '26.4.17 이후 만기로 전제", T4F(kb));
  }
  if (!mat && (c.asOf ?? today()) <= D.OLD_RULE_LAST_0401) card.cond("4.1 기준 대출약정서상 만기가 '26.4.16 이전이면 종전 규정입니다.");

  // T5 예외 사유
  if (c.otherException) {
    card.step("T5 예외⑥", "그 밖에 준하는 경우", ["F401-11"]);
    return card.done("심사위", "그 밖에 준하는 경우는 여신심사위원회가 개별 판단합니다.");
  }
  if (c.publicInterest) {
    card.step("T5 예외⑤", "공익 목적(민간임대리츠·공익법인)", ["F401-10"]);
    card.fact("F401-13");
    return card
      .doc("법인등록증 등")
      .oblige("공익 목적 예외도 다른 예외 사유와 같이 통상 1년 주기로 연장한 뒤 예외 사유가 계속되는지 재심사합니다(F401-13).")
      .done("조건부", "공익 목적 법인은 만기연장 제한의 예외입니다. 통상 1년 주기로 연장하고 재심사합니다.");
  }

  const cands: Candidate[] = [];
  if (c.tenant) {
    const t = tenantEnd(c.tenant, new Set(c.approxDates ?? []));
    // 묵시적 갱신 시점·4.1 이전 갱신 취급은 정부 자료에 기준이 없다(G-11)
    const g11 = !t.recognized && (t.note.includes("묵시적 갱신 시점") || t.note.includes("4.1 이전"));
    card.step("T5 예외① 임차인", t.note, g11 ? ["F401-06", "G-11"] : ["F401-06"]);
    if (t.ask) {
      return card.ask(t.ask).doc("임대차계약서(갱신계약서 포함)").done("역질문", t.askHeadline ?? "임대차 갱신 방식에 따라 연장 가능 기간이 달라집니다.");
    }
    // 종료일을 몰라도 판정(허용, "종료일까지")은 RULES §3 T6대로 두되, 창구가 확인하도록 질문을 붙인다
    if (t.recognized && !t.end && !mat) card.ask("임대차계약 종료일(갱신했다면 갱신계약 종료일)은 언제인가요?");
    // 4.1 당시 유효한 계약인지 모르면(추출기가 단정하지 않음) 계약 체결일을 묻는다
    if (t.recognized && c.tenant.contractValidAt0401 === undefined) card.ask("지금 임대차계약은 언제 맺었나요? ('26.4.2 이후 새로 맺거나 갱신한 계약이면 기존 계약 종료일까지만 인정됩니다)");
    // 예외①은 담보 주택의 임대차를 전제로 한다(401본 예외 ➊: 주택매도 곤란). 질문에 다른 집이 함께 나오면 어느 집의 임차인인지 묻는다
    if (t.recognized) {
      card.fact("G-10").cond("임차인이 이 대출의 담보 주택에 사는 경우를 전제로 한 판정입니다.");
      if (t.premise && c.tenant.contractValidAt0401 !== false) card.cond(t.premise);
      if (c.houses?.length) card.ask("임차인이 사는 집이 이 대출의 담보 주택인가요? (질문에 나온 다른 집의 임차인이면 결론이 달라질 수 있습니다)");
    }
    if (t.recognized) cands.push({ label: "임대차계약 종료일", end: t.end, endText: t.endText, limited: false, facts: ["F401-06"], docs: ["임대차계약서"] });
  }
  if (c.registeredRental) {
    const r = c.registeredRental;
    if (r.voluntaryCancel) {
      cands.push({ label: "자진말소 시점", end: r.voluntaryCancelDate, endText: r.voluntaryCancelDate ? fmt(r.voluntaryCancelDate) : "자진말소 시점", limited: true, facts: ["F401-07"], docs: ["임대사업자 등록증", "자진말소 신청(예정) 확인"] });
    } else {
      cands.push({ label: "의무임대기간 종료일", end: r.mandatoryEnd, endText: r.mandatoryEnd ? fmt(r.mandatoryEnd) : "의무임대기간 종료일", limited: false, facts: ["F401-07"], docs: ["임대사업자 등록증"] });
      // 의무임대기간 종료 후에도 기존 임차인이 살면(401FAQ Ⅲ-9): 의무임대기간 종료일 기준 유효 계약의 종료일까지, 예외적으로 갱신계약 종료일
      if (r.mandatoryEnd && c.tenant && (!mat || r.mandatoryEnd < mat)) {
        const pe = afterMandatory(c.tenant, r.mandatoryEnd);
        card.step("T5 예외② 등록임대(의무임대기간 종료 후)", pe.note, ["F401-07"]);
        if (pe.ask) return card.ask(pe.ask).doc("임대차계약서(갱신계약서 포함)", "임대사업자 등록증").done("역질문", pe.ask);
        if (pe.end) cands.push({ label: "의무임대기간 종료 후 인정되는 임대차계약 종료일", end: pe.end, endText: fmt(pe.end), limited: false, facts: ["F401-07"], docs: ["임대사업자 등록증", "임대차계약서(갱신계약서 포함)"] });
      }
    }
    card.step("T5 예외② 등록임대", r.voluntaryCancel ? "자진말소 예정 → 자진말소 시점까지" : "의무임대기간 종료일까지", ["F401-07"]);
  }
  if (c.legalObligationEnd || c.legalObligation) {
    const end = c.legalObligationEnd;
    cands.push({ label: "법적 의무 종료일", end, endText: end ? fmt(end) : "법적 의무(전매제한·실거주의무) 종료일", limited: false, facts: ["F401-08"], docs: ["법적 의무 증빙(소유권 이전 고시문, 입주자모집공고문 등)"] });
    card.step("T5 예외③ 법적 의무", end ? `의무 종료 ${fmt(end)}` : "법적 의무로 즉시 매도 불가(종료일 모름)", ["F401-08"]);
    if (!end) card.ask("법적 의무(전매제한·실거주의무)가 끝나는 날은 언제인가요?");
  }
  if (c.notifiedBy0401 && c.notifiedProof === "none") {
    // 고객 진술만으로는 신뢰보호를 인정하지 않는다(A은행 지침 제5조 4항). 기록을 찾으면 다시 판정
    card.step("T5 예외④ 신뢰보호", "4.1 이전 통보 주장, 기록 없음 → 인정 불가(A은행 지침 제5조 4항)", ["F401-09"]);
    card
      .cond("A은행 지침 제5조 4항: 고객 진술만으로는 신뢰보호를 인정하지 않습니다. 영업점 상담 기록이나 문자 발송 이력을 찾으면 다시 판정합니다.")
      .ask("'26.4.1 이전에 연장을 안내한 영업점 상담 기록이나 문자·메일 발송 이력이 있나요?");
  } else if (c.notifiedBy0401) {
    cands.push({ label: "4.1 이전 통보된 연장 기간", endText: "통보된 연장 기간", limited: true, facts: ["F401-09"], docs: ["연장 통보 증빙('26.4.1 이전 문자·메일·통화 기록)"] });
    card.step("T5 예외④ 신뢰보호", "4.1 이전 만기연장 통보", ["F401-09"]);
    card.cond("A은행 지침 제5조 4항: 고객 진술만으로는 인정하지 않고, 영업점 상담 기록이나 문자 발송 이력으로 '26.4.1 이전 통보를 확인합니다.");
  }

  const anyKnown = c.tenant || c.registeredRental || c.legalObligationEnd || c.legalObligation || c.notifiedBy0401 !== undefined;
  if (cands.length === 0) {
    // 고객에게 확인해 예외 사유가 모두 없다고 했으면 같은 질문을 다시 묻지 않는다(결론은 원칙 불허 그대로)
    if (c.exceptionsNone && !anyKnown) {
      card.step("T6 결론", "예외 사유 모두 없음(확인됨) → 원칙 불허", ["F401-02"]);
      return card.done("불허", "확인한 예외 사유(임차인·등록임대·법적 의무·4.1 이전 통보)가 모두 없어, 다주택자의 수도권·규제지역 아파트 주담대는 만기연장이 안 됩니다.");
    }
    if (!anyKnown) {
      card.step("T6 결론", "예외 사유 미확인 → 원칙 불허", ["F401-02"]);
      if (c.borrowerType === "corporate_landlord" && c.publicInterest === undefined) card.fact("F401-10").ask(PUBLIC_Q);
      const headline = whyCounted.length
        ? `${whyCounted.join(" ")} 주택 수에 포함되어 다주택자이고, 수도권·규제지역 아파트 주담대는 원칙적으로 만기연장이 안 됩니다.`
        : "다주택자의 수도권·규제지역 아파트 주담대는 원칙적으로 만기연장이 안 됩니다. 다른 예외 사유가 있는지 확인하세요.";
      return card.ask(EXCEPTION_Q).done("불허", headline);
    }
    card.step("T6 결론", "인정되는 예외 없음", ["F401-02"]);
    if (c.tenant && c.exceptionsNone) return card.done("불허", "임차인 사정이 예외로 인정되지 않고 다른 예외 사유(등록임대·법적 의무·4.1 이전 통보)도 없어 만기연장이 제한됩니다.");
    return card.ask(c.tenant ? OTHER_EXCEPTION_Q : EXCEPTION_Q).done("불허", "인정되는 예외 사유가 없어 만기연장이 제한됩니다. 다른 예외 사유가 있는지 확인하세요.");
  }

  // 중복 시 늦은 날짜 (F401-14)
  if (cands.length > 1) card.fact("F401-14");
  const dated = cands.filter((x) => x.end);
  const best = dated.length ? dated.find((x) => x.end === maxDate(dated.map((d) => d.end!)))! : cands[0];
  cands.forEach((x) => card.doc(...x.docs));
  card.fact(...best.facts);

  // 추정 날짜(월만 알려 15일로 채운 날짜)끼리 같은 달이면 정확한 일자에 따라 결론이 갈린다 → 확정하지 않는다
  const approx = new Set(c.approxDates ?? []);
  if (best.end && mat && (approx.has(best.end) || approx.has(mat)) && best.end.slice(0, 7) === mat.slice(0, 7)) {
    card.step("T6 결론", `${best.label}과 대출 만기가 같은 달(${Number(mat.slice(5, 7))}월) → 정확한 날짜에 따라 결론이 갈림`, best.facts);
    return card
      .ask(`${best.label}과 대출 약정서상 만기일의 정확한 날짜는 각각 며칠인가요?`)
      .done("역질문", `${best.label}이 대출 만기보다 늦어야 연장할 수 있는데, 둘 다 ${Number(mat.slice(5, 7))}월이라 정확한 날짜를 확인해야 합니다.`);
  }
  // 대출 만기를 아는데 예외 종료일을 모르면 '종료일까지 허용'으로 넘기지 않는다: 종료일이 만기보다 앞이면 연장이 안 된다
  // (법적 의무는 '지금 팔 수 없다' 자체가 근거라 종료일을 몰라도 연장 + 종료일 질문으로 둔다)
  if (!best.end && mat && best.facts.includes("F401-06")) {
    card.step("T6 결론", `${best.label} 모름 → 대출 만기(${fmt(mat)})와 비교할 수 없음`, best.facts);
    return card
      .ask(`${best.label}은 언제인가요?`)
      .done("역질문", `${best.label}이 대출 만기(${fmt(mat)})보다 늦어야 그날까지 연장할 수 있습니다. ${best.label}을 확인하세요.`);
  }

  if (best.end && mat) {
    if (best.end <= mat) {
      card.step("T6 결론", `인정 종료일 ${fmt(best.end)} ≤ 만기 ${fmt(mat)}`, ["F401-06"]);
      // 다른 예외 사유가 모두 없다고 확인했으면 같은 질문을 다시 묻지 않는다
      if (c.tenant && c.exceptionsNone) return card.done("불허", `인정되는 종료일(${fmt(best.end)})이 이미 대출 만기 전이고 다른 예외 사유(등록임대·법적 의무·4.1 이전 통보)도 없어 만기연장이 안 됩니다.`);
      return card.ask(c.tenant ? OTHER_EXCEPTION_Q : EXCEPTION_Q).done("불허", `인정되는 종료일(${fmt(best.end)})이 이미 대출 만기 전이라 만기연장이 안 됩니다. 다른 예외 사유를 확인하세요.`);
    }
    const cap = addYears(mat, 1);
    const until = minDate([best.end, cap]);
    card.step("T6 결론", `연장 한도 = min(${fmt(best.end)}, 만기+1년 ${fmt(cap)}) = ${fmt(until)}`, ["F401-13"]);
    // 통상 1년 주기(F401-13): 종료일이 두 주기 이상 남으면 '1년마다 재심사'로, 한 번이면 '재심사 후 종료일까지'로 쓴다
    const multi = best.end > addYears(mat, 2);
    if (best.end > cap) card.cond(multi ? `${fmt(cap)}까지 1년 연장한 뒤, 이후에도 1년 주기로 재심사하며 ${fmt(best.end)}까지 연장` : `${fmt(cap)}까지 1년 연장 후 재심사하여 ${fmt(best.end)}까지 추가 연장`);
    else card.cond(`${best.label}(${fmt(best.end)})까지만 연장`);
    if (best.end > cap)
      return card.done(
        "조건부",
        multi
          ? `우선 ${fmt(cap)}까지 1년 연장하고, 이후 1년 주기로 재심사하며 ${best.label}(${fmt(best.end)})까지 연장할 수 있습니다.`
          : `우선 ${fmt(cap)}까지 1년 연장하고, 재심사 후 ${best.label}(${fmt(best.end)})까지 연장할 수 있습니다.`,
      );
    return card.done("조건부", `${best.label} 기준으로 ${fmt(until)}까지 만기연장할 수 있습니다.`);
  }

  if (prevMat && best.end && best.end <= prevMat) {
    card.step("T6 결론", `인정 종료일 ${fmt(best.end)} ≤ 지난 만기 ${fmt(prevMat)} → 다음 만기연장의 근거가 될 수 없음`, ["F401-06", ...T4F(kb)]);
    if (!c.exceptionsNone) card.ask(c.tenant ? OTHER_EXCEPTION_Q : EXCEPTION_Q);
    return card.done("불허", `인정되는 종료일(${fmt(best.end)})이 지난 만기(${fmt(prevMat)})보다도 앞이라 다음 만기연장의 근거가 되지 않습니다. 다음 만기는 이번 제한이 적용됩니다.`);
  }
  card.fact("F401-13");
  if (best.limited) {
    card.step("T6 결론", `${best.endText}까지 (기간 제한)`, best.facts);
    // 기한 날짜와 대출 만기를 모르면, 기한이 만기보다 먼저인 경우(연장 불가)를 걸러 내도록 묻는다
    if (!best.end || !mat) {
      const selfCancel = best.facts.includes("F401-07");
      const what = selfCancel ? "자진말소 예정일" : "통보한 연장 기한";
      // 통보한 연장 기한은 조건 추출에 담을 칸이 없다 → 고객에게 묻지 않고 통보 기록에서 확인할 조건으로 둔다(묻고 못 쓰는 질문 방지)
      if (selfCancel) card.ask(`${what}과 대출 약정서상 만기일은 각각 언제인가요?`);
      else if (!mat) card.ask("대출 약정서상 만기일은 언제인가요?");
      card.cond(selfCancel ? `${what}이 이번 대출 만기보다 먼저면 이번 만기연장은 안 됩니다.` : `통보 기록(문자·상담 기록)에서 ${what}을 확인하세요. 그 기한이 이번 대출 만기보다 먼저면 이번 만기연장은 안 됩니다.`);
    }
    return card.cond(`${best.endText}까지만 연장`).done("조건부", `${best.endText}까지만 만기연장할 수 있습니다.`);
  }
  const overlap = cands.length > 1;
  card.step("T6 결론", `${overlap ? "예외 사유 중복 → 더 늦은 날짜 적용: " : ""}${best.endText}까지, 1년 주기 재심사`, [...best.facts, ...(overlap ? ["F401-14"] : []), "F401-13"]);
  return card.cond("통상 1년 주기로 연장하고 재심사").done("허용", `${/\d/.test(best.endText) ? `${best.label}(${best.endText})` : best.endText}까지 만기연장이 허용됩니다. 1년 주기로 재심사합니다.`);
}

interface TenantResult {
  recognized: boolean;
  end?: ISODate;
  endText: string;
  note: string;
  ask?: string;
  askHeadline?: string;
  premise?: string; // 화면에 드러낼 전제
}

/** 임차인 종료일 (docs/RULES.md §3-1) */
export function tenantEnd(t: Tenant, approx: Set<string> = new Set()): TenantResult {
  // 후속 임차인 신규계약(F401-06): 4.1까지 정식 체결 → 신규계약 종료일, 4.2 이후 체결·가계약 → 기존 계약 종료일까지만
  if (t.successor) {
    const sc = t.successor;
    if (sc.signedDate === undefined) {
      return {
        recognized: false,
        endText: "-",
        note: "후속 임차인 신규계약의 정식 체결일 모름",
        ask: "후속 임차인과 정식 계약(가계약 아님)을 맺은 날짜는 언제인가요? (4.1까지면 신규계약 종료일, 그 뒤면 기존 계약 종료일까지)",
        askHeadline: "후속 임차인 신규계약을 4.1까지 정식으로 맺었는지에 따라 인정 종료일이 달라집니다. 계약일을 확인하세요.",
      };
    }
    if (sc.signedDate <= D.ANNOUNCE_0401 && !sc.provisional && !sc.end) {
      return {
        recognized: false,
        endText: "-",
        note: "4.1까지 정식 체결한 후속 임차인 신규계약 → 그 계약 종료일까지(종료일 모름)",
        ask: "후속 임차인 신규계약의 종료일은 언제인가요? (4.1까지 정식 체결한 계약이라 그 종료일까지 인정)",
        askHeadline: "4.1까지 정식으로 맺은 후속 임차인 신규계약은 그 계약의 종료일까지 인정됩니다. 종료일을 확인하세요.",
      };
    }
    if (sc.signedDate <= D.ANNOUNCE_0401 && !sc.provisional && sc.end) {
      return { recognized: true, end: sc.end, endText: fmt(sc.end), note: `4.1까지 정식 체결한 후속 임차인 신규계약 → 신규계약 종료일 ${fmt(sc.end)}` };
    }
    // 4.2 이후 체결(또는 4.1까지는 가계약뿐) → 기존 계약만 본다
    const why = sc.provisional && sc.signedDate <= D.ANNOUNCE_0401 ? "4.1까지는 가계약뿐(가계약 불인정)" : `후속 계약 정식 체결 ${fmt(sc.signedDate)}(4.2 이후)`;
    const base = tenantEnd({ ...t, successor: undefined });
    return base.recognized ? { ...base, note: `${why} → 기존 계약 종료일까지만. ${base.note}` } : base;
  }
  if (t.provisional) return { recognized: false, endText: "-", note: "가계약은 인정하지 않음" };
  if (t.contractValidAt0401 === false) return { recognized: false, endText: "-", note: "4.1 기준 유효한 임대차계약 아님" };
  const orig = t.originalEnd;
  const origText = orig ? fmt(orig) : "기존 계약 종료일";
  const renewedText = t.renewedEnd ? fmt(t.renewedEnd) : "갱신계약 종료일";
  // 날짜를 모르면 "갱신계약 종료일(갱신계약 종료일)"처럼 겹치지 않게 한다
  const renewedPhrase = t.renewedEnd ? `갱신계약 종료일(${renewedText})` : "갱신계약 종료일";
  const kind = t.renewal ?? (t.renewedEnd || t.renewalDate ? "unknown" : "none");
  // 4.1 이전 갱신이면 4.1 당시 유효한 계약은 갱신계약이다(RULES §3-1: renewal=none, originalEnd=갱신계약 종료일).
  // '4.1 이후 기존 종료일'과 '4.1 이전 갱신일'이 함께 오면 어느 계약이 4.1 당시 계약인지 불분명 → 추정하지 않고 다시 묻는다
  if (kind !== "none" && t.renewalDate && t.renewalDate <= D.ANNOUNCE_0401 && orig && orig > D.ANNOUNCE_0401) {
    return {
      recognized: false,
      endText: "-",
      note: `갱신일(${fmt(t.renewalDate)})이 4.1 이전 → 4.1 당시 유효한 계약이 어느 것인지 확인 필요`,
      ask: `갱신(재계약)한 날짜와 방식을 다시 확인해 주세요. 기존 계약 종료일(${origText}) 전후 언제, 갱신청구권 행사·합의 재계약·묵시적 갱신 중 무엇인가요?`,
      askHeadline: `갱신 날짜(${fmt(t.renewalDate)})가 4.1 이전이라, 4.1 당시 유효한 계약이 갱신 전 계약(종료 ${origText})인지 갱신계약인지에 따라 인정 종료일이 달라집니다. 임대차계약서로 확인하세요.`,
    };
  }
  switch (kind) {
    case "none":
      return { recognized: true, end: orig, endText: origText, note: `4.1 기준 유효한 계약 → 종료일 ${origText}`, premise: "4.1 당시 이미 유효했던 임대차계약 기준입니다. 4.2 이후 새로 맺거나 갱신한 계약이면 인정 종료일이 달라집니다." };
    case "implicit":
      // 묵시적 갱신 시점을 모르면 유예(4.16까지)에 해당한다고 가정하지 않는다
      if (!t.renewalDate)
        return {
          recognized: false,
          endText: "-",
          note: "묵시적 갱신 시점 모름",
          ask: "묵시적 갱신이 언제 이루어졌나요? (기존 임대차계약 종료일은 언제였나요?)",
          askHeadline: "묵시적 갱신이 '26.4.16까지 이루어졌으면 갱신계약 종료일까지, 그 뒤면 기존 계약 종료일까지만 인정됩니다. 갱신 시점을 확인하세요.",
        };
      // 갱신일을 '4월'처럼 달만 알면(추정 날짜) 4.16 유예 경계의 어느 쪽인지 알 수 없다 → 묻는다
      if (approx.has(t.renewalDate) && t.renewalDate.slice(0, 7) === D.IMPLICIT_RENEWAL_LAST.slice(0, 7))
        return {
          recognized: false,
          endText: "-",
          note: "묵시적 갱신이 '26년 4월(일자 모름) → 4.16 유예 경계 확인 필요",
          ask: "묵시적 갱신이 정확히 며칠에 이루어졌나요? (기존 임대차계약 종료일 기준, '26.4.16까지면 갱신계약 종료일까지 인정)",
          askHeadline: "묵시적 갱신이 '26.4.16까지면 갱신계약 종료일까지, 4.17 이후면 기존 계약 종료일까지만 인정됩니다. 4월이라 정확한 날짜를 확인해야 합니다.",
        };
      if (t.renewalDate <= D.IMPLICIT_RENEWAL_LAST)
        return { recognized: true, end: t.renewedEnd, endText: renewedText, note: `'26.4.16까지 묵시적 갱신 → ${renewedPhrase}까지 인정` };
      return { recognized: true, end: orig, endText: origText, note: `'26.4.17 이후 묵시적 갱신 → 기존 종료일(${origText})까지만 인정` };
    case "claim":
      if (!orig) return { recognized: false, endText: "-", note: "기존 계약 종료일 모름", ask: "갱신 전 기존 임대차계약 종료일은 언제였나요?" };
      if (orig <= D.CLAIM_END_LIMIT)
        return { recognized: true, end: t.renewedEnd, endText: renewedText, note: `'26.7.31까지 종료되는 계약의 갱신청구권 행사 → ${renewedPhrase}까지 인정` };
      return { recognized: true, end: orig, endText: origText, note: `기존 계약 종료(${origText})가 '26.7.31 이후라 갱신청구권 예외 불인정 → 기존 종료일까지만` };
    case "agreed":
      return { recognized: true, end: orig, endText: origText, note: `4.2 이후 합의 갱신 → 기존 종료일(${origText})까지만 인정` };
    default:
      // 갱신 방식 모름: 결과가 갈릴 때만 질문
      if (orig && orig > D.CLAIM_END_LIMIT && !(t.renewalDate && t.renewalDate <= D.IMPLICIT_RENEWAL_LAST))
        return { recognized: true, end: orig, endText: origText, note: `갱신 방식과 무관하게 기존 종료일(${origText})까지만 인정` };
      return {
        recognized: false,
        endText: "-",
        note: "갱신 방식에 따라 인정 종료일이 달라짐",
        ask: `세입자가 계약갱신청구권을 행사한 것인가요, 합의로 재계약한 것인가요, 묵시적 갱신인가요?${t.renewalDate ? "" : " (묵시적 갱신이라면 기존 계약이 끝난 날짜는?)"}`,
        askHeadline: `갱신청구권 행사면 ${renewedPhrase}까지, 합의 재계약이면 기존 종료일(${origText})까지만 인정됩니다.`,
      };
  }
}

/** 4.1 주택 수 = 세대 기준(+산정 예외). 세대 분리 가족 명의·범위를 붙여 말한 수는 scope.ts가 반영한다 */
function r401(c: M2Case, kb: KbVersion): HouseCount {
  const sc = countFor(c, "R401", { kb, asOf: c.asOf ?? today() });
  return { ...(sc.hc ?? { evals: [], counted: [] }), count: sc.count };
}

/** 4.1 시행 시기 근거: 4.1 방안(F401-12) + KB v2에서는 같은 내용을 확인한 8.28 행정지도(F828-07) */
const T4F = (kb: KbVersion) => (kb === "v2" ? ["F401-12", "F828-07"] : ["F401-12"]);

/**
 * 등록임대사업자의 의무임대기간 종료 후 기존 임차인 거주(401FAQ Ⅲ-9, F401-07 후단).
 * 기준 시점은 4.1이 아니라 의무임대기간 종료일이다.
 * - 의무임대기간 종료일 기준 유효한 계약 → 그 계약 종료일까지
 * - 예외(갱신계약 종료일까지): ➊ '26.4.16까지 이루어진 묵시적 갱신 ➋ 의무임대기간 종료일로부터 4개월 이내 종료 계약의 갱신청구권 행사
 * - 그 밖의 갱신 → 기존 계약 종료일까지만
 */
export function afterMandatory(t: Tenant, mandatoryEnd: ISODate): { end?: ISODate; note: string; ask?: string } {
  const r = afterMandatoryRaw(t, mandatoryEnd);
  // 4.2 이후 체결한 계약은 최대 2년만 인정(F401-07 후단). 계약일을 아는 것은 갱신·재계약일뿐이라 그 계약의 종료일에만 적용한다
  if (r.end && t.renewalDate && t.renewalDate > D.ANNOUNCE_0401 && r.end === t.renewedEnd) {
    // 2년은 그 계약의 기간으로 센다: 기존 계약이 끝난 뒤 이어지는 갱신이면 기존 종료일부터, 아니면 계약일부터
    const start = t.originalEnd && t.originalEnd > t.renewalDate ? t.originalEnd : t.renewalDate;
    const cap = addYears(start, 2);
    if (r.end > cap) return { end: cap, note: `${r.note} → 4.2 이후 체결 계약(${fmt(t.renewalDate)})은 최대 2년만 인정 → ${fmt(cap)}까지` };
  }
  return r;
}

function afterMandatoryRaw(t: Tenant, mandatoryEnd: ISODate): { end?: ISODate; note: string; ask?: string } {
  if (t.provisional) return { note: "가계약은 인정하지 않음" };
  const orig = t.originalEnd;
  // 기준은 '의무임대기간 종료일 당시 유효한 계약'이다(401FAQ Ⅲ-9). 종료일 이전에 맺은(갱신·재계약) 계약이 그날을 덮으면
  // 그 계약이 바로 기준 계약이다 — 기존 계약이 그 전에 끝났거나 기존 계약 정보가 없을 때
  if ((!orig || orig <= mandatoryEnd) && t.renewalDate && t.renewalDate <= mandatoryEnd && t.renewedEnd && t.renewedEnd > mandatoryEnd)
    return { end: t.renewedEnd, note: `의무임대기간 종료일(${fmt(mandatoryEnd)}) 당시 유효한 계약은 ${fmt(t.renewalDate)}에 맺은 계약 → 종료일 ${fmt(t.renewedEnd)}` };
  if (!orig) return { note: "의무임대기간 종료일 기준 유효한 임대차계약의 종료일 모름", ask: `의무임대기간 종료일(${fmt(mandatoryEnd)}) 당시 유효했던 임대차계약의 종료일은 언제인가요? (갱신했다면 갱신 방식과 갱신계약 종료일도 알려 주세요)` };
  if (orig <= mandatoryEnd) return { note: `기존 계약 종료(${fmt(orig)})가 의무임대기간 종료일(${fmt(mandatoryEnd)}) 이전 → 의무임대기간 종료일 기준 유효한 계약 아님` };
  const renewed = t.renewal && t.renewal !== "none";
  if (!renewed) return { end: orig, note: `의무임대기간 종료일(${fmt(mandatoryEnd)}) 기준 유효한 계약 → 종료일 ${fmt(orig)}` };
  const claimOk = t.renewal === "claim" && orig <= addMonths(mandatoryEnd, 4);
  const implicitOk = t.renewal === "implicit" && !!t.renewalDate && t.renewalDate <= D.IMPLICIT_RENEWAL_LAST;
  if ((claimOk || implicitOk) && t.renewedEnd)
    return { end: t.renewedEnd, note: `${claimOk ? `의무임대기간 종료일로부터 4개월 이내(${fmt(addMonths(mandatoryEnd, 4))}까지) 종료 계약의 갱신청구권 행사` : "'26.4.16까지 묵시적 갱신"} → 갱신계약 종료일 ${fmt(t.renewedEnd)}` };
  if (claimOk || implicitOk) return { note: "갱신계약 종료일 모름", ask: "갱신계약의 종료일은 언제인가요? (의무임대기간 종료 후 인정되는 갱신이라 그 종료일까지 연장 가능)" };
  return { end: orig, note: `의무임대기간 종료 후 갱신(${t.renewal === "claim" ? "종료일이 4개월 넘게 남은 계약의 갱신청구권" : t.renewal === "implicit" ? "'26.4.17 이후 묵시적 갱신" : "합의 갱신"}) → 갱신계약이 아니라 기존 계약 종료일(${fmt(orig)})까지` };
}
