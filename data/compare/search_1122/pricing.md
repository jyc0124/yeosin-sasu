# 검색 API 공개 가격 비교 (2026-11-22 확인)

웹 검색 1,000회 기준. 공식 가격 페이지를 우선하고, 공식 페이지 내용을 확인하지 못한 값은 표시한다. 가격은 바뀔 수 있다.

| 서비스 | 1,000회 | 비고 | 출처 |
|---|---|---|---|
| **Liner Web Search API** | **$1** | 성공한 요청만 과금. 우리 실측도 1회 $0.001(credits API 잔액 차이, 11/19) | https://liner.com/developers/docs/pricing |
| Brave Search API | $5 | 매월 $5 크레딧 포함 | https://brave.com/search/api , api-dashboard.search.brave.com |
| Perplexity Search API | $5 | Sonar 모델은 토큰 + 요청료 별도 | https://docs.perplexity.ai/getting-started/pricing |
| Tavily | 약 $8 | 기본 검색 1크레딧, 종량제 $0.008/크레딧 | https://docs.tavily.com/documentation/api-credits |
| OpenAI web search 도구 | $10 + 검색 내용 토큰 | 이전 preview 도구는 $25 | https://developers.openai.com/api/docs/pricing |

참고: Google 검색 결과 대행(Serper)은 $1 수준이라는 비교가 있다(Liner 블로그 비교표, 독립 확인 안 함). 검색 결과 목록만 주는 서비스라 공식 출처 필터·법령 도구·LLM 라우팅은 없다.

우리 쓰임으로 환산(실측 단가):
- 정책 감시 1회 = Search API 4회 + search_legal 2회 ≈ $0.008
- 해석 쟁점 사전 조사 1건 = Search API 2회 = $0.002
- 같은 감시를 OpenAI web search 도구로 하면 검색 호출만 6회 × $0.01 = $0.06(+토큰), 약 7배 이상
