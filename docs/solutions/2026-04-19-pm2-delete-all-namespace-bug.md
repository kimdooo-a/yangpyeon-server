---
title: PM2 v6 `delete all --namespace X` 필터 무시 — 프로덕션 삭제 위험
date: 2026-04-19
session: 30 (SP-010)
tags: [pm2, ops, safety, production-incident, ypserver]
category: safety-rule
confidence: high
---

## 문제

PM2 v6.0.14에서 namespace 필터 인수가 `pm2 delete all --namespace X` 조합에서 **무시**된다. 의도한 "namespace X 소속 프로세스만 삭제"가 아니라 **PM2가 관리하는 모든 프로세스가 삭제**된다.

본 프로젝트 SP-010 실험 중 재현:

```bash
# 실행
pm2 delete all --namespace sp010

# 결과 (실제)
[PM2] Applying action deleteProcessId on app [all](ids: [ 0, 1, 2 ])
[PM2] [ecosystem-fork](2) ✓
[PM2] [dashboard](0) ✓       ← 프로덕션 대시보드
[PM2] [cloudflared](1) ✓     ← 프로덕션 터널
```

실험 목적은 테스트 namespace `sp010`의 프로세스만 정리하는 것이었으나, 프로덕션 `default` namespace의 `dashboard`와 `cloudflared`까지 함께 내려갔다.

## 원인

PM2 v6.0.14 내부 구현에서 `delete all` 분기가 namespace 필터보다 우선 처리된다. `all` 키워드가 "namespace 무관한 전체"로 해석되어 필터가 적용되지 않는다. 이는 `pm2 restart all --namespace X`, `pm2 stop all --namespace X` 등 다른 `all` 조합에서도 동일할 가능성이 있으나 본 세션에서는 `delete`만 재현 확인.

참고: PM2 공식 문서는 "applies namespace filter"라고 명시하지만 실제 동작이 다름 (v6.0.14 기준).

## 해결

### 즉시 복구
`pm2 save`로 저장된 dump가 있으면:
```bash
pm2 resurrect
```
이 명령이 `~/.pm2/dump.pm2` 기반으로 모든 프로세스를 재기동한다. 본 사고에서는 **5초 이내 복구 완료**.

### 재발 방지
**규칙**: `pm2 delete all`, `pm2 restart all`, `pm2 stop all` 절대 사용 금지. 반드시 개별 이름을 나열:

```bash
# ❌ 위험
pm2 delete all --namespace sp010

# ✅ 안전
pm2 delete sp010-fork sp010-cluster

# ✅ 더 안전 — 실험 전 pm2 save로 스냅샷 확보
pm2 save
# ... 실험 ...
# 사고 시: pm2 resurrect
```

### 운영 스크립트 safeguard
`/ypserver` 스킬, CI 배포 스크립트 등에 다음 패턴 금지:

```bash
# deploy.sh 등에서
if grep -qE 'pm2 (delete|restart|stop) all' "$SCRIPT"; then
  echo "ERROR: 'pm2 <cmd> all' 금지. 개별 이름 사용 필수."
  exit 1
fi
```

## 교훈

1. **"all" 키워드는 언제나 전역**: 필터 인수와 함께 써도 전역으로 해석될 가능성을 가정. 문서와 실제 동작 불일치 사례.
2. **프로덕션 + 실험 같은 PM2 인스턴스 공유 시 격리 원칙**: 실험용 프로세스는 별도 PM2 daemon(`PM2_HOME=/tmp/sp010-pm2` 환경변수)로 격리하거나, PM2를 사용하지 않고 직접 Node 프로세스 관리 권장. SP-010도 최종적으로는 `node run-cluster.cjs`로 전환해 실험 완료.
3. **`pm2 save` 상시 유지**: dump.pm2가 최신이면 사고 복구가 5초. 본 프로젝트는 `pm2-smart.service`로 자동 resurrect 구성 — 세션 25-C에서 확인.
4. **대화형 삭제 가드 요청**: PM2에 `--dry-run` 옵션 또는 `--confirm` 대화형 가드 기능 요청을 upstream issue로 제출 고려.

## 관련 파일

- `docs/research/spikes/spike-010-pm2-cluster-result.md` §7 운영 주의사항
- 글로벌 `~/.claude/skills/ypserver/SKILL.md` — safeguard 추가 대상
