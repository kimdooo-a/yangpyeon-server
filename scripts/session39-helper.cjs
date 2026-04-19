const { Client } = require('/home/smart/dashboard/node_modules/pg');
const fs = require('fs');

function getUrl() {
  const env = fs.readFileSync('/home/smart/dashboard/.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  const raw = line.replace(/^DATABASE_URL=/, '').replace(/^"|"$/g, '');
  return raw.replace(/\?schema=public$/, '');
}

async function withClient(fn) {
  const c = new Client({ connectionString: getUrl() });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

(async () => {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  try {
    if (cmd === 'get-admin-id') {
      await withClient(async (c) => {
        const r = await c.query('SELECT id FROM users WHERE email = $1', [arg]);
        console.log(r.rows[0].id);
      });
    } else if (cmd === 'insert-expired') {
      await withClient(async (c) => {
        const adminId = arg;
        const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
        const t1 = 'e2e-expired-A-' + Date.now();
        const t2 = 'e2e-expired-B-' + Date.now();
        const r1 = await c.query(
          "INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (gen_random_uuid(), $1, $2, $3, '127.0.0.1', 'e2e-session39-A') RETURNING id",
          [adminId, t1, past],
        );
        const r2 = await c.query(
          "INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES (gen_random_uuid(), $1, $2, $3, '127.0.0.1', 'e2e-session39-B') RETURNING id",
          [adminId, t2, past],
        );
        console.log(JSON.stringify({ inserted: [r1.rows[0].id, r2.rows[0].id] }));
      });
    } else if (cmd === 'count-active-sessions') {
      await withClient(async (c) => {
        const r = await c.query(
          'SELECT COUNT(*)::int AS n FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > NOW()',
          [arg],
        );
        console.log(r.rows[0].n);
      });
    } else if (cmd === 'show-latest-sessions') {
      await withClient(async (c) => {
        const r = await c.query(
          'SELECT id, revoked_at, revoked_reason, expires_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',
          [arg],
        );
        console.log(JSON.stringify(r.rows, null, 2));
      });
    } else if (cmd === 'cleanup-test-rows') {
      await withClient(async (c) => {
        const r = await c.query(
          "DELETE FROM sessions WHERE user_agent LIKE 'e2e-session39%' RETURNING id",
        );
        console.log('cleaned:', r.rows.length);
      });
    } else {
      console.error('unknown cmd:', cmd);
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
