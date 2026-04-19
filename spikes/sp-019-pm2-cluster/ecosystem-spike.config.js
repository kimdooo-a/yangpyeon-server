// SP-019 PM2 ecosystem — 격리 네임스페이스 spike019, cluster 4 worker
// 실행 전 ~/dashboard/spikes/sp-019-pm2-cluster/ 디렉토리에 복사 필요 (better-sqlite3 WSL 네이티브 바이너리 접근)
module.exports = {
  apps: [
    {
      name: 'spike019-app',
      namespace: 'spike019',
      script: './write-contention-test.js',
      exec_mode: 'cluster',
      instances: 4,
      max_memory_restart: '256M',
      cwd: '/home/smart/dashboard/spikes/sp-019-pm2-cluster',
      error_file: '/tmp/spike019-error.log',
      out_file: '/tmp/spike019-out.log',
      merge_logs: true,
      env: {
        SPIKE_ID: 'SP-019',
      },
    },
  ],
};
