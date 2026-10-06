# 티끌 (Tikkeul) — 취준생 취업 준비 비용 절감 AI Agent

> 2026 금융 AI Challenge 출품작. 슬로건 **"영끌 아닌 티끌"**.
> 취준생의 프로필(설문 + 마이데이터)과 일정을 전국 청년·취준 정책과 대조해 받을 수 있는 혜택을 AI가 찾아 절약액까지 계산합니다.

- **배포**: https://tikle.vercel.app (main 브랜치 push → Vercel 자동 배포)
- **DB**: Supabase (PostgreSQL, Seoul)
- **LLM**: Groq API (`openai/gpt-oss-20b`, 환경변수로 교체 가능)

---

## 팀원 온보딩 — 처음 클론했다면

```bash
git clone https://github.com/Vaycold/AI_FINANCE.git
cd AI_FINANCE
npm install
cp .env.example .env.local     # 값은 병찬에게 받아서 채우기 (절대 커밋 금지)
npm run build && npm run start # http://localhost:3000
```

- `npm run dev`도 되지만 개발 서버(리눅스 도커)에서는 파일감시 한도 때문에 `build && start`를 쓴다.
- 환경변수 없이도 랜딩·페르소나 선택은 동작. DB·AI 기능은 `.env.local` 필요.

### 작업 방식 제안 (충돌 방지)
- **자기 작업은 브랜치로**: `git checkout -b feature/agent-flow` → push → GitHub에서 PR → 리뷰 후 main 머지
- 파이썬 에이전트 코드는 `agent/` 폴더로 분리 (Next.js 소스 `src/`와 섞이지 않게)
- `main`에 직접 push하면 곧바로 배포되므로 주의

---

## 함께 개발하는 방식 — 브랜치 · 프리뷰 · 머지

- **`main` = 배포판** (https://tikle.vercel.app). `main`에 푸시되면 Vercel이 자동 배포합니다. 빌드가 깨지는 커밋을 `main`에 직접 올리지 않습니다.
- **작업은 브랜치에서**: `feature/<기능>` (예: `feature/agent-architecture`, `feature/simulation-v2`), 문서는 `docs/<주제>`. 기능 코드(`src/`)는 main에 직접 커밋하지 않고 PR로 머지.
- **Hobby 플랜 주의**: 프로젝트 소유자(Vaycold) 계정이 아닌 커밋은 Vercel이 배포를 차단합니다. 팀원 브랜치의 프리뷰는 `scripts/mirror-preview.sh feature/<브랜치> preview/<이름>`으로 소유자 계정 커밋을 얹어 만듭니다 (URL: `tikle-git-preview-<이름>-cau-et.vercel.app`). 팀원은 `preview/*`에 직접 푸시하지 않습니다. 소유자 본인 브랜치는 푸시만 하면 자동으로 프리뷰가 생깁니다.
- **브랜치를 푸시하면 Vercel이 프리뷰 URL을 자동 생성**합니다. 확인 방법 두 가지:
  1. GitHub에서 PR을 열면 Vercel 봇이 댓글로 프리뷰 링크를 달아줍니다 (권장).
  2. Vercel 대시보드 → 프로젝트 → Deployments 탭에서 브랜치 이름으로 찾기. 브랜치 고정 URL은 `tikle-git-<브랜치명>-<팀>.vercel.app` 형태입니다.
- 프리뷰가 뜨려면 Vercel 환경변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GROQ_MODEL, ONTONG_YOUTH_API_KEY, DATA_GO_KR_API_KEY) 각각에 **Preview 환경이 체크**되어 있어야 합니다. Production만 체크되어 있으면 프리뷰의 API가 전부 500(빈 응답)을 냅니다. 바꾼 뒤엔 해당 브랜치를 Redeploy.
- 프리뷰는 **프로덕션과 같은 Supabase·Groq 환경변수**를 씁니다. 즉 같은 DB를 읽고 씁니다. 스키마를 바꾸는 실험은 먼저 `supabase/schema.sql`에 SQL을 적고 팀에 공유한 뒤 실행합니다.
- 머지는 **PR → 프리뷰에서 동작 확인 → `main`에 머지**. 충돌이 나면 `git rebase origin/main` 후 다시 푸시.
- 로컬 실행: `npm run build && npm run start` (이 서버는 `next dev`가 파일 감시 한도로 죽습니다. 다른 환경에선 `npm run dev`도 됩니다).
- 챗봇(팀원) 코드가 Python이면 Vercel 프리뷰에 포함되지 않습니다. TS로 이식하거나, 별도 서버 URL을 `CHATBOT_API_URL` 환경변수로 연결하는 방식 중 하나를 정해야 합니다 (미결).

## 지금 뭐가 되고, 뭐가 안 되나 (2026-09-04)

| 기능 | 상태 | 코드 |
|---|---|---|
| 랜딩페이지 | ✅ | `src/app/page.tsx`, `src/components/landing/` |
| 시작: 페르소나 3종 선택 / 직접 입력(설문+금융, 자동기입) → DB 저장 | ✅ | `src/components/app/StartClient.tsx`, `src/app/api/session`, `src/app/api/signup` |
| 마이데이터 mock → 도출(월소득·월세·수급 감지·취준지출) | ✅ 규칙 기반 | `src/data/personas.ts`, `src/lib/derive.ts` |
| 앱 메인: 검색바 / 마이티끌·추천 / 월 달력 / 절약 위젯 | ✅ UI | `src/app/app/page.tsx` |
| 정책 자세히보기 + **AI 자격 판정** | ✅ | `src/app/api/relevance/route.ts` |
| **일정 → AI 정책 매칭** (의미추출 → SQL 후보 → LLM 선별) | ✅ 코드 / ⏳ **DB에 정책 적재 대기** | `src/app/api/event-match/route.ts` |
| 정책 수집·적재 스크립트 (온통청년 2,750 + gov24 592) | ✅ | `scripts/collect_gov24.py`, `scripts/load_policies.mts`, `scripts/load_gov24.mts` |
| 추천 탭 내용 | ⚠ 데모 데이터 (AI 매칭 결과로 교체 예정) | `RECS` in `src/app/app/page.tsx` |
| 검색바 AI 채팅 | ⏳ UI만 | — |
| 마이티끌 DB 저장 (`user_policy_matches`) | ⏳ 브라우저 저장 중 | — |
| 기획서 · 기능명세서 | ⏳ 미착수 | `docs/reference/` |

---

## 하네스 구조 (Harness framework)

이 저장소는 Harness 프레임워크 구조를 따른다. Claude Code 세션은 `CLAUDE.md` → `docs/*.md` 순으로 규칙을 읽는다.

```
CLAUDE.md                    프로젝트 규칙 (CRITICAL 규칙·명령어) — AGENTS.md(Next.js 16 안내) 포함
docs/
  PRD.md                     목표·사용자·핵심 기능·MVP 제외
  ARCHITECTURE.md            디렉토리 구조·의존 방향·데이터 흐름
  ADR.md                     기술 결정 기록
  UI_GUIDE.md                디자인 토큰·컴포넌트·금지 패턴
  reference/                 기획·설계 원문 (하네스 프롬프트에는 주입되지 않음)
.claude/
  settings.json              .env 읽기 deny · 훅 — Stop: src 변경 시 lint+typecheck+test / PreToolUse: 위험 명령 차단·TDD 가드
  agents/reviewer.md         독립 리뷰 서브에이전트 (/review가 위임)
  commands/harness.md        /harness — 탐색 → 논의 → step 설계 → phases 생성 → 실행
  commands/review.md         /review — reviewer 서브에이전트로 검수 (심각도 4단계 + 판정)
scripts/
  execute.py                 phase 내 step을 claude -p로 순차 실행 (재시도·브랜치·2단계 커밋)
  test_execute.py            execute.py 테스트 (npm run test:harness)
  hooks/tdd-guard.sh         테스트 파일 없이 src/lib 구현 파일 편집 시 차단
  hooks/guard-bash.sh        강제 삭제·force push·hard reset·테이블 삭제·.env 출력 차단
  hooks/stop-verify.sh       응답 종료 시 검증, 실패하면 Claude에게 되돌려 수정
phases/index.json            phase 목록 (phases/<task>/index.json + step{N}.md)
```

실행: `/harness`로 step을 설계한 뒤 `python3 scripts/execute.py <task-name>`.

## 폴더 구조

```
src/
  app/
    page.tsx                 랜딩
    app/start/page.tsx       페르소나 선택·직접 입력
    app/page.tsx             앱 메인 (검색바·정책 패널·달력·위젯·상세 모달)
    app/simulate, app/jobs   취업 후 시뮬레이션 · 채용공고
    api/session              페르소나 → users 생성 + 시드 일정
    api/signup               직접 입력 → profile_survey + users + finance
    api/events               캘린더 일정 CRUD (user_calendar)
    api/relevance            정책 1건 × 사용자 → 자격 판정
    api/event-match          일정 텍스트 → 관련 정책 추천 (3단 파이프라인)
    api/chat                 검색바 AI 채팅 (agents/)
    api/simulate, api/jobs   시뮬레이션 · 채용공고 검색/추천
    api/cron/*               정책·공고 증분 수집, 마감 알림
  components/landing/        랜딩 섹션들
  components/app/            앱 화면 컴포넌트
  types/                     공유 타입 (persona, profile, eligibility, policy, simulate, chat)
  lib/                       순수 함수 + 단위 테스트 (derive, eligibility, simulate, region, calendarRules)
  services/                  외부 I/O (supabase, groq, tavily, policyMatch, profile, notifications, collectJobs)
  agents/                    LangGraph 채팅 에이전트
  data/                      페르소나 mock·NCS·시험·취업 후 참고 데이터
  config/brand.ts            서비스명·슬로건 단일 소스
scripts/
  seed.mts                   페르소나 → DB 시드
  collect_gov24.py           행안부 공공서비스 전체 수집 → 취준 필터
  load_policies.mts          온통청년 → policies 적재
  load_gov24.mts             gov24 → policies 적재
  collect_jobs.mts           채용공고 수동 수집 (크론과 로직 공유)
supabase/schema.sql          테이블 생성 SQL (Supabase SQL Editor에서 실행)
```

## 참고 문서 (docs/reference/)

| 문서 | 내용 |
|---|---|
| `1차생각.md` | 서비스 기획 원문 — "Who you are → What you're doing" |
| `2차설계_페르소나_DB.md` | 페르소나 3종 설계, 프로필 구조(설문/마이데이터/도출) |
| `DB_스키마.md` + `ERD_현재.png` | 테이블 ERD (PROFILE_SURVEY, MYDATA_*, FINANCE) |
| `FINANCE_피처정의.md` | 실정책 178건 요건 분석 → 정책 판정용 금융 피처 15종 |
| `POLICIES_수집기획.md` | 정책 3개 API 소스, 조건코드(JA), 분류 2축, 스키마 |
| `검색추천_3단설계.md` | 조건필터 → 하이브리드 검색 → LLM 판정. **v2 pgvector 분담 스펙** |
| `기능명세서.md` · `STATUS.md` · `작업정리_보고서용.md` | 제출용 명세, 현황(9/5 스냅샷), 작업 정리 |
| `채용공고_시스템_설계.md` · `취업후_시뮬레이션_설계.md` · `RAG_기법비교.md` | 기능별 설계 |

## DB 테이블 (Supabase)

`profile_survey` `mydata_account` `mydata_transaction` `mydata_card_approval` `mydata_loan` `mydata_insurance` `mydata_investment` `finance` `users` — 생성·시드 완료
`policies` `user_calendar` — 생성 SQL은 `supabase/schema.sql` 하단 / 대화 참고, 적재는 `scripts/load_*.mts`

## 환경변수 (`.env.local` — 커밋 금지)

| 변수 | 용도 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB (서버 전용 secret 키) |
| `GROQ_API_KEY`, `GROQ_MODEL` | LLM 판정·매칭 |
| `ONTONG_YOUTH_API_KEY` | 온통청년 정책 수집 (스크립트용) |
| `DATA_GO_KR_API_KEY` | 행안부 공공서비스 수집 (스크립트용) |

배포판(Vercel)에는 Settings → Environment Variables에 같은 이름으로 등록.
