# 04. jose 자체 JWKS vs 외부 KMS/Vault JWKS — 1:1 비교

> **Wave 2 / 12-observability / 1:1 비교 (Agent F)**
> 작성일: 2026-04-18 · 프로젝트: 양평 부엌 서버 대시보드
>
> **Wave 1 필수 참조**
> - `02-jose-jwks-rotation-deep-dive.md` (권고도 0.88)
> - `01-pgsodium-vs-node-crypto-vault-deep-dive.md` (Vault 맥락)
> - `03-observability-matrix.md` (Wave 2 동시 산출 — 5 후보 매트릭스)
>
> **결론 요약**: 우리 시나리오에서 **jose 자체 JWKS 채택**의 결정적 근거는 (1) 서명 속도 100배 우위, (2) $0 비용, (3) Cloudflare Tunnel + Node 20 표준으로 외부 의존 0, (4) 1인 운영 + 단일 호스트에서 외부 KMS의 "키 분리" 이점이 실질 가치 없음이다. 재고 트리거는 **상장 전 보안 감사** 또는 **FIPS 140-2 인증 요구** 단 두 가지.

---

## 0. 한 장 요약

| 축 | 자체 JWKS (jose) | AWS KMS | HashiCorp Vault (transit) |
|----|:---:|:---:|:---:|
| JWKS endpoint | `/api/.well-known/jwks.json` (Next.js) | 자체 구현 (`GetPublicKey` 프록시) | `/v1/identity/oidc/.well-known/keys` |
| 서명 위치 | Node 인프로세스 (jose) | AWS 네트워크 왕복 (KMS Sign) | Vault 네트워크 왕복 |
| 서명 p50 | **0.15ms** | 15~30ms | 3~5ms |
| 월 비용 | **$0** | $1/키/월 + req $0.03/10000 | $0 (OSS self-host) ~ $22 (Cloud) |
| HSM/FIPS 140-2 | ❌ | ✅ | ✅ (유료) |
| 키 회전 | 스크립트 + DB 상태 머신 | CloudFormation/자동 연간 | Vault 정책 |
| 장애 격리 | Next.js만 살면 OK | **AWS 장애 시 로그인 불가** | **Vault 장애 시 로그인 불가** |
| Cloudflare Tunnel 의존 | 없음 | 아웃바운드 필요 | 아웃바운드 필요 |
| 오프라인 복구 | ✅ | ❌ | △ |
| 1인 운영 친화 | ★★★★★ | ★★★☆☆ | ★★☆☆☆ |
| **우리 가중 적합도** | **★★★★★ 채택** | ★★★☆☆ 재고 대기 | ★★★☆☆ 재고 대기 |

---

## 1. 1인 운영 가능성

### 1.1 운영자가 실제로 해야 할 일 (연간)

| 작업 | 자체 JWKS | AWS KMS | Vault |
|------|:---:|:---:|:---:|
| 초기 셋업 | 4h (스크립트+테스트) | 8h (IAM+Customer Master Key+정책) | 16h (cluster+seal+audit) |
| 정기 회전 (2회/년) | 30분 (UI 버튼) | 2h (정책 갱신+CloudFormation) | 1h (Vault rotate) |
| 긴급 회전 | 15분 (grace 0 스크립트) | 30분 (IAM 정책 재배포) | 20분 |
| Node 20 → 22 마이그레이션 | 1h (jose 회귀 테스트) | 0h | 0h |
| AWS SDK 메이저 업그레이드 | 0h | 4h (v3 SDK API 변경) | 0h |
| Vault 메이저 업그레이드 | 0h | 0h | 8h (1.x → 2.x plan) |
| 장애 대응 평균 | 1h (Next.js 로그) | 3h (CloudTrail trace + IAM) | 4h (Vault audit device) |
| 백업/복구 훈련 (분기) | 1h | 0h (AWS 관리) | 3h (Raft snapshot) |
| **연간 총합** | **~9h** | ~22h | ~36h |

### 1.2 운영자 인지 부하

- **자체 JWKS**: TS 코드 + Prisma 모델 = **1개 모델**
- **AWS KMS**: TS + IAM 정책 + CMK 별칭 + CloudTrail + 리전 = **5개 모델**
- **Vault**: TS + Vault policy + audit backend + Raft + seal/unseal = **5개 모델**

1인 운영에서 **모델 수가 운영자 뇌의 주요 제약**이며, 장애 발생 시 "어디를 먼저 볼지" 결정 속도가 MTTR을 결정한다.

### 1.3 평가

| 축 | jose | KMS | Vault |
|----|:---:|:---:|:---:|
| 1인 운영 친화도 | ★★★★★ | ★★★☆☆ | ★★☆☆☆ |

---

## 2. 비용 — $0 vs 월 과금

### 2.1 AWS KMS 예상 비용 (ap-northeast-2, 서울)

가정: 활성 KID 1개 + grace 1개 = 2개 KMS keys

| 항목 | 단가 | 월 볼륨 | 월 비용 |
|------|-----|--------|--------|
| Customer Master Key | $1/key/월 | 2 keys | $2 |
| GetPublicKey 호출 | $0.03 / 10,000 | ~50,000 (5분 캐시 기준 모든 앱 인스턴스) | $0.15 |
| Sign 호출 (로그인 시) | $0.03 / 10,000 | ~3,000 (하루 100 로그인 × 30일) | $0.01 |
| Verify (off-platform local) | 비용 없음 | — | $0 |
| Data Transfer | 최소 | — | <$0.01 |
| **월 합계** | | | **~$2.20** |

**연간**: ~$27, 3년 누적 **~$80**.

### 2.2 HashiCorp Vault 예상 비용

- **OSS self-host**: $0 + 인프라 비용 (전력 ~$1~3/월 근사)
- **Vault Cloud (starter)**: $0.03/hour/node × 720h = **$21.6/월**
- **BSL 1.1 라이선스**: 상용 경쟁 금지 조항, 우리 프로젝트 무관

### 2.3 jose 자체

**$0 영구**.

### 2.4 예산 제약과의 정렬

- 프로젝트 제약: **$0~5/월**
- 자체 JWKS: ✅ 완벽
- AWS KMS: $2.2/월, **예산 내**지만 다른 카테고리($0 유지)를 더 압박
- Vault Cloud: $21.6/월, **예산 초과**

### 2.5 평가

| 축 | jose | KMS | Vault Cloud | Vault OSS |
|----|:---:|:---:|:---:|:---:|
| 비용 적합도 | ★★★★★ | ★★★★☆ | ★★☆☆☆ | ★★★★☆ |

---

## 3. 키 회전 자동화

### 3.1 자체 JWKS — 완전 제어

```typescript
// scripts/jwks-rotate.ts — 통합 회전 스크립트
import { prisma } from '@/lib/prisma';
import { generateKeyPair, exportJWK } from 'jose';
import { createSecret } from '@/lib/vault/repository';

async function rotate(graceDays = 14) {
  const now = new Date();

  // 1. 새 키 생성
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const pubJwk = { ...(await exportJWK(publicKey)), alg: 'ES256', use: 'sig' };
  const privJwk = await exportJWK(privateKey);
  const kid = `kek_v${Date.now()}`;
  pubJwk.kid = kid;

  // 2. private → Vault
  const secret = await createSecret(`jwt_signing_key_${kid}`, JSON.stringify(privJwk), 'system');

  // 3. DB 상태 머신
  await prisma.$transaction([
    prisma.jwksKey.create({ data: { kid, alg: 'ES256', publicJwk: pubJwk as any, privateRef: secret.id, status: 'PENDING' } }),
    prisma.jwksKey.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: now, expiresAt: new Date(now.getTime() + graceDays * 86400_000) } }),
    prisma.jwksKey.update({ where: { kid }, data: { status: 'ACTIVE', activatedAt: now } }),
  ]);

  // 4. JWKS 캐시 무효화
  await fetch('https://stylelucky4u.com/api/admin/revalidate-jwks', { method: 'POST' });
  console.log(`회전 완료: ${kid}, grace ${graceDays}일`);
}
rotate(parseInt(process.argv[2] ?? '14', 10));
```

### 3.2 AWS KMS — 두 단계 (키 + 정책)

```typescript
// AWS KMS 기반 회전 (의사코드)
import { KMSClient, CreateKeyCommand, CreateAliasCommand, UpdateAliasCommand, ScheduleKeyDeletionCommand } from '@aws-sdk/client-kms';

async function rotateKms() {
  const kms = new KMSClient({ region: 'ap-northeast-2' });

  // 1. 새 key 생성 (ECDSA P-256)
  const { KeyMetadata } = await kms.send(new CreateKeyCommand({
    KeyUsage: 'SIGN_VERIFY',
    KeySpec: 'ECC_NIST_P256',
    Description: 'JWT signing key',
  }));
  const newKeyId = KeyMetadata!.KeyId!;
  const newKid = `kek_v${Date.now()}`;

  // 2. alias 업데이트 (active/retired)
  await kms.send(new CreateAliasCommand({
    AliasName: `alias/ypb-jwt-${newKid}`,
    TargetKeyId: newKeyId,
  }));
  await kms.send(new UpdateAliasCommand({
    AliasName: 'alias/ypb-jwt-active',
    TargetKeyId: newKeyId,
  }));

  // 3. DB 상태 머신 (자체 JWKS와 동일)
  // 기존 키는 retired로, 14일 후 ScheduleKeyDeletion(PendingWindowInDays=14)
}
```

복잡도: alias + lifecycle 관리 2중. 자체 JWKS 대비 코드 2배.

### 3.3 HashiCorp Vault

```bash
# Vault 회전
vault write -f transit/keys/ypb-jwt/rotate

# 새 버전이 자동으로 "latest"
# 이전 버전은 min_decryption_version 까지 유지
vault write transit/keys/ypb-jwt/config \
  min_decryption_version=2 \
  min_encryption_version=3
```

복잡도: Vault CLI + 정책 업데이트. 간결하지만 Vault 운영 학습 곡선이 전제.

### 3.4 자동화 수준

| 축 | jose | KMS | Vault |
|----|:---:|:---:|:---:|
| 단일 스크립트로 완결 | ✅ | △ (IAM 별도) | ✅ (vault CLI) |
| grace period 제어 | ✅ (DB 컬럼) | △ (ScheduleKeyDeletion 14일 최소) | ✅ (min_*) |
| 롤백 용이 | ✅ | △ | ✅ |
| 1회 테스트 범위 | jose + Prisma | KMS + IAM + Prisma | Vault + Prisma |

---

## 4. 감사 로그

### 4.1 자체 JWKS — AuditLog 테이블

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?  @map("actor_id")
  action     String                       // "jwks.create" | "jwks.activate" | "jwt.sign" | "jwks.rotate"
  resource   String                       // "kid:kek_v1234567890"
  metadata   Json?
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now())    @map("created_at")

  @@index([action, createdAt])
  @@map("audit_log")
}
```

- 기록 시점: `sign()`, `generateKeyPair()`, 회전 스크립트
- 조회: `/logs` 페이지 (14b에서 SSE 노출 완료)
- 보관 기간: DQ-12.8로 결정 (현 잠정 1년)

### 4.2 AWS KMS — CloudTrail

- 모든 KMS API 호출 자동 기록 (`CreateKey`, `Sign`, `Verify`, `GetPublicKey` 등)
- 보관: CloudTrail 기본 90일, S3 연동으로 영구
- 조회: CloudTrail Console 또는 Athena 쿼리
- **무료 티어**: management events 90일 + $2.00/100,000 events

### 4.3 HashiCorp Vault — Audit Backend

```bash
vault audit enable file file_path=/var/log/vault_audit.log
```

- 모든 요청 JSON 라인으로 기록
- `secret_id_accessor` 등 세부 필드 포함
- 보관: 파일 로테이션 수동 (logrotate) 또는 syslog 연동

### 4.4 비교

| 축 | 자체 AuditLog | CloudTrail | Vault Audit |
|----|:---:|:---:|:---:|
| 자동성 | 코드에 기록 삽입 필요 | 자동 (API 레벨) | 자동 |
| 무결성 보장 | 앱 DB 의존 | AWS 관리 (tamper proof) | append-only 파일 |
| 감사 증빙 | 자체 증언 | AWS 공식 (법정 신뢰) | 자체 증언 |
| 1인 운영 검증 | `/logs` UI 보기 | Console UI | logtail 필요 |

**우리 평가**: 자체 AuditLog는 **외부 감사자 앞에서 약점** (앱이 로그를 쓸 수도, 안 쓸 수도 있음). 그러나 현 시점 우리는 외부 감사 의무가 없으므로 실질 가치 차이 0.

---

## 5. 장애 격리 & 오프라인 복구

### 5.1 장애 시나리오

| 시나리오 | 자체 JWKS | AWS KMS | Vault |
|----------|:---:|:---:|:---:|
| Next.js 프로세스 죽음 | 로그인 불가 (PM2 재시작 자동) | 로그인 불가 | 로그인 불가 |
| PG 다운 | **로그인 불가** (JwksKey 조회 불능) | 로그인 불가 (같음) | 로그인 불가 (같음) |
| Cloudflare Tunnel 다운 | 외부 접근 전체 불가 | 외부 접근 전체 불가 + KMS 미도달 | 외부 접근 전체 불가 |
| AWS 리전 장애 (ap-northeast-2) | **무관** (자체 호스트) | **로그인 불가** (KMS Sign 실패) | 무관 (self-host) |
| Vault seal (autounsealer 장애) | 무관 | 무관 | **로그인 불가** (unseal 필요) |
| WSL2 호스트 재부팅 | 자동 복구 (PM2) | 자동 복구 | Vault unseal 수동 필요 가능성 |

### 5.2 오프라인 복구 시나리오

- **시나리오**: WSL2 호스트 SSD 교체 후 신규 머신에서 복구
- **자체 JWKS**:
  1. PG 백업 복원 (JwksKey 테이블)
  2. Vault의 SecretItem 복원 (암호화된 private JWK)
  3. MASTER_KEY 오프라인 복사본으로 `/etc/luckystyle4u/secrets.env` 복원
  4. PM2 start → 정상
  5. **소요**: ~30분, **인터넷 필요 없음**
- **AWS KMS**:
  1. PG 백업 복원
  2. KMS key는 AWS 쪽에 여전히 존재 (우리 인프라 변화와 무관)
  3. IAM credential 재주입
  4. **소요**: ~45분, **인터넷 필수**
- **Vault**:
  1. PG 백업 복원
  2. Vault Raft snapshot 복원
  3. unseal 키 조합 복구
  4. **소요**: ~1~2시간

### 5.3 평가

| 축 | jose | KMS | Vault |
|----|:---:|:---:|:---:|
| 장애 격리 | ★★★★★ | ★★★☆☆ | ★★★☆☆ |
| 오프라인 복구 | ★★★★★ | ★☆☆☆☆ | ★★★☆☆ |

---

## 6. Cloudflare Tunnel 의존성

### 6.1 현 아키텍처

- 외부 트래픽: Cloudflare → Tunnel → WSL2 Next.js
- **아웃바운드**: WSL2 → 인터넷 (자유, 그러나 홈 ISP 품질 의존)

### 6.2 아웃바운드 트래픽 요구

| 방식 | 아웃바운드 필요? | 실패 시 영향 |
|------|:---:|------|
| 자체 JWKS | ❌ | 없음 (PG + jose만 사용) |
| AWS KMS | ✅ | KMS 미도달 → 로그인 실패 |
| Vault (원격) | ✅ | Vault 미도달 → 로그인 실패 |
| Vault (localhost) | ❌ | 없음 (동일 호스트) |

### 6.3 홈 ISP 품질 고려

가정용 인터넷에서 ap-northeast-2 KMS까지 왕복 **15~30ms, 분산 대** → 로그인 p99가 50ms+ 스파이크 발생 가능.

---

## 7. 코드 비교 (1) — JWKS 엔드포인트 구현

### 7.1 jose 자체 JWKS

```typescript
// app/api/.well-known/jwks.json/route.ts
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

const getJWKS = unstable_cache(
  async () => {
    const keys = await prisma.jwksKey.findMany({
      where: { status: { in: ['ACTIVE', 'RETIRED'] } },
      select: { publicJwk: true },
      orderBy: { createdAt: 'desc' },
    });
    return { keys: keys.map(k => k.publicJwk) };
  },
  ['jwks'],
  { revalidate: 60, tags: ['jwks'] },
);

export async function GET() {
  const jwks = await getJWKS();
  return Response.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Type': 'application/jwk-set+json',
    },
  });
}
```

**코드 LOC**: 24줄. **의존**: Prisma, next/cache, jose는 export만 관련.

### 7.2 AWS KMS — GetPublicKey 프록시

```typescript
// app/api/.well-known/jwks.json/route.ts (KMS 버전)
import { KMSClient, GetPublicKeyCommand, ListAliasesCommand } from '@aws-sdk/client-kms';
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import { importSPKI, exportJWK } from 'jose';

const kms = new KMSClient({ region: 'ap-northeast-2' });

const getJWKS = unstable_cache(
  async () => {
    // 1. DB에서 활성 KID 목록 조회
    const keys = await prisma.jwksKey.findMany({
      where: { status: { in: ['ACTIVE', 'RETIRED'] } },
      select: { kid: true, kmsKeyId: true },
    });

    // 2. 각 KID별로 KMS에서 public key fetch (병렬)
    const jwks = await Promise.all(keys.map(async (k) => {
      const resp = await kms.send(new GetPublicKeyCommand({ KeyId: k.kmsKeyId }));
      // KMS는 DER 포맷 → PEM 래핑 → SPKI import
      const derBytes = resp.PublicKey!;
      const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(derBytes).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
      const publicKey = await importSPKI(pem, 'ES256');
      const jwk = await exportJWK(publicKey);
      return { ...jwk, kid: k.kid, alg: 'ES256', use: 'sig' };
    }));

    return { keys: jwks };
  },
  ['jwks-kms'],
  { revalidate: 300, tags: ['jwks'] },
);

export async function GET() {
  const jwks = await getJWKS();
  return Response.json(jwks, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
```

**코드 LOC**: 38줄. **의존**: `@aws-sdk/client-kms` (~8MB node_modules), IAM 정책, 네트워크 왕복.

### 7.3 차이

| 항목 | jose | KMS 프록시 |
|------|:---:|:---:|
| LOC | 24 | 38 (+58%) |
| 외부 API 왕복 | 0 | N회 (KID 수만큼) |
| Cache miss 시 latency | 5~10ms | 50~150ms (N × 15~30ms) |
| AWS SDK 추가 node_modules | 0 | ~8MB |
| IAM 정책 관리 | 불필요 | 필요 (`kms:GetPublicKey`) |
| 로컬 dev | 자동 | aws-sdk-mock 필요 |

---

## 8. 코드 비교 (2) — 키 회전 배포

### 8.1 jose — 파일 교체/스크립트

```bash
# 한 번의 npm script 실행
npm run jwks:rotate -- 14

# 내부 동작 (섹션 3.1 스크립트):
# 1. generateKeyPair('ES256')
# 2. private → Vault (node:crypto envelope)
# 3. JwksKey 테이블 상태 전환
# 4. revalidateTag('jwks')
```

운영자 체크리스트:
- [ ] 테스트 환경에서 `npm run jwks:rotate -- 14` 실행
- [ ] `/api/.well-known/jwks.json`에 새 kid 포함 확인
- [ ] `/settings/api-keys` 페이지에서 ACTIVE/RETIRED 상태 확인
- [ ] 기존 토큰으로 로그인 유지 확인 (14일 grace)
- [ ] 프로덕션에 동일 스크립트 실행

**총 시간**: 15분.

### 8.2 AWS KMS — CreateKey + alias 전환 + IAM 재배포

```bash
# 1. CreateKey (Terraform 또는 CloudFormation)
terraform apply -target=aws_kms_key.ypb_jwt_v3

# 2. alias 업데이트
aws kms update-alias --alias-name alias/ypb-jwt-active --target-key-id <new-key-id>

# 3. IAM 정책 업데이트 (앱 role이 새 key에 Sign 가능해야)
terraform apply -target=aws_iam_policy.ypb_app

# 4. 앱 재기동 (KMS 클라이언트 캐시 초기화)
pm2 reload ypb-web

# 5. JwksKey 테이블 상태 전환 (DB 수동 SQL)
psql -c "UPDATE jwks_key SET status='RETIRED' WHERE status='ACTIVE'"
psql -c "INSERT INTO jwks_key ... VALUES ('kek_v3', 'ACTIVE', ...)"
```

운영자 체크리스트:
- [ ] Terraform plan/apply × 2
- [ ] KMS alias 확인
- [ ] IAM 정책 확인
- [ ] 앱 재기동
- [ ] DB SQL 실행
- [ ] JWKS 응답 확인
- [ ] 14일 후 `ScheduleKeyDeletion` 실행

**총 시간**: 60~90분. **문서화 필수**.

### 8.3 비교

| 항목 | jose | KMS |
|------|:---:|:---:|
| 회전 수행 시간 | 15분 | 60~90분 |
| 실수 확률 (여러 시스템 수정) | 낮음 | 중 |
| 자동화 가능성 | ✅ (npm script) | △ (Terraform + IAM + DB) |
| 롤백 경로 | DB UPDATE 1개 | Terraform destroy + alias 복구 + DB |

---

## 9. 10차원 가중 스코어

| 차원 | 가중 | **jose 자체** | AWS KMS | Vault OSS | Vault Cloud |
|------|:---:|:---:|:---:|:---:|:---:|
| FUNC | 18 | 4.5 × 18/5 = 16.20 | 4.2 × 18/5 = 15.12 | 4.6 × 18/5 = 16.56 | 4.6 × 18/5 = 16.56 |
| PERF | 10 | **4.9 × 10/5 = 9.80** | 3.5 × 10/5 = 7.00 | 4.0 × 10/5 = 8.00 | 3.8 × 10/5 = 7.60 |
| DX | 14 | **4.5 × 14/5 = 12.60** | 3.8 × 14/5 = 10.64 | 3.5 × 14/5 = 9.80 | 3.5 × 14/5 = 9.80 |
| ECO | 12 | 5.0 × 12/5 = 12.00 | 5.0 × 12/5 = 12.00 | 5.0 × 12/5 = 12.00 | 5.0 × 12/5 = 12.00 |
| LIC | 8 | **5.0 × 8/5 = 8.00** | 3.0 × 8/5 = 4.80 | 4.0 × 8/5 = 6.40 | 4.0 × 8/5 = 6.40 |
| MAINT | 10 | **4.9 × 10/5 = 9.80** | 4.0 × 10/5 = 8.00 | 2.8 × 10/5 = 5.60 | 2.8 × 10/5 = 5.60 |
| INTEG | 10 | **4.9 × 10/5 = 9.80** | 3.8 × 10/5 = 7.60 | 3.5 × 10/5 = 7.00 | 3.5 × 10/5 = 7.00 |
| SECURITY | 10 | 4.0 × 10/5 = 8.00 | 4.5 × 10/5 = 9.00 | 4.5 × 10/5 = 9.00 | 4.5 × 10/5 = 9.00 |
| SELF_HOST | 5 | **5.0 × 5/5 = 5.00** | 3.0 × 5/5 = 3.00 | 3.5 × 5/5 = 3.50 | 2.5 × 5/5 = 2.50 |
| COST | 3 | **5.0 × 3/5 = 3.00** | 4.5 × 3/5 = 2.70 | 4.5 × 3/5 = 2.70 | 2.5 × 3/5 = 1.50 |
| **합계 (/100)** | 100 | **94.20** | 79.86 | 80.56 | 77.96 |

### 9.1 해석

- **jose 자체 94.20** — 7개 축에서 최고 (PERF/DX/LIC/MAINT/INTEG/SELF_HOST/COST)
- **SECURITY만 -0.5점** (HSM 부재) — 그러나 우리 시나리오에서 HSM 요구사항 없음
- **가중 차이 15점 이상** — 매트릭스 전체 관점에서도 자체 JWKS 압도

---

## 10. 외부 KMS 재고 조건 (정량 트리거)

다음 조건 **하나 이상** 충족 시 외부 KMS/Vault 재검토:

| # | 트리거 | 측정 방법 | 임계값 |
|---|-------|---------|-------|
| TK-1 | **상장/M&A 전 보안 감사** | 외부 감사자 KO (또는 투자자 DD) | 개시 시점 즉시 |
| TK-2 | **FIPS 140-2 또는 ISO 27001 인증 요구** | 고객/파트너 계약서 명시 | 요구 발생 시 |
| TK-3 | CloudTrail급 API-레벨 감사 증빙 필수 | 규제 기관 요구 | 요구 발생 시 |
| TK-4 | 팀 규모 ≥ 5명 + 다중 환경(dev/staging/prod) | 인력 + 배포 환경 | 둘 다 충족 |
| TK-5 | 비 WSL2 프로덕션(AWS/GCP 이주) | 인프라 변경 PR | 머지 시점 |
| TK-6 | 다중 리전/AZ 복제 필요 | RTO/RPO 요구 | RTO < 15분 |

### 10.1 현 시점 상태 (2026-04)

- TK-1~6 모두 미충족
- **따라서 jose 자체 JWKS 유지**
- 다음 재평가 시점: **1년 후** 또는 위 트리거 발생 시

### 10.2 재고 시 마이그레이션 비용 (사전 추정)

**jose → AWS KMS 이행**:
1. KMS CreateKey (Terraform 작성): 2h
2. `/api/.well-known/jwks.json` route KMS 프록시 전환: 3h
3. `SignJWT` → `KMS Sign` 전환 (login route, refresh route): 3h
4. Vault의 private JWK 백업 후 삭제: 1h
5. IAM 정책 작성 + 테스트: 2h
6. staging 검증: 4h
7. 프로덕션 cutover + 모니터링: 4h
- **총 ~19시간 (3~4세션)**

**jose → Vault 이행**: 더 큼 (~40시간).

### 10.3 이행 경로의 가역성

- KMS로 이주 후 다시 jose로 복귀 가능: public key JWK 덤프 + DB 컬럼 추가로 지원
- **잠금(lock-in) 없음** — 재고 결정 지연 비용 0

---

## 11. 현재 아키텍처 구조 확정

### 11.1 Data Model

```prisma
model JwksKey {
  kid          String   @id
  alg          String   @default("ES256")
  publicJwk    Json
  privateRef   String   // SecretItem.id (Vault)
  createdAt    DateTime @default(now())
  activatedAt  DateTime?
  retiredAt    DateTime?
  expiresAt    DateTime?
  status       JwksStatus @default(PENDING)

  @@index([status, expiresAt])
  @@map("jwks_key")
}

enum JwksStatus { PENDING  ACTIVE  RETIRED  EXPIRED }
```

### 11.2 Sign 경로 (login)

```typescript
// app/api/auth/login/route.ts
import { SignJWT, importJWK } from 'jose';
import { prisma } from '@/lib/prisma';
import { readSecret } from '@/lib/vault/repository';

export async function POST(req: Request) {
  // ...credential 검증...

  const active = await prisma.jwksKey.findFirstOrThrow({
    where: { status: 'ACTIVE' },
    orderBy: { activatedAt: 'desc' },
  });

  const privJwkJson = await readSecret(active.privateRef, 'system');
  const privateKey = await importJWK(JSON.parse(privJwkJson.value), 'ES256');

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'ES256', kid: active.kid, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('https://stylelucky4u.com')
    .setAudience('https://stylelucky4u.com')
    .setExpirationTime('15m')
    .sign(privateKey);

  return Response.json({ token });
}
```

### 11.3 Verify 경로 (middleware)

```typescript
// middleware.ts
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://stylelucky4u.com/api/.well-known/jwks.json'), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('access_token')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://stylelucky4u.com',
      audience: 'https://stylelucky4u.com',
      algorithms: ['ES256'],
    });
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }
}
```

### 11.4 JWKS endpoint

(섹션 7.1 코드와 동일)

---

## 12. 리스크 레지스터

| ID | 리스크 | 확률 | 영향 | 완화 |
|----|--------|:---:|:---:|------|
| R-JWK-1 | jose 패키지 공급망 공격 | 저 | 고 | lockfile + npm audit 주 1회 + dependabot |
| R-JWK-2 | ES256 private key 노출 | 저 | 치명 | Vault envelope + 즉시 회전 경로 |
| R-JWK-3 | JWKS endpoint 장애 | 중 | 중 | Cloudflare 5분 캐시 + local 60초 캐시 |
| R-JWK-4 | Capacitor 앱 캐시된 JWKS로 회전 후 검증 실패 | 중 | 중 | 빌드 타임 inline + 주기 fetch 재시도 |
| R-JWK-5 | 회전 스크립트 버그 → PENDING 상태 누락 | 저 | 치명 | 회전 전 dry-run + Vitest 회귀 |
| R-JWK-6 | `kid` 없는 레거시 토큰 | 중 | 중 | 명시적 reject + 강제 재로그인 |
| R-JWK-7 | 외부 감사자 HSM 증빙 요구 (미래) | 저 | 중 | TK-1/TK-2 트리거 명시 |
| R-JWK-8 | alg confusion 공격 | 저 | 치명 | `algorithms: ['ES256']` 화이트리스트 |
| R-JWK-9 | jwks.json 응답 HTTP cache poisoning | 저 | 고 | Cloudflare signed headers + origin Cache-Control |
| R-JWK-10 | grace 14일 중 이전 키 남용 | 중 | 저 | 사고 시 긴급 회전(grace 0) |

---

## 13. 새 DQ

- **DQ-12.10**: JWKS endpoint를 Cloudflare Workers 앞단 캐시로 둘지 (P2 대기)
- **DQ-12.11**: Capacitor 빌드 시 JWKS inline 방식 (빌드 타임 fetch vs 런타임 첫 부트)
- **DQ-12.12**: grace period 14일이 실제 Capacitor 오프라인 내구성에 충분한가 (실측 필요)
- **DQ-12.13**: 긴급 회전 시 모든 기존 refresh_token 무효화 전략 (블랙리스트 vs 세션 버전)
- **DQ-12.14**: JWKS endpoint의 응답 포맷을 Supabase 호환으로 맞출지 (`use`/`alg` 필드 세부 차이)

---

## 14. 참고자료 (15)

1. Wave 1 #02 — `02-jose-jwks-rotation-deep-dive.md`
2. Wave 1 #01 — `01-pgsodium-vs-node-crypto-vault-deep-dive.md`
3. Wave 2 매트릭스 — `03-observability-matrix.md`
4. jose docs — https://github.com/panva/jose
5. RFC 7517 (JWK) — https://datatracker.ietf.org/doc/html/rfc7517
6. RFC 7519 (JWT) — https://datatracker.ietf.org/doc/html/rfc7519
7. RFC 8615 (.well-known) — https://datatracker.ietf.org/doc/html/rfc8615
8. AWS KMS Developer Guide — https://docs.aws.amazon.com/kms/latest/developerguide/
9. AWS KMS Sign/Verify — https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
10. HashiCorp Vault transit engine — https://developer.hashicorp.com/vault/docs/secrets/transit
11. HashiCorp Vault OIDC provider — https://developer.hashicorp.com/vault/docs/secrets/identity/oidc-provider
12. OWASP JWT Cheat Sheet 2025
13. NIST FIPS 186-5 (ECDSA P-256)
14. Apple Sign In JWKS — https://appleid.apple.com/auth/keys
15. Cloudflare Tunnel 아웃바운드 정책 — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

---

## 15. 최종 권고

### 15.1 결정적 근거 (요약)

**jose 자체 JWKS 채택**:

1. **서명 속도 100배 우위** (0.15ms vs 15~30ms) — 로그인/refresh의 p99 체감 향상
2. **비용 $0 영구** — $0~5/월 제약과 정합, 다른 카테고리 예산 보존
3. **외부 의존 0** — Cloudflare Tunnel/AWS/Vault 중 어느 하나 장애가 로그인을 멈추지 않음
4. **오프라인 복구** — MASTER_KEY 파일 하나 + PG 백업만 있으면 인터넷 없이 복구
5. **1인 운영 친화** — 학습 모델 1개, 연간 유지 9시간 (KMS 22h/Vault 36h 대비)
6. **마이그레이션 비용 선형** — KMS/Vault로 이행 시 ~19h면 충분, **잠금 없음**

### 15.2 외부 KMS 재고 조건

§10의 TK-1~6 중 하나 이상 충족 시 재평가. **그 시점까지 `_CHECKPOINT_KDYWAVE.md`와 `_PROJECT_VS_SUPABASE_GAP.md`에 "jose 자체 JWKS, 재고 트리거 TK-1~6 잠금" 명시 유지**.

### 15.3 단일 진실 소스 (Single Source of Truth)

- 알고리즘: **ES256**
- 회전 주기: **90일 정기 + 사고 시 즉시**
- grace period: **14일**
- private key 저장소: Vault (node:crypto envelope, Wave 1 #01)
- public key 노출: `/api/.well-known/jwks.json`
- KID 형식: `kek_v{timestamp}`
- JWKS 캐시: Cloudflare 5분 + Next.js unstable_cache 60초 + middleware cooldownDuration 30초 + cacheMaxAge 10분

### 15.4 종합 스코어

jose 자체 JWKS = **94.20 / 100** — 10차원 가중 매트릭스가 추천하는 JWT 영역의 확정 답. AWS KMS(79.86) 대비 **+14.34점 우위**, 가장 큰 기여는 PERF/DX/MAINT/INTEG/SELF_HOST/COST 6개 축에서의 누적.
