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
-- employment_status는 페르소나(personas.ts)·profile_changes.field 화이트리스트·규칙엔진 조건 등
-- 코드 곳곳에서 이미 다뤄지는데 컬럼 자체가 없었다 (seed.mts/signup 둘 다 저장할 곳이 없어 누락돼 있었음).
-- 이미 존재하는 라이브 테이블이라 add column if not exists로 패치.
alter table profile_survey add column if not exists employment_status text; -- 취업상태 (자유텍스트, 예: 재직중|미취업|미취업_단기알바중)

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

-- ── PROFILE_CHANGES: 프로필 상태 변화 이력 (이사·졸업·퇴사 등) ──
create table if not exists profile_changes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(user_id) on delete cascade,
  field         text not null,            -- region_sido | education_status | employment_status
  old_value     text,
  new_value     text not null,
  effective_from date not null,
  source_event  text,
  status        text not null default 'applied',  -- proposed | applied | reverted
  created_at    timestamptz default now()
);
create index if not exists idx_profile_changes_user on profile_changes(user_id, field, effective_from);

-- ── POLICY_DISCOVERY_QUEUE: 신규 정책 발견 큐 (검증 전 격리) ──
create table if not exists policy_discovery_queue (
  id            uuid primary key default gen_random_uuid(),
  found_by      text not null,            -- api:ontong | api:gov24 | web:tavily | crawl:<site>
  trigger_context text,
  url           text,
  title         text,
  snippet       text,
  extracted     jsonb,
  candidate_policy_id text,
  status        text not null default 'new',  -- new | approved | rejected | merged
  created_at    timestamptz default now(),
  reviewed_at   timestamptz
);
create unique index if not exists idx_discovery_url on policy_discovery_queue(url) where url is not null;

-- ── POLICIES / USER_CALENDAR: 지금까지 Supabase 대시보드에서만 만들어져 있던 테이블을
--    코드(scripts/load_*.mts, src/app/api/*)에서 실제 쓰는 컬럼 기준으로 역추적해 처음 문서화.
--    이미 존재하므로 create table if not exists는 무해 (운영 데이터에 영향 없음).
create table if not exists policies (
  policy_id         text primary key,          -- "ontong:12345" | "gov24:67890" | "curated:..."
  source            text not null,             -- ontong | gov24 | curated
  source_id         text,
  title             text not null,
  provider          text,
  theme             text,
  region_sidos      text[],                    -- 빈 배열 = is_national
  is_national       boolean not null default false,
  zip_codes         text,
  age_min           int,
  age_max           int,
  income_condition  text,
  start_date        date,
  end_date          date,
  always_open       boolean not null default false,
  apply_url         text,
  search_text       text,                      -- 키워드 검색용 (ilike)
  raw_sha256        text                       -- 원본 변경 감지용 해시
);
create index if not exists idx_policies_region on policies using gin (region_sidos);

create table if not exists user_calendar (
  event_id      uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(user_id) on delete cascade,
  title         text not null,
  start_at      date not null,
  location      text,
  event_type    text,                          -- INTERVIEW|EXAM|EDUCATION|MOVE|HOUSING|APPLICATION|GRADUATE|RESIGN|EMPLOYED|ETC
  source        text not null default 'user',  -- seed | user
  created_at    timestamptz default now()
);
create index if not exists idx_calendar_user on user_calendar(user_id, start_at);

-- ── POLICY_ELIGIBILITY: 구조화 자격조건 (finance/ 설계 이식) ──
-- policies와 분리된 테이블인 이유: policies는 scripts/load_*.mts가 주기적으로 upsert하는 대상이라,
-- 여기에 손으로 다듬은 자격조건을 같이 두면 다음 수집 때 덮어써진다.
create table if not exists policy_eligibility (
  policy_id           text primary key references policies(policy_id) on delete cascade,
  conditions          jsonb not null default '[]',  -- [{field, source_table, operator, value}]
  eligibility_text    text,                          -- LLM 설명 생성용 원문 근거
  benefit_type        text check (benefit_type in ('cash', 'voucher', 'interest_subsidy', 'savings_match', 'in_kind')),
  benefit_amount_krw  int,
  benefit_period      text,
  updated_at          timestamptz default now()
);

-- ── USER_POLICY_MATCHES: 매칭·자격판정 결과 영속화 (지금까지 없었음 — localStorage만 있었음) ──
create table if not exists user_policy_matches (
  match_id              uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(user_id) on delete cascade,
  policy_id             text not null references policies(policy_id),
  match_mode            text not null check (match_mode in ('search', 'lookup_and_check', 'compare')),
  eligibility_status    text not null check (eligibility_status in ('confirmed', 'excluded', 'insufficient_info')),
  match_score           numeric,
  reason                text,
  status                text not null default 'recommended' check (status in ('recommended', 'applied', 'dismissed', 'expired')),
  missing_information   jsonb not null default '[]',
  checked_at            timestamptz not null default now()
);
create index if not exists idx_matches_user on user_policy_matches(user_id, checked_at desc);

-- ── REMINDERS: 마감·매칭 알림 (Notification Scheduler) ──
create table if not exists reminders (
  reminder_id   uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(user_id) on delete cascade,
  policy_id     text references policies(policy_id),
  event_id      uuid references user_calendar(event_id),
  remind_at     timestamptz not null,
  message       text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at    timestamptz default now()
);
create index if not exists idx_reminders_pending on reminders(status, remind_at);

-- ── CHAT_MESSAGES: 검색바 AI 채팅 대화 기록 ──
create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(user_id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now()
);
create index if not exists idx_chat_messages_user on chat_messages(user_id, created_at);

-- ── USER_INTEREST_EVENTS: 관심 신호 (개인화 추천 순위용, 2026-10-07) ──
-- 담기·빼기·상세열람·추천노출·대화 관심·관심사 거절("아니에요")·채용공고 담기/열람/노출/강점 키워드를 쌓는다.
-- 채용 신호의 태그는 ncs:·org:·hire:·region:·kw: 네임스페이스 (src/lib/jobInterest.ts). 점수는 src/lib/interest.ts가 time-decay로 계산.
-- 일정(user_calendar)·마이데이터 지출은 이미 있는 데이터라 여기 복제하지 않고 추천 시점에 태그로 변환한다.
-- 관심사는 순위에만 쓰고 자격 판정·금액에는 쓰지 않는다.
create table if not exists user_interest_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(user_id) on delete cascade,
  signal       text not null check (signal in ('save', 'remove', 'view', 'impression', 'chat', 'reject', 'job_save', 'job_view', 'job_impression', 'job_keyword')),
  tags         text[] not null default '{}',   -- src/data/interests.ts 태그 id
  policy_id    text,                           -- FK 없음: 데모 정책·삭제된 정책도 이력은 남긴다
  job_id       text,                           -- 채용공고 신호(job_*)의 job_postings.job_id (FK 없음: 마감·삭제돼도 이력 유지)
  weight       numeric,                        -- null이면 SIGNAL_WEIGHT 기본값
  occurred_at  timestamptz not null default now(),
  expires_at   timestamptz                     -- 일시적 관심 (null = 감쇠만)
);
create index if not exists idx_interest_events_user on user_interest_events(user_id, occurred_at desc);
-- 이전 버전으로 이미 만든 DB용 패치 — 여러 번 실행해도 안전
-- (첫 버전엔 'reject'가 없었고, 중간 버전의 선톡 신호 starter_*·starter_id 컬럼은 기능 제거로 더 이상 쓰지 않음)
alter table user_interest_events drop column if exists starter_id;
alter table user_interest_events add column if not exists job_id text;
alter table user_interest_events drop constraint if exists user_interest_events_signal_check;
alter table user_interest_events add constraint user_interest_events_signal_check
  check (signal in ('save', 'remove', 'view', 'impression', 'chat', 'reject', 'job_save', 'job_view', 'job_impression', 'job_keyword')) not valid;

-- ============================================================================
-- RLS — 모든 테이블 활성화, 정책은 두지 않는다 (2026-10-06)
-- 앱·스크립트는 서버에서 service_role 키로만 접근하고 service_role은 RLS를 우회하므로 동작 영향 없음.
-- 효과: anon/publishable 키로 Data API(PostgREST)에 붙는 접근은 전부 차단 (키 유출 대비 2차 방어선).
-- 클라이언트에서 Supabase에 직접 붙는 기능을 만들면 그 테이블에 정책을 따로 추가해야 한다.
-- ============================================================================
alter table profile_survey          enable row level security;
alter table mydata_account          enable row level security;
alter table mydata_transaction      enable row level security;
alter table mydata_card_approval    enable row level security;
alter table mydata_loan             enable row level security;
alter table mydata_insurance        enable row level security;
alter table mydata_investment       enable row level security;
alter table finance                 enable row level security;
alter table users                   enable row level security;
alter table profile_changes         enable row level security;
alter table policy_discovery_queue  enable row level security;
alter table policies                enable row level security;
alter table user_calendar           enable row level security;
alter table policy_eligibility      enable row level security;
alter table user_policy_matches     enable row level security;
alter table reminders               enable row level security;
alter table chat_messages           enable row level security;
alter table user_interest_events    enable row level security;
