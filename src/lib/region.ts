/**
 * 시도 명칭 정규화 — DB(policies.region_sidos)의 표준 명칭으로 통일.
 * 2026년 행정구역 개편(전남+광주 통합, 특별자치도 명칭)으로 옛 이름·약칭이 섞여 들어오므로
 * LLM 출력·설문 입력·페르소나 값을 모두 이 함수로 거른다.
 */
export const SIDO_CANONICAL = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "대전광역시", "울산광역시",
  "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도",
  "전남광주통합특별시", "경상북도", "경상남도", "제주특별자치도",
] as const;

const ALIASES: Record<string, string> = {
  // 통합·개명
  "광주광역시": "전남광주통합특별시", "광주": "전남광주통합특별시", "전라남도": "전남광주통합특별시", "전남": "전남광주통합특별시",
  "광주전남": "전남광주통합특별시", "전남광주": "전남광주통합특별시",
  "강원도": "강원특별자치도", "강원": "강원특별자치도",
  "전라북도": "전북특별자치도", "전북": "전북특별자치도",
  "제주도": "제주특별자치도", "제주": "제주특별자치도",
  "세종시": "세종특별자치시", "세종": "세종특별자치시",
  // 약칭
  "서울": "서울특별시", "서울시": "서울특별시", "부산": "부산광역시", "부산시": "부산광역시", "대구": "대구광역시",
  "인천": "인천광역시", "대전": "대전광역시", "대전시": "대전광역시", "울산": "울산광역시", "경기": "경기도",
  "충북": "충청북도", "충남": "충청남도", "경북": "경상북도", "경남": "경상남도",
};

/** 어떤 표기든 표준 시도명으로. 매핑 불가면 null. */
export function normalizeSido(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim().replace(/\s+/g, "");
  if ((SIDO_CANONICAL as readonly string[]).includes(s)) return s;
  if (ALIASES[s]) return ALIASES[s];
  // "광주광역시 광산구"처럼 시군구가 붙은 경우 앞부분만
  for (const key of Object.keys(ALIASES).sort((a, b) => b.length - a.length)) {
    if (s.startsWith(key)) return ALIASES[key];
  }
  for (const c of SIDO_CANONICAL) if (s.startsWith(c)) return c;
  return null;
}
