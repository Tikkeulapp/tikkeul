-- 채용공고 테이블 (민간: 사람인 오픈API / 공공기관: 잡알리오 공공데이터 API)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
create table if not exists job_postings (
  job_id text primary key,           -- "saramin:<id>" | "pubinst:<recrutPblntSn>"
  source text not null,              -- 'saramin' | 'pubinst'
  title text not null,               -- 공고 제목
  company text,                      -- 회사/기관명
  region_names text[] default '{}',  -- 근무지역 원문 ["서울 강남구","경기"]
  region_sidos text[] default '{}',  -- 정규화 시도 ["서울특별시","경기도"]
  is_national boolean default false, -- 전국/지역 무관 포함
  ncs_codes text[] default '{}',     -- 직무분야 코드 (NCS 대분류 기준으로 통일)
  ncs_names text[] default '{}',     -- 직무분야 원문 이름 ["IT개발·데이터"]
  hire_types text[] default '{}',    -- 고용형태 ["정규직"]
  career text,                       -- 경력 구분 (신입/경력/신입·경력 등)
  education text,                    -- 학력 요건 요약
  salary_text text,                  -- 급여 원문 (예: "연봉 3,000~3,600만원", "회사내규에 따름")
  headcount int,                     -- 채용 인원 (공공기관만 제공)
  pbanc_begin date,                  -- 공고 시작일
  deadline date,                     -- 접수 마감일
  deadline_time text,                -- 접수 마감 시각 "HH:MM" (소스가 제공할 때만, 잡알리오는 미제공)
  summary text,                      -- 직무설명·요약 (소스가 제공할 때만)
  requirements text,                 -- 자격요건(+우대) 요약
  detail_url text,                   -- 공고 원문 URL
  search_text text,                  -- 제목+회사+직무+자격 요약 (키워드 검색용)
  collected_at timestamptz default now()
);
-- 이미 테이블을 만든 경우: 아래 한 줄만 실행하면 됨 (마감 시각 컬럼 추가)
alter table job_postings add column if not exists deadline_time text;
alter table job_postings add column if not exists summary text;
alter table job_postings add column if not exists requirements text;

create index if not exists job_postings_deadline_idx on job_postings (deadline);
create index if not exists job_postings_sidos_idx on job_postings using gin (region_sidos);
create index if not exists job_postings_ncs_idx on job_postings using gin (ncs_codes);
