@AGENTS.md

# 프로젝트: 티끌 (Tikkeul) — 취준생 취업 준비 비용 절감 AI Agent

## 기술 스택
- Next.js 16 (App Router) — 학습 데이터와 다른 버전. 코드 작성 전 `node_modules/next/dist/docs/` 확인 (AGENTS.md)
- TypeScript strict mode, React 19
- Tailwind CSS v4 (`src/app/globals.css`의 `@theme` 토큰)
- Supabase (PostgreSQL, 서울 리전) · Groq LLM (`openai/gpt-oss-120b`, `GROQ_MODEL`로 교체) · LangGraph.js (채팅 에이전트)
- 배포: Vercel (`main` push → 프로덕션 자동 배포, 크론은 `vercel.json`)

## 아키텍처 규칙
- CRITICAL: Supabase·Groq·Tavily 등 외부 I/O는 `src/services/`에서만 한다. 클라이언트 컴포넌트(`"use client"`)에서 `src/services/`·`src/agents/`를 import하지 말 것 — `SUPABASE_SERVICE_ROLE_KEY`가 브라우저로 새어 나간다.
- CRITICAL: "숫자는 코드가, 해설은 AI가" — 금액·날짜·자격 판정(confirmed/excluded/insufficient_info)은 `src/lib/`의 결정론적 코드가 정한다. LLM은 그 결과를 설명·요약·후보 선별만 한다. LLM 출력으로 금액·판정을 덮어쓰지 말 것.
- CRITICAL: LLM에는 판정에 필요한 속성만 보낸다. 닉네임·user id 등 식별정보 전송 금지.
- CRITICAL: 웹검색(Tavily)으로 발견한 정책은 미검증으로 격리한다. `policies` 테이블에 검증된 정책처럼 직접 넣지 말 것.
- `src/lib/`은 순수 함수만 (I/O·`process.env` 금지). 공유 타입은 `src/types/`, 정적 참고 데이터는 `src/data/`, 브랜드 문구는 `src/config/brand.ts` 단일 소스.
- 시도명은 반드시 `normalizeSido()`(`src/lib/region.ts`)로 정규화한 뒤 저장·비교한다.
- DB 스키마 변경은 `supabase/schema.sql`에 SQL을 먼저 적는다 (프리뷰·프로덕션이 같은 DB를 쓴다).

## 개발 프로세스
- CRITICAL: `src/lib/`은 TDD — 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (`tdd-guard.sh` 훅이 강제). 테스트는 대상 파일 옆 `*.test.ts` (`node:test` + `node:assert/strict`). 그 밖의 코드는 테스트 가능한 로직이면 `src/lib/`로 빼서 테스트한다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, chore:). scope는 기능 단위 (예: `feat(jobs): ...`)
- `main`에 직접 커밋하지 않는다 — 브랜치 → PR → Vercel 프리뷰 확인 → 머지.
- `.env.local`은 절대 커밋하지 않는다 (`.env.example` 참고).

## 명령어
npm run dev           # 개발 서버 (파일감시 한도가 낮은 서버에선 build && start)
npm run build         # 프로덕션 빌드
npm run start         # 빌드 결과 실행
npm run lint          # ESLint
npm run typecheck     # next typegen + tsc --noEmit
npm run test          # 단위 테스트 (src/**/*.test.ts)
npm run test:harness  # scripts/execute.py 테스트 (pytest 필요)
python3 scripts/execute.py <phase-dir>   # 하네스 phase 실행 (/harness 참고)
