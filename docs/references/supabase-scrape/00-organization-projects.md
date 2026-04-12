---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: organization-projects
---

# 00. Organization / Projects

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Supabase
doyoung's projects
Free

Feedback

Search...

Ctrl K


Upgrade to Pro


This organization is managed by Vercel Marketplace.
Manage
Projects
Search for a project
Status

Sorted by name


New project
Crypto Chart Analysi

AWS | ap-northeast-2

nano
General-pro

AWS | ap-northeast-2

Project is paused


Plan D

AWS | ap-northeast-2

Project is paused
```

## 드러난 UI / 기능 목록

- 조직(Organization) 개념 — 사용자는 `doyoung's projects`라는 조직에 속함
- 요금제 표시: `Free`
- 조직 단위 관리 위탁: **Vercel Marketplace에서 관리됨** → Supabase 빌링이 Vercel에 의해 통합됨
- Command Palette(`Ctrl K`) — 전역 검색/명령 실행
- **프로젝트 리스트**: 이름, 리전(AWS ap-northeast-2 등), compute tier(`nano`), 상태(Healthy / Paused)
- 프로젝트 정렬: `Sorted by name`
- 상태 필터: `Status`
- `New project` 버튼 — 조직 소속 신규 프로젝트 생성
- `Upgrade to Pro` 업셀
- Feedback 채널

## 추론되는 기술 스택

- **멀티테넌시(Organization → Projects)**: 빌링/권한/감사는 조직 레벨, 자원 격리는 프로젝트 레벨
- **리소스 tier**: 저가~고가 compute 플랜 (`nano`, `micro`, `small`, ...)
- **리전 분산**: AWS 다중 리전 배포
- **프로젝트 상태 관리**: `Healthy`, `Paused`, (후속에서 `Restarting`, `Failed` 등 암시)
- **외부 빌링 플랫폼 연계**: Vercel Marketplace = 별도 결제 게이트웨이
- **Command Palette**: monaco + `cmdk` 같은 React 컴포넌트 라이브러리로 구현 가능
