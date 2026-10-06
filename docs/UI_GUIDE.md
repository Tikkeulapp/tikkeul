# UI 디자인 가이드

## 디자인 원칙
1. 금액과 마감이 먼저 보여야 한다 — "얼마 아끼나 / 언제까지"가 카드의 첫 줄.
2. 판정은 단정하지 않는다 — "가능성 높음 / 추가 확인 필요 / 요건 미충족" 배지 + 근거, 최종 확인은 공식 링크로.
3. 한국어 가독성 우선 — `word-break: keep-all`, 짧은 문장, 숫자는 `1,234,567원`(`formatKrw`).

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 (채팅 영역의 기존 보라 강조 외 신규 사용 금지) |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |

## 색상
`src/app/globals.css`의 `@theme` 토큰을 쓴다 (`bg-paper`, `text-ink`, `border-line` …). 하드코딩 hex는 시맨틱 색상에만.

### 배경
| 용도 | 값 |
|------|------|
| 페이지 | `--color-paper` #ffffff |
| 카드 | `--color-card` #ffffff + `border-line` |
| 옅은 면 | `--color-mint-soft` #f7f7f5 |
| 포인트 면 | `--color-mint` / `--color-lime` #dceeb1 |
| 보조 하이라이트 | `--color-butter` #efd4d4 |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | `--color-ink` #000000 |
| 강조 | `--color-leaf-deep` #1f1d3d |
| 보조 | `--color-mute` #6b6b6b |
| 경계선 | `--color-line` #e6e6e6 |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 가능성 높음 / 성공 | #2fbf5f |
| 추가 확인 필요 / 입력 필요 | 배경 #fff7e0, 테두리 #f6c453, 글자 #b45309 |
| 요건 미충족 / 에러 | #c0392b (배경 #fde8e8) |
| 중립 | #6b6b6b |

## 컴포넌트
### 카드
```
rounded-xl border border-line bg-card p-5 shadow-[var(--shadow-soft)]
```

### 버튼
```
Primary: rounded-full bg-leaf px-5 py-2.5 text-white font-semibold hover:opacity-90
Text:    text-mute hover:text-ink
```

### 입력 필드
```
rounded-lg border border-line bg-white px-3 py-2 focus:border-ink outline-none
```

### 배지
```
rounded border px-1.5 py-0.5 text-[11.5px] font-bold  (색은 시맨틱 표 참조)
```

## 레이아웃
- 랜딩: max-w-6xl 중앙 컨테이너, 섹션 간 py-20 이상
- 앱 메인: 좌(마이티끌·추천) / 중(검색바·월 달력·날짜 패널) / 우(절약·시뮬레이션 위젯) 3열, 모바일은 1열
- 정렬: 좌측 정렬 기본. 히어로·CTA만 중앙 정렬
- 간격: 카드 내부 gap-3~4, 섹션 간 space-y-8

## 타이포그래피
Pretendard Variable (layout.tsx에서 CDN 로드), `letter-spacing: -0.01em`, `line-height: 1.6`.
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 | text-3xl md:text-4xl font-bold text-ink |
| 카드 제목 | text-base font-bold text-ink |
| 금액 강조 | text-2xl font-extrabold tabular-nums |
| 본문 | text-sm text-ink leading-relaxed |
| 보조 | text-xs text-mute |

## 애니메이션
- 허용: fade-in / slide-up (0.2~0.4s), 아코디언 높이 전환, 로딩 스피너·스켈레톤, 온보딩 투어(react-joyride)
- 그 외 장식 애니메이션 금지

## 아이콘
- 이모지 아이콘을 기능 표시로 사용 (💡 일정 혜택, 🏠 거주지, ❗ 입력 필요) — 의미가 있는 곳에만
- SVG는 인라인, strokeWidth 1.5~2. 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다
