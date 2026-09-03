-- 티끌 DB 스키마 (docs/DB_스키마.md ERD와 1:1 대응)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
-- 컬럼은 영문 snake_case, 한글 원명은 COMMENT로 병기.

-- ── PROFILE_SURVEY: 설문 정보 (마이데이터로 알 수 없는 것) ──
create table if not exists profile_survey (
  id                 text primary key,          -- ID (페르소나: minji 등)
  name               text not null,             -- 이름
  birth_date         date,                      -- 생년월일
  gender             text,                      -- 성별
  military_served    boolean,                   -- 병역여부
  military_months    int,                       -- 복무개월
  region_sido        text,                      -- 거주지_시도
  region_sigungu     text,                      -- 거주지_시군구
  residence_since    date,                      -- 거주시작일
  education_status   text,                      -- 학력상태 (재학|휴학|졸업유예|졸업)
  major              text,                      -- 전공
  graduated_at       date,                      -- 졸업일
  target_job         text,                      -- 목표직무
  living_with_parents boolean,                  -- 부모동거여부
  household_size     int,                       -- 가구원수
  housing_type       text,                      -- 주거형태 (본가|월세|전세)
  deposit_krw        bigint,                    -- 보증금
  income_bracket     text,                      -- 가구중위소득구간 (~60%|60~100%|100~150%|150%~|null=모름)
  asset_bracket      text,                      -- 가구재산구간
  parent_income_bracket text,                   -- 원가구(부모)연소득구간 [FINANCE 조사로 추가]
  welfare_status     text,                      -- 기초수급·차상위여부 [FINANCE 조사로 추가]
  benefit_history    text[],                    -- 수급이력
  certificates       text[],                    -- 보유자격증
  created_at         timestamptz default now()
);

-- ── MYDATA_ACCOUNT: 계좌 (RAW) ──
create table if not exists mydata_account (
  account_id   text primary key,                -- 계좌ID
  user_id      text not null references profile_survey(id) on delete cascade,
  org_name     text,                            -- 기관명
  account_type text,                            -- 계좌유형 (수시입출금|예적금|CMA)
  product_name text,                            -- 상품명
  balance_krw  bigint,                          -- 잔액
  opened_at    date,                            -- 개설일
  maturity_at  date,                            -- 만기일 (예적금)
  monthly_contribution_krw int,                 -- 월납입액 (적금)
  interest_rate numeric                         -- 금리 (예적금)
);

-- ── MYDATA_TRANSACTION: 입출금 거래내역 (RAW) ──
create table if not exists mydata_transaction (
  tx_id        uuid primary key default gen_random_uuid(), -- 거래ID
  account_id   text not null references mydata_account(account_id) on delete cascade,
  tx_at        date not null,                   -- 거래일시 (mock은 일 단위)
  amount_krw   bigint not null,                 -- 거래금액
  direction    text not null check (direction in ('IN','OUT')), -- 입출구분
  description  text,                            -- 적요 (분류의 원천)
  balance_after_krw bigint                      -- 거래후잔액
);
create index if not exists idx_tx_account_date on mydata_transaction(account_id, tx_at);

-- ── MYDATA_CARD_APPROVAL / LOAN / INSURANCE / INVESTMENT: 스키마만 (아직 mock 없음) ──
create table if not exists mydata_card_approval (
  approval_id  uuid primary key default gen_random_uuid(),
  user_id      text not null references profile_survey(id) on delete cascade,
  card_org     text, approved_at timestamptz, merchant_name text,
  mcc_code     text, amount_krw bigint, installment_months int, cancelled boolean default false
);
create table if not exists mydata_loan (
  loan_id      text primary key,
  user_id      text not null references profile_survey(id) on delete cascade,
  org_name     text, loan_type text, balance_krw bigint, interest_rate numeric,
  repayment_status text, next_payment_at date, next_payment_krw bigint
);
create table if not exists mydata_insurance (
  contract_id  text primary key,
  user_id      text not null references profile_survey(id) on delete cascade,
  insurer      text, product_type text, monthly_premium_krw int, payment_day int, maturity_at date
);
create table if not exists mydata_investment (
  product_id   text primary key,
  user_id      text not null references profile_survey(id) on delete cascade,
  org_name     text, product_type text, principal_krw bigint, valuation_krw bigint, liquidatable boolean
);

-- ── FINANCE: 정책 판정용 금융 피처 스토어 (docs/FINANCE_피처정의.md) ──
create table if not exists finance (
  user_id      text primary key references profile_survey(id) on delete cascade,
  as_of        date not null,                   -- 기준일
  -- 소득
  monthly_work_income_krw   int,                -- 월평균근로소득 (RAW 도출)
  income_months_observed    int,                -- 소득관측개월수
  annualized_income_krw     int,                -- 연환산소득
  income_bracket            text,               -- 가구중위소득구간 (설문 복사)
  parent_income_bracket     text,               -- 원가구부모연소득구간 (설문 복사)
  health_insurance_type     text,               -- 건보자격
  monthly_health_premium_krw int,               -- 월건보료
  receiving_benefits        jsonb,              -- 수급중제도 [{name, monthly_krw, first_month, end_estimate_month}]
  -- 재산
  financial_assets_krw      bigint,             -- 금융재산총액 (예적금+투자 합산)
  asset_bracket             text,               -- 가구재산구간 (설문 복사)
  homeless_owner            boolean,            -- 무주택여부 (설문 복사)
  rent_deposit_krw          bigint,             -- 임차보증금 (설문 복사)
  monthly_rent_krw          int,                -- 월세액 (RAW 도출)
  -- 부채
  loans_by_type             jsonb,              -- 대출잔액유형별 {학자금, 신용, 전세}
  delinquent                boolean,            -- 연체여부
  -- 자격·이력
  welfare_status            text,               -- 기초수급차상위여부 (설문 복사)
  employment_insurance_months int,              -- 고용보험가입개월 (설문 복사)
  unemployed_months         int                 -- 미취업지속개월 (도출+보정)
);

-- ── USERS: 서비스 이용 주체 (데모=페르소나 선택, 실서비스=회원) ──
create table if not exists users (
  user_id      uuid primary key default gen_random_uuid(),
  kind         text not null default 'demo',      -- demo | member
  persona_id   text references profile_survey(id), -- kind=demo일 때
  nickname     text,
  created_at   timestamptz default now(),
  last_login_at timestamptz default now()
);
