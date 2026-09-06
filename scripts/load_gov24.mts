/**
 * gov24(행안부 공공서비스) 취준 관련분을 policies 테이블에 적재.
 * 실행: npx tsx scripts/load_gov24.mts <gov24_jobseeker.json>
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SIDO_CANONICAL, normalizeSido } from "../src/lib/region";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// "재단법인충남경제진흥원"처럼 지역명이 맨 앞이 아니거나 축약형("충남")으로만 나오는 기관명이
// 실제로 흔해서(직접 확인: gov24:O00109000017 "구직자 면접수당 지원" 등 4건이 전부 이 패턴으로
// is_national=true로 잘못 분류돼 있었음) — startsWith 대신 includes로, 축약형도 lib/region.ts의
// normalizeSido로 정규화해서 잡는다. 토큰은 길이 내림차순으로 검사해 "전라남도"가 "전남"보다
// 먼저 걸리는 식의 우연한 부분일치를 줄인다.
const REGION_TOKENS = [
  ...SIDO_CANONICAL,
  "충남", "충북", "경북", "경남", "전북", "전남", "광주", "강원도", "강원", "제주", "세종",
  "서울", "부산", "대구", "인천", "대전", "울산", "경기",
];
const UNIQ_TOKENS = [...new Set(REGION_TOKENS)].sort((a, b) => b.length - a.length);

// 이름에 지역명이 들어있지만 실제로는 전국 단위인 기관(직접 확인된 예외만) — 예:
// "서울올림픽기념국민체육진흥공단"(KSPO)은 1988 서울올림픽 기념으로 이름에 "서울"이 들어갈
// 뿐 스포츠산업 취업지원 등 전국 사업만 운영한다(해당 정책 4건 모두 지역 제한 문구 없음).
const NATIONAL_EXCEPTIONS = ["서울올림픽기념국민체육진흥공단"];

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v).trim());

export function regionFromProvider(provider: string): { sidos: string[]; national: boolean } {
  if (NATIONAL_EXCEPTIONS.some((ex) => provider.includes(ex))) return { sidos: [], national: true };
  for (const token of UNIQ_TOKENS) {
    if (provider.includes(token)) {
      const canonical = normalizeSido(token);
      if (canonical) return { sidos: [canonical], national: false };
    }
  }
  return { sidos: [], national: true }; // 중앙부처·공단 등 → 전국
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("사용법: npx tsx scripts/load_gov24.mts <gov24_jobseeker.json>");
    process.exit(1);
  }
  const items: Row[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`gov24 ${items.length}건 정규화 중…`);

  const rows = items.map((it) => {
    const provider = str(it["소관기관명"]);
    const { sidos, national } = regionFromProvider(provider);
    const deadline = str(it["신청기한"]);
    const alwaysOpen = /상시|연중|수시/.test(deadline) || deadline === "";
    const searchText = [
      str(it["서비스명"]), str(it["지원유형"]), str(it["서비스분야"]),
      str(it["지원대상"]).slice(0, 600), str(it["선정기준"]).slice(0, 500),
      str(it["지원내용"]).slice(0, 600),
    ].join(" | ");
    return {
      policy_id: `gov24:${str(it["서비스ID"])}`,
      source: "gov24",
      source_id: str(it["서비스ID"]),
      title: str(it["서비스명"]),
      provider: provider || null,
      theme: str(it["서비스분야"]).split(",")[0] || null,
      region_sidos: sidos,
      is_national: national,
      zip_codes: null,
      age_min: null, // 조건코드(JA) enrich 단계에서 채움
      age_max: null,
      income_condition: str(it["선정기준"]).slice(0, 300) || null,
      start_date: null,
      end_date: null,
      always_open: alwaysOpen,
      apply_url: str(it["상세조회URL"]) || `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${str(it["서비스ID"])}`,
      search_text: searchText.slice(0, 2500),
      raw_sha256: createHash("sha256").update(JSON.stringify(it)).digest("hex").slice(0, 32),
    };
  }).filter((r) => r.title);

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await db.from("policies").upsert(batch);
    if (error) throw new Error(`배치 ${i}: ${error.message}`);
    console.log(`  ${Math.min(i + 500, rows.length)}/${rows.length} 적재`);
  }
  const { count } = await db.from("policies").select("*", { count: "exact", head: true });
  console.log(`✅ 완료 — policies 테이블 총 ${count}행`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
