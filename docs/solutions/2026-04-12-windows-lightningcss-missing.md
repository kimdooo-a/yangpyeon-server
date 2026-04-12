---
title: Windows에서 next build 실패 — lightningcss-win32-x64-msvc optional bin 부재
date: 2026-04-12
session: 17
tags: [windows, lightningcss, tailwindcss-v4, next-build, optional-dependencies, wsl2]
category: workaround
confidence: high
---

## 문제
Windows에서 `npx next build` 실행 시 다음 에러로 빌드 실패:

```
Error: Cannot find module '../lightningcss.win32-x64-msvc.node'
Require stack:
- node_modules\lightningcss\node\index.js
- node_modules\@tailwindcss\node\dist\index.js
- node_modules\@tailwindcss\postcss\dist\index.js
```

결과적으로 `/ypserver` 스킬의 Phase 1(로컬 빌드 검증)이 항상 실패하여 Phase 2(WSL2 배포)로 진행 자체가 차단됨.

## 원인
- Tailwind CSS v4(`@tailwindcss/postcss`)는 내부에서 `lightningcss`를 사용
- `lightningcss`는 플랫폼별 네이티브 바이너리를 `optionalDependencies`로 배포
- 현 `node_modules` 상태: `lightningcss-win32-x64-msvc/` 폴더 자체가 없음 → 선택 설치 실패 또는 `npm ci` 시 누락
- WSL2 Linux 쪽은 `lightningcss-linux-x64-gnu`가 정상 설치되어 있어 `next build` 성공

## 해결

### 단기 — WSL2 빌드로 우회 (본 세션 채택)
`/ypserver` Phase 2(WSL2 빌드)를 바로 실행. `&&` 체인 덕에 빌드 실패 시 `pm2 restart`가 실행되지 않아 프로덕션이 깨지지 않음.

```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && \
  rm -rf src .next && cp -r /mnt/e/.../src . && cp /mnt/e/.../next.config.ts ... && \
  npm install && npm run build && pm2 restart dashboard"
```

### 중기 — Windows 바이너리 복구
```bash
npm i -D lightningcss-win32-x64-msvc
# 또는
npm install --force
# 또는 optional dep 재설치
rm -rf node_modules package-lock.json && npm install
```

주의: `package-lock.json`에 optional dep 엔트리가 빠져 있으면 `npm i`만으로는 복구되지 않을 수 있음. `--include=optional` 명시 필요.

### 장기 — ypserver 스킬 보강
Phase 1에서 `lightningcss` 바이너리 부재를 감지하면 자동으로 WSL 빌드로 전환하거나, `--skip-local-build` 플래그를 문서화.

## 교훈
- Tailwind v4 + Windows 조합은 네이티브 바이너리 취약점이 많음. CI/로컬 환경 재현성은 WSL2 Linux에 맞추는 것이 현실적.
- **localhost:3000 포트 소유자 확인**: `Get-NetTCPConnection -LocalPort 3000`으로 `wslrelay.exe` 여부를 확인하면 Windows dev server인지 WSL2 포워딩인지 즉시 구분 가능. 배포 타겟 오인으로 디버깅 시간 낭비를 막음.
- `&&` 명령 체인은 실패 전파의 강력한 안전장치. 빌드 실패 시 재시작을 막아 프로덕션 훼손을 원천 차단.

## 관련 파일
- `package.json` — `lightningcss`는 `@tailwindcss/postcss` 경유 transitive dep
- `C:\Users\smart\.claude\skills\ypserver\SKILL.md` — 스킬 정의 (Phase 1 보강 대상)
