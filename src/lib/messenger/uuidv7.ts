/**
 * UUIDv7 generator (RFC 9562 §5.7) — clientGeneratedId for messenger.
 *
 * 구조:
 *   - bits 0..47   = unix_ts_ms (48 bits) — 시간 정렬 가능
 *   - bits 48..51  = version (4 bits = 0x7)
 *   - bits 52..63  = rand_a 또는 sub_ms_counter (12 bits) — 같은 ms 단조 증가용
 *   - bits 64..65  = variant (2 bits = 0b10)
 *   - bits 66..127 = rand_b (62 bits) — randomness
 *
 * 같은 ms 안에서도 단조 증가 보장: rand_a 를 carry-over counter 로 사용 +
 * counter overflow 시 ms 1 증가 (모노토닉 clock skew 처리 RFC §6.2 method 1).
 *
 * crypto.getRandomValues 는 Node 19+ / 모든 모던 브라우저 native.
 */

let lastMs = 0;
let lastCounter = 0;

const MAX_COUNTER = 0xfff; // 12-bit

function getRandomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(b: number, len: number): string {
  return b.toString(16).padStart(len, "0");
}

export function uuidv7(): string {
  let ms = Date.now();
  if (ms <= lastMs) {
    // 같은 ms 또는 시계 역행 — counter 증가
    ms = lastMs;
    lastCounter += 1;
    if (lastCounter > MAX_COUNTER) {
      // counter overflow — ms 강제 증가 (RFC §6.2 method 1)
      ms += 1;
      lastCounter = 0;
    }
  } else {
    // ms 증가 — counter 초기화 (random 1..MAX_COUNTER 로 jitter)
    lastCounter = getRandomBytes(2)[0] & 0xff; // 0..255 (단조성 여유)
  }
  lastMs = ms;
  const counter = lastCounter;

  // ts: 48-bit (12 hex chars). JS number 안전 정수 한계는 53-bit, 48-bit 안전.
  const tsHex = ms.toString(16).padStart(12, "0");

  // version 7 + counter 12-bit → 4 hex chars: "7" + counter(3 hex)
  const verCounterHex = "7" + toHex(counter, 3);

  // variant 2-bit + rand_b 62-bit → 16 hex chars
  const randB = getRandomBytes(8);
  // 첫 byte 의 top 2 bits 를 0b10 으로 set
  randB[0] = (randB[0] & 0x3f) | 0x80;
  const randBHex = Array.from(randB)
    .map((x) => toHex(x, 2))
    .join("");

  // 8-4-4-4-12 포맷
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8, 12),
    verCounterHex,
    randBHex.slice(0, 4),
    randBHex.slice(4, 16),
  ].join("-");
}
