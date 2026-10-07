/** 채팅 메시지 타입 — API(/api/chat)와 에이전트(src/agents)가 공유. */

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/** 챗봇 답변에 언급된 DB 정책 — 답변 아래 "마이티끌에 담기"·신청 링크 카드용.
 * 웹검색(미검증) 결과는 policies 테이블에 없으므로 여기 들어오지 않는다. */
export type ChatPolicy = {
  policyId: string;
  title: string;
  provider: string | null;
  region: string;
  applyUrl: string | null;
  endDate: string | null;
  alwaysOpen: boolean;
};
