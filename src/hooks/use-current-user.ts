"use client";

import { useState, useEffect } from "react";

export interface CurrentUser {
  sub: string;
  email: string;
  role: string;
}

/**
 * 현재 로그인한 사용자 정보를 가져오는 훅
 * /api/auth/me 엔드포인트를 통해 대시보드 쿠키에서 사용자 정보 조회
 */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUser(data.user);
        }
      })
      .catch(() => {
        // 인증 실패 시 null 유지
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { user, loading };
}
