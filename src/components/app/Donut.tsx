"use client";

/** 라이브러리 없는 SVG 도넛 차트 — 각 조각 위에 % 표시, 중앙에 제목·값 */
export type DonutSegment = { label: string; value: number; color: string };

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

function arcPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rO, a0);
  const [x1, y1] = polar(cx, cy, rO, a1);
  const [x2, y2] = polar(cx, cy, rI, a1);
  const [x3, y3] = polar(cx, cy, rI, a0);
  return `M${x0} ${y0} A${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rI} ${rI} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** 배경색 밝기에 따라 글자색 결정 */
function textColorOn(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1d1d1f" : "#ffffff";
}

export function Donut({
  segments,
  size = 200,
  thickness = 34,
  centerTitle,
  centerValue,
  minLabelPct = 6,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerValue?: string;
  minLabelPct?: number;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const cx = size / 2, cy = size / 2, rO = size / 2 - 2, rI = rO - thickness, rMid = rO - thickness / 2;
  const gap = segments.length > 1 ? 0.025 : 0;
  const visible = segments.filter((s) => s.value > 0);
  const pieces = visible.map((s, i) => {
      const frac = total ? s.value / total : 0;
      const before = visible.slice(0, i).reduce((sum, x) => sum + x.value, 0);
      const start = -Math.PI / 2 + (total ? before / total : 0) * Math.PI * 2;
      const a0 = start + gap / 2;
      const a1 = start + frac * Math.PI * 2 - gap / 2;
      const pct = Math.round(frac * 100);
      const mid = (a0 + a1) / 2;
      const [lx, ly] = polar(cx, cy, rMid, mid);
      // 100% 단일 조각은 두 반원으로 그린다 (원호 하나로는 그릴 수 없음)
      const d =
        a1 - a0 >= Math.PI * 2 - 0.001
          ? arcPath(cx, cy, rO, rI, a0, a0 + Math.PI) + " " + arcPath(cx, cy, rO, rI, a0 + Math.PI, a1)
          : arcPath(cx, cy, rO, rI, a0, Math.max(a1, a0 + 0.002));
      return { ...s, pct, d, lx, ly };
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerTitle ?? "도넛 차트"}>
      {total === 0 && <circle cx={cx} cy={cy} r={rMid} fill="none" stroke="#e6e6e6" strokeWidth={thickness} />}
      {pieces.map((p) => (
        <path key={p.label} d={p.d} fill={p.color}>
          <title>{`${p.label} ${p.value.toLocaleString("ko-KR")}원 (${p.pct}%)`}</title>
        </path>
      ))}
      {pieces
        .filter((p) => p.pct >= minLabelPct)
        .map((p) => (
          <text key={p.label + "-l"} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill={textColorOn(p.color)}>
            {p.pct}%
          </text>
        ))}
      {centerTitle && (
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize={13} fill="#6b6b6b">
          {centerTitle}
        </text>
      )}
      {centerValue && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={17} fontWeight={700} fill="#1d1d1f">
          {centerValue}
        </text>
      )}
    </svg>
  );
}
