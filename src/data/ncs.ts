/**
 * NCS(국가직무능력표준) 대분류 24종 — 공공기관 채용정보(잡알리오) API의 ncsCdLst 코드 체계.
 * 채용 검색 필터와 "프로필 목표 직무 → 직무분야" 매핑에 쓴다.
 * 매핑은 코드가 결정한다(LLM이 직무분야를 추측하지 않음) — 키워드 사전 기반.
 */
export const NCS_CATEGORIES: { code: string; name: string }[] = [
  { code: "01", name: "사업관리" },
  { code: "02", name: "경영·회계·사무" },
  { code: "03", name: "금융·보험" },
  { code: "04", name: "교육·자연·사회과학" },
  { code: "05", name: "법률·경찰·소방·교도·국방" },
  { code: "06", name: "보건·의료" },
  { code: "07", name: "사회복지·종교" },
  { code: "08", name: "문화·예술·디자인·방송" },
  { code: "09", name: "운전·운송" },
  { code: "10", name: "영업판매" },
  { code: "11", name: "경비·청소" },
  { code: "12", name: "이용·숙박·여행·오락·스포츠" },
  { code: "13", name: "음식서비스" },
  { code: "14", name: "건설" },
  { code: "15", name: "기계" },
  { code: "16", name: "재료" },
  { code: "17", name: "화학" },
  { code: "18", name: "섬유·의복" },
  { code: "19", name: "전기·전자" },
  { code: "20", name: "정보통신" },
  { code: "21", name: "식품가공" },
  { code: "22", name: "인쇄·목재·가구·공예" },
  { code: "23", name: "환경·에너지·안전" },
  { code: "24", name: "농림어업" },
  { code: "25", name: "연구" }, // 잡알리오 확장 분류 (연구직 — 출연연·연구기관 공고의 핵심)
];

export const NCS_NAME_BY_CODE = new Map(NCS_CATEGORIES.map((c) => [c.code, c.name]));

/** 목표 직무 자유 텍스트 → NCS 코드 후보. 앞에 올수록 주력 분야. */
const TARGET_JOB_RULES: { re: RegExp; codes: string[] }[] = [
  { re: /데이터|분석|통계|AI|인공지능|머신러닝|개발|프로그래|소프트웨어|백엔드|프론트|엔지니어|IT|정보보안|보안|네트워크|전산/i, codes: ["20", "02", "25"] },
  { re: /연구|R&D|석사|박사|랩|사이언티스트/i, codes: ["25", "04"] },
  { re: /디자인|UX|UI|콘텐츠|영상|방송|미디어|출판|편집/i, codes: ["08", "20"] },
  { re: /마케팅|영업|세일즈|판매|MD/i, codes: ["10", "02"] },
  { re: /금융|은행|보험|증권|투자|여신|심사/i, codes: ["03", "02"] },
  { re: /품질|생산|공정|제조|설비|기계/i, codes: ["15", "19", "23"] },
  { re: /전기|전자|반도체|회로/i, codes: ["19", "15"] },
  { re: /화학|소재|재료/i, codes: ["17", "16"] },
  { re: /건설|토목|건축|시공|도시/i, codes: ["14"] },
  { re: /교육|강사|연구|조교/i, codes: ["04"] },
  { re: /간호|보건|의료|병원|약무/i, codes: ["06"] },
  { re: /복지|사회복지|상담/i, codes: ["07"] },
  { re: /법률|법무|경찰|소방|안전관리/i, codes: ["05", "23"] },
  { re: /환경|에너지|안전/i, codes: ["23"] },
  { re: /식품|영양/i, codes: ["21", "13"] },
  { re: /운전|물류|운송|유통/i, codes: ["09", "10"] },
  { re: /사무|행정|회계|경영|인사|총무|기획/i, codes: ["02", "01"] },
];

/** 목표 직무 텍스트에서 NCS 코드 후보를 뽑는다. 못 찾으면 사무 계열(02)을 기본값으로. */
export function ncsCodesForTargetJob(targetJob: string | null | undefined): string[] {
  const t = (targetJob ?? "").trim();
  if (!t) return ["02"];
  const out: string[] = [];
  for (const rule of TARGET_JOB_RULES) {
    if (rule.re.test(t)) for (const c of rule.codes) if (!out.includes(c)) out.push(c);
  }
  return out.length ? out.slice(0, 3) : ["02"];
}

/** 채용공고의 직무 카테고리 원문(예: 사람인 "IT개발·데이터", "마케팅·홍보·조사")을 NCS 코드로 정규화.
 *  소스마다 분류 체계가 달라서, 전 소스를 NCS 24종 하나로 통일해 검색·추천 필터를 공유한다. */
export function ncsCodesForCategoryText(categoryText: string | null | undefined): string[] {
  const t = (categoryText ?? "").trim();
  if (!t) return [];
  const out: string[] = [];
  for (const rule of TARGET_JOB_RULES) {
    if (rule.re.test(t)) for (const c of rule.codes.slice(0, 1)) if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, 3);
}

/** 학력 요건 텍스트(acbgCondNmLst)가 사용자의 학력으로 지원 가능한지 — 보수적으로 판단. */
export function educationSatisfied(requirementText: string | null | undefined, userEducation: string | null | undefined): boolean | null {
  const req = (requirementText ?? "").replace(/\s/g, "");
  if (!req) return null; // 요건 정보 없음 — 모름
  if (/무관|제한없음/.test(req)) return true;
  const u = (userEducation ?? "").replace(/\s/g, "");
  if (!u) return null;
  // 서비스 사용자(취준 청년)는 재학~대졸이 대부분 — "대졸이상"만 재학·휴학이면 미충족 가능성.
  if (/대졸이상|학사이상|석사|박사/.test(req)) {
    if (/졸업/.test(u)) return true;
    if (/재학|휴학|졸업유예/.test(u)) return false;
    return null;
  }
  return true; // 고졸이상 등 — 서비스 대상층은 충족으로 본다
}

/** 채용구분(recrutSeNm: 신입/경력/신입+경력 등)이 취준생에게 지원 가능한지. */
export function careerOpenToNewcomer(recruitTypeText: string | null | undefined): boolean {
  const t = (recruitTypeText ?? "").replace(/\s/g, "");
  if (!t) return true;
  if (/신입|무관|제한없음/.test(t)) return true;
  return !/^경력(직)?$/.test(t); // "경력" 단독 표기만 제외
}

/** 검색 키워드 동의어 확장 — "agent"처럼 표기가 다른 같은 개념(AI·인공지능·에이전트)을 함께 찾는다.
 *  글자 그대로 일치만 보던 검색의 한계 보완. 사전은 코드가 관리(LLM 추측 없음). */
const KW_SYNONYMS: [RegExp, string[]][] = [
  [/^(ai|에이아이|인공지능|agent|에이전트|생성형|llm|rag|챗봇|머신러닝|딥러닝)$/i, ["AI", "인공지능", "에이전트", "생성형", "머신러닝"]],
  [/^(카드|카드사|신용카드)$/i, ["카드", "신용카드", "여신", "결제", "금융"]],
  [/^(은행|금융|핀테크)$/i, ["은행", "금융", "핀테크", "여신", "결제"]],
  [/^(데이터|data|빅데이터|통계)$/i, ["데이터", "빅데이터", "통계", "전산"]],
  [/^(개발|developer|sw|소프트웨어|프로그래밍|코딩|백엔드|프론트)$/i, ["개발", "소프트웨어", "전산", "정보시스템", "정보화"]],
  [/^(디자인|ux|ui|design)$/i, ["디자인", "UX", "UI", "콘텐츠"]],
  [/^(행정|사무|총무)$/i, ["행정", "사무", "일반직"]],
  [/^(연구|r&d|연구원)$/i, ["연구", "연구원", "R&D"]],
  [/^(보안|시큐리티|security)$/i, ["보안", "정보보호"]],
  [/^(마케팅|홍보)$/i, ["마케팅", "홍보", "광고"]],
];

/** 키워드를 검색어 목록으로 확장. PostgREST or() 구문에 안전하게 특수문자는 제거. */
export function expandKeyword(raw: string | null | undefined): string[] {
  const kw = (raw ?? "").trim();
  if (!kw) return [];
  const out = new Set<string>();
  for (const tok of kw.split(/\s+/).slice(0, 3)) {
    const clean = tok.replace(/[,%()*"'\\]/g, "");
    if (!clean) continue;
    out.add(clean);
    for (const [re, syns] of KW_SYNONYMS) if (re.test(clean)) for (const s of syns) out.add(s);
  }
  return [...out].slice(0, 8);
}

/** D-day 계산 (마감일 당일 = D-0, KST 기준). 마감이 없으면 null. */
export function dday(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const now = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  return Math.round((new Date(deadline + "T00:00:00Z").getTime() - new Date(now + "T00:00:00Z").getTime()) / 86400000);
}
