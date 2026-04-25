---
title: Next.js NFT 해시 디렉토리 네이티브 바이너리 플랫폼 불일치 (Windows 빌드 → Linux 실행)
date: 2026-04-25
session: 52
tags: [nextjs-standalone, nft, better-sqlite3, cross-platform-native, rsync, pm2]
category: bug-fix
confidence: high
---

## 문제

세션 50(standalone 재도입 + WSL PM2 배포) 직후부터 로그인 시도 실패. PM2 err 로그에 `invalid ELF header / ERR_DLOPEN_FAILED` 반복 기록.

```
⨯ Error: /home/smart/ypserver/.next/node_modules/better-sqlite3-90e2652d1716b047/build/Release/better_sqlite3.node: invalid ELF header
code: 'ERR_DLOPEN_FAILED'
```

`file(1)` 검증:

```
better_sqlite3.node: PE32+ executable (DLL) (GUI) x86-64, for MS Windows, 7 sections
```

## 원인

**근본 원인은 "Windows에서 빌드 → Linux에서 실행" 아키텍처 불일치.** Windows 호스트에서 `next build`를 수행하면 Next.js의 NFT(Node File Trace)가 `.next/node_modules/<pkg>-<contentHash>/` 구조로 네이티브 패키지를 복사하는데, 이때 Windows용 `.node` DLL이 번들된다. 이 산출물을 그대로 Linux(WSL PM2)로 전송하면 dlopen 실패.

3중 상호작용으로 문제가 은폐되어 있었다:

1. **`serverExternalPackages: ["better-sqlite3"]` 존재**: 빌드 시 번들링은 막지만 NFT 트레이싱은 여전히 발생 → 해시 디렉토리에 Windows 바이너리가 들어감.
2. **Runtime 리졸버 우선순위**: standalone 런타임에서 `require('better-sqlite3')`는 정규 `node_modules/better-sqlite3/`가 아니라 NFT 해시 디렉토리를 먼저 로드. 해시 디렉토리의 Windows `.node`가 그대로 dlopen됨.
3. **`install-native-linux.sh`의 갭**: `npm rebuild better-sqlite3`는 정규 `node_modules/`만 Linux로 재빌드하고, NFT 해시 디렉토리는 손대지 않음 → 프로덕션 리졸버가 참조하는 파일이 여전히 Windows 바이너리.

또한 부차적으로 발견된 `pack-standalone.sh` 버그 2종:

- `rsync --delete-excluded`가 source(`.next/standalone/`)에 없는 helper 파일(start.sh, install-native-linux.sh 등 5종)을 target에서 삭제 → `find` 단계의 preserve 의도와 충돌 → 매 패키징마다 helper들이 `standalone/standalone/`로 한 단계씩 깊어지고 top-level에서 사라짐.
- NFT가 프로젝트 루트 `standalone/` 디렉토리를 재귀 트레이스 → `.next/standalone/standalone/` 생성 → pack 시 nested 누적.

## 해결

**L2 (근본 — build-on-target)**: WSL(Linux) 네이티브에서 `next build` 수행. NFT가 처음부터 Linux 바이너리만 트레이스해 문제 원천 차단.

`scripts/wsl-build-deploy.sh` 신규 — Windows 소스(`/mnt/e/...`) → WSL 네이티브(`~/dev/ypserver-build/` on ext4) → `npm ci` → `next build` → `pack-standalone.sh` → rsync 배포(`~/ypserver/`) → PM2 재시작까지 단일 명령.

```bash
# WSL 전용 (MSYS_NO_PATHCONV=1 로 Git Bash 경로 변환 우회)
MSYS_NO_PATHCONV=1 wsl bash -c 'bash /mnt/e/.../scripts/wsl-build-deploy.sh'
```

**L1 (안전망 — self-healing)**: `standalone/install-native-linux.sh`에 NFT 해시 디렉토리 자가치유 블록 추가. 누군가 실수로 Windows 빌드 산출물을 배포해도 정규 `node_modules/`의 Linux `.node`를 NFT 해시 디렉토리에 덮어씀.

```bash
sync_native_to_nft() {
  local pkg="$1"
  local rel_path="$2"   # 예: build/Release/better_sqlite3.node
  local src="node_modules/$pkg/$rel_path"
  [[ -f "$src" ]] || { echo "  ⚠️  $src 없음 — 스킵"; return 0; }
  for nft_dir in .next/node_modules/${pkg}-*; do
    [[ -d "$nft_dir" ]] || continue
    local target="$nft_dir/$rel_path"
    # -ef 는 inode 동등성. NFT 가 hardlink 로 묶은 경우 cp 실패 방지.
    if [[ -f "$target" && "$src" -ef "$target" ]]; then
      echo "  = $target (이미 동일 inode — 스킵)"
    else
      mkdir -p "$(dirname "$target")"
      cp -f "$src" "$target"
    fi
  done
}
sync_native_to_nft "better-sqlite3" "build/Release/better_sqlite3.node"
```

**`pack-standalone.sh` 정상화**: helper 5종 임시 백업/복원 + `--exclude='/standalone/'` 앵커링으로 nested 재귀 차단 + 첫 빌드 대비 `mkdir -p "$DEST"` 멱등성 보강.

**rsync exclude 앵커링**: `--exclude 'data/'` → `--exclude '/data/'`로 변경. 앵커 없는 `data/`는 **어느 깊이**의 동명 디렉토리도 매치해 `src/app/api/v1/data/` 같은 코드 경로까지 `--delete`에서 보호 → 잔재 파일 누적 유발.

## 교훈

1. **"빌드 환경 = 실행 환경" 원칙**: 네이티브 모듈(`.node`)이 포함된 Node 프로젝트는 타깃 OS에서 빌드해야 한다. `npm rebuild` 기반 사후 교체는 Next.js NFT 같은 해시 디렉토리 메커니즘과 어긋나 실패한다.
2. **`serverExternalPackages`는 번들 제어만 보장**: NFT 트레이싱 자체는 막지 않으므로 해시 디렉토리에 복사본이 그대로 들어감. 플랫폼 정합성 보장 도구가 아님.
3. **rsync `--exclude` 패턴은 leading `/`로 앵커링**: 앵커 없는 패턴은 어느 깊이의 동명 디렉토리도 보호/제외 대상이 됨. 프로덕션 자산(`data/`, `logs/`, `.env`) 보호 시 특히 주의.
4. **`--delete-excluded`는 find preserve와 충돌 가능**: rsync의 `--delete-excluded`는 source에 없는 파일을 target에서 삭제 → `find ... ! -name X` 방식의 preserve 의도를 파기함. helper 파일 보존은 임시 디렉토리 save/restore 패턴으로 해결.
5. **Defense-in-depth**: L2(정상 경로, 플랫폼 정합) + L1(안전망, 자가치유)로 계층화하면 실수 경로에서도 무중단. L1은 L2 happy path에서는 "이미 동일 inode" 메시지만 출력하는 no-op가 되어 비용이 없다.

## 관련 파일

- `scripts/wsl-build-deploy.sh` (신규, L2)
- `standalone/install-native-linux.sh` (자가치유 블록 + `-ef` inode 체크, L1)
- `scripts/pack-standalone.sh` (helper save/restore + nested exclude + mkdir 멱등)
- 관련 세션 50 CK: [`2026-04-19-nextjs-standalone-output-misunderstanding.md`](./2026-04-19-nextjs-standalone-output-misunderstanding.md) — standalone 오해 정정
- 커밋: `9a37dfb feat(deploy): WSL 빌드 파이프라인 + NFT 네이티브 모듈 정합성 보장`
