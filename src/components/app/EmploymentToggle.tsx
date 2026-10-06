"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 상단 우측 "취업 전/채용/취업 후" 토글 — 취업 전은 메인 홈(캘린더), 채용은 공고 검색, 취업후는 시뮬레이션. */
export function EmploymentToggle() {
  const pathname = usePathname();
  const isAfter = pathname?.startsWith("/app/simulate");
  const isJobs = pathname?.startsWith("/app/jobs");

  const tab = (active: boolean) =>
    `rounded-full px-5 py-2 text-[17px] font-bold transition ${
      active ? "bg-leaf text-white" : "text-mute hover:text-ink"
    }`;

  return (
    <div id="tour-toggle" className="flex items-center rounded-full border border-line bg-card p-0.5">
      <Link href="/app" className={tab(!isAfter && !isJobs)}>취업 전</Link>
      <Link href="/app/jobs" className={tab(!!isJobs)}>채용</Link>
      <Link href="/app/simulate" className={tab(!!isAfter)}>취업 후</Link>
    </div>
  );
}
