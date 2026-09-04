/**
 * 온통청년 전수(2,750건)를 policies 테이블에 적재한다.
 * 실행: npx tsx scripts/load_policies.mts <ontong_all.json 경로>
 * 정규화: 지역코드→시도명, 나이, 신청기간, 검색용 텍스트. (eligibility_json 정밀화는 다음 단계)
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
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

// 법정동코드 앞 2자리 → 시도명
const SIDO: Record<string, string> = {
  "11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시",
  "29": "광주광역시", "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시",
  "41": "경기도", "42": "강원특별자치도", "51": "강원특별자치도", "43": "충청북도",
  "44": "충청남도", "45": "전북특별자치도", "52": "전북특별자치도", "46": "전라남도",
  "47": "경상북도", "48": "경상남도", "50": "제주특별자치도",
  "12": "전남광주통합특별시", // 2026 통합 신설 코드 (광주 29·전남 46 흡수)
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const intOr = (v: unknown): number | null => {
  const n = Number(str(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parseDates(aply: string): { start: string | null; end: string | null } {
  // "20260101 ~ 20261231" 형태
  const m = aply.match(/(\d{8})\s*~\s*(\d{8})/);
  if (!m) return { start: null, end: null };
  const fmt = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return { start: fmt(m[1]), end: fmt(m[2]) };
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("사용법: npx tsx scripts/load_policies.mts <ontong_all.json>");
    process.exit(1);
  }
  const items: Row[] = JSON.parse(readFileSync(path, "utf-8"));
  console.log(`원본 ${items.length}건 정규화 중…`);

  const rows = items.map((it) => {
    const zip = str(it.zipCd);
    const codes = zip.split(",").map((c) => c.trim()).filter(Boolean);
    const sidos = [...new Set(codes.map((c) => SIDO[c.slice(0, 2)]).filter(Boolean))];
    const isNational = sidos.length >= 10;
    const aply = str(it.aplyYmd);
    const { start, end } = parseDates(aply);
    const searchText = [
      str(it.plcyNm), str(it.plcyKywdNm), str(it.lclsfNm), str(it.mclsfNm),
      str(it.plcyExplnCn).slice(0, 800), str(it.plcySprtCn).slice(0, 800),
    ].join(" | ");
    return {
      policy_id: `ontong:${str(it.plcyNo)}`,
      source: "ontong",
      source_id: str(it.plcyNo),
      title: str(it.plcyNm),
      provider: str(it.sprvsnInstCdNm) || str(it.rgtrInstCdNm) || null,
      theme: str(it.lclsfNm).split(",")[0] || null,
      region_sidos: isNational ? [] : sidos,
      is_national: isNational,
      zip_codes: zip.slice(0, 2000) || null,
      age_min: intOr(it.sprtTrgtMinAge),
      age_max: intOr(it.sprtTrgtMaxAge),
      income_condition: str(it.earnEtcCn).slice(0, 300) || null,
      start_date: start,
      end_date: end,
      always_open: !aply,
      apply_url: str(it.aplyUrlAddr) || str(it.refUrlAddr1) || null,
      search_text: searchText.slice(0, 2500),
      raw_sha256: createHash("sha256").update(JSON.stringify(it)).digest("hex").slice(0, 32),
    };
  }).filter((r) => r.title);

  // 500건씩 배치 upsert
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await db.from("policies").upsert(batch);
    if (error) throw new Error(`배치 ${i}: ${error.message}`);
    console.log(`  ${Math.min(i + 500, rows.length)}/${rows.length} 적재`);
  }
  const { count } = await db.from("policies").select("*", { count: "exact", head: true });
  console.log(`✅ 완료 — policies 테이블 ${count}행`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
