# 현황 정리 — 2026-09-05 (접수 마감 9/7 월 10:00)

## A. 지금 닥친 문제 (우선순위 순)

| # | 문제 | 상태 | 성격 |
|---|---|---|---|
| 1 | **기능명세서 초안 완료** (`docs/기능명세서.md` · `.pdf`, 3절은 실서비스 캡처 가이드북) / **기획서 미착수** — 제출 필수 3종 중 1종 남음 | 🟠 | 제출 차단 |
| 2 | 추천 탭이 **데모 하드코딩** — AI 매칭 결과가 아님 (일정 매칭은 AI, 추천 탭은 아님) | 🟠 | 시연 신뢰성 |
| 3 | "대전 이사" 같은 **지역 변경 일정 → 새 지역 혜택 전체**가 안 나옴 (일정에 직접 붙는 2~3건만) | 🟠 | 팀원 지적 |
| 4 | **커버리지 갭** — 지자체 자체 채널 정책이 국가 API에 없음 (대전 AI 거점 실사례). 웹검색·크롤 계층 없음 | 🟠 | 설계 결정 |
| 5 | 검색바 "모르는 거 물어보기" — UI만 있고 AI 미연결 | 🟡 | 기능 |
| 6 | 마이티끌(담기) — 브라우저 저장, DB(`user_policy_matches`) 없음 → 기기 바꾸면 사라짐 | 🟡 | 기능 |
| 7 | policies에 **신뢰도·출처·생명주기 컬럼 없음** (verification_status, source_url, last_seen_at) — 다중 소스·웹발견 편입 불가 구조 | 🟡 | DB |
| 8 | eligibility_json(구조화 자격조건) 미생성 — 현재 LLM이 search_text 원문으로 판정 | 🟡 | 정밀도 |
| 9 | 절약 리포트 원 위젯 — 담은 정책 예상액 합산일 뿐, 실제 절약 계산 로직 없음 | 🟡 | 기능 |
| 10 | 팀원 에이전트 코드와 머지 방법 미정 (Python? → TS 이식 vs FastAPI 분리) | 🟡 | 협업 |
| 11 | 매칭 LLM 품질 — 후보 15~20건 안에서만 선별, 비결정적, 가끔 무관 정책 포함 (60점 컷으로 완화) | 🟢 | 품질 |
| 12 | 온통청년 제공방법코드(0042xxx) 의미가 표본 추정 — 공식 코드표 미확보 → benefit_types 분류 미구현 | 🟢 | 데이터 |

## B. DB 현재 상태 (Supabase, 실측)

| 테이블 | 행 | 내용 | 채워지는 경로 |
|---|---|---|---|
| `profile_survey` | 9 | 설문 프로필 (페르소나 3 + 직접입력 6) | seed / `/api/signup` |
| `mydata_account` | 5 | 계좌 RAW (페르소나만) | seed |
| `mydata_transaction` | 53 | 거래내역 RAW (페르소나만) | seed |
| `mydata_card_approval` `mydata_loan` `mydata_insurance` `mydata_investment` | 0 | 스키마만 | — |
| `finance` | 9 | 정책 판정용 금융 피처 (페르소나=derive 계산 / 직접입력=입력값) | seed / signup |
| `users` | 16 | demo 10 + member 6 | `/api/session` `/api/signup` |
| `user_calendar` | 6 | 일정 (시드 + 직접 입력) | `/api/session` seed, `/api/events` |
| `policies` | **3,344** | 온통청년 2,750 + gov24(취준 필터) 592 + curated 2 | `scripts/load_*.mts` |
| (없음) `user_policy_matches` | — | 마이티끌·매칭 결과 저장용 — **미생성** | |
| (없음) `policy_sources` `policy_discovery_queue` | — | 다중출처·웹발견 큐 — **설계만** | |

policies 주요 컬럼: `source, title, provider, theme, region_sidos[], is_national, age_min/max, income_condition, start/end_date, always_open, apply_url, search_text, raw_sha256`.
없는 것: `verification_status, source_url, region_sigungu, first/last_seen_at, benefit_types, benefit_amount, eligibility_json`.

## C. 기능 현재 상태

### 작동함 (배포판 tikle.vercel.app)
| 기능 | 구현 | 비고 |
|---|---|---|
| 랜딩 | ✅ | AI 매칭 중심 카피 |
| 시작: 페르소나 3종 → 마이데이터 분석 연출 → 도출 프로필 | ✅ | derive.ts 규칙 계산 |
| 시작: 직접 입력 (설문 11 + 금융 6, 자동기입) | ✅ | profile_survey+users+finance 저장 |
| 앱 메인 레이아웃 (검색바·마이티끌/추천 아코디언·월달력·원 위젯) | ✅ | |
| 월 달력: 날짜 클릭·일정 등록·DB 저장·pill 표시 | ✅ | user_calendar |
| **일정 → AI 정책 매칭** (의미추출 → 지역우선 SQL 후보 → LLM 선별) | ✅ | "대전 이사"→대전 월세지원, "자소서 준비"→AI 거점 검증 |
| 정책 자세히보기 모달 + **AI 자격 판정** | ✅ | 추천/마이티끌의 데모 정책 대상 |
| 마이티끌 담기/빼기 → 원 위젯 합산 | ✅ | localStorage |
| **취업 후 시뮬레이션** (`/app/simulate` 전용 페이지, 기업구분·연봉·**목적 복수 선택** → 실수령·한 달 흐름/소비 도넛 차트·목표별 순차 도달 시점 3 시나리오·열리는 제도 14종·AI 해설) | ✅ | `/api/simulate`, `simulate.ts` 결정론 계산, 카드 승인·대출 mock 시드. 문서(기능명세서)는 제출 직전 일괄 갱신 예정 |

### 자리만 있음
| 기능 | 상태 |
|---|---|
| 추천 탭 목록 | 페르소나별 하드코딩 3건 ("데모 추천" 표기) |
| 검색바 | 입력 시 "다음 단계 연결" 안내 |
| 절약 리포트 | 담은 정책 amountMax 합산 |

### 없음
지역 변경 시 새 지역 혜택 전체 / 웹검색·크롤 계층 / user_policy_matches / eligibility_json / benefit_types 분류 / 알림·마감 D-day / 채팅 RAG / pgvector

## D. 파이프라인·인프라

- 배포: GitHub main → Vercel 자동. 환경변수(SUPABASE 2, GROQ 2) 등록 완료
- LLM: Groq `openai/gpt-oss-20b`, `reasoning_effort: low`, JSON 모드, 실패 시 1회 재시도
- 정책 수집: 온통청년 전수 스크립트 ✅ / gov24 전체 수집+필터 스크립트 ✅ / 재수집(증분·해시 비교) ❌ 미구현
- 문서: `docs/` 8종 (기획 원문, 페르소나·DB, ERD, FINANCE 피처, POLICIES 수집, 3단 검색 설계, README)

## E. 열린 결정 (팀이 정해야 함)

1. "대전 이사" 응답 범위 — 직접 혜택만 vs 지역 전체 혜택 2층 구조 (팀원 의견: 전체)
2. 웹검색·크롤 계층 도입 여부와 시점 — 도입 시 미검증 격리 큐(`policy_discovery_queue`) 필수
3. 팀원 에이전트 코드 통합 방식 — TS 이식 vs FastAPI 분리
4. 벡터 검색(pgvector) 시점 — 팀원 v2 분담
5. 제출 문서(기획서·기능명세서) 작성 시작 시점
