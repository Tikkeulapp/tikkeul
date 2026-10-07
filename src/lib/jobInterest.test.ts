import { test } from "node:test";
import assert from "node:assert/strict";
import { jobTags, jobInterestScore, keywordEvents, preferredCompanyType } from "@/lib/jobInterest";

const NOW = new Date("2026-10-07T00:00:00Z");

test("jobTags: 공고 속성 → 채용 관심 태그 (직무분야·기관 구분·고용형태·근무지역)", () => {
  assert.deepEqual(
    jobTags({ ncs_codes: ["20", "02"], isPublic: true, hire_types: ["정규직", "청년인턴(체험형)"], region_sidos: ["서울특별시"] }),
    ["ncs:20", "ncs:02", "org:public", "hire:정규직", "hire:인턴", "region:서울특별시"],
  );
  assert.deepEqual(jobTags({ ncs_codes: [], isPublic: false, hire_types: ["계약직", "기간제"], region_sidos: [] }), ["org:private", "hire:계약직"]);
});

test("jobInterestScore: 공고 태그의 양수 점수 합 + 강점 키워드가 공고 텍스트에 있으면 가산", () => {
  const scores = { "ncs:20": 3, "org:public": 1.5, "hire:계약직": -2, "kw:RAG": 2, "kw:카드사": 1 };
  assert.equal(jobInterestScore(["ncs:20", "org:public", "hire:계약직"], "LLM RAG 엔지니어 채용", scores), 3 + 1.5 + 2);
  assert.equal(jobInterestScore(["org:private"], "영업 관리", scores), 0);
});

test("keywordEvents: 강점 키워드 검색 → kw: 태그 이벤트 (정리·중복 제거·최대 5개)", () => {
  const out = keywordEvents([" RAG ", "rag", "카드사", "", "a", "b", "c", "d"], NOW);
  assert.deepEqual(out.map((e) => e.tags[0]), ["kw:rag", "kw:카드사", "kw:a", "kw:b", "kw:c"]);
  assert.ok(out.every((e) => e.signal === "job_keyword" && e.occurredAt === NOW.toISOString()));
});

test("preferredCompanyType: 공공기관 공고 선호가 뚜렷하면 공기업, 아니면 null", () => {
  assert.equal(preferredCompanyType({ "org:public": 6, "org:private": 1 }), "공기업");
  assert.equal(preferredCompanyType({ "org:public": 2, "org:private": 1.8 }), null);
  assert.equal(preferredCompanyType({ "org:public": 0.5 }), null);
  assert.equal(preferredCompanyType({}), null);
});
