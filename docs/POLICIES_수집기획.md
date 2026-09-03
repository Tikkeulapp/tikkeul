# policies DB 수집 기획

> 목표: `policies` + `policy_detail` 테이블을 실데이터로 채운다.
> 원칙: 원문 보존(raw) → 정형화(normalize) → 자격조건 구조화(eligibility_json은 **FINANCE 피처와 같은 어휘**로).

## 1. 데이터 소스 (3개 + 보강 1개)

| # | 소스 | 커버리지 | 키 | 상태 |
|---|---|---|---|---|
| A | **행안부 대한민국 공공서비스(혜택)** `api.odcloud.kr/api/gov24/v3` | 중앙+지자체 전 국민 대상 서비스 약 1만건 (취준 관련 178건 확인) | 공공데이터포털 | ✅ **키 보유, 즉시 가능** |
| B | **온통청년 청년정책 API** `youthcenter.go.kr` Open API | 청년정책 전수 (중앙+지자체 수천 건) — 취준생 타깃의 본진 | 온통청년 사이트에서 신청 | ⏳ **키 신청 필요 (본인)** |
| C | **HRD-Net 직업훈련과정 API** (고용노동부, 공공데이터포털) | 내일배움카드 훈련과정 — "10월 Python 교육" 이벤트 매칭용 | 공공데이터포털 활용신청 | ⏳ 활용신청 필요 (본인, 자동승인) |
| D | (보강) 서울열린데이터광장·경기데이터드림 | 시·도 자체 정책 상세 | 각 포털 | 후순위 |

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
  source        text           -- gov24 | ontong | hrdnet          [추가 제안]
  source_id     text           -- 원 소스의 ID                      [추가 제안]
  title         text
  provider      text           -- 소관기관 (고용노동부, 서울시 중랑구…)
  category      text           -- 일자리|주거|교육|금융|복지         [추가 제안]
  region_sido   text           -- 전국이면 null
  region_sigungu text          -- 시군구 단위 정책                   [추가 제안]
  age_min       int
  age_max       int
  income_condition text        -- 요약 텍스트 (원문은 policy_detail)
  employment_condition text
  start_date    date           -- 신청 시작 (상시면 null)
  end_date      date           -- 신청 마감 (예산소진 조기마감 플래그 별도)
  apply_url     text
  fetched_at    timestamptz    -- 수집 시각                          [추가 제안]
  raw_sha256    text           -- 원문 해시 (Trust/재현성)           [추가 제안]

policy_detail
  policy_id     text PK FK
  eligibility_json jsonb       -- ⭐ FINANCE 피처와 동일 어휘 (아래 4절)
  eligibility_text text        -- 지원대상+선정기준 원문 (LLM·사람 검증용)
  support_content text         -- 지원내용 원문
  required_docs  jsonb         -- [{name, required, note}] 구비서류
  contact       text
  legal_basis   text
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

## 7. 지금 필요한 결정·작업

- [ ] (본인) 온통청년 Open API 키 신청
- [ ] (본인, 선택) 공공데이터포털 HRD-Net 활용신청
- [ ] (팀) policies 추가 컬럼(source, region_sigungu, fetched_at, raw_sha256, category) 승인
- [ ] (개발) JA 코드 매핑표 + gov24 수집→적재 스크립트
