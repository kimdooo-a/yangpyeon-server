# 03. Auth UI 플로우 — 양평 부엌 서버 대시보드

> Wave 4 · Tier 3 (U1) 산출물 — kdywave W4-U1 (Agent UI/UX-1)
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [03-ui-ux/](./) → **이 문서**
> 참조: [02-architecture/03-auth-advanced-blueprint.md](../02-architecture/03-auth-advanced-blueprint.md) · [02-architecture/06-auth-core-blueprint.md](../02-architecture/06-auth-core-blueprint.md)
> 근거: ADR-006 (Auth Core), ADR-007 (Auth Advanced), NFR-SEC.3~4, FR-5.*, FR-6.*

---

## 목차

- [1. 로그인 플로우](#1-로그인-플로우)
- [2. MFA 등록 플로우 (Phase 15 — MFASetupWizard)](#2-mfa-등록-플로우-phase-15--mfasetupwizard)
- [3. 디바이스 관리 UI — ActiveSessionsPanel](#3-디바이스-관리-ui--activesessionspanel)
- [4. 패스워드 변경 플로우](#4-패스워드-변경-플로우)
- [5. 비밀번호 재설정 플로우](#5-비밀번호-재설정-플로우)
- [6. 세션 만료 처리](#6-세션-만료-처리)
- [7. Anonymous Role UI](#7-anonymous-role-ui)
- [8. 에러 케이스 처리](#8-에러-케이스-처리)
- [9. ASCII Mockup 화면 5개](#9-ascii-mockup-화면-5개)

---

## 1. 로그인 플로우

### 1.1 전체 플로우 다이어그램

```
[로그인 페이지 /login]
       │
       ▼
[이메일 + 비밀번호 입력]
       │
       ├── [비밀번호 틀림] → 에러 메시지 표시, Rate Limit 카운터 증가
       │
       ├── [MFA 비활성화] ──────────────────────────► [대시보드 /dashboard]
       │
       └── [MFA 활성화]
              │
              ├── [TOTP 활성화] ──► [TOTP 챌린지 /auth/mfa?type=totp]
              │                          │
              │                     [6자리 코드 입력]
              │                          │
              │           ┌─────[코드 틀림, 2회 이하]
              │           │         │
              │           │    [코드 틀림, 3회] → 계정 잠금 (5분)
              │           │
              │           └── [코드 정상] ──► [대시보드]
              │
              └── [WebAuthn 활성화] → [WebAuthn 챌린지 /auth/mfa?type=webauthn]
                                           │
                                      [브라우저 생체인증 Prompt]
                                           │
                                      [성공] ──► [대시보드]
```

### 1.2 로그인 페이지 구조

```
라우트: /login
레이아웃: (auth) 그룹 — 중앙 정렬 카드
컴포넌트: LoginForm (Client Component)
```

```tsx
// src/app/(auth)/login/page.tsx
export default function LoginPage() {
  return (
    <>
      <h2 className="text-lg font-semibold text-foreground mb-1">로그인</h2>
      <p className="text-sm text-muted-foreground mb-6">
        양평 부엌 서버 대시보드에 접속합니다.
      </p>
      <LoginForm />
    </>
  );
}
```

```tsx
// src/components/auth/login-form.tsx
function LoginForm() {
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* 이메일 */}
        <FormField
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 비밀번호 */}
        <FormField
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>비밀번호</FormLabel>
                <Link
                  href="/reset-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  비밀번호 잊으셨나요?
                </Link>
              </div>
              <FormControl>
                <PasswordInput
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 에러 */}
        {loginError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{loginError}</AlertDescription>
          </Alert>
        )}

        {/* Rate Limit 경고 */}
        {rateLimitWarning && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              로그인 시도 횟수가 초과되었습니다. {rateLimitWarning}초 후 다시 시도하세요.
            </AlertDescription>
          </Alert>
        )}

        {/* 제출 */}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />로그인 중...</>
          ) : (
            '로그인'
          )}
        </Button>
      </form>
    </Form>
  );
}
```

### 1.3 비밀번호 입력 필드 (보기/숨기기)

```tsx
function PasswordInput({ ...props }: InputProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        className="pr-10"
        {...props}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        tabIndex={-1}
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
```

### 1.4 TOTP 챌린지 페이지

```
라우트: /auth/mfa?type=totp&session=<임시세션토큰>
```

```tsx
function TOTPChallengePage() {
  return (
    <>
      <div className="flex flex-col items-center mb-6">
        <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center mb-3">
          <Smartphone className="h-6 w-6 text-brand" />
        </div>
        <h2 className="text-lg font-semibold">2단계 인증</h2>
        <p className="text-sm text-muted-foreground mt-1 text-center">
          인증 앱에서 6자리 코드를 확인하세요.
        </p>
      </div>

      {/* 6자리 코드 입력 */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">인증 코드</label>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            autoFocus
            className="mt-2 justify-center"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button className="w-full" disabled={code.length < 6 || isPending} onClick={handleVerify}>
          {isPending ? '검증 중...' : '확인'}
        </Button>

        {/* 백업 코드 링크 */}
        <p className="text-center text-xs text-muted-foreground">
          앱에 접근할 수 없나요?{' '}
          <button
            className="text-brand hover:underline"
            onClick={() => setMode('backup')}
          >
            백업 코드 사용
          </button>
        </p>
      </div>
    </>
  );
}
```

---

## 2. MFA 등록 플로우 (Phase 15 — MFASetupWizard)

### 2.1 MFASetupWizard 컴포넌트

라우트: `/auth/mfa` (이미 로그인된 사용자의 MFA 설정)
컴포넌트명: `MFASetupWizard` (Tier 2 ADR-007에서 명명)

```
MFASetupWizard
├── Step 1: MFA 방법 선택 (TOTP / WebAuthn)
├── [TOTP 선택 시]
│   ├── Step 2: QR 코드 + 시드 백업
│   ├── Step 3: 6자리 코드 검증
│   └── Step 4: 백업 코드 발급
└── [WebAuthn 선택 시]
    ├── Step 2: 기기 이름 입력
    ├── Step 3: 브라우저 생체인증 Prompt
    └── Step 4: 백업 코드 발급 (선택적)
```

### 2.2 Step 1 — MFA 방법 선택

```tsx
function MFAMethodSelection({ onSelect }: { onSelect: (method: 'totp' | 'webauthn') => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium">인증 방법 선택</h3>
      <p className="text-sm text-muted-foreground">
        2단계 인증을 활성화하면 계정 보안이 크게 향상됩니다.
      </p>

      {/* TOTP 옵션 */}
      <button
        className={cn(
          "w-full flex items-start gap-3 p-4 rounded-md border border-border",
          "hover:border-brand hover:bg-brand/5 transition-colors text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        onClick={() => onSelect('totp')}
      >
        <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-sm font-medium">인증 앱 (TOTP)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Google Authenticator, Authy 등 앱에서 6자리 코드를 생성합니다.
            인터넷 없이도 사용 가능합니다.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto self-center" />
      </button>

      {/* WebAuthn 옵션 */}
      <button
        className={cn(
          "w-full flex items-start gap-3 p-4 rounded-md border border-border",
          "hover:border-brand hover:bg-brand/5 transition-colors text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        onClick={() => onSelect('webauthn')}
      >
        <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center shrink-0">
          <Fingerprint className="h-5 w-5 text-info" />
        </div>
        <div>
          <p className="text-sm font-medium">Passkey / 생체인증 (WebAuthn)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Touch ID, Windows Hello, YubiKey 등을 사용합니다.
            피싱에 완전히 저항합니다.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto self-center" />
      </button>
    </div>
  );
}
```

### 2.3 TOTP 등록 — Step 2: QR 코드 + 시드 백업

```tsx
function TOTPSetupQR({ secret, qrCodeUrl, userEmail }: TOTPSetupQRProps) {
  const [showSecret, setShowSecret] = React.useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">인증 앱으로 스캔</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Google Authenticator, Authy 또는 다른 TOTP 앱으로 아래 QR 코드를 스캔하세요.
        </p>
      </div>

      {/* QR 코드 */}
      <div className="flex justify-center p-4 bg-white rounded-md">
        {/* QR 코드 이미지 — base64 data URL */}
        <img
          src={qrCodeUrl}
          alt={`TOTP QR 코드 for ${userEmail}`}
          width={180}
          height={180}
          className="rounded"
        />
      </div>

      {/* 수동 입력 코드 (QR 스캔 불가 시) */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          QR 코드를 스캔할 수 없다면 이 코드를 직접 입력하세요:
        </p>
        <div className="flex items-center gap-2">
          <code className={cn(
            "flex-1 font-mono text-sm bg-muted px-2 py-1 rounded text-center",
            !showSecret && "blur-sm select-none"
          )}>
            {secret}
          </code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSecret((s) => !s)}
            aria-label={showSecret ? '시드 숨기기' : '시드 보기'}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              navigator.clipboard.writeText(secret);
              notify.success('클립보드에 복사됨');
            }}
            aria-label="클립보드에 복사"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          이 시드 코드는 다시 표시되지 않습니다. 안전한 곳에 보관하세요.
        </AlertDescription>
      </Alert>
    </div>
  );
}
```

### 2.4 TOTP 등록 — Step 3: 코드 검증

```tsx
// 앱에서 생성한 6자리 코드를 입력하여 등록 완료 확인
function TOTPVerification({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">코드 확인</h3>
        <p className="text-sm text-muted-foreground mt-1">
          인증 앱에서 표시되는 6자리 코드를 입력하여 설정을 완료하세요.
        </p>
      </div>

      <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus className="justify-center">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>

      {verifyError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>코드가 올바르지 않습니다. 앱의 최신 코드를 확인하세요.</AlertDescription>
        </Alert>
      )}

      <Button
        className="w-full"
        disabled={code.length < 6 || isPending}
        onClick={handleVerify}
      >
        {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />확인 중...</> : '확인'}
      </Button>
    </div>
  );
}
```

### 2.5 백업 코드 발급 (1회성 다운로드)

```tsx
function BackupCodesDisplay({ codes }: { codes: string[] }) {
  const [downloaded, setDownloaded] = React.useState(false);

  const handleDownload = () => {
    const content = [
      '양평 부엌 서버 대시보드 — 백업 코드',
      `생성일: ${new Date().toLocaleDateString('ko-KR')}`,
      '',
      '각 코드는 1회만 사용 가능합니다.',
      '안전한 곳에 보관하고 타인과 공유하지 마세요.',
      '',
      ...codes.map((code, i) => `${i + 1}. ${code}`),
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ypb-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">백업 코드 저장</h3>
        <p className="text-sm text-muted-foreground mt-1">
          인증 앱을 분실했을 때 사용할 수 있는 비상 코드입니다.
          각 코드는 1회만 사용 가능합니다.
        </p>
      </div>

      {/* 8개 코드 격자 표시 */}
      <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-md">
        {codes.map((code, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
            <code className="font-mono text-sm text-foreground tracking-wider">{code}</code>
          </div>
        ))}
      </div>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          이 화면을 닫으면 코드가 다시 표시되지 않습니다.
          반드시 다운로드하거나 안전한 곳에 복사하세요.
        </AlertDescription>
      </Alert>

      {/* 다운로드 버튼 */}
      <Button className="w-full" variant="outline" onClick={handleDownload}>
        <Download className="mr-2 h-4 w-4" />
        백업 코드 다운로드 (.txt)
      </Button>

      {/* 완료 버튼 — 다운로드 후에만 활성화 */}
      <Button
        className="w-full"
        disabled={!downloaded}
        onClick={onComplete}
      >
        {downloaded ? (
          <><Check className="mr-2 h-4 w-4" />설정 완료</>
        ) : (
          '다운로드 후 완료 가능'
        )}
      </Button>
    </div>
  );
}
```

### 2.6 WebAuthn 등록 플로우

```tsx
function WebAuthnSetup() {
  const [deviceName, setDeviceName] = React.useState('');
  const [step, setStep] = React.useState<'name' | 'prompt' | 'success'>('name');

  const handleRegister = async () => {
    try {
      setStep('prompt');
      // @simplewebauthn/browser 호출
      const options = await fetchRegistrationOptions();
      const credential = await startRegistration(options);
      await verifyRegistration(credential, deviceName);
      setStep('success');
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        notify.error('인증 취소됨', '사용자가 인증을 취소했습니다.');
        setStep('name');
      }
    }
  };

  if (step === 'name') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">기기 이름 설정</h3>
          <p className="text-sm text-muted-foreground mt-1">
            이 기기를 쉽게 구분할 수 있는 이름을 입력하세요.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">기기 이름</label>
          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="예: MacBook Pro (집), iPhone 15"
            autoFocus
          />
        </div>
        <Button className="w-full" disabled={!deviceName.trim()} onClick={handleRegister}>
          <Fingerprint className="mr-2 h-4 w-4" />
          Passkey 등록 시작
        </Button>
      </div>
    );
  }

  if (step === 'prompt') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-16 w-16 rounded-full bg-brand/10 flex items-center justify-center">
          <Fingerprint className="h-8 w-8 text-brand animate-pulse" />
        </div>
        <p className="text-sm text-center text-muted-foreground">
          브라우저의 생체인증 요청을 확인하세요...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
        <Check className="h-8 w-8 text-success" />
      </div>
      <p className="text-base font-medium">Passkey 등록 완료</p>
      <p className="text-sm text-muted-foreground">{deviceName}</p>
    </div>
  );
}
```

---

## 3. 디바이스 관리 UI — ActiveSessionsPanel

### 3.1 ActiveSessionsPanel 컴포넌트

라우트: `/auth/sessions`
컴포넌트명: `ActiveSessionsPanel` (Tier 2 06-auth-core-blueprint.md에서 명명)

```
ActiveSessionsPanel 레이아웃:
┌─────────────────────────────────────────────────────────────────┐
│ 활성 세션                              [모든 기기 로그아웃]     │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🖥  MacBook Pro — Chrome 120           현재 세션 ✓          │ │
│ │    서울, 한국 · 로그인: 2026-04-18 09:30                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📱  iPhone 15 — Safari                                      │ │
│ │    서울, 한국 · 로그인: 2026-04-17 22:15  [로그아웃]        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🖥  Windows PC — Edge 120                                   │ │
│ │    부산, 한국 · 로그인: 2026-04-15 14:22  [로그아웃]        │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
function ActiveSessionsPanel({ sessions, currentSessionId }: ActiveSessionsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">활성 세션</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            현재 로그인된 모든 기기 목록입니다.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowLogoutAll(true)}
        >
          모든 기기 로그아웃
        </Button>
      </div>

      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isCurrent={session.id === currentSessionId}
            onLogout={() => handleLogout(session.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  isCurrent,
  onLogout,
}: SessionCardProps) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-md border",
      isCurrent ? "border-brand/30 bg-brand/5" : "border-border bg-card"
    )}>
      {/* 기기 아이콘 */}
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        {session.deviceType === 'mobile' ? (
          <Smartphone className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Monitor className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* 세션 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            {session.deviceName} — {session.browserName}
          </p>
          {isCurrent && (
            <Badge className="bg-brand/15 text-brand border-brand/20 text-[10px]">
              현재 세션
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {session.location} · 로그인:{' '}
          {formatDistanceToNow(new Date(session.createdAt), {
            addSuffix: true,
            locale: ko,
          })}
        </p>
        <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
          IP: {session.ipAddress} · MFA: {session.mfaMethod ?? '없음'}
        </p>
      </div>

      {/* 로그아웃 버튼 (현재 세션 아닌 경우) */}
      {!isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-danger hover:text-danger hover:bg-danger/10"
          onClick={onLogout}
        >
          로그아웃
        </Button>
      )}
    </div>
  );
}
```

---

## 4. 패스워드 변경 플로우

### 4.1 패스워드 변경 폼

라우트: `/settings/security` 내 섹션 (별도 페이지 아닌 섹션)

```tsx
function ChangePasswordSection() {
  const form = useForm<ChangePasswordSchema>({
    resolver: zodResolver(changePasswordSchema),
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">비밀번호 변경</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          현재 비밀번호를 입력하고 새 비밀번호로 변경합니다.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
          {/* 현재 비밀번호 */}
          <FormField
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>현재 비밀번호</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="현재 비밀번호 입력"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 새 비밀번호 */}
          <FormField
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>새 비밀번호</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="8자 이상, 대소문자+숫자+특수문자 포함"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                {/* 강도 인디케이터 */}
                <PasswordStrengthIndicator password={field.value} />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 새 비밀번호 확인 */}
          <FormField
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>새 비밀번호 확인</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="새 비밀번호 재입력"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            {isPending ? '변경 중...' : '비밀번호 변경'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

### 4.2 비밀번호 강도 인디케이터

```tsx
function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = calculatePasswordStrength(password);
  // strength: 0 (없음) ~ 4 (강력)

  const levels = [
    { label: '매우 약함', color: 'bg-error-500' },
    { label: '약함', color: 'bg-warning-500' },
    { label: '보통', color: 'bg-warning-400' },
    { label: '강함', color: 'bg-success-500' },
    { label: '매우 강함', color: 'bg-success-400' },
  ];

  if (!password) return null;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < strength ? levels[strength - 1].color : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className={cn(
        "text-xs",
        strength <= 1 ? 'text-error-500' :
        strength <= 2 ? 'text-warning-500' :
        'text-success-500'
      )}>
        {password && levels[strength - 1]?.label}
      </p>
    </div>
  );
}
```

---

## 5. 비밀번호 재설정 플로우

### 5.1 플로우 단계

```
[/reset-password] — 이메일 입력
       │
       ▼
[이메일 전송 완료 화면]
"example@email.com으로 재설정 링크를 보냈습니다."
       │
       ▼ (이메일의 링크 클릭)
[/reset-password?token=<토큰>] — 새 비밀번호 입력
       │
       ├── [토큰 만료/무효] → 에러 + 재시도 링크
       │
       └── [새 비밀번호 설정 완료] → [로그인 페이지]
```

### 5.2 이메일 입력 페이지

```tsx
function RequestResetForm() {
  const [submitted, setSubmitted] = React.useState(false);

  if (submitted) {
    return (
      <div className="text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
          <Mail className="h-6 w-6 text-success" />
        </div>
        <h3 className="text-base font-medium">이메일을 확인하세요</h3>
        <p className="text-sm text-muted-foreground">
          <strong>{submittedEmail}</strong>으로<br />
          비밀번호 재설정 링크를 보냈습니다.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          이메일이 오지 않았나요?{' '}
          <button
            className="text-brand hover:underline"
            onClick={() => setSubmitted(false)}
          >
            다시 시도
          </button>
        </p>
        <Link href="/login">
          <Button variant="ghost" size="sm" className="mt-2">
            로그인으로 돌아가기
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">비밀번호 재설정</h2>
        <p className="text-sm text-muted-foreground mt-1">
          계정 이메일을 입력하면 재설정 링크를 보내드립니다.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input type="email" placeholder="admin@example.com" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '전송 중...' : '재설정 링크 보내기'}
          </Button>
        </form>
      </Form>
      <div className="text-center">
        <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
```

---

## 6. 세션 만료 처리

### 6.1 자동 갱신 전략

```
세션 만료 전 자동 갱신:
- Access Token 유효기간: 15분
- Refresh Token 유효기간: 7일
- 자동 갱신 트리거: Access Token 만료 3분 전 (12분 경과 시)

갱신 실패 처리:
1. 갱신 재시도 1회 (500ms 후)
2. 재시도 실패 → 세션 만료 처리
3. 현재 페이지 URL을 localStorage에 저장
4. /login으로 리다이렉트
5. 로그인 성공 후 저장된 URL로 복귀
```

### 6.2 세션 만료 Toast 알림

```tsx
// 세션 만료 30초 전 경고
function SessionExpiryWarning({ expiresAt }: { expiresAt: Date }) {
  React.useEffect(() => {
    const msRemaining = expiresAt.getTime() - Date.now();
    const warningThreshold = 30 * 1000; // 30초

    if (msRemaining <= warningThreshold) {
      const toastId = toast.warning('세션 만료 임박', {
        description: '30초 후 자동 로그아웃됩니다.',
        duration: Infinity,
        action: {
          label: '세션 연장',
          onClick: () => {
            refreshSession();
            toast.dismiss(toastId);
          },
        },
      });
    }
  }, [expiresAt]);

  return null;
}
```

### 6.3 세션 만료 후 리다이렉트

```typescript
// src/middleware.ts
// 인증 실패 시 현재 URL을 returnUrl로 저장

export function middleware(request: NextRequest) {
  const session = request.cookies.get('ypb_session');

  if (!session || isSessionExpired(session.value)) {
    const returnUrl = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?returnUrl=${returnUrl}`, request.url));
  }
  return NextResponse.next();
}
```

---

## 7. Anonymous Role UI

### 7.1 Anonymous 접근 공유 링크

```
공유 링크 형식: https://stylelucky4u.com/shared/<share-token>
레이아웃: (public) 그룹 — 최소 헤더
권한: 읽기 전용 (GUEST role)
```

```tsx
// (public) 레이아웃 적용
function SharedViewHeader() {
  return (
    <header className="h-12 border-b border-border flex items-center px-4 gap-3">
      <div className="h-6 w-6 rounded bg-brand flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">양</span>
      </div>
      <span className="text-sm font-medium">양평 부엌</span>
      <Badge variant="outline" className="ml-auto text-xs bg-muted">
        읽기 전용
      </Badge>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">로그인</Link>
      </Button>
    </header>
  );
}
```

### 7.2 Anonymous 모드 제한 표시

```tsx
// 편집 시도 시 표시되는 배너
function ReadOnlyBanner() {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription className="text-sm">
        공유 링크로 접근 중입니다. 데이터를 변경하려면{' '}
        <Link href="/login" className="text-brand hover:underline">
          로그인
        </Link>
        이 필요합니다.
      </AlertDescription>
    </Alert>
  );
}
```

---

## 8. 에러 케이스 처리

### 8.1 에러 유형별 메시지

| 에러 코드 | 사용자 메시지 | 기술 메시지 |
|---------|------------|-----------|
| `AUTH_INVALID_CREDENTIALS` | "이메일 또는 비밀번호가 올바르지 않습니다." | Invalid email or password |
| `AUTH_ACCOUNT_LOCKED` | "계정이 잠겼습니다. {minutes}분 후 다시 시도하세요." | Account locked due to too many attempts |
| `AUTH_RATE_LIMIT` | "너무 많은 시도입니다. {seconds}초 후 다시 시도하세요." | Rate limit exceeded |
| `AUTH_MFA_INVALID` | "인증 코드가 올바르지 않습니다." | Invalid TOTP code |
| `AUTH_MFA_EXPIRED` | "인증 코드가 만료되었습니다. 새 코드를 확인하세요." | TOTP code expired |
| `AUTH_SESSION_EXPIRED` | "세션이 만료되었습니다. 다시 로그인하세요." | Session expired |
| `AUTH_WEBAUTHN_FAILED` | "생체인증에 실패했습니다. 다시 시도하세요." | WebAuthn verification failed |
| `AUTH_WEBAUTHN_CANCELLED` | "인증이 취소되었습니다." | User cancelled WebAuthn |
| `AUTH_RESET_TOKEN_INVALID` | "재설정 링크가 유효하지 않거나 만료되었습니다." | Invalid or expired reset token |
| `AUTH_RESET_TOKEN_EXPIRED` | "재설정 링크가 만료되었습니다(24시간). 새로 요청하세요." | Reset token expired |
| `AUTH_PASSWORD_TOO_WEAK` | "비밀번호가 너무 약합니다. 8자 이상, 대소문자+숫자+특수문자를 포함하세요." | Password too weak |
| `AUTH_HIBP_BREACH` | "이 비밀번호는 유출 데이터베이스에 등록되어 있습니다. 다른 비밀번호를 사용하세요." | Password found in breach database |

### 8.2 Rate Limit 시각적 피드백

```tsx
// 로그인 폼에 Rate Limit 카운터 표시
function RateLimitWarning({ remaining, resetAt }: RateLimitWarningProps) {
  const [countdown, setCountdown] = React.useState(
    Math.ceil((resetAt.getTime() - Date.now()) / 1000)
  );

  React.useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>시도 횟수 초과</AlertTitle>
      <AlertDescription>
        {remaining > 0 ? (
          <>남은 시도 횟수: <strong>{remaining}회</strong></>
        ) : (
          <>{countdown}초 후 다시 시도 가능합니다.</>
        )}
      </AlertDescription>
    </Alert>
  );
}
```

---

## 9. ASCII Mockup 화면 5개

### 화면 1: 로그인 페이지

```
┌─────────────────────────────────────────────────────────────┐
│                      [다크 배경 #0E0E0F]                     │
│                                                             │
│                    ┌──────────────────┐                     │
│                    │  [양] (초록 원)  │                     │
│                    │  양평 부엌       │                     │
│                    │  서버 대시보드   │                     │
│                    └──────────────────┘                     │
│                                                             │
│              ┌──────────────────────────────┐               │
│              │ 로그인                        │               │
│              │ 양평 부엌 서버 대시보드에... │               │
│              │                              │               │
│              │ 이메일                        │               │
│              │ ┌────────────────────────┐   │               │
│              │ │ admin@example.com      │   │               │
│              │ └────────────────────────┘   │               │
│              │                              │               │
│              │ 비밀번호        비밀번호 잊으셨나요?          │
│              │ ┌──────────────────────┐[👁]│               │
│              │ │ ••••••••             │   │               │
│              │ └──────────────────────┘   │               │
│              │                              │               │
│              │ ┌────────────────────────┐   │               │
│              │ │        로그인           │   │               │
│              │ └────────────────────────┘   │               │
│              └──────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 화면 2: TOTP MFA 챌린지

```
┌──────────────────────────────────────────────────────────────┐
│                      [다크 배경 #0E0E0F]                      │
│                                                              │
│              ┌──────────────────────────────┐                │
│              │                              │                │
│              │     ┌─────┐                  │                │
│              │     │ 📱  │  2단계 인증       │                │
│              │     └─────┘                  │                │
│              │  인증 앱에서 6자리 코드를...  │                │
│              │                              │                │
│              │  인증 코드                   │                │
│              │  ┌───┬───┬───┐ ─ ┌───┬───┬───┐               │
│              │  │ 1 │ 2 │ 3 │   │ _ │   │   │               │
│              │  └───┴───┴───┘   └───┴───┴───┘               │
│              │                              │                │
│              │ ┌────────────────────────┐   │                │
│              │ │          확인           │   │                │
│              │ └────────────────────────┘   │                │
│              │  앱에 접근할 수 없나요?       │                │
│              │  백업 코드 사용              │                │
│              └──────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

### 화면 3: MFASetupWizard — 백업 코드

```
┌──────────────────────────────────────────────────────────────┐
│  [App Shell]                                                 │
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │  Auth / MFA 설정                                  │
│          ├───────────────────────────────────────────────────┤
│          │                                                   │
│          │  ● 방법 선택  ● QR 스캔  ● 코드 확인  ◐ 백업 코드│
│          │                                                   │
│          │  백업 코드 저장                                    │
│          │  인증 앱을 분실했을 때 사용할 수 있는...           │
│          │                                                   │
│          │  ┌──────────────────────────────────────────────┐ │
│          │  │  1. ABCD-1234-EFGH  │  5. WXYZ-5678-ABCD    │ │
│          │  │  2. EFGH-5678-IJKL  │  6. CDEF-9012-EFGH    │ │
│          │  │  3. MNOP-9012-QRST  │  7. GHIJ-3456-IJKL    │ │
│          │  │  4. UVWX-3456-UVWX  │  8. KLMN-7890-MNOP    │ │
│          │  └──────────────────────────────────────────────┘ │
│          │                                                   │
│          │  ⚠ 이 화면을 닫으면 다시 표시되지 않습니다.       │
│          │                                                   │
│          │  [⬇ 백업 코드 다운로드 (.txt)]                    │
│          │  [설정 완료] ← 다운로드 후 활성화                 │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

### 화면 4: ActiveSessionsPanel

```
┌──────────────────────────────────────────────────────────────┐
│  [App Shell]                                                 │
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │  Auth / Sessions                                  │
│          ├───────────────────────────────────────────────────┤
│          │  활성 세션              [모든 기기 로그아웃]       │
│          │  현재 로그인된 모든 기기 목록입니다.               │
│          │                                                   │
│          │  ┌────────────────────────────────────────────┐   │
│          │  │ [🖥] MacBook Pro — Chrome 120  [현재 세션 ✓]│   │
│          │  │      서울, 한국                             │   │
│          │  │      로그인: 방금 전 · IP: 127.0.0.1        │   │
│          │  │      MFA: TOTP                              │   │
│          │  └────────────────────────────────────────────┘   │
│          │                                                   │
│          │  ┌────────────────────────────────────────────┐   │
│          │  │ [📱] iPhone 15 — Safari        [로그아웃]   │   │
│          │  │      서울, 한국                             │   │
│          │  │      로그인: 18시간 전 · IP: 192.168.1.10   │   │
│          │  │      MFA: WebAuthn                          │   │
│          │  └────────────────────────────────────────────┘   │
│          │                                                   │
│          │  ┌────────────────────────────────────────────┐   │
│          │  │ [🖥] Windows PC — Edge 120      [로그아웃]   │   │
│          │  │      부산, 한국                             │   │
│          │  │      로그인: 3일 전 · IP: 10.0.0.5          │   │
│          │  │      MFA: TOTP                              │   │
│          │  └────────────────────────────────────────────┘   │
└──────────┴───────────────────────────────────────────────────┘
```

### 화면 5: 비밀번호 재설정 완료

```
┌─────────────────────────────────────────────────────────────┐
│                      [다크 배경 #0E0E0F]                     │
│                                                             │
│              ┌──────────────────────────────┐               │
│              │                              │               │
│              │     ┌─────────────┐          │               │
│              │     │  [✓] 초록   │          │               │
│              │     └─────────────┘          │               │
│              │  비밀번호 재설정 완료         │               │
│              │  새 비밀번호로 로그인하세요.  │               │
│              │                              │               │
│              │ ┌────────────────────────┐   │               │
│              │ │      로그인으로 이동    │   │               │
│              │ └────────────────────────┘   │               │
│              │                              │               │
│              │ 보안 팁:                     │               │
│              │ • 비밀번호 관리자 사용 권장  │               │
│              │ • MFA 활성화 권장           │               │
│              └──────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
