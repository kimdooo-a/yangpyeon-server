// ─────────────────────────────────────────────────────────────────────
// PM2 ecosystem — 양평 부엌 대시보드 standalone
//
// 기동:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup                        # 시스템 부팅 시 자동 시작(옵션)
//
// 세션 47 스파이크(SP-019) 결과에 따라 cluster 모드는 SQLite WAL + v6 delete 경합
// 검증 후에만 전환. 기본은 fork (단일 프로세스) — 최소 위험 기동.
// ─────────────────────────────────────────────────────────────────────
module.exports = {
  apps: [
    {
      name: 'ypserver',
      cwd: __dirname,
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      // 로그
      out_file: './logs/ypserver-out.log',
      error_file: './logs/ypserver-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 재시작 정책
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 10,
      // 그레이스풀 셧다운 (Next.js 는 SIGTERM 시 in-flight 요청 완료 후 종료)
      kill_timeout: 8000,
      wait_ready: false,
    },
  ],
};
