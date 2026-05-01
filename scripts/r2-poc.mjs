// SP-032 PoC — R2 직접 동작 검증 (인증 게이트 우회)
// 실행: cd ~/dev/ypserver-build && node scripts/r2-poc.mjs
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

const {
  R2_ACCOUNT_ID,
  R2_BUCKET,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error("R2 환경변수 누락");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const ts = Date.now();
const keys = [];
const out = [];

async function step(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const dt = Date.now() - t0;
    out.push({ label, ms: dt, ok: true });
    console.log(`  OK ${label}: ${dt}ms`);
    return r;
  } catch (e) {
    const dt = Date.now() - t0;
    out.push({ label, ms: dt, ok: false, err: e.message });
    console.error(`  FAIL ${label}: ${e.name} - ${e.message} (${dt}ms)`);
    throw e;
  }
}

console.log(`[PoC] account=${R2_ACCOUNT_ID.slice(0, 8)}... bucket=${R2_BUCKET}`);

const small = Buffer.alloc(1024 * 1024, 0x41);
const k1 = `poc/1mb-${ts}.bin`;
keys.push(k1);
await step("1MB PutObject", () =>
  client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: k1,
      Body: small,
      ContentType: "application/octet-stream",
    }),
  ),
);
const h1 = await step("1MB HeadObject", () =>
  client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: k1 })),
);
console.log(`    -> ContentLength=${h1.ContentLength}`);

const presignTimes = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `poc/presigned-${ts}-${i}`,
      ContentType: "application/octet-stream",
    }),
    { expiresIn: 300 },
  );
  presignTimes.push(Date.now() - t0);
}
const avg = presignTimes.reduce((a, b) => a + b, 0) / presignTimes.length;
console.log(
  `  OK presigned URL x5: avg=${avg.toFixed(1)}ms samples=${presignTimes.join(",")}`,
);
out.push({ label: "presigned avg", ms: avg, ok: true });

const k2 = `poc/presigned-actual-${ts}.bin`;
keys.push(k2);
const purl = await step("presigned URL 발급", () =>
  getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: k2,
      ContentType: "application/octet-stream",
    }),
    { expiresIn: 300 },
  ),
);
const fres = await step("presigned URL PUT (fetch)", () =>
  fetch(purl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: small,
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }),
);
console.log(`    -> status=${fres.status} etag=${fres.headers.get("etag")}`);

const big = Buffer.alloc(100 * 1024 * 1024, 0x42);
const k3 = `poc/100mb-${ts}.bin`;
keys.push(k3);
await step("100MB PutObject", () =>
  client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: k3,
      Body: big,
      ContentType: "application/octet-stream",
    }),
  ),
);
const h3 = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: k3 }));
console.log(`    -> 100MB ContentLength=${h3.ContentLength}`);

console.log(`[cleanup] ${keys.length} keys`);
for (const k of keys) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: k }));
  } catch {}
}

const pass = out.filter((r) => r.ok).length;
console.log(`\n[Result] ${pass}/${out.length} pass`);
for (const r of out) {
  console.log(
    `  ${r.ok ? "OK" : "FAIL"} ${r.label}: ${r.ms.toFixed?.(0) ?? r.ms}ms${
      r.err ? " " + r.err : ""
    }`,
  );
}
