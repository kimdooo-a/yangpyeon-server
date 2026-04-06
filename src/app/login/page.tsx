"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconServer } from "@/components/ui/icons";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "로그인 실패");
      }
    } catch {
      setError("서버 연결 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 그라데이션 효과 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand/3 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-brand/2 rounded-full blur-3xl" />

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-surface-200 border border-border rounded-lg p-8">
          {/* 로고 */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-1">
              <IconServer className="text-brand" size={32} />
              <h1 className="text-2xl font-bold text-brand">양평 부엌</h1>
            </div>
            <p className="text-gray-500 text-sm mt-2">서버 대시보드</p>
          </div>

          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm text-gray-400 mb-1.5"
              >
                비밀번호
              </label>
              <div className="relative">
                {/* 자물쇠 아이콘 */}
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 bg-surface-300 border border-border rounded-md text-gray-200 placeholder-gray-600 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  placeholder="비밀번호를 입력하세요"
                  autoFocus
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand hover:bg-brand-dark active:scale-[0.98] text-black font-medium rounded-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  {/* 로딩 스피너 */}
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  로그인 중...
                </span>
              ) : (
                "로그인"
              )}
            </button>
          </form>

          {/* 하단 버전 정보 */}
          <div className="text-xs text-gray-600 text-center mt-6 pt-4 border-t border-border">
            양평 부엌 서버 v0.1.0
          </div>
        </div>
      </div>
    </div>
  );
}
