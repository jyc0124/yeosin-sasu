// 베타 테스트 전용 화면(판정별 피드백·의견 보내기·미리보기 '베타' 표시)을 켜고 끄는 스위치.
// 기본은 켜짐. 심사 제출·영상 녹화 때는 NEXT_PUBLIC_BETA=0 으로 끈다(빌드 시점에 값이 들어간다).
export const BETA = process.env.NEXT_PUBLIC_BETA !== "0";
