-- 채용공고 테이블 (공공기관 채용정보 — 잡알리오, 기획재정부 공공데이터 API)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
create table if not exists job_postings (
  job_id text primary key,           -- "pubinst:<recrutPblntSn>"
  source text not null default 'pubinst',
  title text not null,               -- 공고 제목
  company text,                      -- 기관명
  region_names text[] default '{}',  -- 근무지역 원문 ["서울","경기"]
  region_sidos text[] default '{}',  -- 정규화 시도 ["서울특별시","경기도"]
  is_national boolean default false, -- 전국/지역 무관 포함
  ncs_codes text[] default '{}',     -- NCS 직무분야 코드 ["20"]
  ncs_names text[] default '{}',     -- ["정보통신"]
  hire_types text[] default '{}',    -- 고용형태 ["정규직"]
  career text,                       -- 채용구분 (신입/경력/신입+경력 등)
  education text,                    -- 학력 요건 요약
  headcount int,                     -- 채용 인원
  pbanc_begin date,                  -- 공고 시작일
  deadline date,                     -- 접수 마감일
  detail_url text,                   -- 원문(잡알리오) URL
  search_text text,                  -- 제목+기관+직무+자격 요약 (키워드 검색용)
  collected_at timestamptz default now()
);
create index if not exists job_postings_deadline_idx on job_postings (deadline);
create index if not exists job_postings_sidos_idx on job_postings using gin (region_sidos);
create index if not exists job_postings_ncs_idx on job_postings using gin (ncs_codes);
