# Architecture Decision Records

## 철학
대회 MVP — 동작하는 최소 구현과 시연 신뢰성 우선. 무료 티어 인프라(Vercel·Supabase·Groq) 안에서 해결한다. 돈과 자격은 코드가 계산하고, AI는 설명한다.

---

### ADR-001: Next.js App Router 단일 풀스택 + Vercel
**결정**: 프론트·API를 Next.js 하나로 만들고 Vercel에 배포한다. `main` push = 프로덕션, 브랜치 = 프리뷰.
**이유**: 팀원 누구나 PR 하나로 프리뷰 URL을 받는다. 별도 백엔드 서버 운영 부담이 없다. 크론도 `vercel.json`으로 해결.
**트레이드오프**: 함수 실행 시간 제한(최대 60초) 안에 LLM 호출을 끝내야 한다. Python 에이전트 코드는 그대로 못 올리고 TS로 이식해야 한다.

### ADR-002: Supabase(PostgreSQL) + 서버 전용 service_role 키
**결정**: DB는 Supabase(서울). 접근은 `services/supabase.supabaseAdmin()` 하나로, 서버에서만.
**이유**: 무료 티어, SQL 그대로 사용, 배열 컬럼(`region_sidos`)·향후 pgvector 확장. 로그인 없는 MVP라 RLS 대신 서버 경유로 통제.
**트레이드오프**: 브라우저 직접 쿼리·실시간 구독을 못 쓴다. 프리뷰와 프로덕션이 같은 DB를 공유한다.

### ADR-003: Groq + gpt-oss (JSON 모드), 모델은 환경변수
**결정**: LLM은 Groq API의 `openai/gpt-oss-120b`(기본값), `GROQ_MODEL`로 교체 가능. `reasoning_effort: low`, JSON 응답, 실패 시 1회 재시도.
**이유**: 무료·저지연. 판정·추출을 JSON으로 받아 코드가 검증한다.
**트레이드오프**: 비결정적 출력 → 점수 컷(60점)·규칙엔진으로 보정. 레이트리밋 시 응답 지연.

### ADR-004: 결정론적 계산 + LLM 해설 분리
**결정**: 마이데이터 도출(`lib/derive`), 자격 판정(`lib/eligibility`), 시뮬레이션(`lib/simulate`)은 순수 함수. LLM은 결과를 인용해 설명만 한다.
**이유**: 금융 서비스에서 금액·자격이 실행마다 바뀌면 신뢰를 잃는다. 순수 함수는 단위 테스트로 고정할 수 있다.
**트레이드오프**: 구조화 조건이 없는 정책(대다수)은 여전히 LLM 폴백 판정에 의존한다.

### ADR-005: 채팅은 LangGraph.js 멀티 에이전트
**결정**: `agents/orchestrator`가 의도를 계획(Plan, zod 스키마) → 정책 검색/조회/비교 에이전트 또는 프로필 에이전트로 라우팅. 도구는 `services/`를 호출한다.
**이유**: 팀원 Python 에이전트 설계를 TS로 이식해 Vercel 한 곳에서 돌린다.
**트레이드오프**: LangChain 의존성 증가, 에이전트 호출 수만큼 지연.

### ADR-006: 테스트는 node:test + tsx
**결정**: 별도 테스트 프레임워크 없이 `node --import tsx --test "src/**/*.test.ts"`. 테스트 파일은 대상 옆에 둔다.
**이유**: 의존성 추가 없음. `tsx`가 `@/` 경로 별칭을 해석한다. 하네스 TDD 가드(`scripts/hooks/tdd-guard.sh`)가 같은 폴더의 `*.test.ts`를 찾는다.
**트레이드오프**: 컴포넌트 렌더 테스트(jsdom)는 없다 — UI는 빌드·수동 확인.

### ADR-007: 정책 데이터는 국가 API 전수 + 웹 발견물 격리
**결정**: 온통청년·행안부 공공서비스 API를 전수 적재하고 매일 증분 수집. Tavily 웹검색 결과는 미검증 큐/표시로만 다룬다.
**이유**: 출처가 공식인 데이터만 "받을 수 있다"고 말할 수 있다.
**트레이드오프**: 지자체 자체 채널에만 있는 정책은 누락될 수 있다 (큐레이션으로 보완).
