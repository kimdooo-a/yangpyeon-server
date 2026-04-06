# Supabase Edge Functions 운영 패턴 가이드

> Wave 3 — Edge Functions 심화 운영 패턴  
> 작성일: 2026-04-06  
> 참고: Supabase 공식 문서 (2025-2026 기준)

---

## 목차

1. [아키텍처 패턴](#1-아키텍처-패턴)
   - 1.1 Webhook 수신기
   - 1.2 API 프록시
   - 1.3 배치 처리 (pg_cron + Edge Functions)
   - 1.4 이벤트 기반 파이프라인
2. [인증 패턴](#2-인증-패턴)
   - 2.1 JWT 검증
   - 2.2 API Key 기반 인증
   - 2.3 Webhook 서명 검증
3. [에러 처리 & 복구](#3-에러-처리--복구)
   - 3.1 구조화된 에러 응답
   - 3.2 재시도 로직 (Idempotency Key)
   - 3.3 Dead Letter Queue 패턴
4. [성능 최적화](#4-성능-최적화)
   - 4.1 콜드 스타트 최소화
   - 4.2 커넥션 풀링
   - 4.3 응답 스트리밍
5. [배포 전략](#5-배포-전략)
   - 5.1 환경별 배포
   - 5.2 롤링/카나리 배포
   - 5.3 시크릿 관리
6. [모니터링 & 디버깅](#6-모니터링--디버깅)
   - 6.1 구조화된 로깅
   - 6.2 에러 추적
   - 6.3 성능 메트릭

---

## 1. 아키텍처 패턴

### 1.1 Webhook 수신기

Webhook은 외부 서비스(Stripe, GitHub, Slack 등)가 이벤트 발생 시 능동적으로 호출하는 HTTP 엔드포인트다.
Edge Function은 이 수신기 역할에 최적화되어 있다.

#### 1.1.1 Stripe Webhook 수신기

Stripe는 결제 이벤트를 Webhook으로 발송하며, 서명을 포함한다.
Edge Function이 서명을 검증하여 위조 요청을 차단한다.

```typescript
// supabase/functions/stripe-webhook/index.ts
import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Stripe 클라이언트는 핸들러 밖에서 초기화 (콜드 스타트 최적화)
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")!;

  if (!signature) {
    return new Response("서명 헤더 누락", { status: 400 });
  }

  // 원시 body를 텍스트로 읽어야 서명 검증이 가능
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Stripe 서명 검증 실패:", err.message);
    return new Response(`Webhook 오류: ${err.message}`, { status: 400 });
  }

  // 이벤트 타입별 처리
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSucceeded(paymentIntent);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCanceled(subscription);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
    default:
      console.log(`처리하지 않는 이벤트 타입: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (error) {
    console.error("결제 완료 처리 실패:", error);
    throw error;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const { error } = await supabase.from("subscriptions").upsert({
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    status: subscription.status,
    current_period_end: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) console.error("구독 업데이트 실패:", error);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);

  if (error) console.error("구독 취소 처리 실패:", error);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // 결제 실패 알림 로직
  console.log(`결제 실패 인보이스: ${invoice.id}, 고객: ${invoice.customer}`);
}
```

`config.toml`에서 JWT 검증을 비활성화해야 한다 (Stripe는 JWT를 전송하지 않으므로):

```toml
# supabase/config.toml
[functions.stripe-webhook]
verify_jwt = false
```

#### 1.1.2 GitHub Webhook 수신기

GitHub은 HMAC-SHA256 서명을 사용한다.

```typescript
// supabase/functions/github-webhook/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSignatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const expectedSignature =
    "sha256=" +
    Array.from(new Uint8Array(expectedSignatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // 타이밍 공격 방지를 위한 상수 시간 비교
  return timingSafeEqual(expectedSignature, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("X-Hub-Signature-256") ?? "";
  const event = req.headers.get("X-GitHub-Event") ?? "";
  const deliveryId = req.headers.get("X-GitHub-Delivery") ?? "";
  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET")!;

  const body = await req.text();
  const isValid = await verifyGitHubSignature(body, signature, secret);

  if (!isValid) {
    return new Response("서명 검증 실패", { status: 401 });
  }

  const payload = JSON.parse(body);

  // Idempotency: 이미 처리된 delivery는 건너뜀
  const { data: existing } = await supabase
    .from("github_webhook_deliveries")
    .select("id")
    .eq("delivery_id", deliveryId)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ message: "이미 처리됨" }), {
      status: 200,
    });
  }

  // 처리 기록 저장
  await supabase.from("github_webhook_deliveries").insert({
    delivery_id: deliveryId,
    event_type: event,
    processed_at: new Date().toISOString(),
  });

  switch (event) {
    case "push":
      await handlePush(payload);
      break;
    case "pull_request":
      await handlePullRequest(payload);
      break;
    case "release":
      await handleRelease(payload);
      break;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

async function handlePush(payload: any) {
  const { ref, repository, commits } = payload;
  console.log(
    `Push 이벤트: ${repository.full_name} @ ${ref}, 커밋 수: ${commits.length}`
  );
}

async function handlePullRequest(payload: any) {
  const { action, pull_request } = payload;
  console.log(`PR ${action}: #${pull_request.number} - ${pull_request.title}`);
}

async function handleRelease(payload: any) {
  const { action, release } = payload;
  if (action === "published") {
    await supabase.from("releases").insert({
      tag: release.tag_name,
      name: release.name,
      body: release.body,
      published_at: release.published_at,
    });
  }
}
```

---

### 1.2 API 프록시 (외부 API 래핑, CORS 우회)

Edge Function을 프록시로 사용하면 API 키를 클라이언트에 노출하지 않고 외부 API를 호출할 수 있다.
또한 CORS 문제를 해결하거나 요청/응답을 변환하는 용도로도 사용된다.

```typescript
// supabase/functions/api-proxy/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS 헤더 공통 정의
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// 허용된 외부 API 엔드포인트 목록 (보안을 위해 화이트리스트 방식)
const ALLOWED_TARGETS: Record<string, string> = {
  weather: "https://api.openweathermap.org/data/2.5",
  maps: "https://maps.googleapis.com/maps/api",
  translate: "https://translation.googleapis.com/language/translate/v2",
};

Deno.serve(async (req) => {
  // OPTIONS preflight 처리
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("target");
  const path = url.searchParams.get("path") ?? "";

  if (!target || !ALLOWED_TARGETS[target]) {
    return new Response(
      JSON.stringify({ error: "허용되지 않는 대상 API" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 사용자 인증 검증 (선택적)
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "인증 필요" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // API 키를 서버 측에서 추가
  const apiKeyMap: Record<string, string> = {
    weather: Deno.env.get("OPENWEATHER_API_KEY")!,
    maps: Deno.env.get("GOOGLE_MAPS_API_KEY")!,
    translate: Deno.env.get("GOOGLE_TRANSLATE_API_KEY")!,
  };

  const targetUrl = new URL(`${ALLOWED_TARGETS[target]}${path}`);

  // 원래 쿼리 파라미터를 전달
  url.searchParams.forEach((value, key) => {
    if (key !== "target" && key !== "path") {
      targetUrl.searchParams.set(key, value);
    }
  });

  // API 키 추가
  if (target === "weather") {
    targetUrl.searchParams.set("appid", apiKeyMap[target]);
  } else if (target === "maps" || target === "translate") {
    targetUrl.searchParams.set("key", apiKeyMap[target]);
  }

  // 요청 전달
  const proxyResponse = await fetch(targetUrl.toString(), {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body:
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.text()
        : undefined,
  });

  const responseData = await proxyResponse.json();

  return new Response(JSON.stringify(responseData), {
    status: proxyResponse.status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Proxy-Target": target,
    },
  });
});
```

---

### 1.3 배치 처리 (pg_cron + Edge Functions)

pg_cron은 PostgreSQL 내부에서 cron 스케줄로 작업을 실행한다.
pg_net과 조합하면 Edge Function을 주기적으로 호출하는 배치 파이프라인을 구성할 수 있다.

#### 1.3.1 pg_cron + pg_net으로 Edge Function 주기 호출

```sql
-- 매일 자정에 일일 리포트 생성 Edge Function 호출
SELECT cron.schedule(
  'daily-report-generator',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object(
      'date', CURRENT_DATE::TEXT,
      'type', 'daily'
    )
  ) AS request_id;
  $$
);

-- 10분마다 임베딩 큐 처리
SELECT cron.schedule(
  'process-embedding-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/process-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('batch_size', 50)
  );
  $$
);
```

#### 1.3.2 배치 처리 Edge Function

```typescript
// supabase/functions/process-embeddings/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface BatchRequest {
  batch_size?: number;
  retry?: boolean;
}

Deno.serve(async (req) => {
  const { batch_size = 50, retry = false }: BatchRequest = await req.json();

  // 처리할 항목 조회 (큐에서 dequeue)
  const { data: items, error: fetchError } = await supabase
    .from("embedding_queue")
    .select("*")
    .eq("status", retry ? "failed" : "pending")
    .order("created_at", { ascending: true })
    .limit(batch_size);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
    });
  }

  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "큐 비어있음" }), {
      status: 200,
    });
  }

  // 처리 중 상태로 업데이트 (중복 처리 방지)
  const ids = items.map((i) => i.id);
  await supabase
    .from("embedding_queue")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .in("id", ids);

  const results = await Promise.allSettled(
    items.map(async (item) => {
      try {
        // OpenAI 임베딩 생성
        const embeddingResponse = await fetch(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: item.content,
              model: "text-embedding-3-small",
            }),
          }
        );

        const { data } = await embeddingResponse.json();
        const embedding = data[0].embedding;

        // 원본 테이블에 임베딩 저장
        await supabase
          .from(item.table_name)
          .update({ embedding })
          .eq("id", item.record_id);

        // 큐에서 완료 처리
        await supabase
          .from("embedding_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        return { id: item.id, status: "success" };
      } catch (err) {
        // 실패 시 retry_count 증가
        const retryCount = (item.retry_count ?? 0) + 1;
        const newStatus = retryCount >= 3 ? "dead_letter" : "failed";

        await supabase
          .from("embedding_queue")
          .update({
            status: newStatus,
            retry_count: retryCount,
            last_error: err.message,
            failed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        return { id: item.id, status: "failed", error: err.message };
      }
    })
  );

  const succeeded = results.filter(
    (r) => r.status === "fulfilled" && r.value.status === "success"
  ).length;
  const failed = results.length - succeeded;

  return new Response(
    JSON.stringify({
      processed: results.length,
      succeeded,
      failed,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
```

---

### 1.4 이벤트 기반 파이프라인 (DB trigger → pg_net → Edge Function)

데이터베이스에서 레코드가 변경될 때 자동으로 Edge Function을 트리거하는 패턴이다.

#### 1.4.1 DB 트리거 + pg_net 설정

```sql
-- pg_net 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 새 주문 생성 시 알림 Edge Function 호출 트리거 함수
CREATE OR REPLACE FUNCTION notify_new_order()
RETURNS TRIGGER AS $$
DECLARE
  request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/order-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object(
      'event', 'order.created',
      'order_id', NEW.id,
      'user_id', NEW.user_id,
      'amount', NEW.total_amount,
      'currency', NEW.currency,
      'created_at', NEW.created_at
    )
  ) INTO request_id;

  -- 비동기 요청 ID를 로그 테이블에 기록
  INSERT INTO webhook_logs (event_type, record_id, net_request_id)
  VALUES ('order.created', NEW.id, request_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 등록
CREATE TRIGGER on_order_created
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_order();

-- 재고 임계치 도달 시 보충 요청
CREATE OR REPLACE FUNCTION check_inventory_threshold()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity <= NEW.reorder_threshold THEN
    PERFORM net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/inventory-reorder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := jsonb_build_object(
        'product_id', NEW.id,
        'current_quantity', NEW.quantity,
        'reorder_quantity', NEW.reorder_quantity
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_inventory_low
  AFTER UPDATE OF quantity ON inventory
  FOR EACH ROW
  WHEN (NEW.quantity <= NEW.reorder_threshold AND OLD.quantity > OLD.reorder_threshold)
  EXECUTE FUNCTION check_inventory_threshold();
```

#### 1.4.2 이벤트 수신 Edge Function

```typescript
// supabase/functions/order-notification/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface OrderEvent {
  event: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  created_at: string;
}

Deno.serve(async (req) => {
  const event: OrderEvent = await req.json();

  // 사용자 이메일 조회
  const { data: user } = await supabase.auth.admin.getUserById(event.user_id);

  if (!user.user?.email) {
    console.warn(`사용자 이메일 없음: ${event.user_id}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // 이메일 발송 (Resend 예시)
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "no-reply@example.com",
      to: [user.user.email],
      subject: "주문이 접수되었습니다",
      html: `
        <h1>주문 확인</h1>
        <p>주문 번호: ${event.order_id}</p>
        <p>결제 금액: ${event.amount.toLocaleString()} ${event.currency.toUpperCase()}</p>
        <p>주문 일시: ${new Date(event.created_at).toLocaleString("ko-KR")}</p>
      `,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

---

## 2. 인증 패턴

### 2.1 JWT 검증 (서비스 역할 vs 사용자 토큰)

#### 2.1.1 기본 JWT 검증

기본적으로 Edge Function은 `Authorization: Bearer <token>` 헤더의 JWT를 자동 검증한다.
`verify_jwt = true` (기본값)이면 유효하지 않은 JWT는 401 응답으로 자동 차단된다.

```typescript
// supabase/functions/protected-resource/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // createClient에 요청 헤더를 전달하여 사용자 컨텍스트 설정
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    }
  );

  // 현재 인증된 사용자 확인
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return new Response(JSON.stringify({ error: "인증되지 않은 요청" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 사용자의 RLS 정책이 적용된 데이터 조회
  const { data, error: dbError } = await supabase
    .from("user_data")
    .select("*")
    .eq("user_id", user.id);

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ user: user.id, data }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

#### 2.1.2 서비스 역할 토큰 vs 사용자 토큰 구분

```typescript
// supabase/functions/admin-action/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// 서비스 역할 클라이언트 (RLS 우회, 관리자 작업용)
const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "인증 헤더 필요" }), {
      status: 401,
    });
  }

  // 사용자 클라이언트로 토큰 검증
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "유효하지 않은 토큰" }), {
      status: 401,
    });
  }

  // 사용자 역할 확인 (admin 역할만 허용)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "권한 없음" }), {
      status: 403,
    });
  }

  // 관리자 작업 수행 (서비스 역할 클라이언트로 RLS 우회)
  const { data, error } = await adminClient.from("sensitive_data").select("*");

  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

#### 2.1.3 커스텀 JWT 검증 (제3자 발급 JWT)

```typescript
// supabase/functions/custom-jwt/index.ts
// 외부 시스템(예: Firebase, Auth0)에서 발급한 JWT를 직접 검증

async function verifyJWT(token: string, jwksUrl: string): Promise<any> {
  // JWKS에서 공개키 가져오기
  const jwksResponse = await fetch(jwksUrl);
  const { keys } = await jwksResponse.json();

  // 토큰 헤더 파싱
  const [headerB64] = token.split(".");
  const header = JSON.parse(atob(headerB64));

  // kid로 공개키 찾기
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("일치하는 키 없음");

  // Web Crypto API로 검증
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = Uint8Array.from(atob(signaturePart.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    data
  );

  if (!isValid) throw new Error("JWT 서명 검증 실패");

  return JSON.parse(atob(payloadPart));
}

Deno.serve(async (req) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return new Response("토큰 없음", { status: 401 });
  }

  try {
    const payload = await verifyJWT(
      token,
      "https://your-auth-provider.com/.well-known/jwks.json"
    );

    // 만료 확인
    if (payload.exp < Date.now() / 1000) {
      return new Response("만료된 토큰", { status: 401 });
    }

    return new Response(JSON.stringify({ user: payload.sub, claims: payload }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 401,
    });
  }
});
```

---

### 2.2 API Key 기반 인증

내부 서비스 간 통신이나 서드파티 통합 시 API Key를 사용한다.

```typescript
// supabase/functions/api-key-protected/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface ApiKeyRecord {
  id: string;
  key_hash: string;
  owner_id: string;
  scopes: string[];
  rate_limit: number;
  requests_today: number;
  is_active: boolean;
  expires_at: string | null;
}

async function validateApiKey(
  apiKey: string,
  requiredScope: string
): Promise<ApiKeyRecord | null> {
  // API Key는 해시하여 DB에 저장 (평문 저장 금지)
  const keyHash = await hashApiKey(apiKey);

  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  // 만료 확인
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // 스코프 확인
  if (!data.scopes.includes(requiredScope) && !data.scopes.includes("*")) {
    return null;
  }

  return data;
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  // X-API-Key 헤더에서 키 추출
  const apiKey =
    req.headers.get("X-API-Key") ||
    new URL(req.url).searchParams.get("api_key");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key 필요" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const keyRecord = await validateApiKey(apiKey, "read:data");

  if (!keyRecord) {
    return new Response(
      JSON.stringify({ error: "유효하지 않거나 만료된 API Key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Rate Limiting 확인
  if (keyRecord.requests_today >= keyRecord.rate_limit) {
    return new Response(JSON.stringify({ error: "일일 요청 한도 초과" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(keyRecord.rate_limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": new Date(
          new Date().setHours(24, 0, 0, 0)
        ).toISOString(),
      },
    });
  }

  // 요청 카운트 증가 (비동기, 응답을 블로킹하지 않음)
  supabase
    .from("api_keys")
    .update({ requests_today: keyRecord.requests_today + 1 })
    .eq("id", keyRecord.id);

  return new Response(
    JSON.stringify({ ok: true, owner: keyRecord.owner_id }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(
          keyRecord.rate_limit - keyRecord.requests_today - 1
        ),
      },
    }
  );
});
```

---

### 2.3 Webhook 서명 검증

다양한 서비스의 Webhook 서명 검증 패턴을 하나의 유틸리티로 통합한다.

```typescript
// supabase/functions/_shared/webhook-verify.ts

export type WebhookProvider = "stripe" | "github" | "slack" | "svix";

export async function verifyWebhookSignature(
  provider: WebhookProvider,
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  switch (provider) {
    case "stripe":
      return verifyStripeSignature(payload, headers, secret);
    case "github":
      return verifyGitHubSignature(payload, headers, secret);
    case "slack":
      return verifySlackSignature(payload, headers, secret);
    default:
      throw new Error(`지원하지 않는 프로바이더: ${provider}`);
  }
}

async function verifyStripeSignature(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const signature = headers.get("Stripe-Signature");
  if (!signature) return false;

  const parts = signature.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts["t"];
  const expectedSig = parts["v1"];

  // 타임스탬프 신선도 확인 (5분 이내)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedHash = await hmacSha256(secret, signedPayload);

  return timingSafeEqual(expectedHash, expectedSig);
}

async function verifyGitHubSignature(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const signature = headers.get("X-Hub-Signature-256");
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expectedHash = "sha256=" + (await hmacSha256(secret, payload));
  return timingSafeEqual(expectedHash, signature);
}

async function verifySlackSignature(
  payload: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const signature = headers.get("X-Slack-Signature");
  const timestamp = headers.get("X-Slack-Request-Timestamp");

  if (!signature || !timestamp) return false;

  // 재전송 공격 방지: 5분 이내 요청만 허용
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${payload}`;
  const expectedHash = "v0=" + (await hmacSha256(secret, baseString));
  return timingSafeEqual(expectedHash, signature);
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );
  return Array.from(new Uint8Array(signature))
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

## 3. 에러 처리 & 복구

### 3.1 구조화된 에러 응답

```typescript
// supabase/functions/_shared/errors.ts

export enum ErrorCode {
  // 인증 에러
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_TOKEN = "INVALID_TOKEN",
  // 유효성 검사 에러
  VALIDATION_ERROR = "VALIDATION_ERROR",
  MISSING_FIELD = "MISSING_FIELD",
  // 리소스 에러
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  // 서버 에러
  INTERNAL_ERROR = "INTERNAL_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  // 제한 에러
  RATE_LIMITED = "RATE_LIMITED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
}

interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    request_id?: string;
    timestamp: string;
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  details?: unknown,
  requestId?: string
): Response {
  const body: ErrorResponse = {
    error: {
      code,
      message,
      details,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      ...(requestId ? { "X-Request-ID": requestId } : {}),
    },
  });
}

// 에러 핸들러 래퍼
export function withErrorHandling(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      return await handler(req);
    } catch (err) {
      // 에러 로깅 (구조화된 형식)
      console.error(
        JSON.stringify({
          level: "error",
          request_id: requestId,
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        })
      );

      if (err instanceof AppError) {
        return createErrorResponse(
          err.code,
          err.message,
          err.statusCode,
          err.details,
          requestId
        );
      }

      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        "내부 서버 오류가 발생했습니다",
        500,
        undefined,
        requestId
      );
    }
  };
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

---

### 3.2 재시도 로직 (Idempotency Key)

```typescript
// supabase/functions/payment-process/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { withErrorHandling, AppError, ErrorCode } from "../_shared/errors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface ProcessPaymentRequest {
  order_id: string;
  amount: number;
  currency: string;
  payment_method_id: string;
}

async function processPayment(req: Request): Promise<Response> {
  // Idempotency Key로 중복 요청 감지
  const idempotencyKey = req.headers.get("Idempotency-Key");

  if (!idempotencyKey) {
    throw new AppError(
      ErrorCode.MISSING_FIELD,
      "Idempotency-Key 헤더가 필요합니다",
      400
    );
  }

  // 이미 처리된 요청인지 확인
  const { data: existingRequest } = await supabase
    .from("idempotency_keys")
    .select("response_status, response_body, created_at")
    .eq("key", idempotencyKey)
    .single();

  if (existingRequest) {
    // 24시간 이내 중복 요청이면 캐시된 응답 반환
    const age = Date.now() - new Date(existingRequest.created_at).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return new Response(existingRequest.response_body, {
        status: existingRequest.response_status,
        headers: {
          "Content-Type": "application/json",
          "X-Idempotent-Replayed": "true",
        },
      });
    }
  }

  const body: ProcessPaymentRequest = await req.json();

  // 실제 결제 처리
  let responseStatus: number;
  let responseBody: string;

  try {
    const paymentResult = await chargePayment(body);
    responseStatus = 200;
    responseBody = JSON.stringify({
      success: true,
      payment_id: paymentResult.id,
      status: paymentResult.status,
    });
  } catch (err) {
    responseStatus = 402;
    responseBody = JSON.stringify({
      success: false,
      error: err.message,
    });
  }

  // 결과를 idempotency_keys 테이블에 저장
  await supabase.from("idempotency_keys").upsert({
    key: idempotencyKey,
    response_status: responseStatus,
    response_body: responseBody,
    created_at: new Date().toISOString(),
  });

  return new Response(responseBody, {
    status: responseStatus,
    headers: { "Content-Type": "application/json" },
  });
}

async function chargePayment(data: ProcessPaymentRequest) {
  // 실제 결제 게이트웨이 호출 (재시도 로직 포함)
  const maxRetries = 3;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.payment-gateway.com/charge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYMENT_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        // 재시도 가능한 에러(5xx)와 불가능한 에러(4xx) 구분
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`결제 거절: ${error.message}`);
        }
        throw new Error(`결제 서비스 오류 (${response.status})`);
      }

      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && !(err.message.startsWith("결제 거절"))) {
        // 지수 백오프: 1초, 2초, 4초
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt - 1) * 1000)
        );
        console.log(`결제 재시도 ${attempt}/${maxRetries}: ${err.message}`);
      } else {
        break;
      }
    }
  }

  throw lastError!;
}

Deno.serve(withErrorHandling(processPayment));
```

---

### 3.3 Dead Letter Queue 패턴

처리에 실패한 메시지를 DLQ에 저장하여 나중에 수동 재처리하거나 분석할 수 있다.

```sql
-- DLQ 테이블 생성
CREATE TABLE dead_letter_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_queue TEXT NOT NULL,
  message_id TEXT,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  original_created_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

-- 처리 실패한 메시지를 DLQ로 이동하는 함수
CREATE OR REPLACE FUNCTION move_to_dlq(
  p_queue_name TEXT,
  p_message_id TEXT,
  p_payload JSONB,
  p_error_message TEXT,
  p_retry_count INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO dead_letter_queue (
    original_queue, message_id, payload, error_message, retry_count
  ) VALUES (
    p_queue_name, p_message_id, p_payload, p_error_message, p_retry_count
  ) RETURNING id INTO v_dlq_id;

  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

```typescript
// supabase/functions/dlq-processor/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const { queue_name, limit = 10 } = await req.json();

  // DLQ에서 처리되지 않은 항목 조회
  const { data: dlqItems, error } = await supabase
    .from("dead_letter_queue")
    .select("*")
    .eq("original_queue", queue_name)
    .is("resolved_at", null)
    .order("failed_at", { ascending: true })
    .limit(limit);

  if (error || !dlqItems?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  const results = await Promise.allSettled(
    dlqItems.map(async (item) => {
      try {
        // 원래 큐에 맞는 재처리 로직 실행
        await reprocessMessage(item.original_queue, item.payload);

        // 처리 완료 표시
        await supabase
          .from("dead_letter_queue")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", item.id);

        return { id: item.id, status: "resolved" };
      } catch (err) {
        console.error(`DLQ 항목 재처리 실패 ${item.id}: ${err.message}`);
        return { id: item.id, status: "still_failing", error: err.message };
      }
    })
  );

  const resolved = results.filter(
    (r) => r.status === "fulfilled" && r.value.status === "resolved"
  ).length;

  return new Response(
    JSON.stringify({
      total: dlqItems.length,
      resolved,
      still_failing: dlqItems.length - resolved,
    }),
    { status: 200 }
  );
});

async function reprocessMessage(queue: string, payload: any) {
  switch (queue) {
    case "embedding_queue":
      // 임베딩 재처리
      await processEmbedding(payload);
      break;
    case "notification_queue":
      // 알림 재발송
      await sendNotification(payload);
      break;
    default:
      throw new Error(`알 수 없는 큐: ${queue}`);
  }
}

async function processEmbedding(payload: any) {
  // 임베딩 생성 로직
}

async function sendNotification(payload: any) {
  // 알림 발송 로직
}
```

---

## 4. 성능 최적화

### 4.1 콜드 스타트 최소화

Edge Function의 콜드 스타트는 첫 요청 시 약 200-400ms의 지연을 유발한다.
이를 최소화하는 전략들이다.

#### 4.1.1 초기화 코드 최상위로 이동

```typescript
// 나쁜 패턴: 핸들러 내부에서 매번 초기화
Deno.serve(async (req) => {
  // 매 요청마다 초기화됨 (비효율)
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  // ...
});

// 좋은 패턴: 모듈 최상위에서 한 번만 초기화
import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 이 코드는 함수 인스턴스당 한 번만 실행됨
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // 이미 초기화된 클라이언트 재사용
});
```

#### 4.1.2 워밍 엔드포인트 (Keep-Warm)

```typescript
// supabase/functions/api-gateway/index.ts
// 여러 기능을 하나의 함수로 통합하면 콜드 스타트 횟수가 줄어든다

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const handlers: Record<string, (req: Request) => Promise<Response>> = {
  "/health": handleHealth,
  "/users": handleUsers,
  "/orders": handleOrders,
  "/products": handleProducts,
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 워밍 요청 처리 (ping)
  if (url.pathname === "/ping") {
    return new Response("pong", { status: 200 });
  }

  const handler = handlers[url.pathname];
  if (!handler) {
    return new Response("Not Found", { status: 404 });
  }

  return handler(req);
});

async function handleHealth(req: Request): Promise<Response> {
  return new Response(JSON.stringify({ status: "ok", ts: Date.now() }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleUsers(req: Request): Promise<Response> {
  // 사용자 관련 로직
  return new Response("{}");
}

async function handleOrders(req: Request): Promise<Response> {
  // 주문 관련 로직
  return new Response("{}");
}

async function handleProducts(req: Request): Promise<Response> {
  // 상품 관련 로직
  return new Response("{}");
}
```

---

### 4.2 커넥션 풀링 (Supabase 클라이언트 재사용)

```typescript
// supabase/functions/_shared/db.ts
// 전역 스코프에서 클라이언트를 싱글턴으로 관리

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

let _adminClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: "public",
        },
      }
    );
  }
  return _adminClient;
}

export function getUserClient(authHeader: string): SupabaseClient {
  // 사용자 클라이언트는 요청마다 새로 생성해야 함 (사용자 컨텍스트가 다름)
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// 직접 DB 연결이 필요한 경우 (Deno Postgres 사용)
// 주의: Edge Function 환경에서는 연결 수를 최소화해야 함
import postgres from "npm:postgres@3";

let _pgClient: ReturnType<typeof postgres> | null = null;

export function getPgClient() {
  if (!_pgClient) {
    _pgClient = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
      max: 1, // Edge Function 환경에서는 최대 1개 연결
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
    });
  }
  return _pgClient;
}
```

---

### 4.3 응답 스트리밍

대용량 데이터나 AI 생성 응답을 스트리밍으로 전송하면 TTFB(첫 바이트 수신 시간)를 줄일 수 있다.

```typescript
// supabase/functions/ai-stream/index.ts
// OpenAI 스트리밍 응답을 클라이언트로 직접 전달

Deno.serve(async (req) => {
  const { prompt, model = "gpt-4o" } = await req.json();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // OpenAI 스트리밍 요청
  const openaiResponse = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
    }
  );

  if (!openaiResponse.ok) {
    return new Response(JSON.stringify({ error: "AI 서비스 오류" }), {
      status: 500,
    });
  }

  // 스트리밍 응답을 그대로 클라이언트에 전달
  return new Response(openaiResponse.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
```

```typescript
// supabase/functions/data-export/index.ts
// 대용량 데이터를 NDJSON 스트림으로 내보내기

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const { table, page_size = 1000 } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .range(offset, offset + page_size - 1);

        if (error) {
          controller.error(error);
          return;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        // NDJSON 형식으로 청크 전송
        for (const row of data) {
          controller.enqueue(encoder.encode(JSON.stringify(row) + "\n"));
        }

        offset += data.length;
        hasMore = data.length === page_size;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Content-Disposition": `attachment; filename="${table}-export.ndjson"`,
    },
  });
});
```

---

## 5. 배포 전략

### 5.1 환경별 배포 (dev/staging/prod)

```bash
# .env.local (개발)
SUPABASE_PROJECT_REF=<dev-project-ref>

# .env.staging
SUPABASE_PROJECT_REF=<staging-project-ref>

# .env.production
SUPABASE_PROJECT_REF=<prod-project-ref>
```

```yaml
# .github/workflows/deploy-edge-functions.yml
name: Edge Functions 배포

on:
  push:
    branches:
      - main        # 프로덕션 배포
      - staging     # 스테이징 배포
    paths:
      - "supabase/functions/**"

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 스테이징 환경 배포
        run: |
          supabase functions deploy --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: 스테이징 시크릿 설정
        run: |
          supabase secrets set \
            STRIPE_SECRET_KEY=${{ secrets.STAGING_STRIPE_SECRET_KEY }} \
            STRIPE_WEBHOOK_SIGNING_SECRET=${{ secrets.STAGING_STRIPE_WEBHOOK_SECRET }} \
            --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production  # 수동 승인 환경
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 프로덕션 환경 배포
        run: |
          supabase functions deploy --project-ref ${{ secrets.PROD_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: 프로덕션 시크릿 설정
        run: |
          supabase secrets set \
            STRIPE_SECRET_KEY=${{ secrets.PROD_STRIPE_SECRET_KEY }} \
            STRIPE_WEBHOOK_SIGNING_SECRET=${{ secrets.PROD_STRIPE_WEBHOOK_SECRET }} \
            --project-ref ${{ secrets.PROD_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

### 5.2 롤링 배포 & 카나리 배포

Supabase Edge Functions는 네이티브 카나리 배포를 지원하지 않지만,
라우터 패턴으로 유사한 전략을 구현할 수 있다.

```typescript
// supabase/functions/payment-v2/index.ts
// 카나리 배포: 일부 트래픽만 새 버전으로 라우팅

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 카나리 비율 (환경변수로 제어)
const CANARY_PERCENTAGE = parseInt(Deno.env.get("CANARY_PERCENTAGE") ?? "0");

Deno.serve(async (req) => {
  const useNewVersion = Math.random() * 100 < CANARY_PERCENTAGE;

  if (useNewVersion) {
    return handleV2(req);
  } else {
    return handleV1(req);
  }
});

async function handleV1(req: Request): Promise<Response> {
  // 기존 결제 로직
  return new Response(JSON.stringify({ version: "v1" }), {
    headers: { "Content-Type": "application/json", "X-Version": "v1" },
  });
}

async function handleV2(req: Request): Promise<Response> {
  // 새 결제 로직 (개선된 버전)
  return new Response(JSON.stringify({ version: "v2" }), {
    headers: { "Content-Type": "application/json", "X-Version": "v2" },
  });
}
```

---

### 5.3 시크릿 관리 모범 사례

```bash
# 개발 환경 시크릿 파일 (.env 파일 절대 커밋하지 말 것)
# supabase/functions/.env

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
GITHUB_WEBHOOK_SECRET=...

# 로컬 개발 시 .env 파일 사용
supabase functions serve --env-file ./supabase/functions/.env

# 원격 프로젝트에 시크릿 설정
supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref <project-ref>

# 특정 함수에만 시크릿 적용
# (config.toml에서 함수별 환경변수 지정)

# 시크릿 목록 확인
supabase secrets list --project-ref <project-ref>

# 시크릿 삭제
supabase secrets unset STRIPE_SECRET_KEY --project-ref <project-ref>
```

```toml
# supabase/config.toml
[functions.stripe-webhook]
verify_jwt = false

[functions.admin-api]
verify_jwt = true

[functions.public-api]
verify_jwt = false
```

```typescript
// 시크릿 접근 패턴: 런타임에 환경변수로 접근
// 절대 하드코딩하거나 로그에 출력하지 말 것

function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`필수 환경변수 누락: ${key}`);
  }
  return value;
}

// 사용
const stripeKey = getRequiredEnv("STRIPE_SECRET_KEY");
// 로그에 절대 출력하지 말 것: console.log(stripeKey)
// 디버깅 필요 시 마스킹: console.log(`키 존재: ${stripeKey.substring(0, 7)}...`)
```

---

## 6. 모니터링 & 디버깅

### 6.1 구조화된 로깅 (JSON)

```typescript
// supabase/functions/_shared/logger.ts

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  function_name: string;
  request_id?: string;
  user_id?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

class Logger {
  constructor(
    private functionName: string,
    private requestId?: string,
    private userId?: string
  ) {}

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      function_name: this.functionName,
      request_id: this.requestId,
      user_id: this.userId,
      ...meta,
    };
    console.log(JSON.stringify(entry));
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    this.log("error", message, {
      ...meta,
      error_message: error?.message,
      error_stack: error?.stack,
    });
  }

  withRequestId(requestId: string): Logger {
    return new Logger(this.functionName, requestId, this.userId);
  }

  withUserId(userId: string): Logger {
    return new Logger(this.functionName, this.requestId, userId);
  }

  // 성능 측정 유틸리티
  async measure<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${label} 완료`, { duration_ms: duration });
      return result;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      this.error(`${label} 실패`, err, { duration_ms: duration });
      throw err;
    }
  }
}

export function createLogger(
  functionName: string,
  req?: Request
): Logger {
  const requestId =
    req?.headers.get("X-Request-ID") ?? crypto.randomUUID();
  return new Logger(functionName, requestId);
}
```

#### 로거 사용 예시

```typescript
// supabase/functions/order-api/index.ts
import { createLogger } from "../_shared/logger.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const logger = createLogger("order-api", req);
  const startTime = Date.now();

  logger.info("요청 수신", {
    method: req.method,
    path: new URL(req.url).pathname,
  });

  try {
    const body = await req.json();

    const result = await logger.measure("주문 생성", async () => {
      return await supabase.from("orders").insert(body).select().single();
    });

    const duration = Date.now() - startTime;
    logger.info("요청 완료", { status: 201, duration_ms: duration });

    return new Response(JSON.stringify(result.data), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("요청 처리 실패", err, { duration_ms: duration });

    return new Response(JSON.stringify({ error: "내부 서버 오류" }), {
      status: 500,
    });
  }
});
```

---

### 6.2 에러 추적 (Sentry 통합)

```typescript
// supabase/functions/_shared/sentry.ts
import * as Sentry from "npm:@sentry/deno";

let _initialized = false;

export function initSentry() {
  if (_initialized) return;

  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) {
    console.warn("SENTRY_DSN 미설정, Sentry 비활성화");
    return;
  }

  Sentry.init({
    dsn,
    environment: Deno.env.get("ENVIRONMENT") ?? "development",
    tracesSampleRate: 0.1, // 10% 샘플링
    release: Deno.env.get("FUNCTION_VERSION"),
  });

  _initialized = true;
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>
) {
  if (!_initialized) return;

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// 사용 예시
// supabase/functions/api/index.ts
import { initSentry, captureException } from "../_shared/sentry.ts";

initSentry(); // 모듈 수준에서 초기화

Deno.serve(async (req) => {
  try {
    // 비즈니스 로직
    return new Response("ok");
  } catch (err) {
    captureException(err, {
      path: new URL(req.url).pathname,
      method: req.method,
    });
    return new Response("Error", { status: 500 });
  }
});
```

---

### 6.3 성능 메트릭

```typescript
// supabase/functions/_shared/metrics.ts
// 커스텀 메트릭을 Supabase 테이블에 저장

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface Metric {
  function_name: string;
  event: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

// 메트릭은 비동기로 저장 (응답 시간에 영향 없도록)
export function recordMetric(metric: Metric) {
  // fire-and-forget 패턴
  supabase.from("function_metrics").insert({
    ...metric,
    recorded_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error) console.warn("메트릭 저장 실패:", error.message);
  });
}

export function withMetrics(
  functionName: string,
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    let status = 200;

    try {
      const response = await handler(req);
      status = response.status;
      return response;
    } catch (err) {
      status = 500;
      throw err;
    } finally {
      const duration = Math.round(performance.now() - start);

      recordMetric({
        function_name: functionName,
        event: "request",
        value: duration,
        unit: "ms",
        tags: {
          status: String(status),
          method: req.method,
        },
      });
    }
  };
}
```

---

## 참고 자료

- [Supabase Edge Functions 공식 문서](https://supabase.com/docs/guides/functions)
- [Stripe Webhook 처리 | Supabase](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [Edge Functions 인증 | Supabase](https://supabase.com/docs/guides/functions/auth)
- [Edge Functions 스케줄링 | Supabase](https://supabase.com/docs/guides/functions/schedule-functions)
- [pg_net 비동기 네트워킹 | Supabase](https://supabase.com/docs/guides/database/extensions/pg_net)
- [배포 | Supabase Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [로깅 | Supabase Edge Functions](https://supabase.com/docs/guides/functions/logging)
- [환경 변수 | Supabase](https://supabase.com/docs/guides/functions/secrets)
- [Persistent Storage and 97% Faster Cold Starts](https://supabase.com/blog/persistent-storage-for-faster-edge-functions)
- [Processing large jobs with Edge Functions, Cron, and Queues](https://supabase.com/blog/processing-large-jobs-with-edge-functions)
- [Receiving webhooks with Supabase Edge Functions | Svix](https://www.svix.com/blog/receive-webhooks-with-supabase-edge-functions/)
