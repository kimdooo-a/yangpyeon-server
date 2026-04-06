# 외부 리소스 요청 예시

> 버전: 2.0 | 최종 업데이트: 2026-01-29
> resource-requests.md의 형식을 활용한 완전한 예시 모음

---

## 예시 1: 새 프로젝트 - 파비콘

```
🖼️ Antigravity 이미지 생성 요청

📋 프로젝트 맥락
- 프로젝트: Monet 자동화 시스템
- 테마: Blue (#3B82F6), Dark mode
- 용도: 파비콘

📐 스펙
- 크기: 512x512
- 형식: PNG
- 배경: 투명

🎨 Antigravity 프롬프트 (복사용)
---
Minimal flat icon of automation workflow arrows,
blue (#3B82F6) color scheme,
simple geometric shapes,
centered composition,
transparent background,
clean vector style,
suitable for favicon
---

📁 저장 정보
- 위치: public/images/icons/
- 파일명: icon-favicon-512.png
- 전체 경로: public/images/icons/icon-favicon-512.png

⚠️ 생성 후 위 경로에 정확히 저장해주세요.
저장 완료되면 알려주세요.

🔄 대안
- Midjourney: /imagine minimal flat icon, automation workflow, blue #3B82F6, geometric, centered, transparent bg --ar 1:1 --v 6
- DALL-E: Minimal flat icon of automation workflow with blue color scheme, simple geometric shapes, centered, transparent background
```

---

## 예시 2: 기존 프로젝트 - 아이콘 추가 (체계 확인 후)

```
🖼️ Antigravity 이미지 생성 요청

📋 기존 체계 확인 결과
- 기존 이미지: public/images/icons/icon-logo-512.png, icon-user-512.png
- 파일명 패턴: icon-[용도]-512.png
- 스타일: 미니멀 플랫, 단색, 투명 배경
- 색상: Blue (#3B82F6)

📋 프로젝트 맥락
- 프로젝트: Monet 자동화 시스템
- 용도: 설정 아이콘 (기존 아이콘과 세트)

📐 스펙 (기존 체계 따름)
- 크기: 512x512
- 형식: PNG
- 배경: 투명

🎨 Antigravity 프롬프트 (복사용)
---
Minimal flat icon of settings gear,
blue (#3B82F6) single color,
simple geometric shapes,
same style as existing icons,
centered composition,
transparent background,
clean vector style
---

📁 저장 정보 (기존 패턴 따름)
- 위치: public/images/icons/
- 파일명: icon-settings-512.png
- 전체 경로: public/images/icons/icon-settings-512.png

⚠️ 기존 아이콘(icon-logo-512.png)과 스타일 일치시켜주세요.
생성 후 위 경로에 정확히 저장해주세요.
```

---

## 예시 3: 이미지 세트 요청 (기존 프로젝트)

```
🖼️ Antigravity 이미지 세트 요청

📋 기존 체계 확인 결과
- 폴더 구조: public/images/{icons,og,hero,ui}
- 파일명 패턴: [카테고리]-[설명]-[크기].[확장자]
- 색상: Primary #3B82F6, Secondary #10B981
- 스타일: 미니멀, 플랫, 모던

📋 필요한 이미지 목록

1️⃣ Empty State - 검색 결과 없음
- 크기: 400x300 / 형식: PNG
- 프롬프트:
---
Minimal flat illustration of empty search,
magnifying glass with no results,
blue (#3B82F6) and gray color palette,
friendly approachable style,
white background
---
- 저장: public/images/ui/ui-empty-search-400x300.png

2️⃣ Empty State - 장바구니 비었음
- 크기: 400x300 / 형식: PNG
- 프롬프트:
---
Minimal flat illustration of empty shopping cart,
blue (#3B82F6) and gray color palette,
friendly approachable style,
white background
---
- 저장: public/images/ui/ui-empty-cart-400x300.png

3️⃣ 새 기능 OG 이미지
- 크기: 1200x630 / 형식: JPG
- 프롬프트:
---
Modern minimalist graphic for new feature announcement,
abstract geometric shapes,
blue (#3B82F6) gradient background,
clean professional aesthetic,
no text
---
- 저장: public/images/og/og-feature-update-1200x630.jpg

⚠️ 모든 이미지는 기존 스타일과 일관성 유지해주세요.
각 이미지 생성 후 해당 경로에 저장해주세요.
```

---
[← 목록](./_index.md) | [← 요청 형식](./resource-requests.md)
