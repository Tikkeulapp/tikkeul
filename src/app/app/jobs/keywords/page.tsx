"use client";

/**
 * (구) 키워드별 공고 페이지 — 채용공고 검색 페이지에 다중 키워드 기능이 통합되어
 * /app/jobs?kw=… 로 리다이렉트만 한다. 북마크·위젯의 옛 링크 호환용.
 */
import { useEffect } from "react";

export default function KeywordJobsRedirect() {
  useEffect(() => {
    const kw = new URLSearchParams(window.location.search).get("kw") ?? "";
    window.location.replace(`/app/jobs${kw ? `?kw=${encodeURIComponent(kw)}` : ""}`);
  }, []);
  return <main className="grid min-h-screen place-items-center bg-paper text-mute">채용공고 검색으로 이동 중…</main>;
}
