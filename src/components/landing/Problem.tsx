const COSTS = [
  ["토익 응시료", "52,000원"],
  ["SQLD 응시료", "50,000원"],
  ["면접 정장", "150,000원"],
  ["증명사진", "20,000원"],
  ["면접 왕복 교통비", "매번"],
  ["직무 강의", "89,000원"],
] as const;

const MISS_REASONS = [
  {
    title: "몰라서",
    body: (
      <>
        응시료·면접수당 같은 지원사업은 중앙정부와 지자체에 흩어져 있어,
        <br />내 지역에 뭐가 있는지 알기 어렵습니다.
      </>
    ),
  },
  {
    title: "증빙을 못 챙겨서",
    body: "지원 대상이었는데 면접확인서를 안 받았거나 영수증을 버려서, 알고도 신청하지 못합니다.",
  },
  {
    title: "조기마감되어서",
    body: (
      <>
        예산 소진 시 조기 마감되는 사업이 많아, 신청 시점을
        <br />놓치면 그대로 끝납니다.
      </>
    ),
  },
] as const;

export function Problem() {
  return (
    <section className="bg-leaf-deep py-20 text-white">
      <div className="mx-auto w-full max-w-6xl px-5">
        <p className="text-[13px] font-extrabold tracking-widest text-lime">
          THE REAL COST OF JOB HUNTING
        </p>
        <h2 className="mt-3 text-3xl font-extrabold leading-snug sm:text-4xl">
          취업 준비에는
          <br />
          생각보다 돈이 듭니다
        </h2>

        <div className="mt-8 flex flex-wrap gap-2.5">
          {COSTS.map(([name, cost]) => (
            <span
              key={name}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13.5px] font-bold"
            >
              {name} <b className="text-lime">{cost}</b>
            </span>
          ))}
        </div>

        <p className="mt-14 text-lg font-bold text-white/90">
          지원제도는 있습니다. 그런데 이렇게 놓칩니다.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {MISS_REASONS.map((reason, i) => (
            <article
              key={reason.title}
              className="rounded-2xl border border-white/15 bg-white/[0.07] p-6"
            >
              <span className="text-[13px] font-extrabold text-lime">0{i + 1}</span>
              <h3 className="mt-1 text-lg font-extrabold">{reason.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/75">{reason.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
