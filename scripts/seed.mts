/**
 * 페르소나 3명을 Supabase에 시드한다.
 * 실행: npx tsx scripts/seed.mts   (.env.local에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요)
 *
 * 채우는 테이블: profile_survey, mydata_account, mydata_transaction, mydata_card_approval, mydata_loan, finance
 * FINANCE 값은 손으로 넣지 않고 derive()로 RAW에서 계산해 넣는다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PERSONAS } from "../src/data/personas";
import { derive } from "../src/lib/derive";

// .env.local 로드 (외부 패키지 없이)
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

async function main() {
  for (const p of PERSONAS) {
    const d = p.declared;

    // ── profile_survey ──
    const survey = {
      id: p.id,
      name: p.name,
      birth_date: d.birthDate,
      gender: d.gender,
      military_served: d.military?.served ?? null,
      military_months: d.military?.months ?? null,
      region_sido: d.region.sido,
      region_sigungu: d.region.sigungu,
      residence_since: d.region.since,
      education_status: d.education.status,
      major: d.education.major,
      graduated_at: d.education.graduatedAt,
      employment_status: d.employmentStatus,
      target_job: d.targetJob,
      living_with_parents: d.household.livingWithParents,
      household_size: d.household.size,
      housing_type: d.household.housing,
      deposit_krw: d.household.depositKrw,
      income_bracket: d.incomeBracket,
      asset_bracket: d.assetBracket,
      parent_income_bracket: null, // 설문 신규 항목 — 페르소나 값 추후 반영
      welfare_status: null, // 설문 신규 항목
      benefit_history: d.benefitHistory,
      certificates: d.certificates,
    };
    let res = await db.from("profile_survey").upsert(survey);
    if (res.error) throw new Error(`profile_survey(${p.id}): ${res.error.message}`);

    // ── mydata_account ──
    const accounts = p.mydata.accounts.map((a) => ({
      account_id: a.accountId,
      user_id: p.id,
      org_name: a.org,
      account_type: a.type,
      balance_krw: a.balanceKrw,
    }));
    res = await db.from("mydata_account").upsert(accounts);
    if (res.error) throw new Error(`mydata_account(${p.id}): ${res.error.message}`);

    // ── mydata_transaction (재실행 대비: 해당 계좌 것 삭제 후 삽입) ──
    const accountIds = accounts.map((a) => a.account_id);
    res = await db.from("mydata_transaction").delete().in("account_id", accountIds);
    if (res.error) throw new Error(`tx delete(${p.id}): ${res.error.message}`);
    // mock 거래는 계좌 구분이 없으므로 대표 입출금 계좌에 귀속
    const mainAccount =
      accounts.find((a) => a.account_type === "수시입출금")?.account_id ?? accountIds[0];
    const txs = p.mydata.transactions.map((t) => ({
      account_id: mainAccount,
      tx_at: t.date,
      amount_krw: t.amountKrw,
      direction: t.direction,
      description: t.description,
    }));
    res = await db.from("mydata_transaction").insert(txs);
    if (res.error) throw new Error(`mydata_transaction(${p.id}): ${res.error.message}`);

    // ── mydata_card_approval (카드 승인내역 — 수집 가정; 재실행 대비 삭제 후 삽입) ──
    res = await db.from("mydata_card_approval").delete().eq("user_id", p.id);
    if (res.error) throw new Error(`card delete(${p.id}): ${res.error.message}`);
    const cards = p.mydata.cardApprovals.map((c) => ({
      user_id: p.id,
      card_org: "카드사(mock)",
      approved_at: `${c.date}T12:00:00+09:00`,
      merchant_name: c.merchant,
      mcc_code: c.category, // 서비스 분류를 업종코드 자리에 기록 (실서비스: MCC → 분류 매핑)
      amount_krw: c.amountKrw,
      installment_months: 0,
      cancelled: false,
    }));
    if (cards.length) {
      res = await db.from("mydata_card_approval").insert(cards);
      if (res.error) throw new Error(`mydata_card_approval(${p.id}): ${res.error.message}`);
    }

    // ── mydata_loan ──
    res = await db.from("mydata_loan").delete().eq("user_id", p.id);
    if (res.error) throw new Error(`loan delete(${p.id}): ${res.error.message}`);
    const loans = p.mydata.loans.map((l) => ({
      loan_id: l.loanId,
      user_id: p.id,
      org_name: l.org,
      loan_type: l.type,
      balance_krw: l.balanceKrw,
      interest_rate: l.interestRate,
      repayment_status: l.monthlyPaymentKrw > 0 ? "상환중" : "거치",
      next_payment_at: null,
      next_payment_krw: l.monthlyPaymentKrw,
    }));
    if (loans.length) {
      res = await db.from("mydata_loan").upsert(loans);
      if (res.error) throw new Error(`mydata_loan(${p.id}): ${res.error.message}`);
    }
    const loansByType: Record<string, number> = {};
    for (const l of p.mydata.loans) loansByType[l.type] = (loansByType[l.type] ?? 0) + l.balanceKrw;

    // ── finance (derive로 계산해 저장) ──
    const dv = derive(p.mydata);
    const work = dv.incomes.find((i) => i.kind === "WORK");
    const investSum = 0; // MYDATA_INVESTMENT mock 미구현 — 추가 시 합산
    const savingsSum = p.mydata.accounts
      .filter((a) => a.type === "적금" || a.type === "예금")
      .reduce((s, a) => s + a.balanceKrw, 0);
    const finance = {
      user_id: p.id,
      as_of: p.mydata.asOf,
      monthly_work_income_krw: work?.avgMonthlyKrw ?? null,
      income_months_observed: work?.monthsObserved ?? null,
      annualized_income_krw: work ? work.avgMonthlyKrw * 12 : null,
      income_bracket: d.incomeBracket,
      parent_income_bracket: null,
      health_insurance_type: null, // 설문 확장 시
      monthly_health_premium_krw: null,
      receiving_benefits: dv.benefits.map((b) => ({
        name: b.name,
        monthly_krw: b.monthlyKrw,
        first_month: b.firstSeenMonth,
        end_estimate_month: b.endEstimateMonth,
      })),
      financial_assets_krw: dv.liquidAssetsKrw + savingsSum + investSum,
      asset_bracket: d.assetBracket,
      homeless_owner: d.household.housing !== "본가" ? true : null, // 본가 거주는 확인 필요
      rent_deposit_krw: d.household.depositKrw,
      monthly_rent_krw: dv.rentMonthlyKrw,
      loans_by_type: loansByType,
      delinquent: null,
      welfare_status: null,
      employment_insurance_months: null, // 설문 확장 시 (서연: 24개월 예정)
      unemployed_months: dv.noRegularWorkIncome ? null : 0, // 정밀 도출은 다음 단계
    };
    res = await db.from("finance").upsert(finance);
    if (res.error) throw new Error(`finance(${p.id}): ${res.error.message}`);

    console.log(
      `✓ ${p.name}(${p.id}) — survey 1행, account ${accounts.length}행, tx ${txs.length}행, card ${cards.length}행, loan ${loans.length}행, finance 1행`,
    );
  }

  // 검증: 행 수 확인
  for (const table of ["profile_survey", "mydata_account", "mydata_transaction", "mydata_card_approval", "mydata_loan", "finance"]) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${table}: ${error ? "오류 " + error.message : count + "행"}`);
  }
  console.log("✅ 시드 완료");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
