// /api/judge NDJSON 이벤트 타입 (app/api/judge/route.ts와 맞춘다)
import type { FactRef, GapRef } from "@/lib/kb";
import type { Verdict } from "@/lib/rules/types";
import type { AgencyRefs } from "@/lib/guarantor";

export interface CardData extends Verdict {
  asOf?: string;
  factRefs: FactRef[];
  gapRefs: GapRef[];
}

export type JudgeEvent =
  | { type: "partial"; raw: unknown }
  | {
      type: "extracted";
      module: "M1" | "M2" | "M0" | "Q" | "OUT";
      case?: Record<string, unknown>;
      assumptions: string[];
      warnings: string[];
      model: string;
      ms: number;
    }
  | ({ type: "verdict"; compare?: CardData; also?: CardData; agency?: AgencyRefs } & CardData)
  | { type: "out_of_scope"; message: string; related?: CardData[]; agency?: AgencyRefs }
  | { type: "error"; stage?: string; message: string };
