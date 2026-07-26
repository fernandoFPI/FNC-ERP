// PM2 ecosystem config — manages all FNC ERP services in production.
// Usage: pm2 start ecosystem.config.cjs --env production
// Log rotation: pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M

'use strict'

const fs = require('fs')
const path = require('path')

const LOG_DIR = '/var/log/fnc-erp'
const BASE = '/opt/fnc-erp'

// packages/config/src/env.ts stops auto-loading .env once NODE_ENV=production,
// so PM2 has to hand every process its environment explicitly. Parsed once here
// and spread into each app's env_production below. No dotenv dependency needed —
// this file has no package.json of its own for pnpm to resolve one against.
function loadEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const sharedEnv = loadEnvFile(path.join(BASE, '.env'))

// exec_mode/instances default to cluster/2 (zero-downtime `pm2 reload`) —
// pass opts to override per-app. wait_ready/listen_timeout pairs with the
// process.send('ready') call each service's index.ts makes once its HTTP
// server is actually listening, so PM2 won't consider a new instance up
// (and won't kill the old one, in cluster mode) until it truly can serve
// traffic. kill_timeout gives server.close()+pool.end() time to finish
// before PM2 force-kills on shutdown/reload.
function makeApp(name, script, port, extraEnv = {}, opts = {}) {
  const {
    execMode = 'cluster',
    instances = 2,
    listenTimeout = 10000,
  } = opts

  return {
    name,
    script,
    exec_mode: execMode,
    instances,
    wait_ready: true,
    listen_timeout: listenTimeout,
    kill_timeout: 5000,
    env_production: {
      ...sharedEnv,
      NODE_ENV: 'production',
      SERVICE_NAME: name,
      PORT: port,
      ...extraEnv,
    },
    out_file: `${LOG_DIR}/${name}-out.log`,
    error_file: `${LOG_DIR}/${name}-error.log`,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    health_check_url: `http://localhost:${port}/health`,
    health_check_interval: 30000,
    health_check_grace_period: 5000,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '5s',
  }
}

module.exports = {
  apps: [
    // Single-instance: its WebSocket broadcast (services/gateway/src/routes/websocket.ts)
    // holds connected clients in an in-process Set with no Redis backing. Clustering
    // it would silently drop broadcasts to clients connected to a different worker.
    makeApp('gateway', `${BASE}/services/gateway/dist/index.js`, 3000, {}, { execMode: 'fork', instances: 1, listenTimeout: 15000 }),

    makeApp('auth',          `${BASE}/services/auth/dist/index.js`,           3001, { DB_POOL_MAX: '8' }),
    makeApp('finance',       `${BASE}/services/finance/dist/index.js`,        3002, { DB_POOL_MAX: '8' }),
    makeApp('procurement',   `${BASE}/services/procurement/dist/index.js`,    3003, { DB_POOL_MAX: '8' }),
    makeApp('hr',            `${BASE}/services/hr/dist/index.js`,             3004, { DB_POOL_MAX: '8' }),
    makeApp('inventory',     `${BASE}/services/inventory/dist/index.js`,      3005, { DB_POOL_MAX: '8' }),
    makeApp('projects',      `${BASE}/services/projects/dist/index.js`,       3006, { DB_POOL_MAX: '8' }),
    makeApp('manufacturing', `${BASE}/services/manufacturing/dist/index.js`,  3007, { DB_POOL_MAX: '8' }),
    makeApp('interco',       `${BASE}/services/interco/dist/index.js`,        3008, { DB_POOL_MAX: '8' }),
    makeApp('notifications', `${BASE}/services/notifications/dist/index.js`,  3009, { DB_POOL_MAX: '8' }),
    makeApp('rental',        `${BASE}/services/rental/dist/index.js`,         3010, { DB_POOL_MAX: '8' }),
    makeApp('reporting',     `${BASE}/services/reporting/dist/index.js`,      3011, { DB_POOL_MAX: '8' }),
    {
      name: 'worker',
      script: `${BASE}/services/worker/dist/index.js`,
      // DO NOT set exec_mode:'cluster' or instances>1 on this app.
      // services/worker/src/index.ts registers 7 node-cron jobs inside start()
      // (called unconditionally on module load), plus 3 more files imported for
      // their side effects register 5 more at raw module-import time —
      // jobs/fx-sync.ts (2), jobs/maintenance-alerts.ts (2), jobs/eng-doc-reminders.ts (1).
      // None are instance-guarded. Running >1 instance fires every job once per
      // instance: duplicate payroll/reminder emails, duplicate FX syncs, etc.
      // If this ever needs horizontal scale, the jobs must first be rewritten
      // with a distributed lock (e.g. Redis SETNX/redlock) or single-leader election.
      exec_mode: 'fork',
      instances: 1,
      env_production: {
        ...sharedEnv,
        NODE_ENV: 'production',
        SERVICE_NAME: 'worker',
      },
      out_file: `${LOG_DIR}/worker-out.log`,
      error_file: `${LOG_DIR}/worker-error.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
}
