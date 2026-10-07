import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCareer, normalizeEducation, condenseLine, NO_INFO } from "./jobDisplay";

test("normalizeCareer: 소스별 제각각인 경력 표기를 5종으로 통일", () => {
  assert.equal(normalizeCareer("신입"), "신입");
  assert.equal(normalizeCareer("경력"), "경력");
  assert.equal(normalizeCareer("신입+경력"), "신입·경력");
  assert.equal(normalizeCareer("경력·신입"), "신입·경력");
  assert.equal(normalizeCareer("경력 5년↑"), "경력");
  assert.equal(normalizeCareer("신입·인턴"), "신입"); // 인턴 포함 신입 공고
  assert.equal(normalizeCareer("인턴"), "인턴");
  assert.equal(normalizeCareer("무관"), "경력무관");
  assert.equal(normalizeCareer("경력무관"), "경력무관");
  assert.equal(normalizeCareer("테크"), null); // 경력이 아닌 값(네이버 직군명)은 버린다
  assert.equal(normalizeCareer(null), null);
});

test("normalizeEducation: 학력 표기를 4종으로 통일", () => {
  assert.equal(normalizeEducation("학력무관"), "학력무관");
  assert.equal(normalizeEducation("학력무관, 고졸"), "학력무관");
  assert.equal(normalizeEducation("고졸"), "고졸 이상");
  assert.equal(normalizeEducation("대졸(4년)"), "대졸 이상");
  assert.equal(normalizeEducation("대졸(4년), 석사, 박사"), "대졸 이상");
  assert.equal(normalizeEducation("석사, 박사"), "석·박사");
  assert.equal(normalizeEducation("박사"), "석·박사");
  assert.equal(normalizeEducation(null), null);
});

test("condenseLine: 장문·불릿 섞인 원문을 한 줄로 압축", () => {
  // 잡알리오식 자격 원문: 불릿·괄호·공통사항 머리말 제거
  const raw = "○ 만18세 이상 고등학교 졸업(졸업 예정자 포함) 이상 학력 소지자 ○ 국가기술자격법시행규칙 제3조의 규정에 의거 사무분야 자격증 1개 이상 소지자 (워드프로세서, 컴퓨터활용능력 2급 이상)";
  const out = condenseLine(raw, 60)!;
  assert.ok(out.length <= 61, out); // 60자 + 말줄임
  assert.ok(!out.startsWith("○"));
  assert.ok(out.startsWith("만18세 이상"));
  // 짧은 문장은 그대로
  assert.equal(condenseLine("경력 3년 이상", 60), "경력 3년 이상");
  // 빈 값/공백은 null
  assert.equal(condenseLine("   ", 60), null);
  assert.equal(condenseLine(null, 60), null);
  // LLM이 "원문에 정보 없음"으로 판정한 센티널은 표시상 null (UI는 "공고 원문 참조")
  assert.equal(condenseLine(NO_INFO, 60), null);
  // 절 경계(· / - / ,)에서 자른다 — 단어 중간에서 끊지 않음
  const long = "자동화 시나리오 제작 및 유지보수 - 다양한 보안 솔루션 데이터 수집 - 탐지 시나리오 기반 대응 프로세스 자동화 구현 및 최적화 - 운영 문서화";
  const c = condenseLine(long, 50)!;
  assert.ok(c.endsWith("…"));
  assert.ok(!/[가-힣]{1}…$/.test(c) || c.length <= 51);
});
