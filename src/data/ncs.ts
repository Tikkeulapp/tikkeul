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
  { re: /데이터|분석|통계|AI|인공지능|머신러닝|개발|프로그래|소프트웨어|백엔드|프론트|엔지니어|IT|정보보안|보안|네트워크|전산|data|software|developer|engineer|backend|frontend|machine ?learning|security|devops|infra|platform|server|android|ios|ml/i, codes: ["20", "02", "25"] },
  { re: /연구|R&D|석사|박사|랩|사이언티스트|research|scientist/i, codes: ["25", "04"] },
  { re: /디자인|UX|UI|콘텐츠|영상|방송|미디어|출판|편집|design|brand|graphic/i, codes: ["08", "20"] },
  { re: /마케팅|영업|세일즈|판매|MD|marketing|sales|growth|business ?development/i, codes: ["10", "02"] },
  { re: /금융|은행|보험|증권|투자|여신|심사|finance|fintech|payment/i, codes: ["03", "02"] },
  { re: /품질|생산|공정|제조|설비|기계/i, codes: ["15", "19", "23"] },
  { re: /전기|전자|반도체|회로/i, codes: ["19", "15"] },
  { re: /화학|소재|재료/i, codes: ["17", "16"] },
  { re: /건설|토목|건축|시공|도시/i, codes: ["14"] },
  { re: /교육|강사|조교/i, codes: ["04"] },
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

/** 검색 키워드 확장 — 방향성 있는 개념 트리.
 *  규칙: ① aliases는 '같은 개념의 다른 표기'라 서로 치환 가능.
 *        ② 확장은 children(하위 개념) 방향으로만 내려간다 — 상위 개념으로는 절대 확장하지 않는다.
 *  예: "AI" → RAG·LLM·머신러닝까지 포함 / "RAG" → RAG(+검색증강생성)만. (RAG→AI 역류 금지)
 *  사전은 코드가 관리하며(LLM 추측 없음), 사전에 없는 단어는 입력 그대로만 검색한다. */
const CONCEPTS: Record<string, { aliases: string[]; children?: string[] }> = {
  AI: { aliases: ["AI", "인공지능", "에이아이"], children: ["생성형AI", "머신러닝", "AI에이전트", "챗봇"] },
  생성형AI: { aliases: ["생성형AI", "생성형 AI", "생성형"], children: ["LLM"] },
  LLM: { aliases: ["LLM", "거대언어모델", "대규모 언어모델"], children: ["RAG"] },
  RAG: { aliases: ["RAG", "검색증강생성", "검색 증강 생성"] },
  머신러닝: { aliases: ["머신러닝", "ML", "기계학습", "machine learning"], children: ["딥러닝"] },
  딥러닝: { aliases: ["딥러닝", "DL", "deep learning"] },
  AI에이전트: { aliases: ["에이전트", "agent", "AI agent"] },
  챗봇: { aliases: ["챗봇", "chatbot"] },
  데이터: { aliases: ["데이터", "data"], children: ["빅데이터", "데이터분석", "데이터사이언스", "데이터엔지니어"] },
  빅데이터: { aliases: ["빅데이터", "big data"] },
  데이터분석: { aliases: ["데이터분석", "데이터 분석"] },
  데이터사이언스: { aliases: ["데이터사이언스", "data science"] },
  데이터엔지니어: { aliases: ["데이터엔지니어", "데이터 엔지니어", "data engineer"] },
  개발: { aliases: ["개발", "developer", "소프트웨어", "software", "SW"], children: ["백엔드", "프론트엔드", "앱개발"] },
  백엔드: { aliases: ["백엔드", "backend", "서버개발"] },
  프론트엔드: { aliases: ["프론트엔드", "frontend", "프론트"] },
  앱개발: { aliases: ["앱개발", "안드로이드", "android", "iOS"] },
  보안: { aliases: ["보안", "정보보호", "security"] },
  금융: { aliases: ["금융", "finance"], children: ["은행", "카드사", "보험사", "증권사", "핀테크", "결제"] },
  은행: { aliases: ["은행", "뱅킹"] },
  카드사: { aliases: ["카드사", "카드", "신용카드"], children: ["여신"] },
  여신: { aliases: ["여신", "여신심사"] },
  보험사: { aliases: ["보험사", "보험"] },
  증권사: { aliases: ["증권사", "증권"] },
  핀테크: { aliases: ["핀테크", "fintech"], children: ["결제"] },
  결제: { aliases: ["결제", "페이", "payment", "PG"] },
  디자인: { aliases: ["디자인", "design", "디자이너"], children: ["UX", "UI", "브랜드디자인"] },
  UX: { aliases: ["UX"] },
  UI: { aliases: ["UI"] },
  브랜드디자인: { aliases: ["브랜드디자인", "브랜드 디자인", "BX"] },
  마케팅: { aliases: ["마케팅", "marketing"], children: ["홍보", "광고", "그로스"] },
  홍보: { aliases: ["홍보", "PR"] },
  광고: { aliases: ["광고"] },
  그로스: { aliases: ["그로스", "growth"] },
  연구: { aliases: ["연구", "R&D", "research"], children: ["연구원"] },
  연구원: { aliases: ["연구원", "researcher", "scientist"] },
  행정: { aliases: ["행정", "사무", "총무"], children: ["일반직"] },
  일반직: { aliases: ["일반직"] },
};

/** 별칭(소문자·공백제거) → 개념 키 역색인 */
const ALIAS_TO_CONCEPT = new Map<string, string>();
for (const [key, c] of Object.entries(CONCEPTS)) {
  for (const a of c.aliases) ALIAS_TO_CONCEPT.set(a.toLowerCase().replace(/\s+/g, ""), key);
}

/** 키워드를 검색어 목록으로 확장 — 자기 자신(별칭 포함) + 하위 개념만. 상위로는 확장하지 않는다. */
export function expandKeyword(raw: string | null | undefined): string[] {
  const kw = (raw ?? "").trim();
  if (!kw) return [];
  const clean = kw.replace(/[,%()*"'\\]/g, "");
  if (!clean) return [];
  const out = new Set<string>([clean]);
  const concept = ALIAS_TO_CONCEPT.get(clean.toLowerCase().replace(/\s+/g, ""));
  if (concept) {
    // BFS로 하위 개념까지 내려가며 모든 별칭 수집 (역방향 없음)
    const queue = [concept];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const node = CONCEPTS[cur];
      if (!node) continue;
      for (const a of node.aliases) out.add(a);
      for (const ch of node.children ?? []) queue.push(ch);
    }
  }
  return [...out].slice(0, 12);
}

/** 공고 원문에서 확장 키워드가 실제로 매칭된 위치와 주변 문맥을 찾는다 (카드에 근거 표시용).
 *  짧은 영문 토큰(AI, ML 등)은 단어 경계를 요구해 training/email 속 'ai' 같은 오탐을 막는다.
 *  매칭 실패 시 null — 호출부는 그 공고를 결과에서 제외한다 (근거 없는 매칭 금지). */
export function findKeywordEvidence(
  text: string | null | undefined,
  terms: string[],
): { term: string; before: string; after: string } | null {
  const t = text ?? "";
  if (!t) return null;
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    let idx = -1;
    let len = term.length;
    if (/^[a-z0-9&+#.]+$/i.test(term) && term.length <= 4) {
      // 짧은 영문·숫자 토큰은 앞뒤가 영문·숫자가 아니어야 함 (단어 경계)
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(^|[^A-Za-z0-9])(${esc})(?![A-Za-z0-9])`, "i").exec(t);
      if (m) { idx = m.index + m[1].length; len = m[2].length; }
    } else {
      idx = t.toLowerCase().indexOf(term.toLowerCase());
    }
    if (idx >= 0) {
      const clean = (s: string) => s.replace(/\s*\|\s*/g, " · ");
      return {
        term: t.slice(idx, idx + len),
        before: (idx > 30 ? "…" : "") + clean(t.slice(Math.max(0, idx - 30), idx)),
        after: clean(t.slice(idx + len, idx + len + 34)) + (idx + len + 34 < t.length ? "…" : ""),
      };
    }
  }
  return null;
}

/** D-day 계산 (마감일 당일 = D-0, KST 기준). 마감이 없으면 null. */
export function dday(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const now = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  return Math.round((new Date(deadline + "T00:00:00Z").getTime() - new Date(now + "T00:00:00Z").getTime()) / 86400000);
}
