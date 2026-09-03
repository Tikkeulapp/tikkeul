const STEPS = [
  {
    step: "01",
    title: "일정을 적으면",
    body: "노션처럼 캘린더에 적기만 하세요. “9/18 ○○기업 면접”, “10월 파이썬 교육” — 그거면 충분합니다.",
    visual: (
      <div className="flex h-full flex-col justify-center gap-2 text-[12.5px] font-bold">
        <span className="w-fit rounded-lg bg-card px-3 py-1.5">9/5 토익</span>
        <span className="w-fit rounded-lg bg-card px-3 py-1.5">9/13 SQLD</span>
        <span className="w-fit rounded-lg bg-leaf px-3 py-1.5 text-white">
          9/18 ○○기업 면접
        </span>
      </div>
    ),
  },
  {
    step: "02",
    title: "AI가 일정의 의미를 읽고",
    body: "‘면접’이라는 걸 이해하고, 나이·거주지역·구직 상태와 조합해 지금 받을 수 있는 지원사업을 찾습니다.",
    visual: (
      <div className="grid h-full place-items-center">
        <div className="relative grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-leaf/40">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-leaf text-sm font-semibold text-white">
            AI
          </span>
          <span className="absolute -right-1 top-2 rounded-full bg-lime px-2 py-0.5 text-[10px] font-semibold text-leaf-deep">
            면접이구나
          </span>
        </div>
      </div>
    ),
  },
  {
    step: "03",
    title: "혜택·증빙·마감을 먼저 챙깁니다",
    body: "신청 가능한 정책과 예상 절약액, 미리 받아둘 증빙 서류, 신청 마감일까지 — 놓치기 전에 알려드립니다.",
    visual: (
      <div className="flex h-full flex-col justify-center gap-2 text-[12.5px] font-bold">
        <span className="w-fit rounded-full bg-mint px-3 py-1.5 text-leaf-deep">
          면접수당 +50,000원
        </span>
        <span className="w-fit rounded-full bg-butter px-3 py-1.5">면접확인서 받아두기</span>
        <span className="w-fit rounded-full bg-card px-3 py-1.5">마감 D-6 알림</span>
      </div>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-[13px] font-semibold tracking-widest text-leaf">HOW IT WORKS</p>
        <h2 className="mt-3 text-3xl font-light leading-tight sm:text-[44px] sm:leading-[1.1]">
          일정을 적으면,
          <br />
          돈이 따라옵니다
        </h2>
        <p className="mt-4 text-mute">
          정책을 검색하지 마세요. 취준 일정을 적는 것만으로 필요한 순간에 혜택이 연결됩니다.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {STEPS.map((s) => (
          <article
            key={s.step}
            className="rounded-[24px] border border-line bg-card p-7"
          >
            <span className="text-[13px] font-semibold text-leaf">{s.step}</span>
            <div className="mt-4 h-36 rounded-[12px] bg-mint-soft/70 p-4">{s.visual}</div>
            <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-mute">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
