/**
 * gov24(행안부 공공서비스) 취준 관련분을 policies 테이블에 적재.
 * 실행: npx tsx scripts/load_gov24.mts <gov24_jobseeker.json>
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const SIDOS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "강원도", "충청북도",
  "충청남도", "전북특별자치도", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];
const NORMALIZE: Record<string, string> = { 강원도: "강원특별자치도", 전라북도: "전북특별자치도" };

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v).trim());

function regionFromProvider(provider: string): { sidos: string[]; national: boolean } {
  for (const s of SIDOS) {
    if (provider.startsWith(s)) return { sidos: [NORMALIZE[s] ?? s], national: false };
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
