// SP-017 — node:crypto AES-256-GCM envelope 검증
// 3 테스트: IV 유일성 (1M 샘플) / tamper 탐지 / KEK 회전 성능
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const KEK = randomBytes(32);

function ivUniquenessTest() {
  const seen = new Set<string>();
  let collisions = 0;
  for (let i = 0; i < 1_000_000; i++) {
    const iv = randomBytes(12).toString('hex');
    if (seen.has(iv)) collisions++;
    seen.add(iv);
  }
  console.log(JSON.stringify({ test: 'iv_uniqueness', count: 1_000_000, collisions, pass: collisions === 0 }));
}

function tamperDetectionTest() {
  const plaintext = Buffer.from('sensitive secret');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEK, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const tampered = Buffer.from(encrypted);
  tampered[0] ^= 0x01;

  try {
    const decipher = createDecipheriv('aes-256-gcm', KEK, iv);
    decipher.setAuthTag(tag);
    decipher.update(tampered);
    decipher.final();
    console.log(JSON.stringify({ test: 'tamper_detection', pass: false, reason: 'no throw' }));
  } catch (e: any) {
    console.log(JSON.stringify({ test: 'tamper_detection', pass: true, message: e.message }));
  }
}

function rotationPerformanceTest() {
  const COUNT = 100;
  const dek = randomBytes(32);
  const entries: Array<{ iv: Buffer; ct: Buffer; tag: Buffer }> = [];

  for (let i = 0; i < COUNT; i++) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', KEK, iv);
    const ct = Buffer.concat([c.update(dek), c.final()]);
    entries.push({ iv, ct, tag: c.getAuthTag() });
  }

  const NEW_KEK = randomBytes(32);
  const start = performance.now();
  entries.map(({ iv, ct, tag }) => {
    const d = createDecipheriv('aes-256-gcm', KEK, iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(ct), d.final()]);
    const newIv = randomBytes(12);
    const e = createCipheriv('aes-256-gcm', NEW_KEK, newIv);
    return { iv: newIv, ct: Buffer.concat([e.update(plain), e.final()]), tag: e.getAuthTag() };
  });
  const elapsed = performance.now() - start;
  console.log(JSON.stringify({ test: 'rotation_performance', count: COUNT, elapsed_ms: Number(elapsed.toFixed(2)), pass: elapsed < 500 }));
}

ivUniquenessTest();
tamperDetectionTest();
rotationPerformanceTest();
