const PRINCIPLES = [
  {
    title: "공식 데이터만",
    body: "정책 정보는 정부 공식 API와 원문에서 가져오고, 항상 공식 링크를 함께 보여드립니다.",
  },
  {
    title: "계산은 코드가",
    body: "절약액·마감일 같은 숫자는 AI가 지어내지 않습니다. 검증 가능한 계산 코드가 처리합니다.",
  },
  {
    title: "모르면 모른다고",
    body: "자격 조건이 불확실하면 추측하는 대신 ‘추가 확인 필요’로 표시하고 확인 방법을 안내합니다.",
  },
] as const;

export function Trust() {
  return (
    <section id="trust" className="bg-mint-soft py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          {/* 밝은 배경 위라 연두 글자가 묻힘 — 검정 배지로 반전 */}
          <p className="inline-block bg-ink px-2.5 py-1 text-[13px] font-semibold tracking-widest text-white">TRUST BY DESIGN</p>
          <h2 className="mt-3 text-3xl font-light leading-tight sm:text-[44px] sm:leading-[1.1]">
            돈 얘기라서,
            <br />더 깐깐하게
          </h2>
          <p className="mt-4 max-w-[38ch] text-mute">
            금융 정보는 틀리면 안 됩니다. 그래서 세 가지 원칙을 서비스 구조에 넣었습니다.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <article key={p.title} className="rounded-[24px] border border-line bg-card p-6">
              <span className="text-[13px] font-semibold text-leaf">0{i + 1}</span>
              <h3 className="mt-1.5 font-semibold">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-mute">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
