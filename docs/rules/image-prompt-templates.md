# 이미지 프롬프트 템플릿

> 버전: 2.0 | 최종 업데이트: 2026-01-29
> 용도별 Antigravity/AI 이미지 프롬프트 구조 정의

---

## 출력 형식 (공통)

```
🖼️ Antigravity 이미지 생성 요청

📋 프로젝트 맥락
- 프로젝트: [프로젝트명]
- 테마: [색상, 분위기]
- 용도: [어디에 사용]

📐 스펙
- 크기: [WxH]
- 형식: [PNG/JPG]
- 배경: [투명/단색/그라데이션]

🎨 Antigravity 프롬프트 (복사용)
---
[영어 프롬프트]
---

📁 저장 정보
- 위치: public/images/[카테고리]/
- 파일명: [용도]-[설명]-[크기].[확장자]

🔄 대안
- Midjourney: [프롬프트] --ar X:X --v 6
- DALL-E: [프롬프트]

💡 생성 후
- [후처리 안내]
```

---

## 용도별 프롬프트 구조

### 파비콘 / 앱 아이콘 (512x512, PNG)

```
Minimal flat icon of [핵심 심볼],
[브랜드 색상] color scheme,
simple geometric shapes,
centered composition,
solid [배경색] background,
suitable for favicon,
clean vector style
```

저장: `public/images/icons/icon-favicon-512.png`

### OG 이미지 (1200x630, PNG/JPG)

```
Modern minimalist [프로젝트 분야] graphic,
abstract [관련 심볼] shapes,
[브랜드 색상] gradient background,
clean professional aesthetic,
no text,
suitable for social media preview
```

저장: `public/images/og/og-default-1200x630.jpg`
주의: 텍스트는 코드로 오버레이 추가

### 히어로 섹션 배경 (1920x1080, JPG)

```
[분위기] abstract background for [서비스 분야] website,
soft [색상1] and [색상2] gradient,
subtle geometric patterns,
[light/dark] theme compatible,
modern tech aesthetic,
high resolution, seamless edges
```

저장: `public/images/hero/hero-main-1920x1080.jpg`

### 빈 상태 (Empty State) 일러스트 (400x300, PNG)

```
Minimal flat illustration of [상황 묘사],
[브랜드 색상] and gray color palette,
friendly and approachable style,
simple line art,
white background,
suitable for empty state UI
```

저장: `public/images/ui/ui-empty-[상황]-400x300.png`

### 로딩/스플래시 이미지 (512x512, PNG)

```
Minimal [브랜드 심볼] logo mark,
[브랜드 색상] on [배경색],
centered composition,
clean modern design,
suitable for loading screen
```

### 대시보드/앱 스크린샷 목업 (1920x1080, PNG)

```
Clean modern [서비스 종류] dashboard UI screenshot,
[light/dark] theme,
showing [주요 기능 - charts, cards, tables],
[브랜드 색상] accent color,
professional SaaS aesthetic,
realistic interface design
```

---

## 프로젝트 유형별 추천 이미지 세트

| 유형 | 필요 이미지 |
|------|------------|
| SaaS/대시보드 | 파비콘, OG, 히어로/목업, Empty state 2~3개 |
| 이커머스 | 파비콘, OG, 히어로, 카테고리 아이콘, Empty state |
| 블로그/콘텐츠 | 파비콘, 기본 OG, 포스트 썸네일 템플릿 |
| 랜딩페이지 | 파비콘, OG, 히어로, 피처 아이콘들 |

---

## 색상 추출 방법

```javascript
// tailwind.config.js에서
primary: '#3B82F6'  → "blue", "sky blue"
secondary: '#10B981' → "emerald green", "teal"

// globals.css에서
--primary: 59 130 246; → RGB를 색상명으로 변환
```

---

## 주의사항

1. **텍스트 포함 금지**: AI 이미지의 텍스트는 부정확함. 텍스트는 코드로 오버레이
2. **저작권**: 특정 브랜드/캐릭터 언급 금지
3. **일관성**: 한 프로젝트 내 이미지들은 같은 스타일 유지
4. **후처리 안내**: 생성 후 필요한 작업 (리사이즈, 압축 등) 명시

---
[← 목록](./_index.md) | [← 요청 형식](./resource-requests.md)
