# 4. 외부 리소스 요청

## 4-1. API 키 필요

[사용자 → Claude Code]
```
Supabase API 키가 필요해.
요청 형식으로 알려줘.
```

[Claude Code → 사용자] (출력 형식)
```
🔑 인증 정보 필요

서비스: Supabase
필요한 값: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
설정 위치: .env.local

사용자 조치:
1. Supabase 대시보드 접속 (https://supabase.com/dashboard)
2. 프로젝트 선택 → Settings → API
3. Project URL과 anon key 복사
4. .env.local에 아래 형식으로 추가:

NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

완료되면 알려주세요.
```

---

## 4-2. 브라우저 테스트 요청 (Antigravity용)

[사용자 → Claude Code]
```
로그인 페이지 테스트 필요해.
Antigravity 브라우저 테스트 요청 형식으로 알려줘.
```

[Claude Code → 사용자] (출력 형식)
```
🌐 Antigravity 브라우저 테스트 요청

테스트 URL: http://localhost:3000/login

확인 항목:
- [ ] 페이지 정상 렌더링
- [ ] 이메일 입력 필드 동작
- [ ] 비밀번호 입력 필드 동작
- [ ] 로그인 버튼 클릭 시 동작
- [ ] 에러 메시지 표시

스크린샷 필요: 예
스크린샷 저장 위치: public/images/ui/screenshot-login-400x300.png

⚠️ Antigravity 브라우저에서 위 URL 접속 후 확인 부탁드립니다.
```

[사용자 → Antigravity]
```
http://localhost:3000/login 접속해서 
로그인 페이지 테스트해줘.
스크린샷도 찍어줘.
```

---

## 4-3. 외부 파일 필요

[사용자 → Claude Code]
```
상품 데이터 CSV 파일이 필요해.
요청 형식으로 알려줘.
```

[Claude Code → 사용자] (출력 형식)
```
📁 외부 파일 필요

파일 종류: CSV
용도: 상품 목록 시드 데이터
권장 형식: CSV (UTF-8)
필요한 컬럼: id, name, price, description, image_url
저장 위치: public/data/products.csv

파일 준비되면 알려주세요.
```
