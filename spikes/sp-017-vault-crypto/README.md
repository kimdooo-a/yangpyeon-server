# SP-017 Result — node:crypto AES-256-GCM Envelope

**Status:** PASS
**Date:** 2026-04-19 (S47)
**Environment:** Windows 11, Node.js v24.14.1, tsx v4.21.0
**Wave 근거:** `docs/research/2026-04-supabase-parity/05-roadmap/01-milestones-wbs.md §4.2` (16a Vault)

## Goal

Phase 16a (Vault envelope 암호화) 구현 전, `node:crypto` AES-256-GCM envelope 구조의 정확성·보안·성능을 사전 검증한다.

- KEK 고정, DEK 별 IV 랜덤 생성 전략
- GCM tag 변조 시 throw 보장
- 100 DEK 회전 (프로덕션 예상 규모) 성능 측정

## Results

### 1. IV 유일성 — PASS

- 샘플: `randomBytes(12)` 1,000,000 회 생성
- 충돌: **0건**
- 해석: GCM IV 재사용 catastrophic 시나리오 (같은 IV+KEK 에 다른 plaintext) 리스크 무시 가능. 12-byte (96-bit) IV 공간은 1M 샘플에서 생일 역설 충돌 확률이 약 5×10⁻¹³.

### 2. Tamper 탐지 — PASS

- 시나리오: encrypt → ciphertext 첫 byte XOR 0x01 → decrypt
- 결과: `Error: Unsupported state or unable to authenticate data` throw
- 해석: GCM authenticated encryption 이 복호화 단계에서 무결성 위반을 즉시 감지한다. Vault 의 "storage tampering 은 decrypt 시 항상 실패" 보안 전제 성립.

### 3. KEK 회전 성능 — PASS

- 시나리오: 100 DEK 엔트리 생성 후 new KEK 로 일괄 재암호화
- 측정: **1.18 ms** (목표 <500 ms)
- 해석: 실제 프로덕션 (예상 secret 수 10~50) 에서 KEK 회전 1회당 1ms 미만. Phase 16a `rotateKek(newKey, newVersion)` 동기 구현이 충분히 빠름 — async chunking 불필요.

## Decision

**GO** — Phase 16 plan 세션 48 Task 48-3 `VaultService.rotateKek` 를 **계획 그대로 (단일 for-loop 트랜잭션)** 구현한다.

### 구현 확정 사항

1. `createCipheriv('aes-256-gcm', masterKey, iv)` 에서 **iv 는 반드시 매 encrypt 마다 새로 생성** (`randomBytes(12)`). 저장/캐싱 금지.
2. `createDecipheriv` 전에 **반드시 `setAuthTag(tag)` 호출** 후 `update` → `final`. 순서 반대면 throw.
3. `rotateKek` 는 `prisma.$transaction` 으로 감싸 atomic 적용 (부분 회전 방지). 1.18ms × 트랜잭션 오버헤드 여유 충분.

### Non-goals (회피 확인)

- ❌ IV derivation (e.g. counter mode) — 랜덤으로 충분
- ❌ hardware acceleration (Intel AES-NI) 명시 분기 — Node `crypto` 기본 사용 (하드웨어 있으면 자동)
- ❌ Tag length 조정 — 기본 16 byte (128-bit) 사용

## Artifacts

- `experiment.ts` — 실행 파일
- 실행 명령: `npx tsx spikes/sp-017-vault-crypto/experiment.ts`
- 실행 결과 (3 JSON line):
  ```
  {"test":"iv_uniqueness","count":1000000,"collisions":0,"pass":true}
  {"test":"tamper_detection","pass":true,"message":"Unsupported state or unable to authenticate data"}
  {"test":"rotation_performance","count":100,"elapsed_ms":1.18,"pass":true}
  ```

## References

- NIST SP 800-38D (GCM 표준)
- Node.js crypto docs: https://nodejs.org/api/crypto.html#class-cipher
- Phase 16 spec: `docs/superpowers/specs/2026-04-19-phase-16-design.md` §4.2
- Phase 16 plan: `docs/superpowers/plans/2026-04-19-phase-16-plan.md` §세션 48
