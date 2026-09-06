/**
 * app/page.tsx의 RECS 데모 정책 중 일부에 curated policies 행 + policy_eligibility 조건을 시드한다.
 * 목적: /api/relevance가 규칙엔진 경로를 실제로 탈 수 있게 만들어 Phase 1을 검증 가능하게 함.
 * 실행: npx tsx scripts/seed_eligibility.mts
 *
 * 조건은 personas.ts의 실제 시드값(특히 employment_status는 자유텍스트라 정확한 문자열을 나열)에
 * 맞춰 썼다 — 표준화(controlled vocabulary)는 별도 과제이고, 여기선 지금 값으로 정확히 동작하게만 한다.
 * wide-jobhunt/kua-link/nbcard/kua처럼 조건을 안정적으로 코드화하기 애매한 정책은 일부러 비워둬서
 * 지금처럼 LLM 폴백 판정을 계속 타게 둔다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없습니다 (.env.local 확인)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

type Condition = { field: string; source_table: "profile_survey" | "finance"; operator: string; value: unknown };
type Seed = {
  policy_id: string;
  title: string;
  region_sidos: string[];
  apply_url: string;
  conditions: Condition[];
  eligibility_text: string;
  benefit_type: "cash" | "voucher" | "interest_subsidy" | "savings_match" | "in_kind";
  benefit_amount_krw: number;
  benefit_period: string;
};

const SEEDS: Seed[] = [
  {
    policy_id: "jungnang-exam",
    title: "중랑구 미취업청년 자격증 응시료 지원",
    region_sidos: ["서울특별시"],
    apply_url: "https://www.jungnang.go.kr",
    conditions: [
      { field: "region_sigungu", source_table: "profile_survey", operator: "=", value: "중랑구" },
      { field: "employment_status", source_table: "profile_survey", operator: "in", value: ["취업 준비 중", "재취업 준비 중"] },
      { field: "age", source_table: "profile_survey", operator: "<=", value: 39 },
    ],
    eligibility_text: "중랑구 거주 미취업 청년(만 19~39세) 대상, 어학·자격증 응시료 연 최대 10만 원 실비 지원.",
    benefit_type: "cash",
    benefit_amount_krw: 100000,
    benefit_period: "연 1회(최대)",
  },
  {
    policy_id: "seoul-allowance",
    title: "서울 청년수당",
    region_sidos: ["서울특별시"],
    apply_url: "https://youth.seoul.go.kr",
    conditions: [
      { field: "region_sido", source_table: "profile_survey", operator: "=", value: "서울특별시" },
      { field: "education_status", source_table: "profile_survey", operator: "=", value: "졸업" },
      { field: "employment_status", source_table: "profile_survey", operator: "in", value: ["취업 준비 중", "재취업 준비 중"] },
      { field: "age", source_table: "profile_survey", operator: "<=", value: 34 },
      { field: "income_bracket", source_table: "profile_survey", operator: "<=", value: 3 },
    ],
    eligibility_text: "서울 거주 만 19~34세 졸업 후 미취업 청년, 중위소득 150% 미만에게 구직활동지원금 월 50만 원 최대 6개월.",
    benefit_type: "cash",
    benefit_amount_krw: 500000,
    benefit_period: "최대 6개월",
  },
  {
    policy_id: "seoul-suit",
    title: "취업날개 면접정장 무료대여",
    region_sidos: ["서울특별시"],
    apply_url: "https://job.seoul.go.kr",
    conditions: [
      { field: "region_sido", source_table: "profile_survey", operator: "=", value: "서울특별시" },
      { field: "age", source_table: "profile_survey", operator: "<=", value: 39 },
    ],
    eligibility_text: "서울 거주 만 18~39세 구직 청년에게 면접용 정장·구두 등 무료 대여(연 10회).",
    benefit_type: "in_kind",
    benefit_amount_krw: 40000,
    benefit_period: "회당(연 10회)",
  },
  {
    policy_id: "gg-interview",
    title: "경기도 청년 면접수당",
    region_sidos: ["경기도"],
    apply_url: "https://www.jobaba.net",
    conditions: [
      { field: "region_sido", source_table: "profile_survey", operator: "=", value: "경기도" },
      { field: "age", source_table: "profile_survey", operator: "<=", value: 39 },
    ],
    eligibility_text: "경기도 거주 만 18~39세 구직 청년에게 면접 참여 시 회당 5만 원, 연 최대 50만 원.",
    benefit_type: "cash",
    benefit_amount_krw: 50000,
    benefit_period: "면접 회당(연 최대 50만)",
  },
  {
    policy_id: "kua-allowance",
    title: "국민취업지원제도 구직촉진수당",
    region_sidos: [],
    apply_url: "https://www.work24.go.kr",
    conditions: [
      { field: "age", source_table: "profile_survey", operator: "<=", value: 69 },
      { field: "income_bracket", source_table: "profile_survey", operator: "<=", value: 1 },
    ],
    eligibility_text: "15~69세 구직자 중 중위소득 60% 이하(+ 가구 재산 요건, 청년 특례 완화) 대상 구직촉진수당 월 50만 원+ × 6개월.",
    benefit_type: "cash",
    benefit_amount_krw: 500000,
    benefit_period: "6개월",
  },
  {
    policy_id: "youth-rent",
    title: "청년월세 특별지원",
    region_sidos: [],
    apply_url: "https://www.bokjiro.go.kr",
    conditions: [
      { field: "age", source_table: "profile_survey", operator: "<=", value: 34 },
      { field: "household_size", source_table: "profile_survey", operator: "=", value: 1 },
    ],
    eligibility_text: "만 19~34세 무주택 1인 가구, 소득·보증금·월세 상한 요건 충족 시 월세 월 최대 20만 원 × 12개월.",
    benefit_type: "cash",
    benefit_amount_krw: 200000,
    benefit_period: "12개월",
  },
  {
    policy_id: "sunshine",
    title: "햇살론유스",
    region_sidos: [],
    apply_url: "https://www.kinfa.or.kr",
    conditions: [
      { field: "age", source_table: "profile_survey", operator: "<=", value: 34 },
      { field: "annualized_income_krw", source_table: "finance", operator: "<=", value: 35000000 },
    ],
    eligibility_text: "만 19~34세, 연소득 3,500만 원 이하(무소득 취준생도 가능)에게 저금리 생활자금 대출(한도 1,200만 원).",
    benefit_type: "interest_subsidy",
    benefit_amount_krw: 12000000,
    benefit_period: "일시(대출)",
  },
];

async function main() {
  for (const s of SEEDS) {
    const policyRes = await db.from("policies").upsert({
      policy_id: s.policy_id,
      source: "curated",
      source_id: s.policy_id, // policies.source_id는 NOT NULL — curated 항목은 policy_id를 그대로 씀
      title: s.title,
      provider: null,
      theme: null,
      region_sidos: s.region_sidos,
      is_national: s.region_sidos.length === 0,
      zip_codes: null,
      age_min: null,
      age_max: null,
      income_condition: null,
      start_date: null,
      end_date: null,
      always_open: true,
      apply_url: s.apply_url,
      search_text: `${s.title} ${s.eligibility_text}`,
      raw_sha256: null,
    });
    if (policyRes.error) throw new Error(`policies(${s.policy_id}): ${policyRes.error.message}`);

    const eligRes = await db.from("policy_eligibility").upsert({
      policy_id: s.policy_id,
      conditions: s.conditions,
      eligibility_text: s.eligibility_text,
      benefit_type: s.benefit_type,
      benefit_amount_krw: s.benefit_amount_krw,
      benefit_period: s.benefit_period,
    });
    if (eligRes.error) throw new Error(`policy_eligibility(${s.policy_id}): ${eligRes.error.message}`);

    console.log(`✓ ${s.title} (${s.policy_id}) — 조건 ${s.conditions.length}개`);
  }
  console.log(`✅ ${SEEDS.length}건 시드 완료`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
