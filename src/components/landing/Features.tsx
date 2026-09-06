"use client";

import { useState } from "react";

const FEATURES = [
  {
    key: "match",
    label: "일정에 붙는 정책 매칭",
    small: "면접·시험·이사를 적으면 혜택이 따라옵니다",
    preview: {
      title: "일정 → 정책 매칭",
      stat: "4,475",
      unit: "개 정책에서",
      copy: "면접·시험·이사 일정을 적으면 AI가 전국 정책 중 <b>그 일정에 붙는 혜택</b>만 골라 이유와 함께 보여줍니다. 이사를 적으면 새 거주지에서 열리는 혜택과 사라지는 혜택까지 알려드립니다.",
      insight: "“대전 이사”를 적으면 대전 월세지원과 함께 거주지 변경 제안이 뜹니다.",
    },
  },
  {
    key: "profile",
    label: "마이데이터로 내 상황 이해",
    small: "소득·월세·수급·소비 습관을 코드로 읽습니다",
    preview: {
      title: "내 상황 이해",
      stat: "15",
      unit: "가지 금융 피처",
      copy: "계좌·카드·대출 마이데이터에서 <b>월 소득, 월세, 받고 있는 수당, 소비 습관</b>을 규칙 코드로 계산합니다. 설문은 마이데이터로 알 수 없는 것만 묻습니다.",
      insight: "숫자는 코드가 계산하고, AI는 판단과 설명만 합니다.",
    },
  },
  {
    key: "judge",
    label: "AI 자격 판정 · 마이티끌",
    small: "받을 수 있는지, 무엇을 챙길지, 언제 마감인지",
    preview: {
      title: "자격 판정과 마이티끌",
      stat: "3",
      unit: "단계 판정",
      copy: "<b>신청 가능성 높음 / 추가 확인 필요 / 요건 미충족</b>으로 판정하고 근거와 미리 챙길 증빙을 알려줍니다. 담은 정책은 마감일·연결 일정·예상 절약액으로 관리합니다.",
      insight: "마감 3일 전이면 캘린더 위에 알림이 뜹니다.",
    },
  },
  {
    key: "chat",
    label: "AI 챗봇",
    small: "이게 뭐예요? 저한테 맞아요? 둘 중 뭐가 나아요?",
    preview: {
      title: "AI 챗봇",
      stat: "3",
      unit: "가지 질문",
      copy: "“이게 뭐예요?” “저한테 맞아요?” “둘 중 뭐가 나아요?” — <b>정보 제공·매칭·비교</b> 세 종류의 질문에 정책 DB를 근거로 답합니다.",
      insight: "DB에 없는 정책은 없다고 말합니다. 지어내지 않습니다.",
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
          <p className="text-[13px] font-semibold tracking-widest text-[#7ddf9a]">
            YOUR JOB-HUNT CO-PILOT
          </p>
          <h2 className="mt-3 text-3xl font-light leading-tight sm:text-[44px] sm:leading-[1.1]">
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
                className={`flex items-center gap-4 rounded-[12px] border p-5 text-left transition ${
                  active === f.key
                    ? "border-white bg-card text-ink"
                    : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    active === f.key ? "text-[#1b8f47]" : "text-white/60"
                  }`}
                >
                  0{i + 1}
                </span>
                <span>
                  <strong className="block text-[15px] font-semibold">{f.label}</strong>
                  <small className={`text-[13px] ${active === f.key ? "text-mute" : "text-white/65"}`}>{f.small}</small>
                </span>
              </button>
            ))}
          </div>

          {/* 미리보기 */}
          <div className="rounded-[24px] border border-line bg-card p-8 text-ink">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-leaf-deep">{current.preview.title}</span>
              <small className="text-[12px] font-bold text-mute">미리보기</small>
            </div>
            <p className="mt-6">
              <strong className="text-[56px] font-bold tracking-[-0.02em] text-[#1b8f47]">
                {current.preview.stat}
              </strong>
              <span className="ml-1.5 font-bold text-mute">{current.preview.unit}</span>
            </p>
            <p
              className="mt-4 text-[15px] leading-relaxed text-ink/85 [&_b]:text-leaf-deep"
              dangerouslySetInnerHTML={{ __html: current.preview.copy }}
            />
            <p className="mt-6 rounded-[12px] bg-mint px-4 py-3 text-[13.5px] font-bold text-leaf-deep">
              💡 {current.preview.insight}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
