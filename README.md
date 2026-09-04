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
| 기획서 · 기능명세서 | ⏳ 미착수 | `docs/` |

---

## 폴더 구조

```
src/
  app/
    page.tsx                 랜딩
    app/start/page.tsx       페르소나 선택·직접 입력
    app/page.tsx             앱 메인 (검색바·정책 패널·달력·위젯·상세 모달)
    api/session              페르소나 → users 생성 + 시드 일정
    api/signup               직접 입력 → profile_survey + users + finance
    api/events               캘린더 일정 CRUD (user_calendar)
    api/relevance            정책 1건 × 사용자 → LLM 자격 판정
    api/event-match          일정 텍스트 → 관련 정책 추천 (3단 파이프라인)
  components/landing/        랜딩 섹션들
  components/app/            앱 화면 컴포넌트
  data/personas.ts           페르소나 3종 (설문값 + 마이데이터 mock + 시드 일정)
  lib/derive.ts              마이데이터 → 도출 피처 (LLM 아님, 규칙)
  lib/supabase.ts            서버 전용 Supabase 클라이언트
  lib/groq.ts                Groq LLM JSON 호출 헬퍼
  config/brand.ts            서비스명·슬로건 단일 소스
scripts/
  seed.mts                   페르소나 → DB 시드
  collect_gov24.py           행안부 공공서비스 전체 수집 → 취준 필터
  load_policies.mts          온통청년 → policies 적재
  load_gov24.mts             gov24 → policies 적재
supabase/schema.sql          테이블 생성 SQL (Supabase SQL Editor에서 실행)
docs/                        기획·설계 문서 (아래)
```

## 문서 (docs/)

| 문서 | 내용 |
|---|---|
| `1차생각.md` | 서비스 기획 원문 — "Who you are → What you're doing" |
| `2차설계_페르소나_DB.md` | 페르소나 3종 설계, 프로필 구조(설문/마이데이터/도출) |
| `DB_스키마.md` + `ERD_현재.png` | 테이블 ERD (PROFILE_SURVEY, MYDATA_*, FINANCE) |
| `FINANCE_피처정의.md` | 실정책 178건 요건 분석 → 정책 판정용 금융 피처 15종 |
| `POLICIES_수집기획.md` | 정책 3개 API 소스, 조건코드(JA), 분류 2축, 스키마 |
| `검색추천_3단설계.md` | 조건필터 → 하이브리드 검색 → LLM 판정. **v2 pgvector 분담 스펙** |

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
