import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSido, SIDO_CANONICAL } from "@/lib/region";

test("표준 시도명은 그대로 반환", () => {
  for (const s of SIDO_CANONICAL) assert.equal(normalizeSido(s), s);
});

test("약칭·옛 명칭을 표준명으로 매핑", () => {
  assert.equal(normalizeSido("서울"), "서울특별시");
  assert.equal(normalizeSido("대전시"), "대전광역시");
  assert.equal(normalizeSido("강원도"), "강원특별자치도");
  assert.equal(normalizeSido("광주광역시"), "전남광주통합특별시");
  assert.equal(normalizeSido("전라남도"), "전남광주통합특별시");
});

test("시군구가 붙거나 공백이 섞여도 시도만 추출", () => {
  assert.equal(normalizeSido("광주광역시 광산구"), "전남광주통합특별시");
  assert.equal(normalizeSido(" 서울 특별시 "), "서울특별시");
  assert.equal(normalizeSido("경기도 수원시"), "경기도");
});

test("매핑 불가·빈 값은 null", () => {
  assert.equal(normalizeSido(null), null);
  assert.equal(normalizeSido(undefined), null);
  assert.equal(normalizeSido(""), null);
  assert.equal(normalizeSido("도쿄"), null);
});
