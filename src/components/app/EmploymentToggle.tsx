"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 상단 우측 "취업전/취업후" 토글 — 취업전은 메인 홈(캘린더), 취업후는 금융 온보딩 시뮬레이션. */
export function EmploymentToggle() {
  const pathname = usePathname();
  const isAfter = pathname?.startsWith("/app/simulate");

  const tab = (active: boolean) =>
    `rounded-full px-3 py-1 text-[12.5px] font-bold transition ${
      active ? "bg-leaf text-white" : "text-mute hover:text-ink"
    }`;

  return (
    <div className="flex items-center rounded-full border border-line bg-card p-0.5">
      <Link href="/app" className={tab(!isAfter)}>취업전</Link>
      <Link href="/app/simulate" className={tab(!!isAfter)}>취업후</Link>
    </div>
  );
}
