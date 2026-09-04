# policies DB 수집 기획

> 목표: `policies` + `policy_detail` 테이블을 실데이터로 채운다.
> 원칙: 원문 보존(raw) → 정형화(normalize) → 자격조건 구조화(eligibility_json은 **FINANCE 피처와 같은 어휘**로).

## 1. 데이터 소스 (3개 + 보강 1개)

| # | 소스 | 커버리지 | 키 | 상태 |
|---|---|---|---|---|
| A | **행안부 대한민국 공공서비스(혜택)** `api.odcloud.kr/api/gov24/v3` | 중앙+지자체 전 국민 대상 서비스 약 1만건 (취준 관련 178건 확인) | 공공데이터포털 | ✅ **키 보유, 즉시 가능** |
| B | **온통청년 청년정책 API** `youthcenter.go.kr/go/ythip/getPlcy` | 청년정책 전수 — 취준생 타깃의 본진 | 보유 | ✅ **키 확보, 전수 수집 완료** |
| C | **HRD-Net 직업훈련과정 API** (고용노동부, 공공데이터포털) | 내일배움카드 훈련과정 — "10월 Python 교육" 이벤트 매칭용 | 공공데이터포털 활용신청 | ⏳ 활용신청 필요 (본인, 자동승인) |
| D | (보강) 서울열린데이터광장·경기데이터드림 | 시·도 자체 정책 상세 | 각 포털 | 후순위 |

## 1-1. 실측 검증 결과 (2026-09-03)

- **gov24 (A)**: 전체 10,961건 중 취준 키워드 검색 222건 → 취준 관련 178건. 적재 시에는 전체를 받아 지원대상 텍스트 기준으로 재필터 예정
- **온통청년 (B)**: **2,750건 전수 수집 완료.** 지역코드 기준 **261개 시·군·구** 커버(전 시·도 등장) → 전국 커버리지 실증. 취준 관련 약 1,427건(52%). 구조화 필드 우수: 나이 73~75%, 취업상태·학력·소득조건코드 ~100% 채움 → 상당 부분 규칙 변환 가능

## 2. 핵심 발견 — A소스의 조건 코드 (LLM 불필요)

`supportConditions` 엔드포인트가 정책마다 **코드화된 자격조건 50컬럼**을 반환한다 (실측 확인, 2026-09-03):

| 코드 | 의미 | 예 (구직자 취업지원 서비스) |
|---|---|---|
| JA0101 / JA0102 | 남성 / 여성 대상 | Y / Y |
| JA0110 / JA0111 | 대상 연령 하한 / 상한 | 18 / 60 |
| JA0201~JA0205 | **기준중위소득 구간별 해당 여부** (0~50 / 51~75 / 76~100 / 101~200 / 200초과) | 전부 Y (=소득 무관) |
| JA03xx | 개인 상황 (한부모·다문화·보훈 등) | JA0327=Y |
| JA04xx | 취업 상태 (재직자·구직자·자영업 등) | 구직자 관련 Y |

→ **A소스는 규칙 변환만으로 eligibility_json 생성 가능.** 나이·성별·소득구간·취업상태가 정형 데이터로 이미 존재.
(공공데이터포털의 컬럼 정의서로 JA 코드 전체 매핑표를 만들어 `src/data/gov24_codes.ts`에 둔다)

## 3. 테이블 스키마 (팀 표기 기준 + 추가 제안 컬럼)

```
policies
  policy_id     text PK        -- "{source}:{source_id}" 예: gov24:149200000092
  source        text           -- gov24 | ontong | hrdnet
  source_id     text
  title         text
  provider      text           -- 소관기관
  theme         text           -- 취업·구직|교육·훈련|주거|금융·자산|생활·복지|창업|참여·문화
  benefit_types text[]         -- CASH|VOUCHER|FEE_WAIVER|LOAN|INTEREST|IN_KIND|EDUCATION|SERVICE|SPACE|INSURANCE (다중)
  benefit_amount_min_krw int   -- 지원내용에서 파싱 (절약액 계산용)
  benefit_amount_max_krw int
  region_sido   text           -- 전국이면 null
  region_sigungu text
  age_min       int
  age_max       int
  income_condition text        -- 요약 (원문은 policy_detail)
  employment_condition text
  start_date    date           -- 신청 시작
  end_date      date           -- 신청 마감
  biz_start_date date          -- 사업 시행 시작 (신청기간과 별개)
  biz_end_date  date
  always_open   boolean        -- 상시 접수
  early_closure boolean        -- 예산소진 조기마감 가능
  apply_url     text
  classify_confidence text     -- CODED | RULE | LLM
  first_seen_at timestamptz    -- 우리 DB 최초 등장 (신규 정책 알림 근거)
  fetched_at    timestamptz    -- 최근 수집 시각
  raw_sha256    text           -- 원문 해시 (변경 감지·재현성)

policy_detail
  policy_id     text PK FK
  eligibility_json jsonb       -- ⭐ FINANCE 피처와 동일 어휘 (아래 4절)
  eligibility_confidence text  -- CODED | PARSED | NEEDS_CHECK
  eligibility_text text        -- 지원대상+선정기준 원문 (근거 첨부용)
  support_content text         -- 지원내용 원문
  required_docs  jsonb         -- [{name, required, note}] 구비서류·증빙
  application_method text
  contact       text
  legal_basis   text
  official_detail_url text
  source_updated_at timestamptz -- 원천 수정일 (증분 수집 기준)
```

## 4. eligibility_json 스키마 — FINANCE 피처와 1:1

매칭 = "정책의 조건 vs 사용자의 FINANCE·SURVEY 값" 비교가 되도록 같은 어휘를 쓴다:

```jsonc
{
  "age": { "min": 19, "max": 34, "military_extension": true },
  "gender": null,                          // null = 무관
  "region": { "sido": "서울특별시", "sigungu": "중랑구", "residence_months_min": 12 },
  "education": { "status": ["졸업", "졸업유예"], "within_years_of_graduation": 2 },
  "employment": { "status": "미취업", "insurance_months_min": null, "unemployed_months_min": 6 },
  "income": {
    "household_median_max_pct": 60,        // 중위소득 60% 이하
    "personal_annual_max_krw": 35000000,   // 햇살론유스식 절대액
    "parent_annual_max_krw": 70000000      // 취준생 특례 (부모 소득)
  },
  "assets": { "household_max_krw": 400000000, "financial_max_krw": null },
  "housing": { "homeless_required": true, "deposit_max_krw": 30000000, "rent_max_krw": 500000 },
  "welfare": ["수급자", "차상위"],           // 이 자격이면 대상(또는 우대)
  "exclusions": ["구직급여 수급 중", "동일사업 기수혜"],  // 중복 배제
  "confidence": "CODED | PARSED | NEEDS_CHECK"  // 출처: 조건코드 | LLM파싱 | 원문확인필요
}
```

- **A소스(gov24)**: JA 코드 → 규칙 변환 (`confidence: CODED`)
- **B·C소스**: eligibility_text를 LLM이 위 스키마로 추출 (`confidence: PARSED`), 확신 없으면 필드 null + `NEEDS_CHECK`
- 원문(eligibility_text)을 항상 보존 — AI 답변에 근거로 첨부 (Trust 원칙)

## 5. 파이프라인

```
[collect]  소스별 수집 스크립트 → raw JSON 저장 (해시·수집시각)
   ↓
[normalize] 공통 스키마 매핑 → policies upsert (source+source_id 키)
   ↓
[enrich]   eligibility_json 생성
           A: JA 코드 규칙 변환 / B·C: LLM 파싱 (배치, 1회)
   ↓
[dedupe]   같은 정책이 여러 소스에 있으면 (국취제 등)
           title 정규화 + provider로 그룹 → 대표 1건, sources 배열 병기
   ↓
[refresh]  주 1회 재수집 (MVP: 수동 스크립트 → 이후 cron)
```

## 6. MVP 실행 순서 (마감 9/7 기준)

1. **오늘 가능**: A소스 — 취준 관련 178건(이미 수집됨)에 supportConditions 붙여 policies+policy_detail 적재. 규칙 변환기 작성
2. **본인 작업 후**: B소스 — 온통청년 Open API 키 신청 (youthcenter.go.kr → 마이페이지 → Open API) → 청년정책 전수 보강
3. **여유 시**: C소스 — HRD-Net 훈련과정 (공공데이터포털 → "HRD-Net 훈련과정" 활용신청, 자동승인)
4. 매칭 엔진은 policies가 부분적으로만 차 있어도 동작하도록: DB에서 후보 필터(지역·나이·상태) → LLM이 eligibility_json+FINANCE로 정밀 판정

## 7. 분류 체계 (2축)

### 축 1 — benefit_types "받는 게 뭐냐" (다중)

| 코드 | 이름 | 예시 | 절약액 계산 |
|---|---|---|---|
| CASH | 금전지원 (수당·지원금·환급) | 면접수당, 응시료 지원, 청년수당 | ✅ |
| VOUCHER | 바우처·포인트·카드 | 일하는기쁨카드 | ✅ |
| FEE_WAIVER | 면제·감면 | 응시료 면제, 보증료 지원 | ✅ |
| LOAN | 대출·융자·보증 | 햇살론유스 | △ 이자차액 |
| INTEREST | 이자·금리 지원 | 전월세 대출이자 지원 | ✅ |
| IN_KIND | 현물·대여 | 정장 무료대여 | ✅ 시장가 대비 |
| EDUCATION | 교육·훈련 제공 | 내일배움카드 과정 | ✅ 수강료 대비 |
| SERVICE | 프로그램·상담·매칭 | 취업역량 프로그램 | ❌ |
| SPACE | 공간·시설 | 청년공간 | ❌ |
| INSURANCE | 보험료 지원 | 군복무 상해보험 | ✅ |

"절약액 계산 ✅" 유형만 절약 리포트에 합산된다.

### 축 2 — theme "어느 영역이냐" (단일)
취업·구직 / 교육·훈련 / 주거 / 금융·자산 / 생활·복지 / 창업 / 참여·문화 — 두 API의 기존 분류(서비스분야, lclsf/mclsfNm) 매핑.

### 분류 파이프라인 (규칙 우선)
1. **원천 필드 결정 매핑** — gov24 `지원유형`("현금"→CASH, "현금(융자)"→LOAN, `||`복수→다중 라벨),
   온통청년 `plcyPvsnMthdCd`(0042006→CASH, 0042010→VOUCHER, 0042003·7·9→LOAN/INTEREST, 0042001→SPACE, 0042008→INSURANCE — 표본 추정, 공식 코드정의서로 확정 필요)
2. **텍스트 규칙 보강** — "면제|감면"→FEE_WAIVER, "대여"→IN_KIND, "이자"→INTEREST, "최대 N만원" 정규식→benefit_amount 파싱
3. **잔여분만 LLM** 분류 (배치 1회) — classify_confidence에 CODED/RULE/LLM 기록

## 8. 적재 결과·커버리지 실측 (2026-09-04)

- `policies` 3,344행 = 온통청년 2,750 + gov24(취준 필터) 592 + **curated 2**
- 지역코드 `12` = **전남광주통합특별시**(2026 통합 신설, 광주 29·전남 46 흡수) — 매핑 누락 발견 후 수정, 418건 지역 복구
- **커버리지 갭 실사례**: 대전시 "청년공간 AI 거점"(챗GPT·제미나이·클로드 무료, 2026.7~12), 대전 서구 "청년 AI 구독료 지원" — 두 국가 API 모두에 **미등록**, 대전일자리정보망·서구 청년플랫폼(지자체 자체 채널)에만 존재
  → 대응: `source='curated'`로 출처 명시해 수동 등록. 장기적으로 D소스(지자체 포털 크롤링) 또는 채팅의 웹검색 fallback으로 보강
  → 기획서 표현: "커버리지 = 국가 등록 채널 2종 전수 + 지자체 채널 큐레이션 보강"
- 매칭 품질 튠: 범용 키워드(준비·작성·지원…) 제거, 일정 지역 후보 우선 12건, LLM 랭킹에 "무관하면 빈 배열·60점 미만 컷" 규칙 → "대전 이사"→대전 월세지원·임차보증금 이자지원, "대전에서 자소서 준비"→정장 무료대여·AI 거점
- Groq gpt-oss 모델: 숨은 추론 토큰이 출력을 비울 수 있어 `reasoning_effort: low` + 실패 시 재시도 필요

## 9. 지금 필요한 결정·작업

- [x] (본인) 온통청년 Open API 키 — 확보 완료 (.env.local)
- [ ] (본인, 선택) 공공데이터포털 HRD-Net 활용신청
- [ ] (팀) policies 추가 컬럼(source, region_sigungu, fetched_at, raw_sha256, category) 승인
- [ ] (개발) JA 코드 매핑표 + gov24 수집→적재 스크립트
