// Liner API 공통 설정. 키는 반드시 환경변수에서만 읽는다(하드코딩 금지).
export const LINER_BASE = "https://platform.liner.com/api/v1";
export const LINER_MCP_URL = `${LINER_BASE}/mcp`;

export function linerKey(): string {
  const key = process.env.LINER_API_KEY;
  if (!key) {
    throw new Error(
      "LINER_API_KEY 환경변수가 없습니다. .env.example을 .env로 복사하고 키를 넣어 주세요.",
    );
  }
  return key;
}

/** 데모 재생 모드: 실제 API 대신 저장된 응답만 사용한다(네트워크 불안정 대비). */
export const isReplayMode = () => process.env.LOANDESK_DEMO_REPLAY === "1";
