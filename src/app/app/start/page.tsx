import { PERSONAS } from "@/data/personas";
import { derive } from "@/lib/derive";
import { StartClient } from "@/components/app/StartClient";
import { BRAND } from "@/config/brand";

export const metadata = { title: `프로필 선택 — ${BRAND.name}` };

/**
 * 페르소나 선택 화면.
 * 도출 프로필(derived)은 서버에서 계산해 내려준다 —
 * 실서비스에서 마이데이터 API 응답을 서버에서 분석하는 것과 같은 경로.
 */
export default function StartPage() {
  const items = PERSONAS.map((persona) => ({
    persona,
    derived: derive(persona.mydata),
  }));
  return <StartClient items={items} />;
}
