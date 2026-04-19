"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

// Phase 15 UI — MFA 등록·해제 통합 페이지.
// 모든 사용자가 자기 MFA 를 관리. ADMIN 전용 (admin) 그룹 밖에 위치.

interface PasskeyInfo {
  id: string;
  friendlyName: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface MfaStatus {
  totp: { enrolled: boolean; confirmed: boolean; lockedUntil: string | null };
  passkeys: PasskeyInfo[];
  recoveryCodesRemaining: number;
}

interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

type TotpFlow =
  | { stage: "idle" }
  | { stage: "qr"; otpauthUrl: string; qrDataUrl: string }
  | { stage: "recovery"; codes: string[] };

export default function MfaSecurityPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [totpFlow, setTotpFlow] = useState<TotpFlow>({ stage: "idle" });
  const [confirmCode, setConfirmCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/v1/auth/mfa/status");
    const data = await res.json();
    if (res.ok && data.success) setStatus(data.data);
  }

  async function loadSessions() {
    const res = await fetch("/api/v1/auth/sessions");
    const data = await res.json();
    if (res.ok && data.success) setSessions(data.data.sessions);
  }

  async function revokeSessionById(id: string) {
    if (!confirm("이 세션을 강제 종료하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/auth/sessions/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "세션 종료 실패");
      await loadSessions();
      toast.success("세션 종료됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadStatus();
    loadSessions();
  }, []);

  async function startTotpEnroll() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/enroll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "등록 시작 실패");
      setTotpFlow({
        stage: "qr",
        otpauthUrl: data.data.otpauthUrl,
        qrDataUrl: data.data.qrDataUrl,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: confirmCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "검증 실패");
      setTotpFlow({ stage: "recovery", codes: data.data.recoveryCodes });
      setConfirmCode("");
      await loadStatus();
      toast.success("MFA 활성화됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp() {
    if (!confirm("정말 MFA 를 해제하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/disable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "해제 실패");
      setDisablePassword("");
      setDisableCode("");
      await loadStatus();
      toast.success("MFA 해제됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  async function enrollPasskey() {
    setBusy(true);
    try {
      const optsRes = await fetch("/api/v1/auth/mfa/webauthn/register-options", {
        method: "POST",
      });
      const optsData = await optsRes.json();
      if (!optsRes.ok) throw new Error(optsData.error?.message || "옵션 발급 실패");

      const attResp = await startRegistration(optsData.data.options);

      const verRes = await fetch("/api/v1/auth/mfa/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: attResp,
          friendlyName: passkeyName.trim() || undefined,
        }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) throw new Error(verData.error?.message || "검증 실패");

      setPasskeyName("");
      await loadStatus();
      toast.success("Passkey 등록 완료");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류";
      // navigator.credentials.create 거부/취소는 NotAllowedError
      if (msg.includes("NotAllowed") || msg.includes("cancel")) {
        toast.error("Passkey 등록이 취소되었습니다");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function deletePasskey(id: string) {
    if (!confirm("이 Passkey 를 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/auth/mfa/webauthn/authenticators/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "삭제 실패");
      await loadStatus();
      toast.success("Passkey 삭제됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  function downloadRecoveryCodes(codes: string[]) {
    const blob = new Blob(
      [
        "양평 부엌 — MFA 복구 코드\n",
        "발급 시각: " + new Date().toLocaleString("ko-KR") + "\n",
        "각 코드는 1회만 사용 가능합니다. 안전한 곳에 보관하세요.\n\n",
        ...codes.map((c, i) => `${(i + 1).toString().padStart(2, "0")}. ${c}\n`),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mfa-recovery-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!status) {
    return (
      <div className="p-6">
        <PageHeader title="MFA & 보안" description="2차 인증 및 Passkey 관리" />
        <div className="mt-6 text-sm text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="MFA & 보안"
        description="2차 인증(TOTP) 및 Passkey 등록·해제"
      />

      {/* TOTP 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>TOTP (Authenticator 앱)</CardTitle>
          <CardDescription>
            Google Authenticator, 1Password 등으로 6자리 코드를 발급
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">상태:</span>
            {status.totp.confirmed ? (
              <span className="text-green-700">활성화됨</span>
            ) : status.totp.enrolled ? (
              <span className="text-amber-700">등록 진행 중 (미확인)</span>
            ) : (
              <span className="text-gray-500">비활성화</span>
            )}
            {status.totp.confirmed && (
              <span className="ml-4 text-gray-500">
                남은 복구 코드: {status.recoveryCodesRemaining}개
              </span>
            )}
          </div>

          {!status.totp.confirmed && totpFlow.stage === "idle" && (
            <button
              onClick={startTotpEnroll}
              disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              MFA 등록 시작
            </button>
          )}

          {totpFlow.stage === "qr" && (
            <div className="space-y-3">
              <p className="text-sm">
                Authenticator 앱으로 QR 코드를 스캔한 후 6자리 코드를 입력하세요.
              </p>
              <img
                src={totpFlow.qrDataUrl}
                alt="TOTP QR"
                className="w-48 h-48 border border-gray-200 rounded-md"
              />
              <details className="text-xs text-gray-500">
                <summary>QR 사용 불가 시 — secret 직접 입력</summary>
                <code className="break-all block mt-1 p-2 bg-gray-50 rounded">
                  {totpFlow.otpauthUrl}
                </code>
              </details>
              <div className="flex gap-2 items-center">
                <input
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm w-32"
                  inputMode="numeric"
                />
                <button
                  onClick={confirmTotp}
                  disabled={busy || confirmCode.length !== 6}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
                >
                  확인
                </button>
                <button
                  onClick={() => setTotpFlow({ stage: "idle" })}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {totpFlow.stage === "recovery" && (
            <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm font-medium text-amber-900">
                ⚠ 복구 코드 — 지금 저장하세요. 다시 표시되지 않습니다.
              </p>
              <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
                {totpFlow.codes.map((c) => (
                  <li key={c} className="px-3 py-2 bg-white border border-amber-200 rounded">
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadRecoveryCodes(totpFlow.codes)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm"
                >
                  텍스트 파일로 다운로드
                </button>
                <button
                  onClick={() => setTotpFlow({ stage: "idle" })}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm"
                >
                  저장했습니다
                </button>
              </div>
            </div>
          )}

          {status.totp.confirmed && totpFlow.stage === "idle" && (
            <details className="border border-gray-200 rounded-md p-4">
              <summary className="text-sm cursor-pointer">MFA 해제</summary>
              <div className="mt-3 space-y-2">
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="현재 TOTP 6자리 코드"
                  maxLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  inputMode="numeric"
                />
                <button
                  onClick={disableTotp}
                  disabled={busy || !disablePassword || disableCode.length !== 6}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm disabled:opacity-50"
                >
                  MFA 해제
                </button>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Passkey 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>Passkey (WebAuthn)</CardTitle>
          <CardDescription>
            Touch ID, Windows Hello, YubiKey, iCloud/Google Password Manager 등
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.passkeys.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 Passkey 가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {status.passkeys.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-md text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {p.friendlyName || "(이름 없음)"}{" "}
                      <span className="text-xs text-gray-500 ml-2">
                        {p.deviceType === "multi_device" ? "동기화" : "단일 기기"}
                        {p.backedUp ? " · 클라우드 백업" : ""}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      등록: {new Date(p.createdAt).toLocaleString("ko-KR")}
                      {p.lastUsedAt && (
                        <> · 마지막 사용: {new Date(p.lastUsedAt).toLocaleString("ko-KR")}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deletePasskey(p.id)}
                    disabled={busy}
                    className="px-3 py-1 text-sm text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 items-center pt-2 border-t border-gray-100">
            <input
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder="기기 이름 (선택, 예: 김도영 iPhone)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <button
              onClick={enrollPasskey}
              disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              새 Passkey 등록
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 활성 세션 카드 (Phase 15-D) */}
      <Card>
        <CardHeader>
          <CardTitle>활성 세션</CardTitle>
          <CardDescription>
            모든 로그인된 기기 목록. 의심스러운 세션은 즉시 종료하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions === null ? (
            <p className="text-sm text-gray-500">로딩 중...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">활성 세션이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between p-3 border border-gray-200 rounded-md text-sm gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium flex items-center gap-2">
                      <span className="truncate">
                        {s.ip ?? "(IP 알 수 없음)"}
                      </span>
                      {s.current && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 shrink-0">
                          현재 세션
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {s.userAgent ?? "(User-Agent 없음)"}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      시작: {new Date(s.createdAt).toLocaleString("ko-KR")} · 마지막 사용:{" "}
                      {new Date(s.lastUsedAt).toLocaleString("ko-KR")} · 만료:{" "}
                      {new Date(s.expiresAt).toLocaleString("ko-KR")}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeSessionById(s.id)}
                    disabled={busy}
                    className="px-3 py-1 text-sm text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 shrink-0"
                  >
                    종료
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
