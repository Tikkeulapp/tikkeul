/** 티끌 로고마크 — 작은 티끌(점)들이 모여 쌓이는 모양 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-none bg-leaf"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        {/* 아래로 갈수록 커지는 점 — 티끌 모아 태산 */}
        <circle cx="16.5" cy="4.5" r="1.6" fill="#f6e500" />
        <circle cx="9.5" cy="9" r="2.4" fill="#ffffff" />
        <circle cx="15" cy="14" r="3.2" fill="#f6e500" />
        <circle cx="8.5" cy="19" r="4" fill="#ffffff" />
      </svg>
    </span>
  );
}
