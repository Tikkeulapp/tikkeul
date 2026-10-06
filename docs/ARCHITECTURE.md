# 아키텍처

## 디렉토리 구조
```
src/
├── app/               # 페이지 + API 라우트 (App Router)
│   ├── page.tsx           랜딩
│   ├── app/               앱 화면: page.tsx(메인) · start/ · simulate/ · jobs/
│   └── api/               Route Handlers — session, signup, events, relevance, event-match,
│                          recommend, policies, policy-matches, profile-*, chat, simulate,
│                          jobs/{search,recommend}, reminders, cron/{discover,notify}
├── components/        # UI 컴포넌트 — landing/(랜딩 섹션), app/(앱 화면)
├── types/             # 공유 TypeScript 타입 (persona, profile, eligibility, policy, simulate, chat)
├── lib/               # 순수 함수 — derive, eligibility, simulate, region, calendarRules (+ *.test.ts)
├── services/          # 외부 I/O 래퍼 — supabase, groq, tavily, notifications,
│                      #   policyMatch, profile, collectJobs (서버 전용)
├── agents/            # LangGraph 채팅 에이전트 — orchestrator, policyAgent/Tools, profileAgent/Tools, state
├── data/              # 정적 참고 데이터 — personas(mock), ncs, exam_*, postjob_*
└── config/            # brand.ts (서비스명·슬로건 단일 소스)
scripts/               # 데이터 수집·적재(*.mts, collect_gov24.py), 하네스(execute.py, hooks/)
supabase/schema.sql    # 테이블 생성 SQL
phases/                # 하네스 phase/step 정의 (/harness)
docs/                  # 하네스 문서 4종 + reference/(기획·설계 원문)
```

## 의존 방향
```
app/(page, api) → agents → services → lib → types
                      ↘        ↘       ↗
                        data · config
components → lib(순수) · types · config   (services·agents import 금지)
```
- `lib/`은 `types/`·`data/`만 import한다. `services/`·`process.env`를 쓰지 않는다.
- `types/`는 타입만 둔다 (런타임 값 금지).

## 패턴
- Server Components 기본, 상호작용이 필요한 화면만 `"use client"` (StartClient, JobsView, SimulateView, app/page.tsx 등)
- 모든 DB·LLM 호출은 API Route → `services/`. 클라이언트는 `fetch("/api/...")`만 한다.
- 계산 → 설명 2단: `lib/`이 숫자·판정을 확정하고, `services/groq.groqJson()`(JSON 모드, 실패 시 1회 재시도)이 해설만 생성
- 검색·추천 3단: 조건 필터(SQL) → 후보 압축(지역·키워드) → LLM 선별/판정
- 자격 판정 단일 진입점: `services/policyMatch.classifyPolicyForUser()` — 구조화 조건 있으면 `lib/eligibility` 규칙엔진, 없으면 LLM 폴백
- 사용자 프로필은 항상 `services/profile.resolveProfile()`로 해석 (페르소나/직접입력 + `profile_changes` 반영)

## 데이터 흐름
```
[시작]  페르소나 mock / 직접 입력 → /api/session|signup → lib/derive → profile_survey·finance·users
[일정]  달력 입력 → /api/events(user_calendar) → /api/event-match
        → LLM 의미추출 → isPolicyRelevantEvent → policies SQL 후보 → LLM 선별 → user_policy_matches
[판정]  자세히보기 → /api/relevance → resolveProfile → classifyPolicyForUser → UI 배지
[채팅]  검색바 → /api/chat → agents/orchestrator(planTurn) → policyAgent | profileAgent → tools → services
[시뮬]  /api/simulate → resolveProfile + 마이데이터 → lib/simulate(결정론) → postjob_programs 판정 → LLM 해설
[크론]  vercel cron → /api/cron/discover (정책·채용공고 증분 수집) · /api/cron/notify (마감 알림)
```

## 상태 관리
- 서버 상태: Supabase가 단일 원천 (users, profile_survey, finance, profile_changes, user_calendar, policies, user_policy_matches, job_postings …)
- 클라이언트 상태: `useState`/`useReducer`. 세션(선택한 user id)·온보딩 등 브라우저 한정 상태만 `localStorage`
- 전역 상태 라이브러리 없음
