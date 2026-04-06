# 3. 이미지 요청 (Antigravity용)

## 3-1. 새 프로젝트 - 단일 이미지 요청

[사용자 → Claude Code]
```
파비콘 이미지 프롬프트 만들어줘.

1. 프로젝트 맥락 파악 (package.json, tailwind.config, globals.css)
2. 브랜드 색상 추출
3. Antigravity용 프롬프트 생성
4. 저장 경로 + 파일명 지정 (image-files.md 규칙 따라서)
```

[Claude Code → 사용자] (출력 형식)
```
🖼️ Antigravity 이미지 생성 요청

📋 프로젝트 맥락
- 프로젝트: [프로젝트명]
- 테마: [색상, 분위기]
- 용도: 파비콘

📐 스펙
- 크기: 512x512
- 형식: PNG
- 배경: 투명

🎨 Antigravity 프롬프트 (아래 내용을 Antigravity에 복사하세요)
---
Minimal flat icon of [심볼],
[색상] color scheme,
simple geometric shapes,
centered composition,
transparent background,
clean vector style
---

📁 저장 정보
- 위치: public/images/icons/
- 파일명: icon-favicon-512.png
- 전체 경로: public/images/icons/icon-favicon-512.png

⚠️ Antigravity에서 이미지 생성 후 위 경로에 정확히 저장해주세요.
저장 완료되면 알려주세요.
```

[사용자 → Antigravity] (복사해서 붙여넣기)
```
Minimal flat icon of [심볼],
[색상] color scheme,
simple geometric shapes,
centered composition,
transparent background,
clean vector style
```

---

## 3-2. 기존 프로젝트 - 단일 이미지 요청

[사용자 → Claude Code]
```
설정 아이콘 이미지 프롬프트 만들어줘.

먼저 기존 체계 확인:
1. ls public/images/ 로 폴더 구조 확인
2. 기존 이미지 파일명 패턴 확인
3. tailwind.config, globals.css에서 색상 확인

기존 체계에 맞춰서:
- 기존 파일명 패턴 따르기
- 기존 스타일과 일관성 유지
- Antigravity 프롬프트 + 저장 경로 + 파일명 알려줘
```

[Claude Code → 사용자] (출력 형식)
```
🖼️ Antigravity 이미지 생성 요청

📋 기존 체계 확인 결과
- 기존 이미지: icon-logo-512.png, icon-user-512.png
- 파일명 패턴: icon-[용도]-512.png
- 스타일: 미니멀 플랫, 단색, 투명 배경
- 색상: Blue (#3B82F6)

📋 프로젝트 맥락
- 프로젝트: [프로젝트명]
- 용도: 설정 아이콘 (기존 아이콘과 세트)

📐 스펙 (기존 체계 따름)
- 크기: 512x512
- 형식: PNG
- 배경: 투명

🎨 Antigravity 프롬프트 (아래 내용을 Antigravity에 복사하세요)
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
Antigravity에서 생성 후 위 경로에 저장해주세요.
```

[사용자 → Antigravity] (복사해서 붙여넣기)
```
Minimal flat icon of settings gear,
blue (#3B82F6) single color,
simple geometric shapes,
same style as existing icons,
centered composition,
transparent background,
clean vector style
```

---

## 3-3. 이미지 세트 요청 (새 프로젝트)

[사용자 → Claude Code]
```
이 프로젝트에 필요한 이미지 세트 파악하고 각각 프롬프트 만들어줘.

1. 프로젝트 분석 (package.json, 컴포넌트, 페이지 구조, tailwind.config, globals.css)
2. 필요한 이미지 목록 도출 (파비콘, OG, 히어로, Empty State 등)
3. 각각 Antigravity 프롬프트 + 저장 경로 + 파일명 알려줘

image-files.md 규칙에 맞춰서.
```

[Claude Code → 사용자] (출력 형식)
```
🖼️ Antigravity 이미지 세트 요청

📋 프로젝트 분석 결과
- 프로젝트: [분석해서 파악한 프로젝트명]
- 색상: [tailwind.config/globals.css에서 추출한 색상]
- 스타일: [프로젝트 분위기]
- 페이지 구조: [분석한 페이지들]

📋 필요한 이미지 목록
[프로젝트 분석 후 도출한 목록]

---

1️⃣ [이미지 1]

📐 스펙: [크기], [형식], [배경]
📁 저장: [경로/파일명]

🎨 Antigravity 프롬프트 (복사용)
---
[프롬프트]
---

---

2️⃣ [이미지 2]
...

⚠️ 각 이미지를 Antigravity에서 생성 후 해당 경로에 저장해주세요.
모두 완료되면 알려주세요.
```

---

## 3-4. 이미지 세트 요청 (기존 프로젝트)

[사용자 → Claude Code]
```
이 프로젝트에 추가로 필요한 이미지 파악하고 프롬프트 만들어줘.

1. public/images/ 기존 체계 확인 (폴더 구조, 파일명 패턴, 스타일)
2. 프로젝트 분석해서 아직 없는 이미지 파악
3. 기존 패턴에 맞춰서 각각 Antigravity 프롬프트 + 저장 경로 + 파일명 알려줘
```

[Claude Code → 사용자] (출력 형식)
```
🖼️ Antigravity 이미지 세트 요청

📋 기존 체계 확인 결과
- 폴더 구조: [확인한 구조]
- 파일명 패턴: [확인한 패턴]
- 기존 이미지: [있는 것들]
- 스타일: [기존 이미지 스타일]
- 색상: [사용 중인 색상]

📋 추가 필요한 이미지 목록
[분석 후 도출한 목록 - 기존에 없는 것들]

---

1️⃣ [이미지 1]
...

⚠️ 기존 이미지와 스타일 일관성 유지해주세요.
각 이미지 생성 후 해당 경로에 저장해주세요.
```

---

## 3-5. 특정 이미지 요청 (상세 지정)

[사용자 → Claude Code]
```
아래 스펙으로 이미지 프롬프트 만들어줘.

용도: 로딩 일러스트
크기: 300x300
형식: PNG
스타일: 미니멀 일러스트
색상: #3B82F6 (파란색)
배경: 투명

Antigravity 프롬프트 + 저장 경로 + 파일명 알려줘.
```

---

## 3-6. 이미지 저장 완료 알림

[사용자 → Claude Code]
```
Antigravity에서 이미지 생성해서 저장했어.

저장 위치: public/images/icons/icon-favicon-512.png

1. 파일 존재 확인해줘
2. 코드에서 이 이미지 사용하는 곳 연결해줘
```
