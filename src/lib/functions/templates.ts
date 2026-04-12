/**
 * 세션 14 Cluster B: Edge Functions 샘플 템플릿
 * 프론트에서 템플릿 선택 시 코드 textarea에 복사한다.
 */

export interface FunctionTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const FUNCTION_TEMPLATES: FunctionTemplate[] = [
  {
    id: "hello-world",
    name: "Hello World",
    description: "입력을 받아 인사말을 반환하는 최소 예제",
    code: `// input 예시: { "name": "세계" }
async function run(input) {
  const name = (input && input.name) || "익명";
  console.log("hello", name);
  return { message: \`안녕하세요, \${name}!\`, ts: Date.now() };
}`,
  },
  {
    id: "fetch-github",
    name: "Fetch GitHub User",
    description: "api.github.com에서 공개 사용자 정보를 조회 (화이트리스트 필요)",
    code: `// input 예시: { "username": "vercel" }
async function run(input) {
  const username = (input && input.username) || "github";
  const res = await fetch(\`https://api.github.com/users/\${encodeURIComponent(username)}\`);
  if (!res.ok) {
    console.error("GitHub API 오류", res.status);
    return { error: "fetch_failed", status: res.status };
  }
  const data = await res.json();
  return { login: data.login, publicRepos: data.public_repos, followers: data.followers };
}`,
  },
  {
    id: "transform-json",
    name: "Transform JSON",
    description: "입력 JSON 배열을 변환/집계하는 순수 함수 예제",
    code: `// input 예시: { "items": [{"price": 1000}, {"price": 2000}] }
async function run(input) {
  const items = Array.isArray(input && input.items) ? input.items : [];
  const total = items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const avg = items.length > 0 ? total / items.length : 0;
  return { count: items.length, total, average: Math.round(avg) };
}`,
  },
];
