"use client";

import { useState } from "react";

const FEATURES = [
  {
    key: "match",
    label: "지원정책 매칭",
    small: "일정·마이데이터·AI 자격 판정·챗봇이 한 흐름으로",
    preview: {
      title: "지원정책 매칭",
      stat: "4,475",
      unit: "개 정책에서",
      copy: "면접·시험·이사 일정을 적으면 <b>그 일정에 붙는 혜택</b>만 골라 보여줍니다. 마이데이터로 소득·월세·수급을 읽어 <b>신청 가능성 3단계 판정</b>과 근거·증빙·마감 관리(마이티끌)까지, 정책 DB를 근거로 답하는 <b>AI 챗봇</b>과 한 흐름으로 이어집니다.",
      insight: "DB에 없는 정책은 없다고 말합니다. 지어내지 않습니다.",
    },
  },
  {
    key: "jobs",
    label: "채용공고 검색·추천",
    small: "공공·사기업 공고를 모아 조건과 키워드로",
    preview: {
      title: "채용공고",
      stat: "1,200+",
      unit: "건 접수 중 공고에서",
      copy: "공공기관 전수(잡알리오)·고용24 공채속보·기업 공식 채용 채널을 매일 아침 모읍니다. 학력·직무 조건과 <b>키워드 검색</b>으로 찾고, 내 프로필 기준 <b>맞춤 추천</b>과 마감 임박 표시, 공고 마감일 <b>캘린더 담기</b>까지 이어집니다.",
      insight: "키워드가 왜 매칭됐는지 공고 원문 근거에 밑줄로 보여줍니다.",
    },
  },
  {
    key: "sim",
    label: "취업 후 시뮬레이션",
    small: "연봉·목표를 넣으면 돈의 흐름과 열리는 제도",
    preview: {
      title: "취업 후 시뮬레이션",
      stat: "3",
      unit: "가지 시나리오",
      copy: "기업 구분·연봉·목표(목돈·내집·결혼)를 넣으면 세후 실수령, 한 달 흐름, 목표 도달 시점을 <b>보수·기본·공격</b> 세 시나리오로 계산하고 취업 후 열리는 정책·금융 제도를 찾아줍니다.",
      insight: "중소기업이면 청년 소득세 감면까지 반영해 계산합니다.",
    },
  },
] as const;

export function Features() {
  const [active, setActive] = useState<(typeof FEATURES)[number]["key"]>("match");
  const current = FEATURES.find((f) => f.key === active)!;

  return (
    <section id="features" className="bg-leaf-deep py-24 text-white">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="max-w-xl">
          <p className="text-[15px] font-semibold tracking-widest text-[#dceeb1]">
            YOUR JOB-HUNT CO-PILOT
          </p>
          <h2 className="mt-3 text-[40px] font-light leading-tight sm:text-[56px] sm:leading-[1.1]">
            검색 포털이 아니라,
            <br />
            먼저 움직이는 Agent
          </h2>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* 탭 목록 */}
          <div className="flex flex-col gap-3">
            {FEATURES.map((f, i) => (
              <button
                key={f.key}
                onClick={() => setActive(f.key)}
                className={`flex flex-1 items-center gap-4 rounded-[12px] border p-5 text-left transition ${
                  active === f.key
                    ? "border-white bg-card text-ink"
                    : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                <span
                  className={`text-lg font-semibold ${
                    active === f.key ? "text-[#dceeb1]" : "text-white/60"
                  }`}
                >
                  0{i + 1}
                </span>
                <span>
                  <strong className="block text-[20px] font-semibold">{f.label}</strong>
                  <small className={`text-[16px] ${active === f.key ? "text-mute" : "text-white/65"}`}>{f.small}</small>
                </span>
              </button>
            ))}
          </div>

          {/* 미리보기 — 탭마다 내용 길이가 달라도 카드 크기는 동일하게 고정 */}
          <div className="flex min-h-[480px] flex-col rounded-[24px] border border-line bg-card p-8 text-ink">
            <div className="flex items-center justify-between">
              <span className="text-[19px] font-semibold text-leaf-deep">{current.preview.title}</span>
              <small className="text-[14px] font-bold text-mute">미리보기</small>
            </div>
            <p className="mt-6">
              <strong className="text-[56px] font-bold tracking-[-0.02em] text-[#dceeb1]">
                {current.preview.stat}
              </strong>
              <span className="ml-1.5 text-[18px] font-bold text-mute">{current.preview.unit}</span>
            </p>
            <p
              className="mt-4 text-[18px] leading-relaxed text-ink/85 [&_b]:text-leaf-deep"
              dangerouslySetInnerHTML={{ __html: current.preview.copy }}
            />
            <div className="min-h-6 flex-1" />
            <p className="rounded-[12px] bg-mint px-4 py-3 text-[16.5px] font-bold text-leaf-deep">
              💡 {current.preview.insight}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
