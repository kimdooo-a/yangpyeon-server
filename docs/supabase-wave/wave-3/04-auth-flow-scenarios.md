# Supabase 인증 플로우 시나리오별 설계 가이드

> Wave 3 — 인증 플로우 시나리오 심화  
> 작성일: 2026-04-06  
> 참고: Supabase Auth 공식 문서 (2025-2026 기준)

---

## 목차

1. [웹 앱 시나리오](#1-웹-앱-시나리오)
   - 1.1 Next.js App Router + SSR 인증
   - 1.2 SPA 인증 플로우 (React)
   - 1.3 미들웨어 기반 보호 라우트
2. [모바일 앱 시나리오](#2-모바일-앱-시나리오)
   - 2.1 OAuth Deep Link 처리
   - 2.2 토큰 저장 (Secure Storage)
   - 2.3 백그라운드 토큰 갱신
3. [B2B/SaaS 시나리오](#3-b2bsaas-시나리오)
   - 3.1 조직 초대 & 온보딩
   - 3.2 역할 기반 접근 제어 (RBAC)
   - 3.3 SSO/SAML 통합
4. [보안 강화 시나리오](#4-보안-강화-시나리오)
   - 4.1 MFA 구현 (TOTP)
   - 4.2 세션 관리 (강제 로그아웃, 세션 목록)
   - 4.3 의심스러운 활동 탐지
5. [특수 시나리오](#5-특수-시나리오)
   - 5.1 서버 간 인증 (Service Role Key)
   - 5.2 Webhook 수신 시 인증
   - 5.3 사용자 임퍼소네이션 (관리자 모드)

---

## 1. 웹 앱 시나리오

### 1.1 Next.js App Router + SSR 인증

Next.js App Router는 서버 컴포넌트, 클라이언트 컴포넌트, 서버 액션, 라우트 핸들러가 혼재한다.
각 컨텍스트에서 Supabase 클라이언트를 올바르게 생성해야 한다.

#### 1.1.1 패키지 설치

```bash
npm install @supabase/supabase-js @supabase/ssr
```

#### 1.1.2 환경변수 설정

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# SUPABASE_SERVICE_ROLE_KEY는 서버 전용, NEXT_PUBLIC_ 접두사 사용 금지
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

#### 1.1.3 Supabase 클라이언트 유틸리티

```typescript
// src/lib/supabase/server.ts
// 서버 컴포넌트, 서버 액션, 라우트 핸들러용

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서 쿠키 쓰기는 에러가 발생할 수 있음
            // 미들웨어가 세션 갱신을 처리하므로 무시 가능
          }
        },
      },
    }
  );
}
```

```typescript
// src/lib/supabase/client.ts
// 클라이언트 컴포넌트용 (브라우저)

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### 1.1.4 미들웨어 (세션 갱신의 핵심)

```typescript
// middleware.ts (프로젝트 루트)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 중요: getUser()를 반드시 호출해야 세션이 갱신됨
  // getSession()은 서버 측에서 신뢰할 수 없으므로 항상 getUser() 사용
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 보호된 경로 목록
  const protectedPaths = ["/dashboard", "/settings", "/admin"];
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // 인증되지 않은 사용자가 보호 경로에 접근하면 로그인 페이지로 리다이렉트
  if (!user && isProtected) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  // 이미 로그인한 사용자가 로그인/회원가입 페이지 접근 시 대시보드로 리다이렉트
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Supabase 접근이 필요한 경로만 매칭 (정적 파일 제외)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

#### 1.1.5 서버 컴포넌트에서 인증 확인

```typescript
// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미들웨어가 처리하지만, 이중 방어를 위해 서버 컴포넌트에서도 확인
  if (!user) {
    redirect("/login");
  }

  // 사용자 데이터 조회 (RLS가 자동으로 해당 사용자 데이터만 필터링)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, status, total_amount, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div>
      <h1>{profile?.full_name}님의 대시보드</h1>
      <section>
        <h2>최근 주문</h2>
        {recentOrders?.map((order) => (
          <div key={order.id}>
            주문 #{order.id}: {order.status} - {order.total_amount}원
          </div>
        ))}
      </section>
    </div>
  );
}
```

#### 1.1.6 서버 액션으로 인증 처리

```typescript
// src/app/login/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email("유효하지 않은 이메일"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
});

export type LoginState = {
  errors?: {
    email?: string[];
    password?: string[];
    general?: string[];
  };
  success?: boolean;
};

export async function login(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validatedFields = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: validatedFields.data.email,
    password: validatedFields.data.password,
  });

  if (error) {
    return {
      errors: {
        general: [
          error.message === "Invalid login credentials"
            ? "이메일 또는 비밀번호가 올바르지 않습니다"
            : error.message,
        ],
      },
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: {
        full_name: formData.get("name") as string,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { errors: { general: [error.message] } };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
```

#### 1.1.7 OAuth 콜백 라우트 핸들러

```typescript
// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
```

---

### 1.2 SPA 인증 플로우 (React, Vite 등)

Next.js를 사용하지 않는 순수 SPA 환경의 인증 패턴이다.

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      // localStorage에 세션 자동 저장
      persistSession: true,
      // 토큰 만료 전 자동 갱신
      autoRefreshToken: true,
      // URL의 해시에서 세션 자동 감지 (OAuth 콜백)
      detectSessionInUrl: true,
      // 탭 간 세션 공유
      storageKey: "my-app-auth-token",
    },
  }
);
```

```typescript
// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 현재 세션 조회
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 인증 상태 변화 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: Record<string, unknown>
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      return { error };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }, []);

  const signInWithGithub = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "read:user user:email",
      },
    });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    return { error };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
        signInWithGithub,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다");
  }
  return context;
}
```

---

### 1.3 미들웨어 기반 보호 라우트 (고급 패턴)

역할 기반 라우트 보호와 세밀한 접근 제어를 구현한다.

```typescript
// middleware.ts (고급 버전)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type RouteRule = {
  pattern: RegExp;
  roles?: string[];          // 허용할 역할 목록
  redirect?: string;         // 접근 거부 시 리다이렉트 경로
  requireMfa?: boolean;      // MFA 요구 여부
};

const ROUTE_RULES: RouteRule[] = [
  // 공개 라우트 (인증 불필요)
  { pattern: /^\/(login|signup|about|pricing|blog)/ },
  // 인증 필요 라우트
  { pattern: /^\/dashboard/, redirect: "/login" },
  { pattern: /^\/settings/, redirect: "/login" },
  // 관리자 전용 라우트
  {
    pattern: /^\/admin/,
    roles: ["admin", "super_admin"],
    redirect: "/dashboard",
  },
  // MFA 요구 라우트 (결제, 보안 설정)
  {
    pattern: /^\/settings\/security/,
    requireMfa: true,
    redirect: "/settings/security/mfa-required",
  },
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  for (const rule of ROUTE_RULES) {
    if (!rule.pattern.test(pathname)) continue;

    // 역할이나 MFA 요구사항이 없으면 공개 라우트
    if (!rule.roles && !rule.requireMfa) break;

    // 비인증 사용자
    if (!user) {
      const redirectUrl = new URL(rule.redirect ?? "/login", request.url);
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // 역할 확인
    if (rule.roles && rule.roles.length > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !rule.roles.includes(profile.role)) {
        return NextResponse.redirect(
          new URL(rule.redirect ?? "/dashboard", request.url)
        );
      }
    }

    // MFA 확인
    if (rule.requireMfa) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aal?.currentLevel !== "aal2") {
        const redirectUrl = new URL(
          rule.redirect ?? "/settings/security/mfa-required",
          request.url
        );
        redirectUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(redirectUrl);
      }
    }

    break;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

---

## 2. 모바일 앱 시나리오

### 2.1 OAuth Deep Link 처리

React Native / Expo 앱에서 OAuth를 구현할 때 딥 링크 설정이 필수다.

```typescript
// app.config.ts (Expo)
export default {
  expo: {
    name: "MyApp",
    scheme: "myapp",  // myapp:// 딥 링크 스킴
    ios: {
      bundleIdentifier: "com.example.myapp",
    },
    android: {
      package: "com.example.myapp",
    },
  },
};
```

```typescript
// src/lib/supabase.ts (React Native / Expo)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// Expo SecureStore 어댑터 (민감한 토큰을 안전하게 저장)
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // 네이티브 앱에서는 false
    },
  }
);
```

```typescript
// src/hooks/useOAuth.ts
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export function useOAuth() {
  const [loading, setLoading] = useState(false);

  const signInWithGoogle = async () => {
    setLoading(true);

    try {
      const redirectUrl = makeRedirectUri({
        scheme: "myapp",
        path: "auth/callback",
      });

      // Supabase OAuth URL 생성
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // 자동 리다이렉트 방지
        },
      });

      if (error) throw error;

      // 브라우저에서 OAuth 진행
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === "success") {
        // URL에서 토큰 추출
        const url = new URL(result.url);
        const fragment = url.hash.substring(1);
        const params = new URLSearchParams(fragment);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async () => {
    setLoading(true);

    try {
      const redirectUrl = makeRedirectUri({
        scheme: "myapp",
        path: "auth/callback",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === "success") {
        const url = new URL(result.url);
        const fragment = url.hash.substring(1);
        const params = new URLSearchParams(fragment);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return { signInWithGoogle, signInWithApple, loading };
}
```

---

### 2.2 토큰 저장 (Secure Storage)

```typescript
// src/lib/secure-session-storage.ts
// AES 암호화를 사용한 세션 저장소 (보안 강화)

import * as SecureStore from "expo-secure-store";
import * as aesJs from "aes-js";
import "react-native-get-random-values";

// 암호화 키를 SecureStore에 저장
const ENCRYPTION_KEY_NAME = "session_encryption_key";

async function getOrCreateEncryptionKey(): Promise<Uint8Array> {
  const storedKey = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);

  if (storedKey) {
    return new Uint8Array(JSON.parse(storedKey));
  }

  // 새 AES-256 키 생성
  const key = crypto.getRandomValues(new Uint8Array(32));
  await SecureStore.setItemAsync(
    ENCRYPTION_KEY_NAME,
    JSON.stringify(Array.from(key))
  );
  return key;
}

async function encryptData(data: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const textBytes = aesJs.utils.utf8.toBytes(data);

  // AES-CTR 암호화
  const aesCtr = new aesJs.ModeOfOperation.ctr(
    key,
    new aesJs.Counter(5)
  );
  const encryptedBytes = aesCtr.encrypt(textBytes);

  return aesJs.utils.hex.fromBytes(encryptedBytes);
}

async function decryptData(encryptedHex: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const encryptedBytes = aesJs.utils.hex.toBytes(encryptedHex);

  // AES-CTR 복호화
  const aesCtr = new aesJs.ModeOfOperation.ctr(
    key,
    new aesJs.Counter(5)
  );
  const decryptedBytes = aesCtr.decrypt(encryptedBytes);

  return aesJs.utils.utf8.fromBytes(decryptedBytes);
}

export const EncryptedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const encryptedValue = await SecureStore.getItemAsync(key);
      if (!encryptedValue) return null;
      return await decryptData(encryptedValue);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptedValue = await encryptData(value);
    await SecureStore.setItemAsync(key, encryptedValue);
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
```

---

### 2.3 백그라운드 토큰 갱신

```typescript
// src/hooks/useAuthSession.ts
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase";

export function useAuthSession() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 앱이 포그라운드로 돌아올 때 세션 갱신
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          // 앱이 활성화되면 세션 새로고침
          const { data, error } = await supabase.auth.refreshSession();

          if (error) {
            console.warn("세션 갱신 실패:", error.message);
            // 세션 만료 시 로그인 화면으로 이동
            await supabase.auth.signOut();
          } else if (data.session) {
            console.log("세션 갱신 성공");
          }
        }

        appState.current = nextAppState;
      }
    );

    return () => subscription.remove();
  }, []);
}
```

---

## 3. B2B/SaaS 시나리오

### 3.1 조직 초대 & 온보딩

B2B SaaS에서는 사용자가 조직(팀, 워크스페이스)에 초대되는 플로우가 핵심이다.

#### 3.1.1 데이터베이스 스키마

```sql
-- 조직 테이블
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 조직 멤버십 테이블
CREATE TABLE org_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- 초대 테이블
CREATE TABLE org_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- 자신이 속한 조직만 조회 가능
CREATE POLICY "소속 조직 조회" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- 어드민 이상만 멤버 관리 가능
CREATE POLICY "조직 멤버 조회" ON org_members
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "어드민이상만 초대 생성" ON org_invitations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

#### 3.1.2 초대 발송 Edge Function

```typescript
// supabase/functions/send-invitation/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // 발신자 인증
  const authHeader = req.headers.get("Authorization");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } }
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return new Response("인증 필요", { status: 401 });

  const { org_id, email, role = "member" } = await req.json();

  // 발신자가 해당 조직의 어드민인지 확인
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return new Response("권한 없음", { status: 403 });
  }

  // 이미 멤버인지 확인
  const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);
  if (existingUser.user) {
    const { data: existingMember } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", org_id)
      .eq("user_id", existingUser.user.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: "이미 조직의 멤버입니다" }),
        { status: 409 }
      );
    }
  }

  // 초대 레코드 생성
  const { data: invitation, error } = await supabase
    .from("org_invitations")
    .insert({
      org_id,
      email,
      role,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  // 조직 정보 조회
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", org_id)
    .single();

  // 초대 이메일 발송
  const inviteUrl = `${Deno.env.get("SITE_URL")}/invite?token=${invitation.token}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@example.com",
      to: [email],
      subject: `${org?.name}에 초대되었습니다`,
      html: `
        <h2>${org?.name} 초대</h2>
        <p>안녕하세요! ${org?.name}에 ${role}(으)로 초대받으셨습니다.</p>
        <p>아래 링크를 클릭하여 초대를 수락하세요. (7일간 유효)</p>
        <a href="${inviteUrl}" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #3ECF8E;
          color: white;
          text-decoration: none;
          border-radius: 6px;
        ">초대 수락하기</a>
      `,
    }),
  });

  return new Response(JSON.stringify({ success: true, invitation_id: invitation.id }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

#### 3.1.3 초대 수락 플로우

```typescript
// src/app/invite/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface InvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { token } = await searchParams;

  if (!token) redirect("/");

  const supabase = await createClient();

  // 초대 유효성 확인
  const { data: invitation } = await supabase
    .from("org_invitations")
    .select("*, organizations(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!invitation) {
    return (
      <div>
        <h1>초대가 유효하지 않습니다</h1>
        <p>이미 만료되었거나 사용된 초대 링크입니다.</p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1>{invitation.organizations.name} 초대</h1>
      <p>{invitation.role}(으)로 초대되었습니다.</p>
      {user ? (
        <AcceptInvitationForm token={token} userEmail={user.email!} />
      ) : (
        <SignupToAcceptForm token={token} inviteEmail={invitation.email} />
      )}
    </div>
  );
}
```

---

### 3.2 역할 기반 접근 제어 (RBAC)

```sql
-- 세밀한 권한 시스템
CREATE TABLE permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,  -- 예: 'orders:read', 'orders:write', 'users:manage'
  description TEXT
);

-- 역할별 권한 매핑
CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission_id UUID NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role, permission_id)
);

-- 기본 권한 삽입
INSERT INTO permissions (name, description) VALUES
  ('orders:read', '주문 조회'),
  ('orders:write', '주문 생성/수정'),
  ('orders:delete', '주문 삭제'),
  ('users:read', '사용자 조회'),
  ('users:manage', '사용자 관리'),
  ('billing:read', '결제 정보 조회'),
  ('billing:manage', '결제 관리'),
  ('settings:read', '설정 조회'),
  ('settings:manage', '설정 관리');

-- 역할별 기본 권한 설정
INSERT INTO role_permissions (role, permission_id)
SELECT 'viewer', id FROM permissions WHERE name IN ('orders:read', 'settings:read');

INSERT INTO role_permissions (role, permission_id)
SELECT 'member', id FROM permissions
WHERE name IN ('orders:read', 'orders:write', 'settings:read');

INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions
WHERE name IN (
  'orders:read', 'orders:write', 'orders:delete',
  'users:read', 'billing:read', 'settings:read', 'settings:manage'
);

INSERT INTO role_permissions (role, permission_id)
SELECT 'owner', id FROM permissions;  -- 모든 권한

-- 사용자 권한 확인 함수
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id UUID,
  p_org_id UUID,
  p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM org_members
  WHERE user_id = p_user_id AND org_id = p_org_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role = v_role AND p.name = p_permission
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS에서 권한 함수 활용
CREATE POLICY "주문 삭제 권한" ON orders
  FOR DELETE USING (
    has_permission(auth.uid(), org_id, 'orders:delete')
  );
```

```typescript
// src/hooks/usePermissions.ts
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface UserPermissions {
  role: string;
  permissions: string[];
}

export function usePermissions(orgId: string) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !orgId) return;

    async function fetchPermissions() {
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", user!.id)
        .eq("org_id", orgId)
        .single();

      if (!membership) {
        setPermissions(null);
        setLoading(false);
        return;
      }

      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permissions(name)")
        .eq("role", membership.role);

      setPermissions({
        role: membership.role,
        permissions: rolePerms?.map((rp: any) => rp.permissions.name) ?? [],
      });
      setLoading(false);
    }

    fetchPermissions();
  }, [user, orgId]);

  const can = (permission: string): boolean => {
    return permissions?.permissions.includes(permission) ?? false;
  };

  const isRole = (role: string): boolean => {
    return permissions?.role === role;
  };

  return { permissions, loading, can, isRole };
}

// 사용 예시
// const { can, isRole } = usePermissions(orgId);
// if (can('orders:delete')) { ... }
// if (isRole('admin')) { ... }
```

---

### 3.3 SSO/SAML 통합

```typescript
// src/app/login/sso/page.tsx
// 기업 SSO 로그인 페이지

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface SsoLoginPageProps {
  searchParams: Promise<{ domain?: string; next?: string }>;
}

export default async function SsoLoginPage({ searchParams }: SsoLoginPageProps) {
  const { domain, next } = await searchParams;

  if (!domain) {
    return <SsoDomainForm />;
  }

  const supabase = await createClient();

  // 도메인으로 SSO 제공자 조회 및 로그인 시작
  const { data, error } = await supabase.auth.signInWithSSO({
    domain,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${next ?? "/dashboard"}`,
    },
  });

  if (error) {
    return <div>SSO 설정 오류: {error.message}</div>;
  }

  if (data?.url) {
    redirect(data.url);
  }

  return null;
}

function SsoDomainForm() {
  return (
    <form action="/login/sso" method="GET">
      <label>
        회사 이메일 도메인
        <input
          type="text"
          name="domain"
          placeholder="example.com"
          required
        />
      </label>
      <button type="submit">SSO로 로그인</button>
    </form>
  );
}
```

---

## 4. 보안 강화 시나리오

### 4.1 MFA 구현 (TOTP)

Supabase Auth는 TOTP(Time-based One-Time Password) MFA를 기본 지원한다.
Google Authenticator, Authy, 1Password 등의 앱과 호환된다.

#### 4.1.1 MFA 등록 플로우

```typescript
// src/components/MfaSetup.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

type SetupStep = "initial" | "qr_code" | "verify" | "complete";

export function MfaSetup() {
  const supabase = createClient();
  const [step, setStep] = useState<SetupStep>("initial");
  const [factorId, setFactorId] = useState<string>("");
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [verifyCode, setVerifyCode] = useState<string>("");
  const [error, setError] = useState<string>("");

  const startEnrollment = async () => {
    setError("");

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "내 인증 앱",
    });

    if (error) {
      setError(error.message);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("qr_code");
  };

  const verifyEnrollment = async () => {
    if (verifyCode.length !== 6) {
      setError("6자리 코드를 입력하세요");
      return;
    }

    setError("");

    // 1단계: challenge 생성
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      return;
    }

    // 2단계: verify로 등록 완료
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError("코드가 올바르지 않습니다. 다시 시도하세요.");
      return;
    }

    setStep("complete");
  };

  if (step === "initial") {
    return (
      <div>
        <h2>2단계 인증 설정</h2>
        <p>Google Authenticator나 Authy 앱을 사용하여 계정 보안을 강화하세요.</p>
        <button onClick={startEnrollment}>MFA 설정 시작</button>
      </div>
    );
  }

  if (step === "qr_code") {
    return (
      <div>
        <h2>앱에서 QR 코드 스캔</h2>
        <img src={qrCode} alt="MFA QR 코드" width={200} height={200} />
        <details>
          <summary>QR 코드를 스캔할 수 없나요?</summary>
          <p>아래 키를 앱에 직접 입력하세요:</p>
          <code>{secret}</code>
        </details>
        <button onClick={() => setStep("verify")}>코드 확인하기</button>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div>
        <h2>인증 앱의 6자리 코드 입력</h2>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button onClick={verifyEnrollment} disabled={verifyCode.length !== 6}>
          인증 완료
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>2단계 인증 설정 완료</h2>
      <p>이제 로그인할 때 인증 앱의 코드를 입력해야 합니다.</p>
    </div>
  );
}
```

#### 4.1.2 MFA 로그인 플로우

```typescript
// src/components/MfaChallenge.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function MfaChallenge() {
  const supabase = createClient();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string>("");
  const [challengeId, setChallengeId] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 등록된 MFA 요소 목록 조회
    supabase.auth.mfa
      .listFactors()
      .then(({ data }) => {
        const totpFactor = data?.totp.find((f) => f.status === "verified");
        if (totpFactor) {
          setFactorId(totpFactor.id);
          // 즉시 challenge 생성
          return supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        }
      })
      .then((result) => {
        if (result?.data) {
          setChallengeId(result.data.id);
        }
      });
  }, []);

  const handleVerify = async () => {
    if (!factorId || !challengeId || code.length !== 6) return;

    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      setError("코드가 올바르지 않습니다");
      setCode("");
      setLoading(false);

      // 새 challenge 생성 (기존 challenge는 1회용)
      const { data: newChallenge } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (newChallenge) setChallengeId(newChallenge.id);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div>
      <h2>2단계 인증</h2>
      <p>인증 앱의 6자리 코드를 입력하세요.</p>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && handleVerify()}
        placeholder="000000"
        autoFocus
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button onClick={handleVerify} disabled={loading || code.length !== 6}>
        {loading ? "확인 중..." : "확인"}
      </button>
    </div>
  );
}
```

#### 4.1.3 AAL(Authenticator Assurance Level) 기반 보호

```typescript
// src/hooks/useMfaGuard.ts
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function useMfaGuard(requiredLevel: "aal1" | "aal2" = "aal2") {
  const supabase = createClient();
  const router = useRouter();
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (!data) {
          router.push("/login");
          return;
        }

        if (
          requiredLevel === "aal2" &&
          data.currentLevel !== "aal2" &&
          data.nextLevel === "aal2"
        ) {
          // MFA 등록은 되어 있지만 아직 MFA 인증을 하지 않은 상태
          router.push("/mfa-challenge");
          return;
        }

        if (
          requiredLevel === "aal2" &&
          data.currentLevel !== "aal2" &&
          data.nextLevel !== "aal2"
        ) {
          // MFA 미등록 상태
          router.push("/settings/mfa/setup");
          return;
        }

        setIsVerified(true);
      })
      .finally(() => setLoading(false));
  }, [requiredLevel]);

  return { isVerified, loading };
}
```

---

### 4.2 세션 관리 (강제 로그아웃, 세션 목록)

```typescript
// src/app/settings/sessions/page.tsx
// 활성 세션 목록 조회 및 관리

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  user_agent?: string;
  ip?: string;
}

export default function SessionsPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const { data } = await supabase.auth.getSession();
    setCurrentSession(data.session?.access_token ?? "");

    // Supabase는 직접적인 세션 목록 API를 제공하지 않으므로
    // 커스텀 세션 추적 테이블을 사용
    const { data: sessionData } = await supabase
      .from("user_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    setSessions(sessionData ?? []);
  };

  const revokeSession = async (sessionId: string) => {
    setLoading(true);

    // 커스텀 세션 레코드 삭제
    await supabase.from("user_sessions").delete().eq("id", sessionId);

    // Edge Function을 통해 세션 무효화
    await supabase.functions.invoke("revoke-session", {
      body: { session_id: sessionId },
    });

    await loadSessions();
    setLoading(false);
  };

  const revokeAllOtherSessions = async () => {
    setLoading(true);

    await supabase.auth.signOut({ scope: "others" });
    await loadSessions();
    setLoading(false);
  };

  return (
    <div>
      <h1>활성 세션 관리</h1>
      <button onClick={revokeAllOtherSessions} disabled={loading}>
        다른 모든 기기에서 로그아웃
      </button>

      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <div>
              <strong>{session.device_name ?? "알 수 없는 기기"}</strong>
              {session.is_current && <span> (현재 기기)</span>}
            </div>
            <div>마지막 활동: {formatDistanceToNow(new Date(session.updated_at), { locale: ko, addSuffix: true })}</div>
            <div>IP: {session.ip_address ?? "알 수 없음"}</div>
            {!session.is_current && (
              <button
                onClick={() => revokeSession(session.id)}
                disabled={loading}
              >
                이 기기에서 로그아웃
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```typescript
// supabase/functions/revoke-session/index.ts
// 특정 세션 강제 무효화

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } }
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return new Response("인증 필요", { status: 401 });

  const { session_id } = await req.json();

  // 해당 세션이 현재 사용자의 것인지 확인
  const { data: session } = await supabase
    .from("user_sessions")
    .select("user_id, refresh_token")
    .eq("id", session_id)
    .single();

  if (!session || session.user_id !== user.id) {
    return new Response("권한 없음", { status: 403 });
  }

  // 세션 로그아웃
  // Supabase Admin API를 통해 특정 refresh_token 무효화
  await supabase.auth.admin.signOut(session_id, "local");

  // 커스텀 세션 레코드 삭제
  await supabase.from("user_sessions").delete().eq("id", session_id);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
```

---

### 4.3 의심스러운 활동 탐지

```typescript
// supabase/functions/auth-monitor/index.ts
// Auth 이벤트를 모니터링하고 의심스러운 활동을 탐지

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Auth Hooks를 통해 로그인 이벤트 수신 (Supabase Dashboard에서 설정)
Deno.serve(async (req) => {
  const event = await req.json();

  if (event.type !== "login") {
    return new Response(JSON.stringify({ decision: "continue" }), {
      status: 200,
    });
  }

  const { user_id, ip_address, user_agent } = event;

  // 최근 로그인 기록 조회
  const { data: recentLogins } = await supabase
    .from("auth_audit_log")
    .select("ip_address, user_agent, created_at")
    .eq("user_id", user_id)
    .eq("action", "login")
    .order("created_at", { ascending: false })
    .limit(10);

  // 의심스러운 활동 판단
  const suspiciousReasons: string[] = [];

  // 1. 새로운 국가/IP에서 로그인
  const knownIps = new Set(recentLogins?.map((l) => l.ip_address) ?? []);
  if (recentLogins && recentLogins.length > 0 && !knownIps.has(ip_address)) {
    suspiciousReasons.push("새로운 IP 주소에서 로그인");
  }

  // 2. 단시간 내 다수 실패 후 성공 (브루트포스 감지)
  const { count: failedCount } = await supabase
    .from("auth_audit_log")
    .select("*", { count: "exact" })
    .eq("user_id", user_id)
    .eq("action", "login_failed")
    .gte(
      "created_at",
      new Date(Date.now() - 60 * 60 * 1000).toISOString()
    );

  if (failedCount && failedCount > 5) {
    suspiciousReasons.push(`최근 1시간 내 ${failedCount}회 로그인 실패 후 성공`);
  }

  // 3. 비정상적인 시간대 (새벽 2-5시)
  const loginHour = new Date().getHours();
  if (loginHour >= 2 && loginHour <= 5) {
    suspiciousReasons.push("비정상적인 시간대 로그인 (새벽 2-5시)");
  }

  // 로그인 기록 저장
  await supabase.from("auth_audit_log").insert({
    user_id,
    action: "login",
    ip_address,
    user_agent,
    suspicious: suspiciousReasons.length > 0,
    suspicious_reasons: suspiciousReasons,
  });

  if (suspiciousReasons.length > 0) {
    // 의심스러운 로그인 알림 발송
    const { data: user } = await supabase.auth.admin.getUserById(user_id);
    if (user.user?.email) {
      await sendSuspiciousLoginAlert(user.user.email, ip_address, suspiciousReasons);
    }

    // 강도가 높으면 로그인 차단도 가능
    // return new Response(JSON.stringify({ decision: "reject", message: "보안 정책에 의해 차단되었습니다" }), { status: 200 });
  }

  return new Response(JSON.stringify({ decision: "continue" }), {
    status: 200,
  });
});

async function sendSuspiciousLoginAlert(
  email: string,
  ip: string,
  reasons: string[]
) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "security@example.com",
      to: [email],
      subject: "[보안 알림] 의심스러운 로그인 감지",
      html: `
        <h2>의심스러운 로그인이 감지되었습니다</h2>
        <p>IP: ${ip}</p>
        <p>감지 이유:</p>
        <ul>${reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
        <p>본인이 로그인한 것이 아니라면 즉시 비밀번호를 변경하세요.</p>
        <a href="${Deno.env.get("SITE_URL")}/settings/security">보안 설정 확인</a>
      `,
    }),
  });
}
```

---

## 5. 특수 시나리오

### 5.1 서버 간 인증 (Service Role Key)

서버 간 통신에서는 서비스 역할 키를 사용하여 RLS를 우회하고 관리자 수준의 작업을 수행한다.

```typescript
// src/lib/supabase/admin.ts
// 서버 전용 관리자 클라이언트 (절대 클라이언트에 노출하면 안 됨)

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사 없이 서버 전용으로 사용
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

```typescript
// src/app/api/admin/users/route.ts
// 관리자 API: 사용자 관리 (서비스 역할 사용)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  // 요청자가 admin 권한이 있는지 먼저 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }

  // 서비스 역할로 모든 사용자 목록 조회 (RLS 우회)
  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 50,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users.users });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: "슈퍼 관리자 권한만 사용자를 삭제할 수 있습니다" },
      { status: 403 }
    );
  }

  const { userId } = params;

  // 서비스 역할로 사용자 삭제
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

---

### 5.2 Webhook 수신 시 인증

외부 서비스의 Webhook을 받을 때, 해당 서비스의 서명만으로 인증하고
데이터베이스 작업은 서비스 역할로 수행하는 패턴이다.

```typescript
// supabase/functions/payment-webhook/index.ts
// 결제 서비스 Webhook: JWT 미사용, 서명으로만 인증

import { createClient } from "jsr:@supabase/supabase-js@2";

// config.toml에서 verify_jwt = false 설정 필수

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Webhook 서명 검증
  const signature = req.headers.get("X-Payment-Signature");
  const timestamp = req.headers.get("X-Payment-Timestamp");

  if (!signature || !timestamp) {
    return new Response("서명 또는 타임스탬프 누락", { status: 400 });
  }

  // 타임스탬프 신선도 확인 (재전송 공격 방지)
  const tsSeconds = parseInt(timestamp);
  if (Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    return new Response("요청 만료", { status: 400 });
  }

  const body = await req.text();

  // HMAC 서명 검증
  const expectedSig = await computeHmac(
    Deno.env.get("PAYMENT_WEBHOOK_SECRET")!,
    `${timestamp}.${body}`
  );

  if (!timingSafeEqual(expectedSig, signature)) {
    return new Response("서명 검증 실패", { status: 401 });
  }

  const event = JSON.parse(body);

  // Idempotency: 이미 처리된 이벤트인지 확인
  const { data: processed } = await supabase
    .from("processed_webhooks")
    .select("id")
    .eq("event_id", event.id)
    .single();

  if (processed) {
    return new Response(JSON.stringify({ already_processed: true }), {
      status: 200,
    });
  }

  // 서비스 역할로 DB 업데이트 (특정 사용자 컨텍스트 없이)
  switch (event.type) {
    case "payment.completed":
      await supabase.from("orders").update({ status: "paid" }).eq("payment_id", event.payment_id);
      break;
    case "payment.refunded":
      await supabase.from("orders").update({ status: "refunded" }).eq("payment_id", event.payment_id);
      break;
  }

  // 처리 완료 기록
  await supabase.from("processed_webhooks").insert({
    event_id: event.id,
    event_type: event.type,
    processed_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

---

### 5.3 사용자 임퍼소네이션 (관리자 모드)

관리자가 디버깅이나 지원 목적으로 특정 사용자의 세션으로 접근하는 패턴이다.
**주의: 감사 로그 기록 필수, 접근 범위를 최소화해야 한다.**

```typescript
// supabase/functions/admin-impersonate/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // 관리자 인증 확인
  const authHeader = req.headers.get("Authorization");
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } }
  );

  const {
    data: { user: admin },
  } = await adminClient.auth.getUser();

  if (!admin) {
    return new Response("인증 필요", { status: 401 });
  }

  // 관리자 권한 확인
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", admin.id)
    .single();

  if (adminProfile?.role !== "super_admin") {
    return new Response("슈퍼 관리자 권한 필요", { status: 403 });
  }

  const { target_user_id, reason } = await req.json();

  if (!reason || reason.trim().length < 10) {
    return new Response(
      JSON.stringify({ error: "임퍼소네이션 사유를 10자 이상 입력하세요" }),
      { status: 400 }
    );
  }

  // 임퍼소네이션 감사 로그 기록 (필수)
  await supabase.from("impersonation_audit_log").insert({
    admin_id: admin.id,
    target_user_id,
    reason,
    started_at: new Date().toISOString(),
    ip_address: req.headers.get("CF-Connecting-IP") ?? "unknown",
  });

  // 대상 사용자의 임시 토큰 발급 (Admin API)
  // 주의: 이 링크는 일회성이며 보안 채널로만 전달해야 함
  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "", // 대상 사용자 이메일
    options: {
      redirectTo: `${Deno.env.get("SITE_URL")}/admin/impersonate?audit_id=<audit_id>`,
    },
  });

  // 보다 안전한 방법: 대상 사용자 ID로 직접 세션 생성
  // (이 기능은 Supabase Admin API에서 지원하지 않으므로
  //  커스텀 JWT를 생성하거나 Magic Link를 사용해야 함)

  // 실무 권장 패턴: 읽기 전용 뷰로 제한
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", target_user_id)
    .single();

  const { data: userOrders } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", target_user_id)
    .order("created_at", { ascending: false })
    .limit(20);

  // 읽기 전용 데이터 반환 (실제 세션 전환 없이 관리자에게 데이터만 제공)
  return new Response(
    JSON.stringify({
      profile: userProfile,
      recent_orders: userOrders,
      audit_note:
        "이 데이터는 감사 목적으로 조회되었으며 모든 접근이 기록됩니다.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
```

```sql
-- 임퍼소네이션 감사 테이블
CREATE TABLE impersonation_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  ip_address TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  actions_taken JSONB DEFAULT '[]'
);

-- 관리자 자신의 임퍼소네이션 로그만 조회 가능 (또는 슈퍼어드민이 전체 조회)
CREATE POLICY "임퍼소네이션 로그 조회" ON impersonation_audit_log
  FOR SELECT USING (
    admin_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 삽입/수정은 서비스 역할만 가능 (감사 로그 위조 방지)
CREATE POLICY "임퍼소네이션 로그 삽입" ON impersonation_audit_log
  FOR INSERT WITH CHECK (false);  -- 직접 삽입 불가, Edge Function에서만 가능
```

---

## 부록: 인증 플로우 의사결정 트리

```
로그인이 필요한가?
│
├── YES
│   ├── 웹 앱인가?
│   │   ├── Next.js App Router → @supabase/ssr + 미들웨어
│   │   └── SPA (Vite/CRA) → AuthContext + supabase.auth.onAuthStateChange
│   │
│   ├── 모바일 앱인가?
│   │   ├── Expo/React Native → expo-secure-store + detectSessionInUrl: false
│   │   └── OAuth 사용 → expo-web-browser + makeRedirectUri
│   │
│   └── 서버 간 통신인가?
│       └── Service Role Key (환경변수, 클라이언트 노출 금지)
│
├── 보안 강화가 필요한가?
│   ├── MFA 요구 → TOTP 등록 + AAL2 확인
│   ├── 세션 제어 → signOut({ scope: 'others' })
│   └── 이상 탐지 → Auth Hooks + 감사 로그
│
└── 조직 기능이 필요한가?
    ├── RBAC → org_members + role_permissions
    ├── 초대 → org_invitations + Edge Function
    └── SSO → supabase.auth.signInWithSSO({ domain })
```

---

## 참고 자료

- [Supabase Auth with Next.js App Router](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [SSR 클라이언트 생성 | Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [React Native 인증 시작하기](https://supabase.com/blog/react-native-authentication)
- [네이티브 모바일 딥 링크 | Supabase](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [MFA (TOTP) | Supabase](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [엔터프라이즈 SSO | Supabase](https://supabase.com/docs/guides/auth/enterprise-sso)
- [SAML 2.0 | Supabase](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [Next.js + Supabase Cookie-Based Auth (2025 가이드)](https://the-shubham.medium.com/next-js-supabase-cookie-based-auth-workflow-the-best-auth-solution-2025-guide-f6738b4673c1)
- [Expo 가이드 | Supabase 사용하기](https://docs.expo.dev/guides/using-supabase/)
