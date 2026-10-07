/** 관심 태그 정의 — "부모>자식" 형태의 id. 키워드는 정책·일정·지출 텍스트에서 태그를 찾는 데 쓴다. */
export type InterestTagDef = {
  id: string;
  label: string;
  keywords: (string | RegExp)[];
};

/** 관심 신호 종류 — 가중치는 src/lib/interest.ts의 SIGNAL_WEIGHT가 정한다.
 * reject = "티끌이 이해한 나" 카드에서 "아니에요". */
export type InterestSignal = "save" | "remove" | "view" | "impression" | "calendar" | "spend" | "chat" | "reject";

/** 관심 점수 계산 입력 (DB 이벤트 + 일정·지출에서 런타임 도출한 이벤트 공통). */
export type InterestEvent = {
  signal: InterestSignal;
  tags: string[];
  policyId?: string | null;
  weight?: number | null;      // 지정 시 SIGNAL_WEIGHT 대신 사용 (chat 강도·지속성 등)
  occurredAt: string;          // ISO 날짜/시각
  expiresAt?: string | null;   // 이후엔 무시 (일시적 관심)
};

/** "티끌이 이해한 나" 카드 한 줄 — 근거는 신호 종류 수준으로만 (날짜·구체 내역 노출 금지). */
export type InterestExplanation = {
  tag: string;
  label: string;
  score: number;
  sources: InterestSignal[]; // 기여도 큰 순
};

/** 검색바 추천 질문 후보. */
export type StarterTemplate = {
  id: string;
  tag: string | null;   // null = 프로필·기본 질문
  question: string;     // 사용자가 누르면 그대로 채팅에 보내는 문장
};

export type StarterPick = StarterTemplate & { reason: "event" | "interest" | "profile" | "default" };
