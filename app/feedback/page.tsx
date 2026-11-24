// 베타 테스터 의견 보내기: 판정 하나에 묶이지 않는 의견(화면·흐름·없는 기능).
import { notFound } from "next/navigation";
import { Header } from "../_components/Header";
import { BETA } from "@/lib/beta";
import { GeneralFeedback } from "../_components/Feedback";

export const metadata = { title: "의견 보내기 · 여신 사수" };

export default function FeedbackPage() {
  if (!BETA) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <Header subtitle="써 보시면서 불편했던 점, 헷갈린 말, 현장에서 필요한 기능을 자유롭게 적어 주세요. 판정 하나하나에 대한 의견은 판정 결과 아래 ‘이 판정, 현장 판단과 맞나요?’에서 보내 주시면 됩니다." />
      <GeneralFeedback />
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">
        고객 이름·연락처·주민번호 같은 개인정보는 적지 마세요. 보내 주신 의견은 이 도구를 고치는 데만 씁니다.
      </p>
    </main>
  );
}
