/**
 * 채용 관심 (정책 관심과 다른 축) — 공고 속성을 네임스페이스 태그로 바꿔 같은 time-decay 점수 체계를 쓴다.
 *   ncs:<직무분야 코드> · org:public|private · hire:정규직|인턴|계약직 · region:<시도> · kw:<강점 키워드>
 * 순위에만 쓴다. 지원 자격(경력·학력) 판단은 기존 코드 규칙 그대로.
 */
import type { InterestEvent } from "@/types/interest";

export function jobTags(j: { ncs_codes: string[]; isPublic: boolean; hire_types: string[]; region_sidos: string[] }): string[] {
  const tags = j.ncs_codes.map((c) => `ncs:${c}`);
  tags.push(j.isPublic ? "org:public" : "org:private");
  const hires = new Set<string>();
  for (const h of j.hire_types) {
    if (/정규/.test(h) && !/비정규/.test(h)) hires.add("hire:정규직");
    if (/인턴/.test(h)) hires.add("hire:인턴");
    if (/계약|기간제|비정규|위촉|파견/.test(h)) hires.add("hire:계약직");
  }
  tags.push(...hires);
  tags.push(...j.region_sidos.map((s) => `region:${s}`));
  return tags;
}

/** 공고 관심 점수 = 공고 태그의 양수 점수 합 + 공고 텍스트에 들어 있는 강점 키워드(kw:)의 점수. */
export function jobInterestScore(tags: string[], text: string, scores: Record<string, number>): number {
  let s = tags.reduce((acc, t) => acc + Math.max(0, scores[t] ?? 0), 0);
  const lower = text.toLowerCase();
  for (const [tag, v] of Object.entries(scores)) {
    if (v > 0 && tag.startsWith("kw:") && lower.includes(tag.slice(3).toLowerCase())) s += v;
  }
  return s;
}

/** 강점 키워드 검색 → kw: 태그 이벤트 (소문자·공백 정리, 중복 제거, 최대 5개). */
export function keywordEvents(keywords: string[], now: Date): InterestEvent[] {
  const uniq = [...new Set(keywords.map((k) => k.trim().toLowerCase().slice(0, 20)).filter(Boolean))].slice(0, 5);
  return uniq.map((k) => ({ signal: "job_keyword", tags: [`kw:${k}`], occurredAt: now.toISOString() }));
}

/** 채용 행동에서 공공기관 선호가 뚜렷하면(점수 2 이상이고 사기업의 2배 이상) 시뮬레이션 기업구분 기본값으로 "공기업". */
export function preferredCompanyType(scores: Record<string, number>): "공기업" | null {
  const pub = scores["org:public"] ?? 0;
  const priv = Math.max(0, scores["org:private"] ?? 0);
  return pub >= 2 && pub >= priv * 2 ? "공기업" : null;
}
