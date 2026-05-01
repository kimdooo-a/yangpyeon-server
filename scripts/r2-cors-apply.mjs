// R2 버킷 CORS 정책 적용 — 브라우저 직접 PUT 허용
// 실행: cd ~/dev/ypserver-build && node scripts/r2-cors-apply.mjs
//      또는 Windows: node scripts/r2-cors-apply.mjs (cwd 가 프로젝트 루트일 때)
//
// 정책:
//  - PUT (presigned 업로드), GET/HEAD (presigned 다운로드)
//  - origin: stylelucky4u.com + dev localhost
//  - 만료 1h preflight 캐시
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error("R2 환경변수 누락 (R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: [
        "https://stylelucky4u.com",
        "http://localhost:3000",
      ],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};

console.log(`[R2-CORS] 버킷: ${R2_BUCKET}`);
console.log(`[R2-CORS] origins: ${corsConfig.CORSRules[0].AllowedOrigins.join(", ")}`);

await client.send(new PutBucketCorsCommand({
  Bucket: R2_BUCKET,
  CORSConfiguration: corsConfig,
}));
console.log(`[R2-CORS] ✓ 적용 완료`);

// 검증 — 적용된 CORS 재조회
const verify = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
console.log(`[R2-CORS] 검증 — 현재 적용된 정책:`);
console.log(JSON.stringify(verify.CORSRules, null, 2));
