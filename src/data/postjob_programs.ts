/**
 * 취업 후 열리는 금융 제도·정책 (큐레이션) — 규칙 기반 1차 판정.
 * 각 항목의 요건은 공고 기준을 요약한 것이며 asOf 시점 이후 변경될 수 있다 → 화면에 "확인 필요" 원칙 유지.
 * 판정은 코드가(LIKELY / NEEDS_CHECK / UNLIKELY), 설명은 reason 문자열로 고정 — LLM은 요건을 새로 만들지 않는다.
 */
import type { CompanyType, GoalType } from "@/lib/simulate";

export type ProgramStatus = "LIKELY" | "NEEDS_CHECK" | "UNLIKELY";
export type ProgramCategory = "자산형성" | "세제" | "주거" | "대출" | "결혼" | "연금";

export type ProgramCtx = {
  age: number | null;
  annualSalaryKrw: number;
  companyType: CompanyType;
  /** 선택한 목적들 (복수) */
  goals: GoalType[];
  housing: "본가" | "월세" | "전세" | null;
  /** 무주택 여부 — 본가 거주는 세대주 여부에 따라 달라져 null */
  homeless: boolean | null;
  loans: { type: string; interestRate: number }[];
};

export type Program = {
  id: string;
  name: string;
  provider: string;
  category: ProgramCategory;
  summary: string; // 무엇인지 한 줄
  benefit: string; // 혜택 요약
  eligibility: string; // 요건 요약 (공고 기준)
  url: string;
  asOf: string;
  /** 어떤 목표·기업구분에 특히 관련 */
  tags: string[];
  judge: (c: ProgramCtx) => { status: ProgramStatus; reason: string };
};

const youth = (c: ProgramCtx, max = 34) => c.age !== null && c.age >= 19 && c.age <= max;
const sme = (c: ProgramCtx) => c.companyType === "중소기업" || c.companyType === "스타트업";
const man = (krw: number) => `${Math.round(krw / 10000).toLocaleString()}만 원`;

export const PROGRAMS: Program[] = [
  {
    id: "youth-leap-account",
    name: "청년도약계좌",
    provider: "서민금융진흥원 · 금융위원회",
    category: "자산형성",
    summary: "5년간 매달 최대 70만 원을 넣으면 정부기여금과 비과세를 더해주는 청년 전용 적금",
    benefit: "정부기여금(소득 구간별) + 이자소득 비과세, 3년 이상 유지 시 중도해지도 일부 혜택",
    eligibility: "만 19~34세(병역 최대 6년 가산), 개인 총급여 7,500만 원 이하, 가구소득 중위 250% 이하",
    url: "https://ylaccount.kinfa.or.kr",
    asOf: "2025",
    tags: ["LUMP_SUM", "HOUSE", "MARRIAGE"],
    judge: (c) => {
      if (!youth(c)) return { status: "UNLIKELY", reason: "만 19~34세 요건 (병역 가산 시 확인 필요)" };
      if (c.annualSalaryKrw > 75_000_000) return { status: "UNLIKELY", reason: `총급여 7,500만 원 초과 (입력 ${man(c.annualSalaryKrw)})` };
      return { status: "NEEDS_CHECK", reason: "나이·개인소득 충족. 가구소득(중위 250%) 요건은 확인 필요" };
    },
  },
  {
    id: "isa",
    name: "ISA (개인종합자산관리계좌)",
    provider: "은행·증권사 (금융위원회)",
    category: "세제",
    summary: "예금·펀드·주식을 한 계좌에 담고 수익에 비과세·저율과세를 받는 절세 계좌",
    benefit: "순수익 200만 원(서민형 400만 원) 비과세, 초과분 9.9% 분리과세. 연 2,000만 원 납입, 3년 의무",
    eligibility: "만 19세 이상 거주자(15~19세는 근로소득자). 직전 3년 금융소득종합과세 대상자 제외. 서민형: 총급여 5,000만 원 이하",
    url: "https://www.kofia.or.kr",
    asOf: "2025 (비과세 한도 확대 개정 여부 확인 필요)",
    tags: ["LUMP_SUM", "HOUSE", "MARRIAGE"],
    judge: (c) =>
      c.annualSalaryKrw <= 50_000_000
        ? { status: "LIKELY", reason: `총급여 ${man(c.annualSalaryKrw)} → 서민형(비과세 400만 원) 가입 가능` }
        : { status: "LIKELY", reason: "일반형(비과세 200만 원) 가입 가능" },
  },
  {
    id: "youth-dream-subscription",
    name: "청년주택드림청약통장",
    provider: "주택도시기금 (국토교통부)",
    category: "주거",
    summary: "청약 기능에 최고 4.5% 금리·소득공제·비과세를 붙인 청년 전용 청약통장",
    benefit: "최고 연 4.5%, 납입액 40% 소득공제(연 300만 원 한도), 이자소득 비과세(500만 원). 당첨 시 청년주택드림대출 연계",
    eligibility: "만 19~34세 무주택자, 연소득 5,000만 원 이하",
    url: "https://nhuf.molit.go.kr",
    asOf: "2025",
    tags: ["HOUSE", "MARRIAGE"],
    judge: (c) => {
      if (!youth(c)) return { status: "UNLIKELY", reason: "만 19~34세 요건" };
      if (c.annualSalaryKrw > 50_000_000) return { status: "UNLIKELY", reason: `연소득 5,000만 원 초과 (입력 ${man(c.annualSalaryKrw)}) → 일반 주택청약종합저축 검토` };
      if (c.homeless === false) return { status: "UNLIKELY", reason: "무주택 요건" };
      return c.homeless === null
        ? { status: "NEEDS_CHECK", reason: "나이·소득 충족. 무주택 여부(본가 거주 시 세대 기준) 확인 필요" }
        : { status: "LIKELY", reason: "나이·소득·무주택 요건 충족" };
    },
  },
  {
    id: "subscription-deduction",
    name: "주택청약종합저축 소득공제",
    provider: "국세청",
    category: "세제",
    summary: "청약통장 납입액의 40%를 근로소득에서 공제",
    benefit: "연 납입 300만 원 한도 × 40% = 최대 120만 원 소득공제",
    eligibility: "총급여 7,000만 원 이하 무주택 세대주",
    url: "https://www.nts.go.kr",
    asOf: "2025",
    tags: ["HOUSE", "LUMP_SUM"],
    judge: (c) => {
      if (c.annualSalaryKrw > 70_000_000) return { status: "UNLIKELY", reason: "총급여 7,000만 원 초과" };
      if (c.housing === "본가") return { status: "NEEDS_CHECK", reason: "세대주 요건 — 본가 거주 시 세대 분리 여부 확인" };
      return { status: "LIKELY", reason: "총급여 요건 충족, 무주택 세대주라면 적용" };
    },
  },
  {
    id: "sme-income-tax-relief",
    name: "중소기업 취업자 소득세 감면 (청년)",
    provider: "국세청",
    category: "세제",
    summary: "중소기업에 취업한 청년의 근로소득세를 5년간 90% 감면",
    benefit: "소득세 90% 감면, 연 200만 원 한도, 취업일부터 5년 (실수령 계산에 반영됨)",
    eligibility: "취업일 기준 만 15~34세(병역 최대 6년 가산), 중소기업기본법상 중소기업. 금융·보험·전문서비스 등 일부 업종 제외",
    url: "https://www.nts.go.kr",
    asOf: "2025",
    tags: ["중소기업", "스타트업"],
    judge: (c) => {
      if (!sme(c)) return { status: "UNLIKELY", reason: "중소기업 재직자 대상 (대기업·공공기관 제외)" };
      if (c.age !== null && c.age > 34) return { status: "NEEDS_CHECK", reason: "만 34세 초과 — 병역 기간 가산 적용 여부 확인" };
      return { status: "NEEDS_CHECK", reason: c.companyType === "스타트업" ? "회사가 중소기업기본법상 중소기업인지, 업종이 감면 대상인지 확인" : "업종 요건 확인 후 회사에 감면신청서 제출" };
    },
  },
  {
    id: "sme-worker-savings",
    name: "중소기업 재직자 우대 저축공제",
    provider: "중소벤처기업진흥공단",
    category: "자산형성",
    summary: "재직자가 월 10~50만 원 저축하면 기업이 납입액의 20%를 지원하고 은행이 우대금리를 더하는 5년 상품",
    benefit: "기업지원금 납입액 20% + 우대금리(1~2%p), 5년 만기",
    eligibility: "중소기업 재직자(재직 기간 제한 없음). 기업이 사업에 참여해야 함",
    url: "https://www.sbcplan.or.kr",
    asOf: "2024-10 출시",
    tags: ["중소기업", "LUMP_SUM"],
    judge: (c) =>
      sme(c)
        ? { status: "NEEDS_CHECK", reason: "재직 예정 회사의 사업 참여 여부에 달려 있음 — 입사 후 인사팀 확인" }
        : { status: "UNLIKELY", reason: "중소기업 재직자 대상" },
  },
  {
    id: "sme-youth-jeonse-loan",
    name: "중소기업취업청년 전월세보증금 대출",
    provider: "주택도시기금",
    category: "대출",
    summary: "중소기업 취업 청년에게 연 1.5% 고정금리로 전월세 보증금을 최대 1억 원 대출",
    benefit: "연 1.5%, 최대 1억 원, 보증금 2억 원 이하 주택",
    eligibility: "만 19~34세 무주택 세대주, 중소기업 재직, 연소득 3,500만 원 이하(외벌이)",
    url: "https://nhuf.molit.go.kr",
    asOf: "2025 (운영 기한 연장 여부 확인 필요)",
    tags: ["중소기업", "HOUSE"],
    judge: (c) => {
      if (!sme(c)) return { status: "UNLIKELY", reason: "중소기업 재직자 대상" };
      if (!youth(c)) return { status: "UNLIKELY", reason: "만 19~34세 요건" };
      if (c.annualSalaryKrw > 35_000_000) return { status: "UNLIKELY", reason: `연소득 3,500만 원 초과 (입력 ${man(c.annualSalaryKrw)})` };
      return c.housing === "본가"
        ? { status: "NEEDS_CHECK", reason: "독립 시 신청 가능 — 세대주 요건" }
        : { status: "LIKELY", reason: "나이·소득·중소기업 요건 충족. 사업 운영 기한 확인" };
    },
  },
  {
    id: "rent-tax-credit",
    name: "월세 세액공제",
    provider: "국세청",
    category: "세제",
    summary: "낸 월세의 15~17%를 연말정산에서 세액공제",
    benefit: "연 1,000만 원 한도 × 15%(총급여 5,500만 원 이하 17%)",
    eligibility: "총급여 8,000만 원 이하 무주택 세대주(세대원 가능), 국민주택규모 또는 기준시가 4억 원 이하 주택",
    url: "https://www.nts.go.kr",
    asOf: "2025",
    tags: ["월세"],
    judge: (c) => {
      if (c.housing !== "월세") return { status: "UNLIKELY", reason: "월세 거주자 대상" };
      if (c.annualSalaryKrw > 80_000_000) return { status: "UNLIKELY", reason: "총급여 8,000만 원 초과" };
      return { status: "LIKELY", reason: `월세 거주·총급여 요건 충족 → 공제율 ${c.annualSalaryKrw <= 55_000_000 ? "17%" : "15%"}. 임대차계약서·이체내역 보관` };
    },
  },
  {
    id: "didimdol",
    name: "디딤돌 대출 (내집마련)",
    provider: "주택도시기금",
    category: "대출",
    summary: "무주택 서민의 주택 구입 자금을 2~3%대 금리로 지원하는 정책 모기지",
    benefit: "최대 2.5억 원(생애최초 3억 원), 금리 2%대~3%대, 최장 30년",
    eligibility: "무주택 세대주, 부부합산 연소득 6,000만 원 이하(생애최초 7,000만 원), 주택가격 5억 원 이하(생애최초 6억 원)",
    url: "https://nhuf.molit.go.kr",
    asOf: "2025",
    tags: ["HOUSE"],
    judge: (c) => {
      if (!c.goals.includes("HOUSE")) return { status: "UNLIKELY", reason: "내집마련 목표 시 해당" };
      if (c.annualSalaryKrw > 70_000_000) return { status: "UNLIKELY", reason: "연소득 요건(생애최초 7,000만 원) 초과" };
      return { status: "NEEDS_CHECK", reason: "소득 요건 충족. 목표 지역 주택가격(5~6억 원 이하) 요건 확인" };
    },
  },
  {
    id: "bogeumjari",
    name: "보금자리론",
    provider: "한국주택금융공사",
    category: "대출",
    summary: "장기 고정금리 정책 모기지",
    benefit: "최대 3.6억 원(생애최초 4.2억 원), LTV 70%(생애최초 80%), 10~50년 고정금리",
    eligibility: "주택가격 6억 원 이하, 부부합산 연소득 7,000만 원 이하(신혼 8,500만 원·다자녀 완화)",
    url: "https://www.hf.go.kr",
    asOf: "2025",
    tags: ["HOUSE"],
    judge: (c) => {
      if (!c.goals.includes("HOUSE")) return { status: "UNLIKELY", reason: "내집마련 목표 시 해당" };
      return c.annualSalaryKrw <= 70_000_000
        ? { status: "NEEDS_CHECK", reason: "소득 요건 충족. 주택가격 6억 원 이하 요건 확인 (서울 중위가격은 초과)" }
        : { status: "NEEDS_CHECK", reason: "연소득 7,000만 원 초과 — 결혼 시 신혼 완화(8,500만 원) 적용 여부 확인" };
    },
  },
  {
    id: "newlywed-special-supply",
    name: "신혼부부 특별공급 · 신혼부부 전용 전세·구입자금",
    provider: "국토교통부 · 주택도시기금",
    category: "결혼",
    summary: "혼인 7년 이내 무주택 신혼부부에게 분양 특별공급 물량과 저리 전세·구입 대출을 배정",
    benefit: "특별공급 청약 자격 + 버팀목(전세)·디딤돌(구입) 신혼 우대금리",
    eligibility: "혼인 7년 이내(또는 예비부부) 무주택, 부부합산 소득 요건(공급 유형별 상이)",
    url: "https://www.applyhome.co.kr",
    asOf: "2025",
    tags: ["MARRIAGE", "HOUSE"],
    judge: (c) =>
      c.goals.includes("MARRIAGE")
        ? { status: "NEEDS_CHECK", reason: "결혼 후(예비부부 포함) 열리는 혜택 — 청약통장 가입 기간을 지금부터 쌓아두면 유리" }
        : { status: "UNLIKELY", reason: "결혼 목표 시 해당" },
  },
  {
    id: "pension-savings-irp",
    name: "연금저축 · IRP 세액공제",
    provider: "국세청 · 금융회사",
    category: "연금",
    summary: "노후 대비 납입액에 세액공제를 주는 제도 — 첫 월급부터 시작하면 복리 효과가 가장 큼",
    benefit: "연 900만 원(연금저축 600만 원) 한도 × 13.2%(총급여 5,500만 원 이하 16.5%) 세액공제",
    eligibility: "소득이 있는 거주자 누구나. 55세 이후 연금 수령 조건",
    url: "https://www.nts.go.kr",
    asOf: "2025",
    tags: ["LUMP_SUM"],
    judge: (c) => ({ status: "LIKELY", reason: `취업 즉시 가능. 공제율 ${c.annualSalaryKrw <= 55_000_000 ? "16.5%" : "13.2%"} — 목돈 목표와 병행 시 납입 비중 조절` }),
  },
  {
    id: "youth-savings-account",
    name: "청년내일저축계좌",
    provider: "보건복지부",
    category: "자산형성",
    summary: "저소득 근로 청년이 월 10만 원 저축하면 정부가 10~30만 원을 매칭하는 3년 통장",
    benefit: "본인 10만 원 + 정부 10만 원(차상위 초과) / 30만 원(차상위 이하) × 36개월",
    eligibility: "만 19~34세, 근로소득 월 50만~250만 원, 가구소득 중위 100% 이하, 가구재산 요건",
    url: "https://www.bokjiro.go.kr",
    asOf: "2025",
    tags: ["LUMP_SUM"],
    judge: (c) => {
      if (!youth(c)) return { status: "UNLIKELY", reason: "만 19~34세 요건" };
      if (c.annualSalaryKrw / 12 > 2_500_000) return { status: "UNLIKELY", reason: `월 근로소득 250만 원 초과 (입력 연봉 ${man(c.annualSalaryKrw)})` };
      return { status: "NEEDS_CHECK", reason: "소득 요건 충족. 가구소득·재산 요건 확인" };
    },
  },
  {
    id: "civil-servant-pension",
    name: "공무원연금 · 공무원연금공단 대여·저축",
    provider: "공무원연금공단",
    category: "연금",
    summary: "공무원은 국민연금 대신 공무원연금(기여율 9%)에 가입하며, 공단·공제회의 저리 대여·저축 상품을 이용할 수 있음",
    benefit: "재직 중 주택자금·생활자금 저리 대여, 공제회 장기저축 등",
    eligibility: "공무원 임용자",
    url: "https://www.geps.or.kr",
    asOf: "2025",
    tags: ["공무원"],
    judge: (c) =>
      c.companyType === "공무원"
        ? { status: "LIKELY", reason: "임용과 함께 자동 가입. 실수령 계산에 기여금 9% 반영됨" }
        : { status: "UNLIKELY", reason: "공무원 대상" },
  },
];

export function judgePrograms(ctx: ProgramCtx) {
  const judged = PROGRAMS.map((p) => {
    const { status, reason } = p.judge(ctx);
    const { judge: _j, ...rest } = p;
    return { ...rest, status, reason };
  });
  const order: Record<ProgramStatus, number> = { LIKELY: 0, NEEDS_CHECK: 1, UNLIKELY: 2 };
  judged.sort((a, b) => order[a.status] - order[b.status]);
  return {
    likely: judged.filter((p) => p.status === "LIKELY"),
    needsCheck: judged.filter((p) => p.status === "NEEDS_CHECK"),
    unlikely: judged.filter((p) => p.status === "UNLIKELY").map(({ id, name, reason }) => ({ id, name, reason })),
  };
}
export type JudgedProgram = ReturnType<typeof judgePrograms>["likely"][number];
