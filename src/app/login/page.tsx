"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";

const STATUS_LINES = [
  "postgresql://localhost:5432 ··· connected",
  "cloudflare tunnel ··· active",
  "pm2 dashboard ··· online",
  "ssl certificate ··· valid",
  "api/v1 ··· ready",
];

function TypingLine({ text, delay }: { text: string; delay: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, 18);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);

  const isOk = done && (text.includes("connected") || text.includes("active") || text.includes("online") || text.includes("valid") || text.includes("ready"));

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] leading-relaxed">
      <span className="text-[#C5BFB3] select-none">$</span>
      <span className="text-[#A09A8E]">{displayed}</span>
      {!done && <span className="inline-block w-[5px] h-[13px] bg-[#2D9F6F] animate-[blink_1s_steps(1)_infinite]" />}
      {isOk && <span className="text-[#2D9F6F]">&#10003;</span>}
    </div>
  );
}

type MfaState =
  | { stage: "password" }
  | {
      stage: "challenge";
      challenge: string;
      methods: ("totp" | "recovery" | "passkey")[];
    };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mfa, setMfa] = useState<MfaState>({ stage: "password" });
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [activeMethod, setActiveMethod] = useState<"totp" | "recovery" | "passkey">(
    "totp",
  );
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  async function finalizeLogin(accessToken: string) {
    await fetch("/api/auth/login-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    router.push("/");
    router.refresh();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || "인증 실패");
        return;
      }

      if (data.data.mfaRequired) {
        setMfa({
          stage: "challenge",
          challenge: data.data.challenge,
          methods: data.data.methods,
        });
        // 우선 method 선택 (passkey > totp > recovery)
        if (data.data.methods.includes("passkey")) setActiveMethod("passkey");
        else if (data.data.methods.includes("totp")) setActiveMethod("totp");
        else setActiveMethod("recovery");
        return;
      }

      await finalizeLogin(data.data.accessToken);
    } catch {
      setError("서버 연결 오류");
    } finally {
      setLoading(false);
    }
  };

  async function submitTotpOrRecovery() {
    if (mfa.stage !== "challenge") return;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = { challenge: mfa.challenge };
      if (activeMethod === "totp") body.code = totpCode;
      else body.recoveryCode = recoveryCode;

      const res = await fetch("/api/v1/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || "MFA 검증 실패");
        return;
      }
      await finalizeLogin(data.data.accessToken);
    } catch {
      setError("서버 연결 오류");
    } finally {
      setLoading(false);
    }
  }

  async function submitPasskey() {
    if (mfa.stage !== "challenge") return;
    setLoading(true);
    setError("");
    try {
      const optsRes = await fetch("/api/v1/auth/mfa/webauthn/assert-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: mfa.challenge }),
      });
      const optsData = await optsRes.json();
      if (!optsRes.ok) {
        setError(optsData.error?.message || "Passkey 옵션 발급 실패");
        return;
      }

      const assertion = await startAuthentication(optsData.data.options);

      const verRes = await fetch("/api/v1/auth/mfa/webauthn/assert-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: mfa.challenge, response: assertion }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) {
        setError(verData.error?.message || "Passkey 검증 실패");
        return;
      }
      await finalizeLogin(verData.data.accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey 오류";
      setError(msg.includes("NotAllowed") ? "Passkey 인증이 취소되었습니다" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 도트 패턴 */}
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: "radial-gradient(circle, #D4CFC7 0.8px, transparent 0.8px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* 은은한 그린 글로우 */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#2D9F6F]/[0.04] blur-[120px]" />

      <div
        className={`w-full max-w-[420px] relative z-10 transition-all duration-1000 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* 터미널 스테이터스 */}
        <div
          className={`mb-6 pl-1 space-y-1 transition-opacity duration-1000 delay-300 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          {STATUS_LINES.map((line, i) => (
            <TypingLine key={i} text={line} delay={400 + i * 600} />
          ))}
        </div>

        {/* 카드 */}
        <div className="relative">
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-[#2D9F6F]/15 via-[#E2DDD4]/50 to-[#E2DDD4]/30" />

          <div className="relative bg-white rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.04)]">
            {/* 로고 */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#2D9F6F]/10 border border-[#2D9F6F]/15 mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2D9F6F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1A1815]">
                양평 부엌
              </h1>
              <p className="text-[#B5AFA6] text-xs mt-1.5 font-mono tracking-widest uppercase">
                Server Control Panel
              </p>
            </div>

            {/* 폼 */}
            {mfa.stage === "password" ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-[11px] font-mono text-[#A09A8E] uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-[#F8F6F1] border border-[#E2DDD4] rounded-xl text-sm text-[#1A1815] placeholder-[#C5BFB3] outline-none transition-all duration-200 focus:border-[#2D9F6F]/50 focus:shadow-[0_0_0_3px_rgba(45,159,111,0.08)]"
                    placeholder="admin@stylelucky4u.com"
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-[11px] font-mono text-[#A09A8E] uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-[#F8F6F1] border border-[#E2DDD4] rounded-xl text-sm text-[#1A1815] placeholder-[#C5BFB3] outline-none transition-all duration-200 focus:border-[#2D9F6F]/50 focus:shadow-[0_0_0_3px_rgba(45,159,111,0.08)]"
                    placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-[13px] text-[#D94F4F] bg-[#D94F4F]/5 border border-[#D94F4F]/10 rounded-xl px-4 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#2D9F6F] hover:bg-[#247F59] text-white font-semibold text-sm rounded-xl transition-all duration-200 disabled:opacity-40 active:scale-[0.98] shadow-[0_1px_2px_rgba(45,159,111,0.2)]"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      인증 중...
                    </span>
                  ) : (
                    "로그인"
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="text-[11px] font-mono text-[#A09A8E] uppercase tracking-wider">
                  2차 인증
                </div>

                {/* 방법 선택 탭 (passkey/totp/recovery) */}
                <div className="flex gap-1 p-1 bg-[#F8F6F1] rounded-xl">
                  {mfa.methods.includes("passkey") && (
                    <button
                      type="button"
                      onClick={() => setActiveMethod("passkey")}
                      className={`flex-1 py-2 text-xs rounded-lg transition ${
                        activeMethod === "passkey"
                          ? "bg-white text-[#1A1815] shadow-sm"
                          : "text-[#A09A8E]"
                      }`}
                    >
                      Passkey
                    </button>
                  )}
                  {mfa.methods.includes("totp") && (
                    <button
                      type="button"
                      onClick={() => setActiveMethod("totp")}
                      className={`flex-1 py-2 text-xs rounded-lg transition ${
                        activeMethod === "totp"
                          ? "bg-white text-[#1A1815] shadow-sm"
                          : "text-[#A09A8E]"
                      }`}
                    >
                      Authenticator
                    </button>
                  )}
                  {mfa.methods.includes("recovery") && (
                    <button
                      type="button"
                      onClick={() => setActiveMethod("recovery")}
                      className={`flex-1 py-2 text-xs rounded-lg transition ${
                        activeMethod === "recovery"
                          ? "bg-white text-[#1A1815] shadow-sm"
                          : "text-[#A09A8E]"
                      }`}
                    >
                      복구 코드
                    </button>
                  )}
                </div>

                {activeMethod === "passkey" && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#A09A8E]">
                      등록된 Passkey 로 인증합니다 (Touch ID, Windows Hello, 보안 키 등).
                    </p>
                    <button
                      type="button"
                      onClick={submitPasskey}
                      disabled={loading}
                      className="w-full py-3 bg-[#2D9F6F] hover:bg-[#247F59] text-white font-semibold text-sm rounded-xl transition disabled:opacity-40"
                    >
                      {loading ? "인증 중..." : "Passkey 로 인증"}
                    </button>
                  </div>
                )}

                {activeMethod === "totp" && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      maxLength={6}
                      placeholder="000000"
                      inputMode="numeric"
                      autoFocus
                      className="w-full px-4 py-3 bg-[#F8F6F1] border border-[#E2DDD4] rounded-xl text-center text-2xl font-mono tracking-widest outline-none focus:border-[#2D9F6F]/50"
                    />
                    <button
                      type="button"
                      onClick={submitTotpOrRecovery}
                      disabled={loading || totpCode.length !== 6}
                      className="w-full py-3 bg-[#2D9F6F] hover:bg-[#247F59] text-white font-semibold text-sm rounded-xl transition disabled:opacity-40"
                    >
                      {loading ? "인증 중..." : "확인"}
                    </button>
                  </div>
                )}

                {activeMethod === "recovery" && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="XXXXX-XXXXX"
                      autoFocus
                      className="w-full px-4 py-3 bg-[#F8F6F1] border border-[#E2DDD4] rounded-xl font-mono outline-none focus:border-[#2D9F6F]/50"
                    />
                    <button
                      type="button"
                      onClick={submitTotpOrRecovery}
                      disabled={loading || recoveryCode.length < 10}
                      className="w-full py-3 bg-[#2D9F6F] hover:bg-[#247F59] text-white font-semibold text-sm rounded-xl transition disabled:opacity-40"
                    >
                      {loading ? "인증 중..." : "복구 코드로 인증"}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-[13px] text-[#D94F4F] bg-[#D94F4F]/5 border border-[#D94F4F]/10 rounded-xl px-4 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMfa({ stage: "password" });
                    setError("");
                    setTotpCode("");
                    setRecoveryCode("");
                  }}
                  className="w-full py-2 text-[11px] font-mono text-[#A09A8E] hover:text-[#1A1815]"
                >
                  ← 다른 계정으로 로그인
                </button>
              </div>
            )}

            {/* 하단 */}
            <div className="mt-8 pt-5 border-t border-[#F0EDE6] flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#C5BFB3] tracking-wider">
                stylelucky4u.com
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2D9F6F] animate-pulse" />
                <span className="text-[10px] font-mono text-[#B5AFA6]">
                  SYSTEM ONLINE
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
